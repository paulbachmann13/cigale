/**
 * Calque de commentaires posé sur les pages de pdf.js : outils de dessin, sélection, déplacement, redimensionnement.
 * Rien n'est écrit ici : chaque geste aboutit à un appel de l'hôte (App/Editing) qui modifie le PDF réel.
 */
import { type Annot, type AnnotDraft, type AnnotPatch, type Pt, type Rect, type Rgb, normalizeRect, resize, rgbToCss, translate } from '../data/annotations';
import { t } from '../i18n/fr';
import type { DocView } from '../pdf/viewer';
import { h } from './dom';

export type Tool = 'select' | 'highlight' | 'underline' | 'strikeout' | 'note' | 'freetext' | 'ink' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'stamp';

export interface Style {
  color: Rgb;
  width: number;
  fontSize: number;
  stamp: string;
}

export interface AnnotHost {
  add(drafts: AnnotDraft[]): Promise<void>;
  update(id: string, patch: AnnotPatch, label: 'edit' | 'move'): Promise<void>;
  remove(ids: string[]): Promise<void>;
  selected(id: string | null): void;
  notify(message: string): void;
}

/** Même partie de l'API de PageViewport que pdf.js expose : on n'en utilise que ces deux conversions. */
interface Viewport {
  scale: number;
  convertToViewportPoint(x: number, y: number): [number, number];
  convertToPdfPoint(x: number, y: number): [number, number];
}
interface PageViewLike {
  div: HTMLElement;
  viewport: Viewport;
}

const SHAPE_TOOLS = new Set<Tool>(['ink', 'rect', 'ellipse', 'line', 'arrow', 'note', 'freetext', 'stamp']);
const MARKUP_TOOLS = new Set<Tool>(['highlight', 'underline', 'strikeout']);
const RESIZABLE = new Set(['rect', 'ellipse', 'freetext', 'stamp']);

export class Annotator {
  private tool: Tool | null = null;
  style: Style = { color: [0.85, 0.15, 0.15], width: 2, fontSize: 14, stamp: 'approved' };
  private annots: Annot[] = [];
  private selectedId: string | null = null;
  private layers = new Map<number, HTMLElement>();
  private editor: HTMLElement | null = null;
  private onMouseUp = () => this.captureTextSelection();

  constructor(private view: DocView, private host: AnnotHost) {
    view.eventBus.on('pagerendered', ({ pageNumber }: { pageNumber: number }) => this.layoutPage(pageNumber));
    view.container.addEventListener('mouseup', this.onMouseUp);
  }

  destroy() {
    this.closeEditor();
    this.view.container.removeEventListener('mouseup', this.onMouseUp);
    this.layers.forEach((l) => l.remove());
    this.layers.clear();
  }

  // ───────────── état ─────────────

  get active(): Tool | null {
    return this.tool;
  }
  get selection(): Annot | undefined {
    return this.annots.find((a) => a.id === this.selectedId);
  }

  /** `null` : mode commentaire désactivé (aucun calque). */
  setTool(tool: Tool | null) {
    this.tool = tool;
    if (tool !== 'select') this.select(null);
    this.view.container.classList.toggle('annotating', tool !== null);
    this.view.container.classList.toggle('annot-markup', tool !== null && MARKUP_TOOLS.has(tool));
    this.renderAll();
  }

  setAnnots(list: Annot[]) {
    this.annots = list;
    if (this.selectedId && !list.some((a) => a.id === this.selectedId)) this.selectedId = null;
    this.renderAll();
  }

  select(id: string | null, notify = true) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.renderAll();
    if (notify) this.host.selected(id);
  }

  private pageView(n: number): PageViewLike | undefined {
    return (this.view.viewer as unknown as { getPageView(i: number): PageViewLike | undefined }).getPageView(n - 1);
  }

  // ───────────── calques ─────────────

  private renderAll() {
    for (let n = 1; n <= this.view.pageCount; n++) if (this.pageView(n)?.div.querySelector('canvas')) this.layoutPage(n);
  }

  private layoutPage(n: number) {
    const pv = this.pageView(n);
    if (!pv) return;
    let layer = this.layers.get(n);
    if (!layer || !pv.div.contains(layer)) {
      layer = h('div', { class: 'annot-layer', 'data-page': n });
      this.layers.set(n, layer);
      pv.div.append(layer);
      this.bindLayer(layer, n);
    }
    layer.replaceChildren();
    layer.classList.toggle('capture', this.tool !== null && SHAPE_TOOLS.has(this.tool));
    if (this.tool !== 'select') return; // les zones cliquables n'existent qu'avec l'outil Sélectionner (sinon elles gêneraient la sélection de texte)
    const vp = pv.viewport;
    for (const a of this.annots) {
      if (a.page !== n - 1 || a.replyTo) continue;
      const [x1, y1] = vp.convertToViewportPoint(a.rect[0], a.rect[1]);
      const [x2, y2] = vp.convertToViewportPoint(a.rect[2], a.rect[3]);
      const hit = h('div', { class: `annot-hit${a.id === this.selectedId ? ' selected' : ''}`, 'data-id': a.id, title: [a.author, a.contents].filter(Boolean).join(' — ') });
      Object.assign(hit.style, { left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`, width: `${Math.max(6, Math.abs(x2 - x1))}px`, height: `${Math.max(6, Math.abs(y2 - y1))}px` });
      this.bindHit(hit, a, n);
      layer.append(hit);
      if (a.id === this.selectedId && RESIZABLE.has(a.kind)) {
        for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
          const handle = h('div', { class: `annot-handle ${corner}` });
          hit.append(handle);
          this.bindHandle(handle, a, n, corner);
        }
      }
    }
  }

  private local(layer: HTMLElement, e: PointerEvent): [number, number] {
    const r = layer.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // ───────────── sélection, déplacement, redimensionnement ─────────────

  private bindHit(hit: HTMLElement, a: Annot, n: number) {
    hit.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).classList.contains('annot-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      this.select(a.id);
      const layer = this.layers.get(n)!;
      const vp = this.pageView(n)!.viewport;
      const start = this.local(layer, e);
      let moved = false;
      hit.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const p = this.local(layer, ev);
        if (Math.hypot(p[0] - start[0], p[1] - start[1]) > 3) moved = true;
        if (moved) hit.style.transform = `translate(${p[0] - start[0]}px, ${p[1] - start[1]}px)`;
      };
      const up = (ev: PointerEvent) => {
        hit.removeEventListener('pointermove', move);
        hit.removeEventListener('pointerup', up);
        if (!moved) return;
        const p = this.local(layer, ev);
        const [px0, py0] = vp.convertToPdfPoint(start[0], start[1]);
        const [px1, py1] = vp.convertToPdfPoint(p[0], p[1]);
        void this.host.update(a.id, translate(a, px1 - px0, py1 - py0), 'move');
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerup', up);
    });
    hit.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.editContents(a, e.clientX, e.clientY);
    });
  }

  private bindHandle(handle: HTMLElement, a: Annot, n: number, corner: 'nw' | 'ne' | 'sw' | 'se') {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const layer = this.layers.get(n)!;
      const vp = this.pageView(n)!.viewport;
      const hit = handle.parentElement!;
      handle.setPointerCapture(e.pointerId);
      const next = (ev: PointerEvent): Rect => {
        const [x, y] = vp.convertToPdfPoint(...this.local(layer, ev));
        const [x1, y1, x2, y2] = a.rect;
        // le coin tenu suit la souris ; l'opposé reste fixe (« n » = haut = y le plus grand en PDF)
        const fixedX = corner.endsWith('w') ? x2 : x1;
        const fixedY = corner.startsWith('n') ? y1 : y2;
        const r = normalizeRect([x, y, fixedX, fixedY]);
        return [r[0], r[1], Math.max(r[2], r[0] + 6), Math.max(r[3], r[1] + 6)];
      };
      const move = (ev: PointerEvent) => {
        const r = next(ev);
        const [ax, ay] = vp.convertToViewportPoint(r[0], r[1]);
        const [bx, by] = vp.convertToViewportPoint(r[2], r[3]);
        Object.assign(hit.style, { left: `${Math.min(ax, bx)}px`, top: `${Math.min(ay, by)}px`, width: `${Math.abs(bx - ax)}px`, height: `${Math.abs(by - ay)}px` });
      };
      const up = (ev: PointerEvent) => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        void this.host.update(a.id, resize(a, next(ev)), 'edit');
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  // ───────────── dessin ─────────────

  private bindLayer(layer: HTMLElement, n: number) {
    layer.addEventListener('pointerdown', (e) => {
      if (e.target !== layer || this.tool === null || !SHAPE_TOOLS.has(this.tool)) return;
      e.preventDefault();
      const tool = this.tool;
      const vp = this.pageView(n)!.viewport;
      const start = this.local(layer, e);
      const points: [number, number][] = [start];
      layer.setPointerCapture(e.pointerId);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'annot-preview');
      layer.append(svg);
      const color = rgbToCss(this.style.color);
      const sw = this.style.width * vp.scale;
      const draw = (end: [number, number]) => {
        svg.replaceChildren();
        const el = (name: string, attrs: Record<string, string | number>) => {
          const x = document.createElementNS('http://www.w3.org/2000/svg', name);
          for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, String(v));
          svg.append(x);
        };
        const [x1, y1] = start;
        const [x2, y2] = end;
        const common = { stroke: color, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
        if (tool === 'ink') el('polyline', { ...common, points: points.map((p) => p.join(',')).join(' ') });
        else if (tool === 'rect') el('rect', { ...common, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        else if (tool === 'ellipse') el('ellipse', { ...common, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2 });
        else if (tool === 'line' || tool === 'arrow') el('line', { ...common, x1, y1, x2, y2 });
        else if (tool === 'freetext') el('rect', { stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 3', fill: 'none', x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
      };
      const move = (ev: PointerEvent) => {
        const p = this.local(layer, ev);
        if (tool === 'ink') {
          const last = points[points.length - 1];
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.5) points.push(p);
        }
        draw(p);
      };
      const up = (ev: PointerEvent) => {
        layer.removeEventListener('pointermove', move);
        layer.removeEventListener('pointerup', up);
        svg.remove();
        this.finishShape(tool, n, vp, start, this.local(layer, ev), points, ev);
      };
      layer.addEventListener('pointermove', move);
      layer.addEventListener('pointerup', up);
    });
  }

  private base(n: number): Pick<AnnotDraft, 'page' | 'color' | 'fill' | 'opacity' | 'width' | 'contents'> {
    return { page: n - 1, color: this.style.color, fill: null, opacity: 1, width: this.style.width, contents: '' };
  }

  private finishShape(tool: Tool, n: number, vp: Viewport, a: [number, number], b: [number, number], points: [number, number][], ev: PointerEvent) {
    const pdf = (p: [number, number]): Pt => vp.convertToPdfPoint(p[0], p[1]);
    const dragged = Math.hypot(b[0] - a[0], b[1] - a[1]) > 4;
    const base = this.base(n);
    if (tool === 'ink') {
      const pts = points.map(pdf);
      if (pts.length < 2) pts.push([pts[0][0] + 0.1, pts[0][1]]);
      void this.host.add([{ ...base, kind: 'ink', strokes: [pts], rect: normalizeRect([pts[0][0], pts[0][1], pts[0][0], pts[0][1]]) }]);
    } else if ((tool === 'rect' || tool === 'ellipse') && dragged) {
      const [p, q] = [pdf(a), pdf(b)];
      void this.host.add([{ ...base, kind: tool, rect: normalizeRect([p[0], p[1], q[0], q[1]]) }]);
    } else if ((tool === 'line' || tool === 'arrow') && dragged) {
      const [p, q] = [pdf(a), pdf(b)];
      void this.host.add([{ ...base, kind: tool, line: [p[0], p[1], q[0], q[1]], rect: normalizeRect([p[0], p[1], q[0], q[1]]) }]);
    } else if (tool === 'note') {
      const [x, y] = pdf(a);
      this.openEditor(ev.clientX, ev.clientY, t.annot.noteWrite, '', (text) => this.host.add([{ ...base, kind: 'note', color: [1, 0.85, 0.2], rect: [x, y - 24, x + 24, y], contents: text }]));
    } else if (tool === 'freetext') {
      const [p, q] = dragged ? [pdf(a), pdf(b)] : [pdf(a), ([pdf(a)[0] + 180, pdf(a)[1] - 40] as Pt)];
      const rect = normalizeRect([p[0], p[1], q[0], q[1]]);
      this.openEditor(ev.clientX, ev.clientY, t.annot.textWrite, '', (text) => this.host.add([{ ...base, kind: 'freetext', width: 0, rect, fontSize: this.style.fontSize, contents: text }]));
    } else if (tool === 'stamp') {
      const [x, y] = pdf(a);
      void this.host.add([{ ...base, kind: 'stamp', width: 2, rect: [x - 75, y - 22, x + 75, y + 22], stamp: this.style.stamp }]);
    }
  }

  // ───────────── surlignage, soulignement, barré : d'après le texte sélectionné ─────────────

  private captureTextSelection() {
    const tool = this.tool;
    if (!tool || !MARKUP_TOOLS.has(tool)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const draftsByPage = new Map<number, Rect[]>();
    for (let n = 1; n <= this.view.pageCount; n++) {
      const pv = this.pageView(n);
      const canvas = pv?.div.querySelector('canvas');
      if (!pv || !canvas) continue;
      const origin = canvas.getBoundingClientRect(); // même origine que le calque : le coin de la page
      const quads: Rect[] = [];
      pv.div.querySelectorAll<HTMLElement>('.textLayer span:not(.markedContent)').forEach((span) => {
        if (!range.intersectsNode(span) || !span.textContent) return;
        const sub = document.createRange();
        sub.selectNodeContents(span);
        if (range.compareBoundaryPoints(Range.START_TO_START, sub) > 0) sub.setStart(range.startContainer, range.startOffset);
        if (range.compareBoundaryPoints(Range.END_TO_END, sub) < 0) sub.setEnd(range.endContainer, range.endOffset);
        const r = sub.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const [ax, ay] = pv.viewport.convertToPdfPoint(r.left - origin.left, r.top - origin.top);
        const [bx, by] = pv.viewport.convertToPdfPoint(r.right - origin.left, r.bottom - origin.top);
        quads.push(normalizeRect([ax, ay, bx, by]));
      });
      if (quads.length) draftsByPage.set(n, mergeLines(quads));
    }
    if (draftsByPage.size === 0) return;
    sel.removeAllRanges();
    const kind = tool as 'highlight' | 'underline' | 'strikeout';
    const drafts: AnnotDraft[] = [...draftsByPage].map(([n, quads]) => ({
      ...this.base(n),
      kind,
      color: kind === 'highlight' && this.style.color.every((c) => c < 0.3) ? [1, 0.9, 0.1] : this.style.color,
      width: kind === 'highlight' ? 0 : 1.2,
      opacity: kind === 'highlight' ? 0.5 : 1,
      quads,
      rect: quads[0],
    }));
    void this.host.add(drafts);
  }

  // ───────────── texte d'un commentaire ─────────────

  private editContents(a: Annot, x: number, y: number) {
    if (a.kind === 'highlight' || a.kind === 'underline' || a.kind === 'strikeout' || a.kind === 'note' || a.kind === 'freetext' || a.kind === 'other' || a.kind === 'stamp' || a.kind === 'ink' || a.kind === 'rect' || a.kind === 'ellipse' || a.kind === 'line' || a.kind === 'arrow') {
      this.openEditor(x, y, a.kind === 'freetext' ? t.annot.textWrite : t.annot.noteWrite, a.contents, (text) => this.host.update(a.id, { contents: text }, 'edit'), () => this.host.remove([a.id]));
    }
  }

  closeEditor() {
    this.editor?.remove();
    this.editor = null;
  }

  /** Petite fenêtre de saisie flottante. ⌘/Ctrl+Entrée valide, Échap annule. */
  openEditor(x: number, y: number, title: string, initial: string, onSave: (text: string) => unknown, onDelete?: () => unknown) {
    this.closeEditor();
    const area = h('textarea', { class: 'annot-text', rows: 4, placeholder: t.annot.placeholder, 'aria-label': title });
    area.value = initial;
    const save = () => {
      const text = area.value.trim();
      this.closeEditor();
      if (!text && !initial) return void this.host.notify(t.annot.emptyText);
      void onSave(text);
    };
    const box = h(
      'div',
      { class: 'annot-pop', role: 'dialog', 'aria-label': title },
      h('strong', {}, title),
      area,
      h(
        'div',
        { class: 'annot-pop-actions' },
        onDelete ? h('button', { type: 'button', class: 'link', id: 'annot-delete', onclick: () => (this.closeEditor(), void onDelete()) }, t.annot.delete) : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', id: 'annot-cancel', onclick: () => this.closeEditor() }, t.annot.cancel),
        h('button', { type: 'button', id: 'annot-save', class: 'primary', onclick: save }, t.annot.save),
      ),
    );
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.closeEditor();
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
    });
    document.body.append(box);
    const { width, height } = box.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    box.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
    this.editor = box;
    area.focus();
  }
}

/** Fusionne les rectangles d'une même ligne (les « span » de pdf.js découpent une ligne en plusieurs morceaux). */
export function mergeLines(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => b[3] - a[3] || a[0] - b[0]);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const sameLine = last && Math.abs((last[1] + last[3]) / 2 - (r[1] + r[3]) / 2) < Math.min(last[3] - last[1], r[3] - r[1]) * 0.5;
    if (last && sameLine && r[0] <= last[2] + 4) {
      last[0] = Math.min(last[0], r[0]);
      last[1] = Math.min(last[1], r[1]);
      last[2] = Math.max(last[2], r[2]);
      last[3] = Math.max(last[3], r[3]);
    } else out.push([...r]);
  }
  return out;
}
