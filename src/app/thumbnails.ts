import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { fmt, t } from '../i18n/fr';
import { clear, h } from './dom';

const THUMB_WIDTH = 132;

/** Panneau de miniatures : une page n'est dessinée que quand elle est (presque) visible, puis libérée. */
export class ThumbnailPanel {
  readonly el = h('div', { class: 'thumbs', role: 'list', 'aria-label': t.panels.thumbnails });
  private items: { li: HTMLElement; canvas: HTMLCanvasElement; task?: RenderTask; drawn: boolean }[] = [];
  private observer: IntersectionObserver;
  private current = 1;

  constructor(private pdf: PDFDocumentProxy, private onSelect: (page: number) => void) {
    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), { root: this.el, rootMargin: '600px 0px' });
    void this.build();
  }

  private async build() {
    const first = await this.pdf.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    const ratio = vp.height / vp.width;
    clear(this.el);
    for (let n = 1; n <= this.pdf.numPages; n++) {
      const canvas = h('canvas', { class: 'thumb-canvas' });
      canvas.style.width = `${THUMB_WIDTH}px`;
      canvas.style.height = `${Math.round(THUMB_WIDTH * ratio)}px`;
      const li = h(
        'button',
        { class: 'thumb', role: 'listitem', 'data-page': n, 'aria-label': fmt(t.panels.thumbnailOf, { n }), onclick: () => this.onSelect(n) },
        canvas,
        h('span', { class: 'thumb-label' }, String(n)),
      );
      this.items.push({ li, canvas, drawn: false });
      this.el.append(li);
      this.observer.observe(li);
    }
    this.setCurrent(this.current);
  }

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
      const scale = (THUMB_WIDTH * dpr) / base.width;
      const vp = page.getViewport({ scale });
      const canvas = item.canvas;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${THUMB_WIDTH}px`;
      canvas.style.height = `${Math.round((THUMB_WIDTH * base.height) / base.width)}px`;
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
    item.canvas.style.width = `${THUMB_WIDTH}px`;
    item.drawn = false;
  }

  setCurrent(page: number) {
    this.current = page;
    this.items.forEach((it, i) => it.li.classList.toggle('current', i + 1 === page));
    const li = this.items[page - 1]?.li;
    if (!li) return;
    const top = li.offsetTop;
    if (top < this.el.scrollTop || top + li.offsetHeight > this.el.scrollTop + this.el.clientHeight) {
      this.el.scrollTop = Math.max(0, top - 16);
    }
  }

  destroy() {
    this.observer.disconnect();
    this.items.forEach((_, i) => this.items[i].task?.cancel());
    this.items = [];
  }
}
