/**
 * Caviardage RÉEL : les pages qui portent des zones à caviarder sont remplacées par une image (rendue par l'interface avec
 * les zones noircies). Le texte, les images d'origine et tout ce que la page contenait disparaissent du fichier : ce n'est pas un
 * rectangle noir posé par-dessus. Logique pure : octets → octets.
 */
import { PDFArray, PDFDict, PDFName, PDFRef } from '@cantoo/pdf-lib';
import { PageOpError, loadForEdit, pruneUnreachable } from './page-ops';
import { saveDoc } from './protection';

export interface RedactedPage {
  /** Indice de la page (à partir de 0). */
  index: number;
  /** Image de la page entière, déjà noircie (JPEG ou PNG). */
  image: Uint8Array;
  /** Taille de la page affichée, en points. */
  width: number;
  height: number;
}

export interface RedactOptions {
  /** Retirer titre, auteur, sujet, mots-clés et métadonnées XMP. */
  stripMetadata: boolean;
  /** Supprimer tous les signets (leurs titres peuvent être confidentiels). */
  removeBookmarks: boolean;
}

export interface RedactResult {
  bytes: Uint8Array;
  /** Pages remplacées. */
  replaced: number;
}

const N = (s: string) => PDFName.of(s);
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;

export async function applyRedactions(bytes: Uint8Array, pages: RedactedPage[], opts: RedactOptions, password?: string, expectedPages?: number): Promise<RedactResult> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new PageOpError('structure');
  const count = doc.getPageCount();
  const before = doc.getPages().map((p) => p.ref);
  const unique = new Map<number, RedactedPage>();
  for (const p of pages) if (p.index >= 0 && p.index < count) unique.set(p.index, p);
  for (const p of unique.values()) {
    const image = isJpeg(p.image) ? await doc.embedJpg(p.image) : await doc.embedPng(p.image);
    // La nouvelle page prend la place de l'ancienne ; l'ancienne (et tout ce qu'elle référence) est supprimée puis purgée.
    const page = doc.insertPage(p.index, [p.width, p.height]);
    page.drawImage(image, { x: 0, y: 0, width: p.width, height: p.height });
    doc.removePage(p.index + 1);
  }
  // Les marques de caviardage qui subsisteraient sur d'autres pages n'ont plus lieu d'être.
  for (const page of doc.getPages()) {
    const arr = page.node.lookupMaybe(N('Annots'), PDFArray);
    if (!arr) continue;
    for (let i = arr.size() - 1; i >= 0; i--) {
      const d = arr.lookupMaybe(i, PDFDict);
      if (d?.get(N('Subtype')) === N('Redact')) arr.remove(i);
    }
  }
  if (opts.removeBookmarks) doc.catalog.delete(N('Outlines'));
  if (opts.stripMetadata) {
    doc.catalog.delete(N('Metadata'));
    const info = doc.context.trailerInfo.Info;
    if (info instanceof PDFRef) doc.context.delete(info);
    delete doc.context.trailerInfo.Info;
  }
  pruneUnreachable(doc, before);
  return { bytes: await saveDoc(doc), replaced: unique.size };
}
