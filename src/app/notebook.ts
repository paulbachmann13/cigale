/**
 * Carnets : « Nouveau carnet » (document neuf sur le papier de son choix, avec aperçus) et « Insérer des pages »
 * (papier, copie d'une page du document, ou pages d'un autre PDF) avant ou après une page.
 */
import { type PaperColor, type PaperSize, type PaperTemplate, PAPER_SIZES, paperPageSize } from '../data/paper';
import { fmt, t } from '../i18n/fr';
import { notebookOp } from '../pdf/ops-client';
import { modal, showMessage } from './dialogs';
import { h } from './dom';
import { paperPicker } from './paper-picker';

const SIZES = Object.keys(PAPER_SIZES) as PaperSize[];

function countInput(id: string, value: number, max: number): HTMLInputElement {
  return h('input', { type: 'number', id, min: '1', max: String(max), step: '1', value: String(value), inputmode: 'numeric' }) as HTMLInputElement;
}

/** « Nouveau carnet » : crée le document et le donne à `open` (onglet non enregistré). */
export function openNotebookDialog(open: (name: string, bytes: Uint8Array) => Promise<unknown>): void {
  const size = h('select', { id: 'nb-size' }, ...SIZES.map((k) => h('option', { value: k }, t.notebook.sizes[k]))) as HTMLSelectElement;
  const orient = h('select', { id: 'nb-orient' }, h('option', { value: 'portrait' }, t.notebook.portrait), h('option', { value: 'landscape' }, t.notebook.landscape)) as HTMLSelectElement;
  const pageSize = () => paperPageSize(size.value as PaperSize, orient.value === 'landscape');
  const picker = paperPicker({ template: 'seyes' }, pageSize, 'nb-paper');
  size.onchange = orient.onchange = () => picker.refresh();
  const pages = countInput('nb-pages', 10, 500);
  const error = h('p', { class: 'dialog-error', id: 'nb-error', role: 'alert' });
  modal((close) => [
    h('h2', {}, t.notebook.title),
    h('p', { class: 'hint' }, t.notebook.hint),
    picker.el,
    h('div', { class: 'paper-options' }, h('label', { class: 'form-row' }, t.notebook.size, size), h('label', { class: 'form-row' }, t.notebook.orientation, orient), h('label', { class: 'form-row' }, t.notebook.pages, pages)),
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'nb-cancel', onclick: close }, t.notebook.cancel),
      h(
        'button',
        {
          type: 'button',
          id: 'nb-create',
          class: 'primary',
          onclick: () => {
            const n = Number(pages.value);
            if (!Number.isInteger(n) || n < 1 || n > 500) {
              error.textContent = t.notebook.badCount;
              return;
            }
            close();
            const { template, color } = picker.value();
            void notebookOp({ template, color, size: size.value as PaperSize, landscape: orient.value === 'landscape', pages: n })
              .promise.then((bytes) => open(t.notebook.name, bytes))
              .catch((err) => showMessage(t.notebook.title, fmt(t.notebook.failed, { detail: String((err as Error)?.message ?? err) })));
          },
        },
        t.notebook.create,
      ),
    ),
  ]).id = 'dialog-notebook';
}

/** Ce que l'utilisateur veut insérer, et où (`at` : position d'insertion, à partir de 0). */
export type InsertChoice = { kind: 'paper'; template: PaperTemplate; color: PaperColor; count: number; at: number } | { kind: 'copy'; from: number; count: number; at: number } | { kind: 'file'; at: number };

export interface InsertContext {
  pageCount: number;
  /** Page visée (à partir de 0) : la sélection, sinon la page affichée. */
  target: number;
  /** Taille de cette page en points, pour l'aperçu des papiers. */
  pageSize: [number, number];
}

/** « Insérer des pages » : papier, copie d'une page, ou pages d'un autre PDF ; avant ou après une page. */
export function askInsertPages(ctx: InsertContext): Promise<InsertChoice | null> {
  return new Promise((resolve) => {
    let answer: InsertChoice | null = null;
    const n = ctx.target + 1;
    const source = (value: string, label: string, checked = false) =>
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'ip-source', value, id: `ip-source-${value}`, checked }), label);
    const picker = paperPicker({ template: 'lined' }, () => ctx.pageSize, 'ip-paper');
    const count = countInput('ip-count', 1, 200);
    const copyFrom = countInput('ip-copy-from', n, ctx.pageCount);
    const where = h(
      'select',
      { id: 'ip-where' },
      h('option', { value: 'after' }, fmt(t.notebook.afterPage, { n })),
      h('option', { value: 'before' }, fmt(t.notebook.beforePage, { n })),
      h('option', { value: 'start' }, t.notebook.atStart),
      h('option', { value: 'end' }, t.notebook.atEnd),
    ) as HTMLSelectElement;
    const paperBox = h('div', { id: 'ip-paper-box' }, picker.el);
    const copyBox = h('div', { id: 'ip-copy-box', hidden: true }, h('label', { class: 'form-row' }, t.notebook.copyOf, copyFrom));
    const fileBox = h('p', { id: 'ip-file-box', class: 'hint', hidden: true }, t.notebook.fileHint);
    const countRow = h('label', { class: 'form-row', id: 'ip-count-row' }, t.notebook.pages, count);
    const error = h('p', { class: 'dialog-error', id: 'ip-error', role: 'alert' });
    const current = () => (document.querySelector<HTMLInputElement>('input[name="ip-source"]:checked')?.value ?? 'paper') as 'paper' | 'copy' | 'file';
    const showSource = () => {
      const k = current();
      paperBox.hidden = k !== 'paper';
      copyBox.hidden = k !== 'copy';
      fileBox.hidden = k !== 'file';
      countRow.hidden = k === 'file';
      if (k === 'paper') picker.refresh();
    };
    modal(
      (close) => {
        const radios = h('div', { class: 'ip-sources' }, source('paper', t.notebook.srcPaper, true), source('copy', t.notebook.srcCopy), source('file', t.notebook.srcFile));
        radios.addEventListener('change', showSource);
        return [
          h('h2', {}, t.notebook.insertTitle),
          radios,
          paperBox,
          copyBox,
          fileBox,
          countRow,
          h('label', { class: 'form-row' }, t.notebook.where, where),
          error,
          h(
            'div',
            { class: 'dialog-actions' },
            h('button', { type: 'button', id: 'ip-cancel', onclick: close }, t.notebook.cancel),
            h(
              'button',
              {
                type: 'button',
                id: 'ip-insert',
                class: 'primary',
                onclick: () => {
                  const kind = current();
                  const c = Number(count.value);
                  if (kind !== 'file' && !(Number.isInteger(c) && c >= 1 && c <= 200)) {
                    error.textContent = t.notebook.badCountInsert;
                    return;
                  }
                  const from = Number(copyFrom.value);
                  if (kind === 'copy' && !(Number.isInteger(from) && from >= 1 && from <= ctx.pageCount)) {
                    error.textContent = fmt(t.notebook.badCopyPage, { max: ctx.pageCount });
                    return;
                  }
                  const at = where.value === 'before' ? ctx.target : where.value === 'after' ? ctx.target + 1 : where.value === 'start' ? 0 : ctx.pageCount;
                  if (kind === 'paper') answer = { kind, ...picker.value(), count: c, at };
                  else if (kind === 'copy') answer = { kind, from: from - 1, count: c, at };
                  else answer = { kind, at };
                  close();
                },
              },
              t.notebook.insert,
            ),
          ),
        ];
      },
      () => resolve(answer),
    ).id = 'dialog-insert-paper';
  });
}
