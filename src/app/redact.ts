/**
 * Appliquer le caviardage : les pages qui portent des zones sont rendues en image (zones noircies) puis remplacent les
 * pages d'origine (voir src/pdf/redact-ops.ts). Le rendu se fait ici (pdf.js a besoin d'un canevas).
 */
import { fmt, t } from '../i18n/fr';
import { modal } from './dialogs';
import { h, toast } from './dom';
import type { Editing } from './editing';
import type { RedactedPage } from '../pdf/redact-ops';
import type { Session } from './session';

const DPI = 200;

interface Choice {
  stripMetadata: boolean;
  removeBookmarks: boolean;
  removeAttachments: boolean;
  /** Effacer l'historique Annuler et les copies de sécurité de ce document (elles contiennent le texte d'origine). */
  clearHistory: boolean;
}

function confirmRedaction(n: number, m: number): Promise<Choice | null> {
  return new Promise((resolve) => {
    let answer: Choice | null = null;
    const meta = h('input', { type: 'checkbox', id: 'redact-meta', checked: true });
    const marks = h('input', { type: 'checkbox', id: 'redact-bookmarks', checked: true });
    const files = h('input', { type: 'checkbox', id: 'redact-attachments', checked: true });
    const hist = h('input', { type: 'checkbox', id: 'redact-history', checked: true });
    modal(
      (close) => [
        h('h2', {}, t.docTools.redactTitle),
        h('p', { class: 'dialog-text' }, fmt(t.docTools.redactMessage, { n, m })),
        h('label', { class: 'check' }, meta, t.docTools.redactMeta),
        h('label', { class: 'check' }, marks, t.docTools.redactBookmarks),
        h('label', { class: 'check' }, files, t.docTools.redactAttachments),
        h('label', { class: 'check' }, hist, t.docTools.redactHistory),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { type: 'button', id: 'redact-cancel', onclick: close }, t.docTools.cancel),
          h('button', { type: 'button', id: 'redact-go', class: 'primary', onclick: () => ((answer = { stripMetadata: meta.checked, removeBookmarks: marks.checked, removeAttachments: files.checked, clearHistory: hist.checked }), close()) }, t.docTools.redactGo),
        ),
      ],
      () => resolve(answer),
    ).id = 'dialog-redact';
  });
}

export async function applyRedaction(s: Session, editing: Editing, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void): Promise<void> {
  await editing.settleView(s); // la saisie et l'écriture à la main doivent être dans le document ET dans l'affichage AVANT le rendu des pages
  const marks = s.annots.filter((a) => a.kind === 'redact');
  if (marks.length === 0) return;
  const byPage = new Map<number, typeof marks>();
  for (const a of marks) byPage.set(a.page, [...(byPage.get(a.page) ?? []), a]);
  const choice = await confirmRedaction(marks.length, byPage.size);
  if (!choice) return;

  let cancelled = false;
  const progress = overlay(fmt(t.docTools.redactPreparing, { k: 0, n: byPage.size }), () => (cancelled = true));
  const pages: RedactedPage[] = [];
  try {
    let k = 0;
    for (const [index, list] of byPage) {
      if (cancelled) return void idle();
      const page = await s.view.pdf.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(DPI / 72, Math.sqrt(2 ** 25 / (base.width * base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // annotationMode 1 : les commentaires, tampons et champs remplis hors zone restent visibles ; les marques rouges sont recouvertes par le noir
      await page.render({ canvas, viewport, annotationMode: 1 }).promise;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      for (const a of list) {
        const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
        const pad = 1; // un pixel de plus de chaque côté : aucun reste de lettre au bord
        ctx.fillRect(Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.abs(x2 - x1) + 2 * pad, Math.abs(y2 - y1) + 2 * pad);
      }
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      canvas.width = canvas.height = 0;
      page.cleanup();
      if (!blob) throw new Error('image');
      pages.push({ index, image: new Uint8Array(await blob.arrayBuffer()), width: base.width, height: base.height });
      progress(++k / byPage.size);
    }
  } catch (err) {
    idle();
    toast(fmt(t.docTools.failed, { detail: String((err as Error).message ?? err) }));
    return;
  }
  idle();
  if (await editing.redact(s, pages, choice, choice.clearHistory)) toast(fmt(t.docTools.redactDone, { n: pages.length }));
}
