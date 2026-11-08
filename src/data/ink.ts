/**
 * Écriture manuscrite : types de stylos, contour d'un trait (avec pression), gomme. Logique pure, partagée entre
 * l'écran (aperçu en direct), l'écriture dans le PDF (flux d'apparence) et les tests : un trait a donc exactement
 * la même forme à l'écran, dans le fichier, dans Aperçu et dans Acrobat. Coordonnées : espace utilisateur PDF.
 */
import { getStroke } from 'perfect-freehand';
import type { Pt, Rect, Rgb } from './annotations';

export type PenKind = 'pen' | 'fountain' | 'highlighter';

export interface PenPreset {
  /** Épaisseur proposée au départ (points). */
  width: number;
  /** Épaisseurs proposées dans la barre d'outils. */
  widths: number[];
  /** Effet de la pression sur l'épaisseur (0 = aucun). */
  thinning: number;
  smoothing: number;
  streamline: number;
  /** Affinement du début et de la fin du trait (en multiples de l'épaisseur). */
  taperStart: number;
  taperEnd: number;
  /** Opacité de l'annotation (le surligneur est translucide). */
  opacity: number;
  /** Le surligneur se superpose au texte (multiplication) au lieu de le cacher. */
  blend: 'Normal' | 'Multiply';
  /** Couleur proposée quand on choisit ce stylo. */
  color: Rgb;
}

export const PENS: Record<PenKind, PenPreset> = {
  pen: { width: 2, widths: [1, 2, 3, 5, 8], thinning: 0.4, smoothing: 0.55, streamline: 0.5, taperStart: 0, taperEnd: 0, opacity: 1, blend: 'Normal', color: [0.1, 0.1, 0.15] },
  fountain: { width: 3, widths: [2, 3, 5, 8], thinning: 0.75, smoothing: 0.6, streamline: 0.45, taperStart: 1, taperEnd: 2.5, opacity: 1, blend: 'Normal', color: [0.1, 0.25, 0.6] },
  highlighter: { width: 14, widths: [8, 14, 20, 28], thinning: 0, smoothing: 0.5, streamline: 0.6, taperStart: 0, taperEnd: 0, opacity: 0.4, blend: 'Multiply', color: [1, 0.9, 0.1] },
};

export const isPenKind = (v: unknown): v is PenKind => v === 'pen' || v === 'fountain' || v === 'highlighter';

/** Un trait écrit, pas encore (ou déjà) dans le PDF. `pressures` : une valeur 0–1 par point, absent pour une souris (pression simulée). */
export interface InkStroke {
  page: number;
  points: Pt[];
  pressures?: number[];
  color: Rgb;
  /** Épaisseur de base, en points. */
  width: number;
  pen: PenKind;
}

/** Contour (polygone) d'un trait : à remplir, pas à tracer. Jamais vide, même pour un simple point. */
export function inkOutline(points: Pt[], pressures: number[] | undefined, width: number, pen: PenKind): Pt[] {
  const p = PENS[pen];
  const input = points.map((pt, i) => [pt[0], pt[1], pressures?.[i] ?? 0.5]);
  const out = getStroke(input, {
    size: Math.max(0.5, width),
    thinning: p.thinning,
    smoothing: p.smoothing,
    streamline: p.streamline,
    simulatePressure: pressures === undefined && p.thinning > 0,
    start: { cap: true, taper: p.taperStart ? width * p.taperStart : 0 },
    end: { cap: true, taper: p.taperEnd ? width * p.taperEnd : 0 },
    last: true,
  });
  if (out.length >= 3) return out as Pt[];
  // trait trop court pour la bibliothèque : un petit disque
  const [cx, cy] = points[0] ?? [0, 0];
  const r = Math.max(0.25, width / 2);
  return Array.from({ length: 12 }, (_, i): Pt => [cx + r * Math.cos((i * Math.PI) / 6), cy + r * Math.sin((i * Math.PI) / 6)]);
}

/** Rectangle qui contient tout le trait, épaisseur comprise. */
export function strokeBounds(points: Pt[], width: number): Rect {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const m = width * 0.9 + 0.5; // la pression peut élargir le trait au-delà de l'épaisseur de base
  return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
}

/** Distance d'un point à un segment. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** La gomme (cercle de rayon `radius` centré en `at`) touche-t-elle ce trait ? */
export function strokeTouched(points: Pt[], width: number, at: Pt, radius: number): boolean {
  const reach = radius + width / 2;
  if (points.length === 1) return Math.hypot(points[0][0] - at[0], points[0][1] - at[1]) <= reach;
  for (let i = 1; i < points.length; i++) if (distToSegment(at, points[i - 1], points[i]) <= reach) return true;
  return false;
}

/** Chemin PDF (« m l l … h ») d'un polygone. */
export function polygonOps(poly: Pt[], fmt: (n: number) => string): string {
  return poly.map((p, i) => `${fmt(p[0])} ${fmt(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h';
}
