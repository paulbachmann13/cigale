/** « Extraire une zone » : le rectangle tracé sur une page devient un nouveau PDF (vectoriel ou image). */
import { fmt, t } from '../i18n/fr';
import { Cancelled, regionImageOp, regionOp } from '../pdf/ops-client';
import { PageOpError } from '../pdf/page-ops';
import { modal } from './dialogs';
import { h, toast } from './dom';
import type { Session } from './session';

export interface RegionHost {
  busy: (text: string, onCancel: () => void) => unknown;
  idle: () => void;
  openNew: (name: string, bytes: Uint8Array) => unknown;
}

type Rect = [number, number, number, number];
const DPI = 300;
const MAX_PIXELS = 2 ** 24;

export function openRegionDialog(host: RegionHost, s: Session, pageIndex: number, rect: Rect): void {
  const vector = h('input', { type: 'radio', name: 'region-mode', id: 'region-vector', value: 'vector', checked: true });
  const image = h('input', { type: 'radio', name: 'region-mode', id: 'region-image', value: 'image' });
  modal((close) => [
    h('h2', {}, t.docTools.regionTitle),
    h('p', { class: 'hint' }, fmt(t.docTools.regionHint, { page: pageIndex + 1 })),
    h('label', { class: 'check' }, vector, h('span', {}, h('strong', {}, t.docTools.regionVector), h('br'), h('small', {}, t.docTools.regionVectorHint))),
    h('label', { class: 'check' }, image, h('span', {}, h('strong', {}, t.docTools.regionImage), h('br'), h('small', {}, t.docTools.regionImageHint))),
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'tool-cancel', onclick: close }, t.docTools.cancel),
      h(
        'button',
        {
          type: 'button',
          id: 'tool-apply',
          class: 'primary',
          onclick: () => {
            close();
            void createRegion(host, s, pageIndex, rect, image.checked);
          },
        },
        t.docTools.regionGo,
      ),
    ),
  ]).id = 'dialog-region';
}

/** Image de la zone (rendue par pdf.js à 300 dpi, plafonnée) et sa taille en points. */
async function renderRegion(s: Session, pageIndex: number, rect: Rect): Promise<{ png: Uint8Array; widthPt: number; heightPt: number }> {
  const page = await s.view.pdf.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const [ax, ay] = base.convertToViewportPoint(rect[0], rect[1]);
  const [bx, by] = base.convertToViewportPoint(rect[2], rect[3]);
  // bornée à la page, comme en mode vectoriel
  const [x0, x1] = [Math.max(0, Math.min(ax, bx)), Math.min(base.width, Math.max(ax, bx))];
  const [y0, y1] = [Math.max(0, Math.min(ay, by)), Math.min(base.height, Math.max(ay, by))];
  const [x, y, widthPt, heightPt] = [x0, y0, x1 - x0, y1 - y0];
  if (!(widthPt >= 10 && heightPt >= 10)) throw new PageOpError('structure');
  const scale = Math.min(DPI / 72, Math.sqrt(MAX_PIXELS / (widthPt * heightPt)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(widthPt * scale));
  canvas.height = Math.max(1, Math.ceil(heightPt * scale));
  try {
    await page.render({ canvas, viewport: page.getViewport({ scale, offsetX: -x * scale, offsetY: -y * scale }) }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('png');
    return { png: new Uint8Array(await blob.arrayBuffer()), widthPt, heightPt };
  } finally {
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
}

async function createRegion(host: RegionHost, s: Session, pageIndex: number, rect: Rect, asImage: boolean): Promise<void> {
  let cancelled = false;
  let cancel: (() => void) | undefined;
  host.busy(t.busy.working, () => {
    cancelled = true;
    cancel?.();
    host.idle();
  });
  try {
    let bytes: Uint8Array;
    if (asImage) {
      const r = await renderRegion(s, pageIndex, rect);
      if (cancelled) return;
      const handle = regionImageOp(r.png, r.widthPt, r.heightPt);
      cancel = () => handle.cancel();
      bytes = await handle.promise;
    } else {
      const handle = regionOp(s.history.current, pageIndex, rect, s.password, s.view.pageCount);
      cancel = () => handle.cancel();
      bytes = await handle.promise;
    }
    if (cancelled) return;
    host.idle();
    const name = `${s.name.replace(/\.pdf$/i, '')} (zone).pdf`;
    await host.openNew(name, bytes);
    toast(fmt(t.docTools.regionDone, { name }));
  } catch (err) {
    if (cancelled || err instanceof Cancelled) return;
    host.idle();
    toast(err instanceof PageOpError ? t.docTools.regionTooSmall : fmt(t.docTools.failed, { detail: String((err as Error)?.message ?? err) }));
  }
}
