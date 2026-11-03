import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { normalizeSelection, rangeSelection } from '../data/page-order';
import { fmt, t } from '../i18n/fr';
import { clear, h } from './dom';

export const PAGES_MIME = 'application/x-cigale-pages';

export interface PageListOptions {
  /** Largeur d'une miniature en pixels CSS. */
  width: number;
  layout: 'list' | 'grid';
  /** Clic (liste) ou double-clic (grille) : aller à cette page (à partir de 1). */
  onOpen: (page: number) => void;
  onSelectionChange: (selection: number[]) => void;
  /** Glisser-déposer : placer les pages (indices à partir de 0) avant la page d'origine `to`. */
  onMove: (pages: number[], to: number) => void;
  onContextMenu: (x: number, y: number) => void;
}

interface Item {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  task?: RenderTask;
  drawn: boolean;
}

/**
 * Liste de miniatures avec sélection (clic, ⌘/Ctrl, Maj), glisser-déposer et menu contextuel.
 * Une page n'est dessinée que lorsqu'elle est (presque) visible, puis libérée : 500 pages restent légères.
 * Sert aussi bien au panneau latéral (liste) qu'à la vue « Organiser les pages » (grille).
 */
export class PageList {
  readonly el: HTMLElement;
  private items: Item[] = [];
  private observer: IntersectionObserver;
  private selected = new Set<number>();
  private anchor = 0;
  private current = 1;
  private width: number;
  private ratio = 1.414;
  private dropTarget: { el: HTMLElement; side: 'before' | 'after' } | null = null;

  constructor(private pdf: PDFDocumentProxy, private opts: PageListOptions) {
    this.width = opts.width;
    this.el = h('div', { class: `thumbs thumbs-${opts.layout}`, role: 'listbox', 'aria-multiselectable': true, 'aria-label': t.panels.thumbnails });
    this.el.style.setProperty('--thumb-w', `${this.width}px`);
    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), { root: this.el, rootMargin: '600px 0px' });
    this.bindContainerEvents();
    void this.build();
  }

  get selection(): number[] {
    return [...this.selected].sort((a, b) => a - b);
  }

  get count(): number {
    return this.pdf.numPages;
  }

  private async build() {
    const first = await this.pdf.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    this.ratio = vp.height / vp.width;
    clear(this.el);
    for (let n = 1; n <= this.pdf.numPages; n++) {
      const canvas = h('canvas', { class: 'thumb-canvas' });
      this.sizeCanvas(canvas, this.ratio);
      const el = h(
        'div',
        {
          class: 'thumb',
          role: 'option',
          tabindex: 0,
          draggable: true,
          'data-page': n,
          'aria-selected': 'false',
          'aria-label': fmt(t.panels.thumbnailOf, { n }),
        },
        canvas,
        h('span', { class: 'thumb-label' }, String(n)),
      );
      this.items.push({ el, canvas, drawn: false });
      this.el.append(el);
      this.observer.observe(el);
    }
    this.paintSelection();
    this.setCurrent(this.current);
  }

  private sizeCanvas(canvas: HTMLCanvasElement, ratio: number) {
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${Math.round(this.width * ratio)}px`;
  }

  private indexOf(target: EventTarget | null): number {
    const el = (target as HTMLElement | null)?.closest?.('.thumb') as HTMLElement | null;
    return el ? Number(el.dataset.page) - 1 : -1;
  }

  private bindContainerEvents() {
    this.el.addEventListener('click', (e) => {
      const i = this.indexOf(e.target);
      if (i < 0) return;
      if (e.shiftKey) this.select(rangeSelection(this.anchor, i));
      else if (e.metaKey || e.ctrlKey) {
        const next = new Set(this.selected);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        this.anchor = i;
        this.select([...next]);
      } else {
        this.anchor = i;
        this.select([i]);
        if (this.opts.layout === 'list') this.opts.onOpen(i + 1);
      }
    });
    this.el.addEventListener('dblclick', (e) => {
      const i = this.indexOf(e.target);
      if (i >= 0 && this.opts.layout === 'grid') this.opts.onOpen(i + 1);
    });
    this.el.addEventListener('contextmenu', (e) => {
      const i = this.indexOf(e.target);
      if (i < 0) return;
      e.preventDefault();
      if (!this.selected.has(i)) {
        this.anchor = i;
        this.select([i]);
      }
      this.opts.onContextMenu(e.clientX, e.clientY);
    });
    this.el.addEventListener('keydown', (e) => {
      const i = this.indexOf(e.target);
      if (i < 0) return;
      const cols = this.opts.layout === 'grid' ? Math.max(1, Math.floor(this.el.clientWidth / (this.width + 28))) : 1;
      const step = e.key === 'ArrowDown' ? cols : e.key === 'ArrowUp' ? -cols : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step) {
        e.preventDefault();
        const to = Math.min(this.count - 1, Math.max(0, i + step));
        this.items[to].el.focus();
        if (e.shiftKey) this.select(rangeSelection(this.anchor, to));
        else {
          this.anchor = to;
          this.select([to]);
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.key === 'Enter') this.opts.onOpen(i + 1);
        else {
          this.anchor = i;
          this.select([i]);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.selectAll();
      }
    });

    // glisser-déposer
    this.el.addEventListener('dragstart', (e) => {
      const i = this.indexOf(e.target);
      if (i < 0 || !e.dataTransfer) return;
      if (!this.selected.has(i)) {
        this.anchor = i;
        this.select([i]);
      }
      e.dataTransfer.setData(PAGES_MIME, JSON.stringify(this.selection));
      e.dataTransfer.effectAllowed = 'move';
      this.el.classList.add('dragging-pages');
    });
    this.el.addEventListener('dragend', () => {
      this.el.classList.remove('dragging-pages');
      this.clearDropTarget();
    });
    this.el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes(PAGES_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const i = this.indexOf(e.target);
      if (i < 0) return;
      const rect = this.items[i].el.getBoundingClientRect();
      const after = this.opts.layout === 'grid' ? e.clientX > rect.left + rect.width / 2 : e.clientY > rect.top + rect.height / 2;
      this.setDropTarget(this.items[i].el, after ? 'after' : 'before');
    });
    this.el.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null || !this.el.contains(e.relatedTarget as Node)) this.clearDropTarget();
    });
    this.el.addEventListener('drop', (e) => {
      const raw = e.dataTransfer?.getData(PAGES_MIME);
      const target = this.dropTarget;
      this.clearDropTarget();
      if (!raw || !target) return;
      e.preventDefault();
      e.stopPropagation();
      const pages = normalizeSelection(JSON.parse(raw) as number[], this.count);
      const index = Number(target.el.dataset.page) - 1;
      this.opts.onMove(pages, target.side === 'after' ? index + 1 : index);
    });
  }

  private setDropTarget(el: HTMLElement, side: 'before' | 'after') {
    if (this.dropTarget?.el === el && this.dropTarget.side === side) return;
    this.clearDropTarget();
    el.classList.add(side === 'after' ? 'drop-after' : 'drop-before');
    this.dropTarget = { el, side };
  }
  private clearDropTarget() {
    this.dropTarget?.el.classList.remove('drop-before', 'drop-after');
    this.dropTarget = null;
  }

  // ───────────── sélection ─────────────

  select(selection: number[], silent = false) {
    this.selected = new Set(normalizeSelection(selection, this.count));
    this.paintSelection();
    if (!silent) this.opts.onSelectionChange(this.selection);
  }

  selectAll() {
    this.select(Array.from({ length: this.count }, (_, i) => i));
  }

  private paintSelection() {
    this.items.forEach((it, i) => {
      const on = this.selected.has(i);
      it.el.classList.toggle('selected', on);
      it.el.setAttribute('aria-selected', String(on));
    });
  }

  // ───────────── dessin des miniatures ─────────────

  private onIntersect(entries: IntersectionObserverEntry[]) {
    for (const e of entries) {
      const n = Number((e.target as HTMLElement).dataset.page);
      const item = this.items[n - 1];
      if (!item) continue;
      if (e.isIntersecting && !item.drawn) void this.draw(n);
      else if (!e.isIntersecting && item.drawn) this.release(n);
    }
  }

  private async draw(n: number) {
    const item = this.items[n - 1];
    item.drawn = true;
    try {
      const page = await this.pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (this.width * dpr) / base.width });
      const canvas = item.canvas;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      this.sizeCanvas(canvas, base.height / base.width);
      item.task = page.render({ canvas, viewport: vp, annotationMode: 0 });
      await item.task.promise;
      page.cleanup();
    } catch {
      /* rendu annulé (page quittée) ou échec isolé : la miniature reste vide */
    }
  }

  private release(n: number) {
    const item = this.items[n - 1];
    item.task?.cancel();
    item.canvas.width = 0;
    item.canvas.height = 0;
    this.sizeCanvas(item.canvas, this.ratio);
    item.drawn = false;
  }

  /** Change la taille des miniatures (grille) : tout est redessiné à la nouvelle taille. */
  setWidth(width: number) {
    this.width = width;
    this.el.style.setProperty('--thumb-w', `${width}px`);
    this.items.forEach((it, i) => {
      this.sizeCanvas(it.canvas, this.ratio);
      if (it.drawn) {
        this.release(i + 1);
        void this.draw(i + 1);
        it.drawn = true;
      }
    });
  }

  setCurrent(page: number) {
    this.current = page;
    this.items.forEach((it, i) => it.el.classList.toggle('current', i + 1 === page));
    const el = this.items[page - 1]?.el;
    if (!el || this.opts.layout === 'grid') return;
    const top = el.offsetTop;
    if (top < this.el.scrollTop || top + el.offsetHeight > this.el.scrollTop + this.el.clientHeight) {
      this.el.scrollTop = Math.max(0, top - 16);
    }
  }

  focusPage(index: number) {
    this.items[index]?.el.focus({ preventScroll: false });
  }

  destroy() {
    this.observer.disconnect();
    this.items.forEach((it) => it.task?.cancel());
    this.items = [];
  }
}
