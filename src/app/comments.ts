/** Panneau « Commentaires » : tous les commentaires du document par page, avec réponses, modification et suppression. */
import type { Annot } from '../data/annotations';
import { fmt, plural, t } from '../i18n/fr';
import { h } from './dom';
import { type IconName, icon } from './icons';

export interface CommentsHost {
  select(a: Annot): void;
  edit(id: string, text: string): void;
  remove(id: string): void;
  reply(parentId: string, page: number, text: string): void;
}

const ICON: Record<string, IconName> = {
  highlight: 'highlight',
  underline: 'underline',
  strikeout: 'strikeout',
  note: 'note',
  freetext: 'text',
  ink: 'pen',
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line',
  arrow: 'arrow',
  stamp: 'stamp',
  other: 'comment',
};

const when = (iso: string) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export class CommentsPanel {
  readonly el = h('div', { class: 'comments', id: 'comments-panel' });
  private filter = h('input', { type: 'search', id: 'comments-filter', placeholder: t.annot.filter, 'aria-label': t.annot.filter });
  private count = h('span', { class: 'comments-count', id: 'comments-count' });
  private list = h('div', { class: 'comments-list' });
  private annots: Annot[] = [];
  private selectedId: string | null = null;
  private openReply: string | null = null;

  constructor(private host: CommentsHost) {
    this.filter.addEventListener('input', () => this.render());
    this.el.append(h('div', { class: 'comments-head' }, this.filter, this.count), this.list);
  }

  update(annots: Annot[], selectedId: string | null) {
    this.annots = annots;
    this.selectedId = selectedId;
    this.render();
  }

  private render() {
    const q = this.filter.value.trim().toLowerCase();
    const top = this.annots.filter((a) => !a.replyTo);
    const repliesOf = (id: string) => this.annots.filter((a) => a.replyTo === id);
    const match = (a: Annot) => !q || [a.contents, a.author, t.annot.kinds[a.kind]].some((s) => s.toLowerCase().includes(q)) || repliesOf(a.id).some((r) => r.contents.toLowerCase().includes(q));
    const shown = top.filter(match);
    this.count.textContent = plural(top.length, t.annot.count);
    this.list.replaceChildren();
    if (top.length === 0) return void this.list.append(h('p', { class: 'empty' }, t.annot.panelEmpty));
    let page = -1;
    for (const a of shown.sort((x, y) => x.page - y.page || y.rect[3] - x.rect[3])) {
      if (a.page !== page) {
        page = a.page;
        this.list.append(h('h4', { class: 'comments-page' }, fmt(t.annot.page, { n: page + 1 })));
      }
      this.list.append(this.card(a, repliesOf(a.id)));
    }
  }

  private card(a: Annot, replies: Annot[]): HTMLElement {
    const text = h('p', { class: 'comment-text', title: t.annot.noteWrite }, a.contents || t.annot.kinds[a.kind]);
    if (!a.contents) text.classList.add('muted');
    text.onclick = (e) => {
      e.stopPropagation();
      this.host.select(a);
      this.edit(a, text);
    };
    const card = h(
      'div',
      { class: `comment${a.id === this.selectedId ? ' selected' : ''}`, 'data-id': a.id, tabindex: 0, onclick: () => this.host.select(a) },
      h(
        'div',
        { class: 'comment-head' },
        h('span', { class: 'comment-icon', style: `color: ${cssColor(a)}` }, icon(ICON[a.kind] ?? 'comment', 16)),
        h('span', { class: 'comment-author' }, a.author || t.annot.defaultAuthor),
        h('span', { class: 'comment-date' }, when(a.date)),
        h('button', { class: 'tool mini-tool', title: t.annot.delete, 'aria-label': t.annot.delete, onclick: (e: Event) => (e.stopPropagation(), this.host.remove(a.id)) }, icon('trash', 14)),
      ),
      a.foreign ? h('span', { class: 'comment-foreign' }, t.annot.foreign) : null,
      text,
    );
    for (const r of replies) {
      card.append(
        h(
          'div',
          { class: 'comment-reply', 'data-id': r.id },
          h('div', { class: 'comment-head' }, h('span', { class: 'comment-author' }, r.author || t.annot.defaultAuthor), h('span', { class: 'comment-date' }, when(r.date)),
            h('button', { class: 'tool mini-tool', title: t.annot.delete, 'aria-label': t.annot.delete, onclick: (e: Event) => (e.stopPropagation(), this.host.remove(r.id)) }, icon('trash', 14))),
          h('p', { class: 'comment-text' }, r.contents),
        ),
      );
    }
    const open = this.openReply === a.id;
    const replyBtn = h('button', { class: 'link', type: 'button', 'data-reply': a.id, onclick: (e: Event) => (e.stopPropagation(), (this.openReply = open ? null : a.id), this.render()) }, t.annot.reply);
    card.append(replyBtn);
    if (open) {
      const input = h('textarea', { class: 'annot-text', rows: 2, placeholder: t.annot.replyPlaceholder, 'aria-label': t.annot.reply });
      const send = () => {
        const v = input.value.trim();
        if (!v) return;
        this.openReply = null;
        this.host.reply(a.id, a.page, v);
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send());
      input.addEventListener('click', (e) => e.stopPropagation());
      card.append(input, h('button', { type: 'button', class: 'primary', 'data-send': a.id, onclick: (e: Event) => (e.stopPropagation(), send()) }, t.annot.send));
      queueMicrotask(() => input.focus());
    }
    return card;
  }

  private edit(a: Annot, p: HTMLElement) {
    const area = h('textarea', { class: 'annot-text', rows: 3, 'aria-label': t.annot.noteWrite });
    area.value = a.contents;
    const done = (save: boolean) => {
      if (save && area.value.trim() !== a.contents) this.host.edit(a.id, area.value.trim());
      else this.render();
    };
    area.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') done(false);
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) done(true);
    });
    area.addEventListener('blur', () => done(true));
    area.addEventListener('click', (e) => e.stopPropagation());
    p.replaceWith(area);
    area.focus();
  }
}

const cssColor = (a: Annot) => `rgb(${a.color.map((c) => Math.round(c * 255)).join(' ')})`;
