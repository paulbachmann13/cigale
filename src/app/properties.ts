/** Propriétés du document : informations (lecture seule) et titre, auteur, sujet, mots-clés (modifiables). */
import { fromPdfDate } from '../data/annotations';
import { formatSize } from '../data/recent';
import { t } from '../i18n/fr';
import { modal } from './dialogs';
import { h } from './dom';
import type { Editing } from './editing';
import type { Session } from './session';

interface PdfInfo {
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
  Creator?: string;
  Producer?: string;
  CreationDate?: string;
  ModDate?: string;
  PDFFormatVersion?: string;
}

const date = (s: string | undefined): string => {
  const iso = s ? fromPdfDate(s) : '';
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : t.properties.unknown;
};

export async function openPropertiesDialog(s: Session, editing: Editing): Promise<void> {
  await editing.flushForm(s);
  const meta = await s.view.pdf.getMetadata().catch(() => null);
  const info = ((meta?.info as PdfInfo | undefined) ?? {}) as PdfInfo;
  const first = await s.view.pdf.getPage(1);
  const v = first.view;
  const mm = (pt: number) => Math.round((pt * 25.4) / 72);
  const size = `${mm(Math.abs(v[2] - v[0]))} × ${mm(Math.abs(v[3] - v[1]))} mm`;
  const input = (id: string, label: string, value: string, hint = '') => {
    const el = h('input', { type: 'text', id, value, autocomplete: 'off', 'aria-label': label }) as HTMLInputElement;
    return { el, row: h('label', { class: 'form-row' }, hint ? `${label} (${hint})` : label, el) };
  };
  const title = input('prop-title', t.properties.docTitle, info.Title ?? '');
  const author = input('prop-author', t.properties.author, info.Author ?? '');
  const subject = input('prop-subject', t.properties.subject, info.Subject ?? '');
  const keywords = input('prop-keywords', t.properties.keywords, info.Keywords ?? '', t.properties.keywordsHint);
  const row = (label: string, value: string) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, value));
  const table = h(
    'table',
    { class: 'props-table', id: 'prop-table' },
    row(t.properties.fileName, s.name),
    row(t.properties.fileSize, formatSize(s.history.current.length)),
    row(t.properties.pages, String(s.view.pageCount)),
    row(t.properties.pageSize, size),
    row(t.properties.version, info.PDFFormatVersion ?? t.properties.unknown),
    row(t.properties.creator, info.Creator || t.properties.unknown),
    row(t.properties.producer, info.Producer || t.properties.unknown),
    row(t.properties.created, date(info.CreationDate)),
    row(t.properties.modified, date(info.ModDate)),
    row(t.properties.protection, s.password !== undefined ? t.properties.protectedYes : t.properties.protectedNo),
  );
  modal((close) => [
    h('h2', {}, t.properties.title),
    table,
    h('div', { class: 'form' }, title.row, author.row, subject.row, keywords.row),
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'prop-close', onclick: close }, t.properties.close),
      h(
        'button',
        {
          type: 'button',
          id: 'prop-apply',
          class: 'primary',
          onclick: () => {
            // seulement ce qui a changé : le reste du document n'est pas touché
            const next = { title: title.el.value.trim(), author: author.el.value.trim(), subject: subject.el.value.trim(), keywords: keywords.el.value.trim() };
            const changed = Object.fromEntries(Object.entries(next).filter(([k, val]) => val !== (({ title: info.Title, author: info.Author, subject: info.Subject, keywords: info.Keywords } as Record<string, string | undefined>)[k] ?? '')));
            close();
            if (Object.keys(changed).length === 0) return;
            void editing.setInfo(s, changed);
          },
        },
        t.properties.apply,
      ),
    ),
  ]).id = 'dialog-properties';
}
