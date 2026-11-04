import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  PDFOperator,
  PDFOperatorNames,
  PDFNumber,
  asPDFNumber,
  pushGraphicsState,
  popGraphicsState,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  TextRenderingMode,
  showText,
} from '@cantoo/pdf-lib';
import { loadForEdit, PageOpError } from './page-ops';
import { saveDoc } from './protection';

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} // pixels de l'image rendue, origine en HAUT à gauche, x0<x1, y0<y1

export interface OcrLine {
  words: OcrWord[];
}

export interface OcrPage {
  index: number;
  imageWidth: number;
  imageHeight: number;
  lines: OcrLine[];
} // index de page à partir de 0 ; l'image = la page TELLE QU'AFFICHÉE par pdf.js (zone visible = CropBox sinon MediaBox, rotation /Rotate déjà appliquée), à une échelle quelconque

/** Remplace les caractères absents de WinAnsi par « ? ». */
function safeText(font: PDFFont, s: string): string {
  const set = new Set(font.getCharacterSet());
  return Array.from(s)
    .map((ch) => (set.has(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

/** Rectangle visible de la page (CropBox si défini, sinon MediaBox). */
function getVisibleBox(page: PDFPage): { x: number; y: number; width: number; height: number } {
  try {
    const crop = page.getCropBox();
    if (crop && crop.width > 0 && crop.height > 0) {
      return crop;
    }
  } catch {
    /* fallback MediaBox */
  }
  try {
    const media = page.getMediaBox();
    if (media && typeof media.width === 'number' && typeof media.height === 'number') {
      return media;
    }
  } catch {
    /* fallback getSize */
  }
  const { width, height } = page.getSize();
  return { x: 0, y: 0, width, height };
}

/**
 * Convertit un point écran (u, v) depuis l'origine bas-gauche de la page visible
 * vers les coordonnées natives de la page PDF selon /Rotate (0, 90, 180, 270).
 */
function screenToPage(
  u: number,
  v: number,
  crop: { x: number; y: number; width: number; height: number },
  rot: number
): { x: number; y: number } {
  const r = ((rot % 360) + 360) % 360;
  switch (r) {
    case 90:
      return { x: crop.x + crop.width - v, y: crop.y + u };
    case 180:
      return { x: crop.x + crop.width - u, y: crop.y + crop.height - v };
    case 270:
      return { x: crop.x + v, y: crop.y + crop.height - u };
    case 0:
    default:
      return { x: crop.x + u, y: crop.y + v };
  }
}

/** Génère l'opérateur Tz (mise à l'échelle horizontale du texte en %). */
function setHorizontalScaling(scalePercent: number): PDFOperator {
  const num = typeof asPDFNumber === 'function' ? asPDFNumber(scalePercent) : PDFNumber.of(scalePercent);
  const opName = PDFOperatorNames.SetTextHorizontalScaling ?? 'Tz';
  return PDFOperator.of(opName, [num]);
}

export async function addTextLayer(
  bytes: Uint8Array,
  pages: OcrPage[],
  password?: string,
  expectedPages?: number
): Promise<Uint8Array> {
  const doc = await loadForEdit(bytes, password);
  const totalPages = doc.getPageCount();
  if (expectedPages !== undefined && totalPages !== expectedPages) {
    throw new PageOpError('structure');
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pdfPages = doc.getPages();
  const seenPages = new Set<number>();

  for (const pageOcr of pages) {
    if (pageOcr.index < 0 || pageOcr.index >= totalPages) {
      continue;
    }
    if (seenPages.has(pageOcr.index)) {
      continue;
    }
    seenPages.add(pageOcr.index);

    if (pageOcr.imageWidth <= 0 || pageOcr.imageHeight <= 0) {
      continue;
    }

    // Filtre les mots vides par ligne
    const lineWordsList: Array<Array<{ word: OcrWord; cleanText: string }>> = [];
    let totalWords = 0;

    for (const line of pageOcr.lines ?? []) {
      const validInLine: Array<{ word: OcrWord; cleanText: string }> = [];
      for (const w of line.words ?? []) {
        const clean = safeText(font, w.text ?? '').trim();
        if (clean.length > 0) {
          validInLine.push({ word: w, cleanText: clean });
        }
      }
      if (validInLine.length > 0) {
        lineWordsList.push(validInLine);
        totalWords += validInLine.length;
      }
    }

    // Pages sans mots inchangées
    if (totalWords === 0) {
      continue;
    }

    const page = pdfPages[pageOcr.index];
    const crop = getVisibleBox(page);
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const isSideways = rot === 90 || rot === 270;
    const viewWidth = isSideways ? crop.height : crop.width;
    const viewHeight = isSideways ? crop.width : crop.height;

    // Enregistre la police Helvetica dans les ressources de la page
    page.setFont(font);
    const [, fontKey] = page.getFont();

    const scaleX = viewWidth / pageOcr.imageWidth;
    const scaleY = viewHeight / pageOcr.imageHeight;

    const rad = (rot * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad)) < 1e-10 ? 0 : Math.cos(rad);
    const sin = Math.abs(Math.sin(rad)) < 1e-10 ? 0 : Math.sin(rad);

    const ops: PDFOperator[] = [
      pushGraphicsState(),
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
    ];

    for (const lineWords of lineWordsList) {
      const count = lineWords.length;
      for (let i = 0; i < count; i++) {
        const { word, cleanText } = lineWords[i];
        const isLastInLine = i === count - 1;
        const textToDraw = isLastInLine ? cleanText : `${cleanText} `;

        const boxWidth = Math.abs(word.x1 - word.x0) * scaleX;
        const boxHeight = Math.abs(word.y1 - word.y0) * scaleY;
        const fontSize = Math.max(1, boxHeight);

        const naturalWidth = font.widthOfTextAtSize(textToDraw, fontSize);
        const hScaling =
          naturalWidth > 0 && boxWidth > 0 ? (boxWidth / naturalWidth) * 100 : 100;

        // Ligne de base au bas de la boîte moins ~20 % de la hauteur (remontée côté écran)
        const yBaselineScreen = word.y1 - 0.2 * Math.abs(word.y1 - word.y0);
        const u = (word.x0 / pageOcr.imageWidth) * viewWidth;
        const v = viewHeight - (yBaselineScreen / pageOcr.imageHeight) * viewHeight;

        const { x, y } = screenToPage(u, v, crop, rot);

        ops.push(
          setFontAndSize(fontKey, fontSize),
          setHorizontalScaling(hScaling),
          setTextMatrix(cos, sin, -sin, cos, x, y),
          showText(font.encodeText(textToDraw))
        );
      }
    }

    ops.push(endText(), popGraphicsState());
    page.pushOperators(...ops);
  }

  return saveDoc(doc);
}
