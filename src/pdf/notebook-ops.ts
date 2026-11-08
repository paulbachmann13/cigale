/**
 * Carnets : pages avec un papier (lignes, quadrillage, Seyès, points) dessiné dans le contenu de la page, et création
 * d'un document neuf. Fonctions pures : paramètres → octets. Le papier est du vrai contenu PDF (vectoriel, léger),
 * pas une image : il s'imprime et s'affiche partout pareil.
 */
import { PDFDocument, PDFName, type PDFPage, rgb } from '@cantoo/pdf-lib';
import { saveDoc } from './protection';

export type PaperTemplate = 'blank' | 'lined' | 'grid' | 'dots' | 'seyes';
export type PaperSize = 'a4' | 'a5' | 'letter';

export const PAPER_TEMPLATES: PaperTemplate[] = ['blank', 'lined', 'grid', 'dots', 'seyes'];
/** Tailles en points (1 pt = 1/72 pouce), portrait. */
export const PAPER_SIZES: Record<PaperSize, [number, number]> = { a4: [595.28, 841.89], a5: [419.53, 595.28], letter: [612, 792] };
const MM = 72 / 25.4;

export interface NotebookOptions {
  template: PaperTemplate;
  size: PaperSize;
  landscape: boolean;
  pages: number;
}

export class NotebookError extends Error {
  constructor(readonly code: 'pageCount') {
    super(code);
    this.name = code;
  }
}

/** Dessine le papier sur une page (sa taille en points). Ne touche pas à ce qui s'y trouve déjà. */
export function drawPaper(page: PDFPage, template: PaperTemplate): void {
  if (template === 'blank') return;
  const { width: w, height: h } = page.getSize();
  const line = (x1: number, y1: number, x2: number, y2: number, thickness: number, color: ReturnType<typeof rgb>) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
  if (template === 'lined') {
    const step = 8 * MM; // 8 mm : interligne d'un cahier ligné
    const c = rgb(0.72, 0.8, 0.92);
    for (let y = h - 28 * MM; y > 12 * MM; y -= step) line(10 * MM, y, w - 10 * MM, y, 0.5, c);
    line(26 * MM, h - 10 * MM, 26 * MM, 10 * MM, 0.6, rgb(0.92, 0.65, 0.65)); // marge
  } else if (template === 'grid') {
    const step = 5 * MM;
    const c = rgb(0.8, 0.85, 0.93);
    for (let x = 0; x <= w; x += step) line(x, 0, x, h, 0.4, c);
    for (let y = h; y >= 0; y -= step) line(0, y, w, y, 0.4, c);
  } else if (template === 'dots') {
    const step = 5 * MM;
    const c = rgb(0.6, 0.64, 0.72);
    for (let x = step; x < w; x += step) for (let y = step; y < h; y += step) page.drawCircle({ x, y, size: 0.55, color: c, borderWidth: 0 });
  } else if (template === 'seyes') {
    // Seyès : réglure française, lignes horizontales tous les 2 mm (plus marquées tous les 8 mm), verticales tous les 8 mm, marge rouge
    const fine = rgb(0.82, 0.8, 0.93);
    const major = rgb(0.6, 0.57, 0.82);
    const top = h - 12 * MM;
    for (let i = 0, y = top; y > 8 * MM; i++, y -= 2 * MM) line(0, y, w, y, i % 4 === 0 ? 0.55 : 0.3, i % 4 === 0 ? major : fine);
    for (let x = 28 * MM; x < w; x += 8 * MM) line(x, top, x, 8 * MM, 0.4, major);
    for (let x = 28 * MM - 8 * MM; x > 0; x -= 8 * MM) line(x, top, x, 8 * MM, 0.4, major);
    line(28 * MM + 3 * 8 * MM, h - 6 * MM, 28 * MM + 3 * 8 * MM, 6 * MM, 0.8, rgb(0.9, 0.45, 0.5)); // marge
  }
}

/** Fait partager à `page` le papier déjà dessiné sur `source` : un seul flux dans le fichier pour toutes les pages (500 pages pointillées ne pèsent pas 500 fois plus). */
export function sharePaper(source: PDFPage, page: PDFPage): void {
  const contents = source.node.get(PDFName.of('Contents'));
  if (contents) page.node.set(PDFName.of('Contents'), contents);
}

/** Crée un document neuf (carnet) : `pages` pages du même papier. */
export async function createNotebook(options: NotebookOptions): Promise<Uint8Array> {
  const pages = Math.floor(options.pages);
  if (!(pages >= 1 && pages <= 500)) throw new NotebookError('pageCount');
  const doc = await PDFDocument.create();
  const [pw, ph] = PAPER_SIZES[options.size];
  const size: [number, number] = options.landscape ? [ph, pw] : [pw, ph];
  let first: PDFPage | undefined;
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(size);
    if (!first) {
      drawPaper(page, options.template);
      first = page;
    } else sharePaper(first, page);
  }
  return saveDoc(doc);
}
