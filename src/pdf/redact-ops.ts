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
  /** Supprimer les pièces jointes du document. */
  removeAttachments: boolean;
}

export interface RedactResult {
  bytes: Uint8Array;
  /** Pages remplacées. */
  replaced: number;
}

const N = (s: string) => PDFName.of(s);
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;

/** Retire des champs de formulaire (récursivement) ceux dont tous les widgets sont sur des pages caviardées. */
function pruneFields(arr: PDFArray, dead: Set<PDFRef>): void {
  for (let i = arr.size() - 1; i >= 0; i--) {
    const ref = arr.get(i);
    const dict = arr.lookupMaybe(i, PDFDict);
    if (!(ref instanceof PDFRef) || !dict) continue;
    if (dead.has(ref)) {
      arr.remove(i);
      continue;
    }
    const kids = dict.lookupMaybe(N('Kids'), PDFArray);
    if (kids) {
      pruneFields(kids, dead);
      if (kids.size() === 0) arr.remove(i); // plus aucun widget : le champ (et sa valeur) part aussi
    }
  }
}

export async function applyRedactions(bytes: Uint8Array, pages: RedactedPage[], opts: RedactOptions, password?: string, expectedPages?: number): Promise<RedactResult> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new PageOpError('structure');
  const count = doc.getPageCount();
  const before = doc.getPages().map((p) => p.ref);
  const originals = doc.getPages();
  const unique = new Map<number, RedactedPage>();
  for (const p of pages) if (p.index >= 0 && p.index < count) unique.set(p.index, p);
  // Tout ce qui est attaché aux pages remplacées (annotations, champs de formulaire…) disparaît avec elles, même s'il est aussi référencé ailleurs.
  const alsoDead: PDFRef[] = [];
  for (const idx of unique.keys()) {
    const annots = originals[idx].node.lookupMaybe(N('Annots'), PDFArray);
    for (let i = 0; annots && i < annots.size(); i++) {
      const r = annots.get(i);
      if (r instanceof PDFRef) alsoDead.push(r);
    }
  }
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
  const fields = doc.catalog.lookupMaybe(N('AcroForm'), PDFDict)?.lookupMaybe(N('Fields'), PDFArray);
  if (fields) pruneFields(fields, new Set(alsoDead));
  // Structure logique (texte alternatif, ActualText) et fils d'articles : ils peuvent répéter le texte caviardé.
  doc.catalog.delete(N('StructTreeRoot'));
  doc.catalog.delete(N('MarkInfo'));
  doc.catalog.delete(N('Threads'));
  if (opts.removeBookmarks) doc.catalog.delete(N('Outlines'));
  if (opts.removeAttachments) {
    // annotations « pièce jointe » des autres pages
    for (const page of doc.getPages()) {
      const arr = page.node.lookupMaybe(N('Annots'), PDFArray);
      for (let i = (arr?.size() ?? 0) - 1; i >= 0; i--) if (arr!.lookupMaybe(i, PDFDict)?.get(N('Subtype')) === N('FileAttachment')) arr!.remove(i);
    }
    doc.catalog.delete(N('AF'));
    doc.catalog.lookupMaybe(N('Names'), PDFDict)?.delete(N('EmbeddedFiles'));
  }
  if (opts.stripMetadata) {
    doc.catalog.delete(N('Metadata'));
    const info = doc.context.trailerInfo.Info;
    if (info instanceof PDFRef) doc.context.delete(info);
    delete doc.context.trailerInfo.Info;
  }
  pruneUnreachable(doc, before, alsoDead);
  return { bytes: await saveDoc(doc), replaced: unique.size };
}
