/**
 * Calque de commentaires posé sur les pages de pdf.js : outils de dessin, sélection, déplacement, redimensionnement.
 * Rien n'est écrit ici : chaque geste aboutit à un appel de l'hôte (App/Editing) qui modifie le PDF réel.
 */
import { type Annot, type AnnotDraft, type AnnotPatch, type Pt, type Rect, type Rgb, mergeLines, normalizeRect, resize, rgbToCss, translate } from '../data/annotations';
import { t } from '../i18n/fr';
import type { DocView } from '../pdf/viewer';
import { type InkStroke, type PenKind, PENS, inkOutline, strokeTouched } from '../data/ink';
import { h } from './dom';
import type { InkStore } from './ink-store';

export type Tool = 'select' | 'redact' | 'clip' | 'sign' | 'highlight' | 'underline' | 'strikeout' | 'note' | 'freetext' | 'ink' | 'eraser' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'stamp';

export interface Style {
  color: Rgb;
  width: number;
  fontSize: number;
  stamp: string;
  /** Stylo de l'outil « Écrire » (stylo, plume, surligneur). */
  pen: PenKind;
}

export interface AnnotHost {
  add(drafts: AnnotDraft[]): Promise<void>;
  update(id: string, patch: AnnotPatch, label: 'edit' | 'move'): Promise<void>;
  remove(ids: string[]): Promise<void>;
  selected(id: string | null): void;
  notify(message: string): void;
  /** Outil « Extraire une zone » : une zone (repère PDF de la page, x0 y0 x1 y1) a été tracée. */
  region(page: number, rect: [number, number, number, number]): void;
  /** Écrit dans le document les traits en attente (et retient l'état « modifié » en attendant). */
  flushInk(): Promise<void>;
  /** Des traits viennent d'apparaître ou de disparaître (état « modifié »). */
  inkChanged(): void;
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

const SHAPE_TOOLS = new Set<Tool>(['sign', 'redact', 'clip', 'ink', 'eraser', 'rect', 'ellipse', 'line', 'arrow', 'note', 'freetext', 'stamp']);
const MARKUP_TOOLS = new Set<Tool>(['highlight', 'underline', 'strikeout']);
const RESIZABLE = new Set(['rect', 'ellipse', 'freetext', 'stamp', 'redact', 'signature']);

/** Le calque garde le stylet même s'il sort de la page (sans erreur si le système a déjà lâché ce pointeur). */
function capture(el: HTMLElement, id: number) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* pointeur déjà terminé */
  }
}

export class Annotator {
  private tool: Tool | null = null;
  /** Signature choisie, posée par un clic avec l'outil « Signer ». */
  signature: { png: Uint8Array; width: number; height: number } | null = null;
  style: Style = { color: [0.85, 0.15, 0.15], width: 2, fontSize: 14, stamp: 'approved', pen: 'pen' };
  /** Une écriture au stylet a eu lieu : le doigt fait défiler la page au lieu d'écrire (la paume ne laisse plus de traits). */
  private penSeen = false;
  private inkCanvases = new Map<number, { normal: HTMLCanvasElement; multiply: HTMLCanvasElement }>();
  /** Trait en cours d'écriture. */
  private live: { page: number; points: Pt[]; pressures: number[]; usesPressure: boolean } | null = null;
  /** Traits déjà enregistrés que la gomme vient de toucher (supprimés au relâchement). */
  private erasing = new Map<string, Annot>();
  private inkTimer: number | undefined;
  private paintQueued = false;
  private paintFrame = 0;
  /** Traits en attente que la gomme vient de toucher (supprimés au relâchement seulement : un geste annulé ne supprime rien). */
  private erasingPending = new Set<InkStroke>();
  private annots: Annot[] = [];
  private selectedId: string | null = null;
  private layers = new Map<number, HTMLElement>();
  private editor: HTMLElement | null = null;
  private onMouseUp = () => this.captureTextSelection();
  private onPageRendered = ({ pageNumber }: { pageNumber: number }) => this.layoutPage(pageNumber);

  constructor(private view: DocView, private host: AnnotHost, private ink: InkStore) {
    view.eventBus.on('pagerendered', this.onPageRendered);
    if (ink.hasPending) this.scheduleInkFlush(1500); // des traits attendaient pendant un rechargement
    // sur le document : la sélection peut se terminer hors de la zone de lecture
    document.addEventListener('mouseup', this.onMouseUp);
  }

  destroy() {
    window.clearTimeout(this.inkTimer);
    cancelAnimationFrame(this.paintFrame);
    this.inkCanvases.forEach((c) => (c.normal.remove(), c.multiply.remove()));
    this.inkCanvases.clear();
    this.closeEditor();
    document.removeEventListener('mouseup', this.onMouseUp);
    this.view.eventBus.off('pagerendered', this.onPageRendered);
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
    if (tool !== 'ink' && tool !== 'eraser') this.scheduleInkFlush(0); // on quitte l'écriture : tout part dans le document
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
    layer.classList.toggle('eraser', this.tool === 'eraser');
    this.paintInk(n);
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
      // Tout se calcule à l'écran (le coin opposé reste fixe) puis se convertit : correct aussi sur une page tournée.
      const box = { left: hit.offsetLeft, top: hit.offsetTop, right: hit.offsetLeft + hit.offsetWidth, bottom: hit.offsetTop + hit.offsetHeight };
      const fixed: [number, number] = [corner.endsWith('w') ? box.right : box.left, corner.startsWith('n') ? box.bottom : box.top];
      const next = (ev: PointerEvent): Rect => {
        const p = this.local(layer, ev);
        const [x, y] = vp.convertToPdfPoint(p[0], p[1]);
        const [fx, fy] = vp.convertToPdfPoint(fixed[0], fixed[1]);
        const r = normalizeRect([x, y, fx, fy]);
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
      if (this.tool === 'ink' || this.tool === 'eraser') return this.beginInk(e, layer, n);
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
        if (tool === 'redact') el('rect', { stroke: '#d9231a', 'stroke-width': 2, fill: 'rgba(217,35,26,0.18)', 'stroke-dasharray': '5 3', x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        else if (tool === 'clip') el('rect', { stroke: '#1a6fd9', 'stroke-width': 2, fill: 'rgba(26,111,217,0.14)', 'stroke-dasharray': '6 4', x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        else if (tool === 'rect') el('rect', { ...common, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        else if (tool === 'ellipse') el('ellipse', { ...common, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2 });
        else if (tool === 'line' || tool === 'arrow') el('line', { ...common, x1, y1, x2, y2 });
        else if (tool === 'freetext') el('rect', { stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 3', fill: 'none', x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
      };
      const move = (ev: PointerEvent) => {
        const p = this.local(layer, ev);
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
    if (tool === 'sign' && this.signature) {
      const [x, y] = pdf(a);
      const w = 150;
      const hgt = (w * this.signature.height) / this.signature.width;
      void this.host.add([{ ...base, kind: 'signature', color: [0, 0, 0], width: 0, rect: [x - w / 2, y - hgt / 2, x + w / 2, y + hgt / 2], image: this.signature.png }]);
    } else if (tool === 'clip' && dragged) {
      const [p, q] = [pdf(a), pdf(b)];
      const r = normalizeRect([p[0], p[1], q[0], q[1]]);
      if (r[2] - r[0] < 10 || r[3] - r[1] < 10) this.host.notify(t.docTools.regionTooSmall); // l'outil reste actif : on retrace
      else this.host.region(n - 1, [r[0], r[1], r[2], r[3]]);
    } else if (tool === 'redact' && dragged) {
      const [p, q] = [pdf(a), pdf(b)];
      const rect = normalizeRect([p[0], p[1], q[0], q[1]]);
      void this.host.add([{ ...base, kind: 'redact', color: [0.85, 0.1, 0.1], fill: [0, 0, 0], width: 1.5, rect, quads: [rect] }]);
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

  // ───────────── écriture manuscrite (stylo, plume, surligneur, gomme) ─────────────

  /** Envoie les traits en attente au document, après `ms` millisecondes sans nouveau trait. */
  private scheduleInkFlush(ms: number) {
    window.clearTimeout(this.inkTimer);
    if (!this.ink.hasPending) return;
    this.inkTimer = window.setTimeout(() => {
      // jamais en plein tracé : le rechargement du document ferait perdre le trait en cours
      if (this.live || this.erasing.size || this.erasingPending.size) this.scheduleInkFlush(500);
      else void this.host.flushInk();
    }, ms);
  }

  refreshInk() {
    for (const n of this.layers.keys()) this.paintInk(n);
  }

  private inkCanvasesFor(n: number) {
    const pv = this.pageView(n);
    if (!pv) return null;
    let c = this.inkCanvases.get(n);
    if (!c || !pv.div.contains(c.normal)) {
      const mk = (cls: string) => h('canvas', { class: `ink-canvas ${cls}`, 'aria-hidden': 'true' });
      c = { normal: mk('normal'), multiply: mk('multiply') };
      pv.div.append(c.normal, c.multiply);
      this.inkCanvases.set(n, c);
    }
    return c;
  }

  /** Dessine, sur le calque de la page, les traits en attente et celui qu'on écrit. Même contour que dans le PDF. */
  private paintInk(n: number) {
    const pv = this.pageView(n);
    const layer = this.layers.get(n);
    if (!pv || !layer) return;
    const strokes: InkStroke[] = this.ink.forPage(n - 1);
    const liveHere = this.live && this.live.page === n - 1 ? this.live : null;
    const erasedHere = [...this.erasing.values()].filter((a) => a.page === n - 1);
    if (strokes.length === 0 && !liveHere && erasedHere.length === 0 && !this.inkCanvases.has(n)) return;
    // (un trait que la gomme a touché reste affiché, en rouge, jusqu'au relâchement)
    const c = this.inkCanvasesFor(n);
    if (!c) return;
    const w = layer.clientWidth;
    const hgt = layer.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const vp = pv.viewport;
    const toScreen = (poly: Pt[]) => poly.map((p) => vp.convertToViewportPoint(p[0], p[1]));
    for (const [cv, multiply] of [[c.normal, false], [c.multiply, true]] as const) {
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(hgt * dpr);
      }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, hgt);
      const all: { s: Pick<InkStroke, 'points' | 'pressures' | 'width' | 'pen' | 'color'> }[] = strokes.map((s) => ({ s }));
      if (liveHere) all.push({ s: { points: liveHere.points, pressures: liveHere.usesPressure ? liveHere.pressures : undefined, width: this.style.width, pen: this.style.pen, color: this.style.color } });
      for (const { s } of all) {
        if ((PENS[s.pen].blend === 'Multiply') !== multiply) continue;
        if (this.erasingPending.has(s as InkStroke)) continue; // dessiné en rouge plus bas
        const poly = toScreen(inkOutline(s.points, s.pressures, s.width, s.pen));
        g.globalAlpha = PENS[s.pen].opacity;
        g.fillStyle = rgbToCss(s.color);
        g.beginPath();
        poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fill();
      }
      if (!multiply) {
        g.globalAlpha = 0.55;
        g.fillStyle = '#d9231a';
        for (const s of strokes) {
          if (!this.erasingPending.has(s)) continue;
          g.beginPath();
          toScreen(inkOutline(s.points, s.pressures, s.width, s.pen)).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.closePath();
          g.fill();
        }
        // gomme : les traits déjà enregistrés qu'elle va supprimer apparaissent barrés en rouge
        g.globalAlpha = 0.55;
        g.strokeStyle = '#d9231a';
        g.lineCap = 'round';
        for (const a of erasedHere) {
          g.lineWidth = Math.max(3, a.width * vp.scale) + 2;
          for (const st of a.strokes ?? []) {
            const pts = toScreen(st);
            g.beginPath();
            pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            if (pts.length === 1) g.lineTo(pts[0][0] + 0.1, pts[0][1]);
            g.stroke();
          }
        }
      }
      g.globalAlpha = 1;
    }
  }

  private queuePaint(n: number) {
    if (this.paintQueued) return;
    this.paintQueued = true;
    this.paintFrame = requestAnimationFrame(() => {
      this.paintQueued = false;
      this.paintInk(n);
    });
  }

  private beginInk(e: PointerEvent, layer: HTMLElement, n: number) {
    if (!e.isPrimary) return; // un 2ᵉ doigt pendant un tracé ne doit rien casser
    window.clearTimeout(this.inkTimer); // pas d'envoi au document pendant qu'on écrit
    if (e.pointerType === 'pen') this.penSeen = true;
    if (e.pointerType === 'touch' && this.penSeen) return this.panWithFinger(e, layer); // doigt = défiler, stylet = écrire
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    capture(layer, e.pointerId);
    const vp = this.pageView(n)!.viewport;
    const toPdf = (ev: PointerEvent): Pt => {
      const [x, y] = this.local(layer, ev);
      return vp.convertToPdfPoint(x, y);
    };
    if (this.tool === 'eraser') return this.beginErase(e, layer, n, toPdf, vp.scale);
    const usesPressure = e.pointerType === 'pen';
    const live = { page: n - 1, points: [] as Pt[], pressures: [] as number[], usesPressure };
    this.live = live;
    const minGap = 0.8 / vp.scale; // moins d'un pixel d'écran : inutile
    const add = (ev: PointerEvent, force = false) => {
      const p = toPdf(ev);
      const last = live.points[live.points.length - 1];
      if (!force && last && Math.hypot(p[0] - last[0], p[1] - last[1]) < minGap) return;
      live.points.push(p);
      live.pressures.push(ev.pressure > 0 ? ev.pressure : 0.5);
    };
    add(e, true);
    this.paintInk(n);
    const move = (ev: PointerEvent) => {
      for (const c of ev.getCoalescedEvents?.() ?? [ev]) add(c);
      this.queuePaint(n);
    };
    const finish = (ev: PointerEvent, cancelled: boolean) => {
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', up);
      layer.removeEventListener('pointercancel', cancel);
      if (!cancelled) add(ev);
      this.live = null;
      if (!cancelled && live.points.length > 0) {
        this.ink.add({ page: n - 1, points: live.points, pressures: usesPressure ? live.pressures : undefined, color: this.style.color, width: this.style.width, pen: this.style.pen });
        this.scheduleInkFlush(1500);
        this.host.inkChanged();
      }
      this.paintInk(n);
    };
    const up = (ev: PointerEvent) => finish(ev, false);
    const cancel = (ev: PointerEvent) => finish(ev, true);
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', cancel);
  }

  /** Doigt sur la page pendant qu'on écrit au stylet : on fait défiler. */
  private panWithFinger(e: PointerEvent, layer: HTMLElement) {
    capture(layer, e.pointerId);
    let x = e.clientX;
    let y = e.clientY;
    const move = (ev: PointerEvent) => {
      this.view.container.scrollLeft -= ev.clientX - x;
      this.view.container.scrollTop -= ev.clientY - y;
      x = ev.clientX;
      y = ev.clientY;
    };
    const end = () => {
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', end);
      layer.removeEventListener('pointercancel', end);
    };
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
  }

  private beginErase(e: PointerEvent, layer: HTMLElement, n: number, toPdf: (ev: PointerEvent) => Pt, scale: number) {
    const radius = 9 / scale; // 9 pixels d'écran
    const hit = (ev: PointerEvent) => {
      const at = toPdf(ev);
      let changed = false;
      for (const s of this.ink.forPage(n - 1)) {
        if (!this.erasingPending.has(s) && strokeTouched(s.points, s.width, at, radius)) {
          this.erasingPending.add(s);
          changed = true;
        }
      }
      for (const a of this.annots) {
        if (a.kind !== 'ink' || a.page !== n - 1 || a.replyTo || this.erasing.has(a.id)) continue;
        if ((a.strokes ?? []).some((st) => strokeTouched(st, a.width, at, radius))) {
          this.erasing.set(a.id, a);
          changed = true;
        }
      }
      if (changed) this.queuePaint(n);
    };
    hit(e);
    const move = (ev: PointerEvent) => {
      for (const c of ev.getCoalescedEvents?.() ?? [ev]) hit(c);
    };
    const finish = (cancelled: boolean) => {
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', up);
      layer.removeEventListener('pointercancel', cancel);
      const ids = cancelled ? [] : [...this.erasing.keys()];
      if (!cancelled) this.ink.removeWhere((s) => this.erasingPending.has(s));
      this.erasing.clear();
      this.erasingPending.clear();
      this.paintInk(n);
      this.host.inkChanged();
      if (ids.length) void this.host.remove(ids);
      else this.scheduleInkFlush(1500);
    };
    const up = () => finish(false);
    const cancel = () => finish(true);
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', cancel);
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
      const screen: Rect[] = [];
      pv.div.querySelectorAll<HTMLElement>('.textLayer span:not(.markedContent)').forEach((span) => {
        if (!range.intersectsNode(span) || !span.textContent) return;
        const sub = document.createRange();
        sub.selectNodeContents(span);
        if (range.compareBoundaryPoints(Range.START_TO_START, sub) > 0) sub.setStart(range.startContainer, range.startOffset);
        if (range.compareBoundaryPoints(Range.END_TO_END, sub) < 0) sub.setEnd(range.endContainer, range.endOffset);
        const r = sub.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        screen.push([r.left - origin.left, r.top - origin.top, r.right - origin.left, r.bottom - origin.top]);
      });
      if (screen.length) {
        // fusion par ligne à l'écran (sens de lecture réel, même sur une page tournée), puis conversion en coordonnées PDF
        const toPdf = (r: Rect): Rect => {
          const [ax, ay] = pv.viewport.convertToPdfPoint(r[0], r[1]);
          const [bx, by] = pv.viewport.convertToPdfPoint(r[2], r[3]);
          return normalizeRect([ax, ay, bx, by]);
        };
        draftsByPage.set(n, mergeLines(screen).map(toPdf));
      }
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
