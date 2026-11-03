/**
 * Impression (⌘P) : chaque page est dessinée en image (annotations comprises) dans une zone réservée à l'impression,
 * puis on ouvre la boîte d'impression du système (qui propose aussi « Enregistrer au format PDF »).
 * Même méthode dans le navigateur et dans l'application Mac (WebKit n'imprime pas un cadre, seulement la fenêtre).
 */
import { parseRanges, rangesToIndices } from '../data/page-ranges';
import { fmt, t } from '../i18n/fr';
import { modal, showMessage } from './dialogs';
import { h, toast } from './dom';
import type { Session } from './session';

const DPI = 200;
const MAX_PAGES = 300;

/** Boîte « Imprimer » : toutes les pages, la page affichée, ou des plages. Renvoie les indices, ou null si annulé. */
function askPages(s: Session): Promise<number[] | null> {
  const total = s.view.pageCount;
  return new Promise((resolve) => {
    let answer: number[] | null = null;
    const radio = (id: string, label: string, checked = false) => {
      const input = h('input', { type: 'radio', name: 'print-scope', id, checked });
      return { input, el: h('label', { class: 'check' }, input, label) };
    };
    const all = radio('print-all', t.print.all, true);
    const current = radio('print-current', fmt(t.print.current, { n: s.view.page }));
    const custom = radio('print-range', t.print.range);
    const range = h('input', { type: 'text', id: 'print-range-text', placeholder: '1-3, 5', 'aria-label': t.print.range });
    range.addEventListener('focus', () => (custom.input.checked = true));
    const error = h('p', { class: 'dialog-error', id: 'print-error', role: 'alert' });
    const dlg = modal((close) => [
      h('h2', {}, t.print.title),
      h('div', { class: 'split-modes', style: 'flex-direction:column;gap:8px' }, all.el, current.el, h('div', { class: 'combine-tools' }, custom.el, range)),
      error,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', id: 'print-cancel', onclick: close }, t.print.cancel),
        h(
          'button',
          {
            type: 'button',
            id: 'print-go',
            class: 'primary',
            onclick: () => {
              if (all.input.checked) answer = Array.from({ length: total }, (_, i) => i);
              else if (current.input.checked) answer = [s.view.page - 1];
              else {
                const r = parseRanges(range.value, total);
                if (!r.ok) return void (error.textContent = fmt(t.print.rangeError, { token: r.token, total }));
                answer = rangesToIndices(r.ranges);
              }
              if (answer.length > MAX_PAGES) return void ((error.textContent = fmt(t.print.tooMany, { max: MAX_PAGES })), (answer = null));
              close();
            },
          },
          t.print.go,
        ),
      ),
    ], () => resolve(answer));
    dlg.id = 'dialog-print';
  });
}

export async function printDocument(s: Session, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void): Promise<void> {
  const pages = await askPages(s);
  if (!pages || pages.length === 0) return;
  document.getElementById('print-root')?.remove(); // une impression précédente non nettoyée
  document.getElementById('print-style')?.remove();
  let cancelled = false;
  const progress = overlay(t.print.preparing, () => (cancelled = true));
  const root = h('div', { id: 'print-root', 'aria-hidden': 'true' });
  document.body.append(root);
  const urls: string[] = [];
  let firstSize: [number, number] = [595, 842];
  const cleanup = () => {
    root.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
    document.getElementById('print-style')?.remove();
  };
  try {
    const pdf = s.view.pdf;
    for (const [k, index] of pages.entries()) {
      if (cancelled) return cleanup();
      const page = await pdf.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      if (k === 0) firstSize = [base.width, base.height];
      const scale = Math.min(DPI / 72, Math.sqrt(2 ** 25 / (base.width * base.height))); // pas plus de 33 Mpx par page
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      try {
        await page.render({ canvas, viewport, annotationMode: 2 }).promise;
      } finally {
        page.cleanup();
      }
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error('image');
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const img = h('img', { src: url, alt: '' });
      img.style.aspectRatio = `${base.width} / ${base.height}`;
      root.append(img);
      progress((k + 1) / pages.length);
    }
    // Les images doivent être décodées avant d'imprimer, sinon des pages sortent blanches.
    await Promise.all(Array.from(root.querySelectorAll('img')).map((i) => i.decode().catch(() => undefined)));
    if (cancelled) return cleanup();
    const style = h('style', { id: 'print-style' }, `@page { size: ${(firstSize[0] / 72).toFixed(3)}in ${(firstSize[1] / 72).toFixed(3)}in; margin: 0 }`);
    document.head.append(style);
    idle();
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    // certains navigateurs ne signalent pas la fin : on nettoie de toute façon plus tard
    window.setTimeout(cleanup, 10 * 60 * 1000);
  } catch (err) {
    idle();
    cleanup();
    await showMessage(t.errors.title, fmt(t.print.failed, { detail: String((err as Error).message ?? err) }));
  } finally {
    idle();
  }
  void toast;
}
