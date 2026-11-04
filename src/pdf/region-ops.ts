/**
 * « Extraire une zone » : une partie d'une page devient un nouveau PDF d'une page.
 * - vectoriel : la page est copiée et sa zone visible est réduite au rectangle (texte et dessins gardés, sélectionnables) ;
 *   comme pour « Recadrer », le reste de la page reste caché dans le fichier ;
 * - image : la zone est une image (rien d'autre n'est conservé) — l'image est fabriquée par l'application (pdf.js).
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { PageOpError, extractPages, loadForEdit } from './page-ops';
import { saveDoc } from './protection';

/** Rectangle dans le repère PDF de la page (x0, y0, x1, y1), non tourné. */
export type RegionRect = [number, number, number, number];

const MIN_SIZE = 10; // points

/** Rectangle normalisé et ramené à la zone visible de la page ; PageOpError('structure') s'il reste moins de 10 pt. */
export function clampRect(rect: RegionRect, visible: { x: number; y: number; width: number; height: number }): RegionRect {
  const x0 = Math.max(visible.x, Math.min(rect[0], rect[2]));
  const y0 = Math.max(visible.y, Math.min(rect[1], rect[3]));
  const x1 = Math.min(visible.x + visible.width, Math.max(rect[0], rect[2]));
  const y1 = Math.min(visible.y + visible.height, Math.max(rect[1], rect[3]));
  if (x1 - x0 < MIN_SIZE || y1 - y0 < MIN_SIZE) throw new PageOpError('structure');
  return [x0, y0, x1, y1];
}

export async function extractRegion(bytes: Uint8Array, pageIndex: number, rect: RegionRect, password?: string, expectedPages?: number): Promise<Uint8Array> {
  const single = await extractPages(bytes, [pageIndex], password, expectedPages);
  const doc = await loadForEdit(single, password);
  const page = doc.getPage(0);
  let visible: { x: number; y: number; width: number; height: number };
  try {
    const c = page.getCropBox();
    visible = c.width > 0 && c.height > 0 ? c : page.getMediaBox();
  } catch {
    visible = page.getMediaBox();
  }
  const [x0, y0, x1, y1] = clampRect(rect, visible);
  const [w, h] = [x1 - x0, y1 - y0];
  page.setMediaBox(x0, y0, w, h);
  page.setCropBox(x0, y0, w, h);
  page.setBleedBox(x0, y0, w, h);
  page.setTrimBox(x0, y0, w, h);
  page.setArtBox(x0, y0, w, h);
  return saveDoc(doc);
}

/** Un PDF d'une page de `widthPt` × `heightPt` points qui contient seulement cette image PNG. */
export async function regionImagePdf(png: Uint8Array, widthPt: number, heightPt: number): Promise<Uint8Array> {
  if (!(widthPt >= MIN_SIZE) || !(heightPt >= MIN_SIZE)) throw new PageOpError('structure');
  const doc = await PDFDocument.create({ updateMetadata: false });
  const image = await doc.embedPng(png);
  doc.addPage([widthPt, heightPt]).drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
  return saveDoc(doc);
}
