/**
 * Carnets : pages avec un papier (lignes, quadrillage, Seyès, points) dessiné dans le contenu de la page, et création
 * d'un document neuf. Fonctions pures : paramètres → octets. Le papier est du vrai contenu PDF (vectoriel, léger),
 * pas une image : il s'imprime et s'affiche partout pareil.
 */
import { PDFDocument, PDFName, type PDFPage, rgb } from '@cantoo/pdf-lib';
import { type PaperColor, type PaperSize, type PaperTemplate, PAPER_COLORS, paperPageSize, paperPrims } from '../data/paper';
import { saveDoc } from './protection';

export type { PaperColor, PaperSize, PaperTemplate };
export { PAPER_SIZES, PAPER_TEMPLATES } from '../data/paper';

export interface NotebookOptions {
  template: PaperTemplate;
  /** Couleur du papier (blanc si absent). */
  color?: PaperColor;
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

/** Dessine le papier (fond coloré, puis traits et points) sur une page. Ne touche pas à ce qui s'y trouve déjà, sauf le fond qui passe dessous. */
export function drawPaper(page: PDFPage, template: PaperTemplate, color: PaperColor = 'white'): void {
  const { width: w, height: h } = page.getSize();
  if (color !== 'white') {
    const [r, g, b] = PAPER_COLORS[color];
    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(r, g, b), borderWidth: 0 });
  }
  for (const p of paperPrims(template, w, h)) {
    if (p.k === 'line') page.drawLine({ start: { x: p.x1, y: p.y1 }, end: { x: p.x2, y: p.y2 }, thickness: p.w, color: rgb(...p.c) });
    else page.drawCircle({ x: p.x, y: p.y, size: p.r, color: rgb(...p.c), borderWidth: 0 });
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
  const size = paperPageSize(options.size, options.landscape);
  let first: PDFPage | undefined;
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(size);
    if (!first) {
      drawPaper(page, options.template, options.color);
      first = page;
    } else sharePaper(first, page);
  }
  return saveDoc(doc);
}
