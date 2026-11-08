/**
 * Carnets : « Nouveau carnet » (document neuf sur le papier de son choix) et « Insérer des pages » avec un papier.
 */
import { fmt, t } from '../i18n/fr';
import { type PaperSize, type PaperTemplate, PAPER_SIZES, PAPER_TEMPLATES } from '../pdf/notebook-ops';
import { notebookOp } from '../pdf/ops-client';
import { modal, showMessage } from './dialogs';
import { h } from './dom';

const SIZES = Object.keys(PAPER_SIZES) as PaperSize[];

function paperSelect(id: string, value: PaperTemplate): HTMLSelectElement {
  const sel = h('select', { id }, ...PAPER_TEMPLATES.map((k) => h('option', { value: k }, t.notebook.papers[k]))) as HTMLSelectElement;
  sel.value = value;
  return sel;
}

function countInput(id: string, value: number, max: number): HTMLInputElement {
  return h('input', { type: 'number', id, min: '1', max: String(max), step: '1', value: String(value), inputmode: 'numeric' }) as HTMLInputElement;
}

/** « Nouveau carnet » : crée le document et le donne à `open` (onglet non enregistré). */
export function openNotebookDialog(open: (name: string, bytes: Uint8Array) => Promise<unknown>): void {
  const paper = paperSelect('nb-paper', 'seyes');
  const size = h('select', { id: 'nb-size' }, ...SIZES.map((k) => h('option', { value: k }, t.notebook.sizes[k]))) as HTMLSelectElement;
  const orient = h('select', { id: 'nb-orient' }, h('option', { value: 'portrait' }, t.notebook.portrait), h('option', { value: 'landscape' }, t.notebook.landscape)) as HTMLSelectElement;
  const pages = countInput('nb-pages', 10, 500);
  const error = h('p', { class: 'dialog-error', id: 'nb-error', role: 'alert' });
  modal((close) => [
    h('h2', {}, t.notebook.title),
    h('p', { class: 'hint' }, t.notebook.hint),
    h('label', { class: 'form-row' }, t.notebook.paper, paper),
    h('label', { class: 'form-row' }, t.notebook.size, size),
    h('label', { class: 'form-row' }, t.notebook.orientation, orient),
    h('label', { class: 'form-row' }, t.notebook.pages, pages),
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
            void notebookOp({ template: paper.value as PaperTemplate, size: size.value as PaperSize, landscape: orient.value === 'landscape', pages: n })
              .promise.then((bytes) => open(t.notebook.name, bytes))
              .catch((err) => showMessage(t.notebook.title, fmt(t.notebook.failed, { detail: String((err as Error)?.message ?? err) })));
          },
        },
        t.notebook.create,
      ),
    ),
  ]).id = 'dialog-notebook';
}

/** « Insérer des pages » avec un papier : renvoie le choix, ou null si on annule. */
export function askInsertPaper(): Promise<{ template: PaperTemplate; count: number; side: 'before' | 'after' } | null> {
  return new Promise((resolve) => {
    let answer: { template: PaperTemplate; count: number; side: 'before' | 'after' } | null = null;
    const paper = paperSelect('ip-paper', 'lined');
    const count = countInput('ip-count', 1, 200);
    const side = h('select', { id: 'ip-side' }, h('option', { value: 'after' }, t.notebook.after), h('option', { value: 'before' }, t.notebook.before)) as HTMLSelectElement;
    const error = h('p', { class: 'dialog-error', id: 'ip-error', role: 'alert' });
    modal(
      (close) => [
        h('h2', {}, t.notebook.insertTitle),
        h('label', { class: 'form-row' }, t.notebook.paper, paper),
        h('label', { class: 'form-row' }, t.notebook.pages, count),
        h('label', { class: 'form-row' }, t.notebook.where, side),
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
                const n = Number(count.value);
                if (!Number.isInteger(n) || n < 1 || n > 200) {
                  error.textContent = t.notebook.badCountInsert;
                  return;
                }
                answer = { template: paper.value as PaperTemplate, count: n, side: side.value as 'before' | 'after' };
                close();
              },
            },
            t.notebook.insert,
          ),
        ),
      ],
      () => resolve(answer),
    ).id = 'dialog-insert-paper';
  });
}
