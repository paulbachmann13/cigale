/** Comparer le document ouvert avec un autre PDF : différences de texte, page par page (tout reste sur l'ordinateur). */
import { compareDocuments, withContext } from '../data/text-diff';
import { pageText } from '../data/text-layout';
import { fmt, plural, t } from '../i18n/fr';
import { loadPdf } from '../pdf/engine';
import { askPassword, modal } from './dialogs';
import { h, toast } from './dom';
import { piecesOf } from './export-text';
import { pickOnePdf } from './files';
import type { Session } from './session';

/** Le texte de chaque page d'un document pdf.js. */
async function textsOf(pdf: import('pdfjs-dist').PDFDocumentProxy, progress: (f: number) => void, cancelled: () => boolean): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    if (cancelled()) return out;
    out.push(pageText(await piecesOf(pdf, i)));
    progress((i + 1) / pdf.numPages);
  }
  return out;
}

export async function compareWithOther(s: Session, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void): Promise<void> {
  const file = await pickOnePdf();
  if (!file) return;
  let cancelled = false;
  const otherBytes = new Uint8Array(await file.arrayBuffer());
  const handle = loadPdf(otherBytes, { password: (incorrect) => askPassword(file.name, incorrect) });
  const progress = overlay(t.compare.preparing, () => ((cancelled = true), handle.cancel()));
  let other: import('pdfjs-dist').PDFDocumentProxy | null = null;
  try {
    other = await handle.promise;
    const half = (offset: number) => (f: number) => progress(offset + f / 2);
    const first = await textsOf(s.view.pdf, half(0), () => cancelled);
    const second = await textsOf(other, half(0.5), () => cancelled);
    idle();
    if (cancelled) return;
    showResult(s, file.name, first, second);
  } catch (err) {
    idle();
    if (!cancelled) toast(fmt(t.docTools.failed, { detail: String((err as Error)?.message ?? err) }));
  } finally {
    void other?.loadingTask.destroy();
  }
}

function showResult(s: Session, otherName: string, first: string[], second: string[]) {
  const cmp = compareDocuments(first, second);
  const list = h('div', { class: 'cmp-list', id: 'cmp-list', hidden: cmp.changed.length === 0 });
  for (const p of cmp.changed) {
    const label = p.only === 'second' ? t.compare.onlyOther : p.only === 'first' ? t.compare.onlyThis : '';
    const body = h('p', { class: 'cmp-text' });
    for (const op of withContext(p.ops)) {
      const text = `${op.words.join(' ')} `;
      body.append(op.kind === 'equal' ? text : h('span', { class: op.kind === 'add' ? 'cmp-add' : 'cmp-del' }, text));
    }
    const go = p.page < s.view.pageCount ? h('button', { type: 'button', class: 'link', onclick: () => (s.view.page = p.page + 1) }, t.compare.go) : null;
    list.append(h('details', { class: 'cmp-page', 'data-page': String(p.page + 1), open: cmp.changed.length <= 3 }, h('summary', {}, `${fmt(t.compare.page, { n: p.page + 1 })} — +${p.added} / −${p.removed}${label ? ` (${label})` : ''}`), body, go));
  }
  modal((close) => [
    h('h2', {}, t.compare.title),
    h('p', { class: 'hint', id: 'cmp-names' }, fmt(t.compare.between, { a: s.name, na: first.length, b: otherName, nb: second.length })),
    h(
      'p',
      { class: 'cmp-summary', id: 'cmp-summary' },
      cmp.changed.length === 0 ? t.compare.same : `${plural(cmp.changed.length, t.compare.pagesDiffer)} · ${plural(cmp.added, t.compare.added)} · ${plural(cmp.removed, t.compare.removed)}`,
    ),
    list,
    h('p', { class: 'hint' }, t.compare.limits),
    h('div', { class: 'dialog-actions' }, h('button', { type: 'button', id: 'cmp-close', class: 'primary', onclick: close }, t.compare.close)),
  ]).id = 'dialog-compare';
}
