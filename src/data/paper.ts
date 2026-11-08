/**
 * Papiers de carnet décrits comme une liste de formes simples (traits, points, rectangles), en points PDF (origine en bas à gauche).
 * Cette même description sert à dessiner la page dans le PDF ET l'aperçu affiché dans les boîtes de choix : on voit donc
 * exactement ce qu'on obtiendra. Logique pure.
 */
import type { Rgb } from './annotations';

export type PaperTemplate = 'blank' | 'lined' | 'grid' | 'dots' | 'seyes' | 'cornell' | 'music' | 'mm' | 'checklist';
export type PaperColor = 'white' | 'cream' | 'yellow' | 'green' | 'blue';
export type PaperSize = 'a4' | 'a5' | 'letter';

export const PAPER_TEMPLATES: PaperTemplate[] = ['blank', 'lined', 'grid', 'dots', 'seyes', 'cornell', 'music', 'mm', 'checklist'];
export const PAPER_COLOR_NAMES: PaperColor[] = ['white', 'cream', 'yellow', 'green', 'blue'];
export const PAPER_COLORS: Record<PaperColor, Rgb> = {
  white: [1, 1, 1],
  cream: [0.99, 0.965, 0.9],
  yellow: [1, 0.98, 0.8],
  green: [0.93, 0.97, 0.93],
  blue: [0.92, 0.95, 1],
};
/** Tailles en points (1 pt = 1/72 pouce), portrait. */
export const PAPER_SIZES: Record<PaperSize, [number, number]> = { a4: [595.28, 841.89], a5: [419.53, 595.28], letter: [612, 792] };

export type Prim = { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; c: Rgb } | { k: 'dot'; x: number; y: number; r: number; c: Rgb };

const MM = 72 / 25.4;

/** Les formes du papier pour une page de `w` × `h` points. Le papier uni n'a aucune forme. */
export function paperPrims(template: PaperTemplate, w: number, h: number): Prim[] {
  const out: Prim[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, wd: number, c: Rgb) => void out.push({ k: 'line', x1, y1, x2, y2, w: wd, c });
  switch (template) {
    case 'blank':
      break;
    case 'lined': {
      const c: Rgb = [0.72, 0.8, 0.92];
      for (let y = h - 28 * MM; y > 12 * MM; y -= 8 * MM) line(10 * MM, y, w - 10 * MM, y, 0.5, c);
      line(26 * MM, h - 10 * MM, 26 * MM, 10 * MM, 0.6, [0.92, 0.65, 0.65]); // marge
      break;
    }
    case 'grid': {
      const c: Rgb = [0.8, 0.85, 0.93];
      for (let x = 0; x <= w; x += 5 * MM) line(x, 0, x, h, 0.4, c);
      for (let y = h; y >= 0; y -= 5 * MM) line(0, y, w, y, 0.4, c);
      break;
    }
    case 'dots': {
      const c: Rgb = [0.6, 0.64, 0.72];
      for (let x = 5 * MM; x < w; x += 5 * MM) for (let y = 5 * MM; y < h; y += 5 * MM) out.push({ k: 'dot', x, y, r: 0.55, c });
      break;
    }
    case 'seyes': {
      // Seyès : réglure française, horizontales tous les 2 mm (plus marquées tous les 8 mm), verticales tous les 8 mm, marge rouge
      const fine: Rgb = [0.82, 0.8, 0.93];
      const major: Rgb = [0.6, 0.57, 0.82];
      const top = h - 12 * MM;
      for (let i = 0, y = top; y > 8 * MM; i++, y -= 2 * MM) line(0, y, w, y, i % 4 === 0 ? 0.55 : 0.3, i % 4 === 0 ? major : fine);
      for (let x = 28 * MM; x < w; x += 8 * MM) line(x, top, x, 8 * MM, 0.4, major);
      for (let x = 20 * MM; x > 0; x -= 8 * MM) line(x, top, x, 8 * MM, 0.4, major);
      line(52 * MM, h - 6 * MM, 52 * MM, 6 * MM, 0.8, [0.9, 0.45, 0.5]); // marge
      break;
    }
    case 'cornell': {
      // méthode Cornell : titre en haut, colonne de mots-clés à gauche, notes à droite, résumé en bas
      const rule: Rgb = [0.78, 0.82, 0.9];
      const frame: Rgb = [0.45, 0.5, 0.65];
      const top = h - 35 * MM;
      const bottom = 50 * MM;
      const cue = 62 * MM;
      for (let y = top - 9 * MM; y > bottom + 4 * MM; y -= 8 * MM) line(cue, y, w - 10 * MM, y, 0.4, rule);
      line(10 * MM, top, w - 10 * MM, top, 0.9, frame);
      line(10 * MM, bottom, w - 10 * MM, bottom, 0.9, frame);
      line(cue, top, cue, bottom, 0.9, frame);
      break;
    }
    case 'music': {
      // portées : 5 lignes espacées de 2 mm, une portée tous les 20 mm
      const c: Rgb = [0.25, 0.25, 0.3];
      for (let y = h - 28 * MM; y > 28 * MM; y -= 20 * MM) for (let k = 0; k < 5; k++) line(12 * MM, y - k * 2 * MM, w - 12 * MM, y - k * 2 * MM, 0.5, c);
      break;
    }
    case 'mm': {
      // papier millimétré : traits à 1 mm, 5 mm et 10 mm
      const mm1: Rgb = [0.9, 0.86, 0.88];
      const mm5: Rgb = [0.82, 0.62, 0.66];
      const mm10: Rgb = [0.7, 0.4, 0.46];
      const lines = (len: number, vertical: boolean) => {
        for (let i = 0; i * MM <= len; i++) {
          const p = i * MM;
          const [c, wd] = i % 10 === 0 ? [mm10, 0.55] : i % 5 === 0 ? [mm5, 0.4] : [mm1, 0.2];
          if (vertical) line(p, 0, p, h, wd, c as Rgb);
          else line(0, p, w, p, wd, c as Rgb);
        }
      };
      lines(w, true);
      lines(h, false);
      break;
    }
    case 'checklist': {
      // liste à cocher : une case et une ligne par rangée
      const c: Rgb = [0.55, 0.6, 0.72];
      const rule: Rgb = [0.8, 0.84, 0.92];
      for (let y = h - 30 * MM; y > 15 * MM; y -= 10 * MM) {
        const x0 = 14 * MM;
        const s = 4.5 * MM;
        line(x0, y, x0 + s, y, 0.7, c);
        line(x0 + s, y, x0 + s, y + s, 0.7, c);
        line(x0 + s, y + s, x0, y + s, 0.7, c);
        line(x0, y + s, x0, y, 0.7, c);
        line(x0 + s + 4 * MM, y, w - 12 * MM, y, 0.4, rule);
      }
      break;
    }
  }
  return out;
}

/** Taille d'une page de carnet en points, selon le format et l'orientation. */
export function paperPageSize(size: PaperSize, landscape: boolean): [number, number] {
  const [w, h] = PAPER_SIZES[size];
  return landscape ? [h, w] : [w, h];
}
