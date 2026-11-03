import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { loadForEdit, PageOpError } from './page-ops';
import { saveDoc } from './protection';

export type Rgb = [number, number, number]; // 0..1

export interface WatermarkOptions {
  text: string;     // une ligne
  fontSize: number; // pt, ex. 72
  color: Rgb;
  opacity: number;  // 0..1
  angle: number;    // degrés, sens trigonométrique, ex. 45 ; 0 = horizontal
  pages?: number[]; // indices à partir de 0 ; toutes si absent
}

export interface HeaderFooterOptions {
  header: { left: string; center: string; right: string };
  footer: { left: string; center: string; right: string };
  fontSize: number;    // pt, ex. 10
  color: Rgb;
  margin: number;      // distance au bord visible en pt, ex. 28
  firstNumber: number; // numéro affiché sur la première page traitée, ex. 1
  pages?: number[];    // indices à partir de 0 ; toutes si absent. Les numéros se suivent dans l'ordre des pages traitées.
  date?: Date;         // pour {date} (défaut : maintenant), format JJ/MM/AAAA
}

/** Remplace les caractères absents de WinAnsi par « ? ». */
function safeText(font: PDFFont, s: string): string {
  const set = new Set(font.getCharacterSet());
  return Array.from(s)
    .map((ch) => (set.has(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

/** Formate une date en JJ/MM/AAAA. */
function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  return `${day}/${month}/${year}`;
}

/** Rectangle visible de la page (CropBox si défini, sinon MediaBox). */
function getVisibleBox(page: PDFPage): { x: number; y: number; width: number; height: number } {
  try {
    const crop = page.getCropBox();
    if (crop && typeof crop.width === 'number' && typeof crop.height === 'number') {
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

/** Détermine les indices uniques des pages ciblées dans l'ordre de traitement. */
function resolvePages(total: number, selected?: number[]): number[] {
  if (!selected) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const p of selected) {
    if (p >= 0 && p < total && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export function expandTokens(
  template: string,
  vars: { page: number; pages: number; date: string; title: string }
): string {
  return template.replace(/\{(page|pages|date|title)\}/g, (_, key) => {
    switch (key) {
      case 'page':
        return String(vars.page);
      case 'pages':
        return String(vars.pages);
      case 'date':
        return vars.date;
      case 'title':
        return vars.title;
      default:
        return '';
    }
  });
}

export async function addWatermark(
  bytes: Uint8Array,
  opts: WatermarkOptions,
  password?: string,
  expectedPages?: number
): Promise<Uint8Array> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) {
    throw new PageOpError('structure');
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = safeText(font, opts.text);
  if (!text) {
    return saveDoc(doc);
  }

  const pages = doc.getPages();
  const targetIndices = resolvePages(pages.length, opts.pages);
  const textWidth = font.widthOfTextAtSize(text, opts.fontSize);
  // Hauteur médiane typographique (Helvetica cap-height ~ 0.7 * fontSize)
  const textHalfHeight = opts.fontSize * 0.35;
  const rad = (opts.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = (textWidth / 2) * cos - textHalfHeight * sin;
  const dy = (textWidth / 2) * sin + textHalfHeight * cos;

  const color = rgb(opts.color[0], opts.color[1], opts.color[2]);
  const opacity = Math.max(0, Math.min(1, opts.opacity));

  for (const idx of targetIndices) {
    const page = pages[idx];
    const crop = getVisibleBox(page);
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const isSideways = rot === 90 || rot === 270;
    const viewWidth = isSideways ? crop.height : crop.width;
    const viewHeight = isSideways ? crop.width : crop.height;

    const u0 = viewWidth / 2 - dx;
    const v0 = viewHeight / 2 - dy;
    const { x, y } = screenToPage(u0, v0, crop, rot);
    const userAngle = (((opts.angle + rot) % 360) + 360) % 360;

    page.drawText(text, {
      x,
      y,
      size: opts.fontSize,
      font,
      color,
      opacity,
      rotate: degrees(userAngle),
    });
  }

  return saveDoc(doc);
}

export async function addHeaderFooter(
  bytes: Uint8Array,
  opts: HeaderFooterOptions,
  password?: string,
  expectedPages?: number
): Promise<Uint8Array> {
  const doc = await loadForEdit(bytes, password);
  const totalPages = doc.getPageCount();
  if (expectedPages !== undefined && totalPages !== expectedPages) {
    throw new PageOpError('structure');
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const targetIndices = resolvePages(totalPages, opts.pages);
  const dateStr = formatDate(opts.date ?? new Date());
  const docTitle = doc.getTitle() ?? '';
  const color = rgb(opts.color[0], opts.color[1], opts.color[2]);

  targetIndices.forEach((pageIndex, sequenceIdx) => {
    const page = pages[pageIndex];
    const crop = getVisibleBox(page);
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const isSideways = rot === 90 || rot === 270;
    const viewWidth = isSideways ? crop.height : crop.width;
    const viewHeight = isSideways ? crop.width : crop.height;

    const vars = {
      page: opts.firstNumber + sequenceIdx,
      pages: totalPages,
      date: dateStr,
      title: docTitle,
    };

    const headerV = viewHeight - opts.margin - opts.fontSize;
    const footerV = opts.margin;

    const items: Array<{ text: string; align: 'left' | 'center' | 'right'; v: number }> = [
      { text: expandTokens(opts.header.left, vars), align: 'left', v: headerV },
      { text: expandTokens(opts.header.center, vars), align: 'center', v: headerV },
      { text: expandTokens(opts.header.right, vars), align: 'right', v: headerV },
      { text: expandTokens(opts.footer.left, vars), align: 'left', v: footerV },
      { text: expandTokens(opts.footer.center, vars), align: 'center', v: footerV },
      { text: expandTokens(opts.footer.right, vars), align: 'right', v: footerV },
    ];

    for (const item of items) {
      const clean = safeText(font, item.text).trim();
      if (!clean) continue;

      const w = font.widthOfTextAtSize(clean, opts.fontSize);
      let u = opts.margin;
      if (item.align === 'center') {
        u = (viewWidth - w) / 2;
      } else if (item.align === 'right') {
        u = viewWidth - opts.margin - w;
      }

      const { x, y } = screenToPage(u, item.v, crop, rot);
      page.drawText(clean, {
        x,
        y,
        size: opts.fontSize,
        font,
        color,
        rotate: degrees(rot),
      });
    }
  });

  return saveDoc(doc);
}
