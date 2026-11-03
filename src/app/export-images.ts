/** Exporter les pages en images (PNG ou JPEG) dans une archive .zip. */
import { sanitizeFileName, uniqueNames } from '../data/page-ranges';
import { fmt, t } from '../i18n/fr';
import { zipOperation } from '../pdf/ops-client';
import { modal } from './dialogs';
import { h, toast } from './dom';
import { scopeControls } from './page-tools';
import { downloadBytes } from './save';
import type { Session } from './session';

const MAX_PIXELS = 2 ** 25;

export function openExportImagesDialog(s: Session, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void): void {
  const format = h('select', { id: 'img-format' }, h('option', { value: 'png' }, 'PNG'), h('option', { value: 'jpeg' }, 'JPEG'));
  const dpi = h('select', { id: 'img-dpi' }, ...[72, 150, 300].map((n) => h('option', { value: String(n), selected: n === 150 }, `${n} dpi`)));
  const error = h('p', { class: 'dialog-error', id: 'img-error', role: 'alert' });
  const scope = scopeControls(s, error);
  modal((close) => [
    h('h2', {}, t.docTools.exportTitle),
    h('div', { class: 'form-grid' }, h('label', { class: 'form-row' }, t.docTools.exportFormat, format), h('label', { class: 'form-row' }, t.docTools.exportDpi, dpi)),
    scope.el,
    error,
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
            const pages = scope.read();
            if (pages === null) return;
            close();
            void run(s, pages ?? Array.from({ length: s.view.pageCount }, (_, i) => i), format.value as 'png' | 'jpeg', Number(dpi.value), overlay, idle);
          },
        },
        t.docTools.exportGo,
      ),
    ),
  ]).id = 'dialog-export-images';
}

async function run(s: Session, pages: number[], type: 'png' | 'jpeg', dpi: number, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void) {
  if (pages.length === 0) return void toast(t.docTools.tooManyPages);
  let cancelled = false;
  const progress = overlay(t.docTools.exportPreparing, () => (cancelled = true));
  const base = sanitizeFileName(s.name.replace(/\.pdf$/i, ''));
  const ext = type === 'png' ? 'png' : 'jpg';
  const files: { name: string; bytes: Uint8Array }[] = [];
  try {
    for (const [k, index] of pages.entries()) {
      if (cancelled) return void idle();
      const page = await s.view.pdf.getPage(index + 1);
      const b = page.getViewport({ scale: 1 });
      const scale = Math.min(dpi / 72, Math.sqrt(MAX_PIXELS / (b.width * b.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport, annotationMode: 1 }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type === 'png' ? 'image/png' : 'image/jpeg', 0.92));
      canvas.width = canvas.height = 0;
      page.cleanup();
      if (!blob) throw new Error('image');
      files.push({ name: `${base} - page ${index + 1}.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      progress((k + 1) / pages.length);
    }
    const names = uniqueNames(files.map((f) => f.name));
    const zip = await zipOperation(files.map((f, i) => ({ name: names[i], bytes: f.bytes }))).promise;
    idle();
    const zipName = `${base} - images.zip`;
    if (await downloadBytes(zipName, zip, 'application/zip')) toast(fmt(t.docTools.exportDone, { name: zipName, n: files.length }));
  } catch (err) {
    idle();
    toast(fmt(t.docTools.failed, { detail: String((err as Error).message ?? err) }));
  }
}
