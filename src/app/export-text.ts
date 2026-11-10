/** Convertir en texte ou en Word : le texte de chaque page est remis en lignes et en paragraphes (tout reste sur l'ordinateur). */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildDocx } from '../data/docx';
import { sanitizeFileName } from '../data/page-ranges';
import { type TextPiece, pageText, toParagraphs } from '../data/text-layout';
import { fmt, t } from '../i18n/fr';
import { modal } from './dialogs';
import { h, toast } from './dom';
import type { Editing } from './editing';
import { scopeControls } from './page-tools';
import { downloadBytes } from './save';
import type { Session } from './session';

export type TextFormat = 'txt' | 'docx';

export function openExportTextDialog(s: Session, editing: Editing, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void): void {
  const format = h('select', { id: 'text-format' }, h('option', { value: 'docx' }, t.docTools.textWord), h('option', { value: 'txt' }, t.docTools.textPlain)) as HTMLSelectElement;
  const error = h('p', { class: 'dialog-error', id: 'text-error', role: 'alert' });
  const scope = scopeControls(s, error);
  modal((close) => [
    h('h2', {}, t.docTools.textTitle),
    h('p', { class: 'hint' }, t.docTools.textHint),
    h('label', { class: 'form-row' }, t.docTools.exportFormat, format),
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
            void editing.settleView(s).then(() => run(s, pages ?? Array.from({ length: s.view.pageCount }, (_, i) => i), format.value as TextFormat, overlay, idle));
          },
        },
        t.docTools.textGo,
      ),
    ),
  ]).id = 'dialog-export-text';
}

/** Les morceaux de texte d'une page, avec leur position. */
export async function piecesOf(pdf: PDFDocumentProxy, index: number): Promise<TextPiece[]> {
  const page = await pdf.getPage(index + 1);
  try {
    const content = await page.getTextContent();
    const out: TextPiece[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      out.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height || Math.abs(it.transform[3]) });
    }
    return out;
  } finally {
    page.cleanup();
  }
}

async function run(s: Session, pages: number[], format: TextFormat, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void) {
  let cancelled = false;
  const progress = overlay(t.docTools.textPreparing, () => (cancelled = true));
  try {
    const perPage: TextPiece[][] = [];
    for (const [k, index] of [...new Set(pages)].sort((a, b) => a - b).entries()) {
      if (cancelled) return void idle();
      perPage.push(await piecesOf(s.view.pdf, index));
      progress((k + 1) / pages.length);
    }
    idle();
    if (cancelled) return;
    const total = perPage.reduce((n, p) => n + p.reduce((m, x) => m + x.str.trim().length, 0), 0);
    if (total === 0) return void toast(t.docTools.textNone); // un scan : proposer la reconnaissance de texte
    const base = sanitizeFileName(s.name.replace(/\.pdf$/i, ''));
    const name = `${base}.${format}`;
    const bytes =
      format === 'txt'
        ? new TextEncoder().encode(perPage.map((p) => pageText(p)).filter(Boolean).join('\n\n') + '\n')
        : buildDocx(perPage.map((p) => toParagraphs(p)), base);
    const mime = format === 'txt' ? 'text/plain;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (await downloadBytes(name, bytes, mime)) toast(fmt(t.docTools.textDone, { name }));
  } catch (err) {
    idle();
    toast(fmt(t.docTools.failed, { detail: String((err as Error)?.message ?? err) }));
  }
}
