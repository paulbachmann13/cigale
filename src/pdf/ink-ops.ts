/**
 * Écriture manuscrite ↔ PDF. L'encre d'une page est écrite comme des annotations /Ink STANDARD (une « feuille » par suite
 * de traits de même style : tout lecteur les affiche, Acrobat et Aperçu savent les déplacer ou les supprimer), avec en plus,
 * pour Cigale, le stylo, la pression et l'identifiant de chaque trait (clés privées ignorées par les autres logiciels).
 * Si ces clés privées se perdent, les traits restent lisibles (épaisseur constante). Fonctions pures : octets → octets.
 */
import { PDFArray, PDFDict, PDFName, PDFRef } from '@cantoo/pdf-lib';
import type { AnnotDraft } from '../data/annotations';
import { type InkStroke, PENS, sameStyle, strokeBounds } from '../data/ink';
import { AnnotError, addAnnotationsToDoc } from './annot-ops';
import { isInkSheet } from './ink-layer';
import { loadForEdit, pruneUnreachable } from './page-ops';
import { saveDoc } from './protection';

const N = (s: string) => PDFName.of(s);

export { strokesFromAnnots } from '../data/ink-model';

/** Les annotations à écrire pour les traits d'une page : une par suite de traits consécutifs de même style (l'ordre de superposition est gardé). */
export function sheetsFromStrokes(page: number, strokes: readonly InkStroke[]): AnnotDraft[] {
  const drafts: AnnotDraft[] = [];
  let run: InkStroke[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const first = run[0];
    drafts.push({
      kind: 'ink',
      page,
      color: first.color,
      fill: null,
      opacity: PENS[first.pen].opacity,
      width: first.width,
      contents: '',
      rect: strokeBounds(run.flatMap((s) => s.points), first.width),
      strokes: run.map((s) => s.points),
      pen: first.pen,
      strokeIds: run.map((s) => s.id),
      ...(first.pressures ? { pressures: run.map((s) => s.pressures!) } : {}),
    });
    run = [];
  };
  for (const s of strokes) {
    if (run.length && !sameStyle(run[0], s)) flush();
    run.push(s);
  }
  flush();
  return drafts;
}

export interface InkPage {
  page: number;
  strokes: InkStroke[];
}

/**
 * Remplace l'encre des pages données par `strokes` (les autres pages, et toutes les autres annotations, ne sont pas touchées).
 * Une page sans trait perd simplement son encre.
 */
export async function setInk(bytes: Uint8Array, pages: InkPage[], password?: string, expectedPages?: number, author = '', now = new Date()): Promise<Uint8Array> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new AnnotError('structure');
  const all = doc.getPages();
  const drafts: AnnotDraft[] = [];
  for (const { page, strokes } of pages) {
    const target = all[page];
    if (!target) throw new AnnotError('badPage');
    const annots = target.node.lookupMaybe(N('Annots'), PDFArray);
    for (let i = (annots?.size() ?? 0) - 1; annots && i >= 0; i--) {
      const d = annots.lookupMaybe(i, PDFDict);
      if (d && isInkSheet(d)) {
        const ref = annots.get(i);
        annots.remove(i);
        if (ref instanceof PDFRef) doc.context.delete(ref);
      }
    }
    drafts.push(...sheetsFromStrokes(page, strokes));
  }
  await addAnnotationsToDoc(doc, drafts, author, now);
  pruneUnreachable(doc); // les anciens flux d'apparence ne restent pas dans le fichier
  return saveDoc(doc);
}

/** Réécrit le document tel quel : `saveDoc` range l'encre dans son calque (fichiers des anciennes versions). */
export async function normalizeInk(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  return saveDoc(await loadForEdit(bytes, password));
}
