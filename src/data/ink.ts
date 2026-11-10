/**
 * Écriture manuscrite : types de stylos, contour d'un trait (avec pression), gomme. Logique pure, partagée entre
 * l'écran (calque d'encre), l'écriture dans le PDF (flux d'apparence) et les tests : un trait a donc exactement
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
  /** Lissage de la trajectoire : plus il est fort, plus le trait « traîne » et arrondit les petites lettres. */
  streamline: number;
  /** Sans stylet (souris, doigt) : simuler la pression d'après la vitesse (plume) ou garder une épaisseur constante (stylo). */
  simulate: boolean;
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
  // Stylo : épaisseur presque constante (la pression joue à peine), lissage léger : l'écriture reste fidèle et nette.
  pen: { width: 1.5, widths: [0.75, 1, 1.5, 2.5, 4], thinning: 0.14, smoothing: 0.5, streamline: 0.28, simulate: false, taperStart: 0, taperEnd: 0, opacity: 1, blend: 'Normal', color: [0.1, 0.1, 0.15] },
  // Plume : pleins et déliés selon la pression (ou la vitesse sans stylet).
  fountain: { width: 2.5, widths: [1.5, 2.5, 3.5, 5], thinning: 0.6, smoothing: 0.55, streamline: 0.34, simulate: true, taperStart: 0, taperEnd: 1.2, opacity: 1, blend: 'Normal', color: [0.1, 0.25, 0.6] },
  highlighter: { width: 14, widths: [8, 14, 20, 28], thinning: 0, smoothing: 0.5, streamline: 0.45, simulate: false, taperStart: 0, taperEnd: 0, opacity: 0.4, blend: 'Multiply', color: [1, 0.9, 0.1] },
};

/** Nom du calque PDF où Cigale range l'écriture manuscrite (masqué dans notre visionneuse, qui dessine l'encre elle-même). */
export const INK_LAYER_NAME = 'Écriture manuscrite (Cigale)';

export const isPenKind = (v: unknown): v is PenKind => v === 'pen' || v === 'fountain' || v === 'highlighter';

/**
 * Un trait d'écriture. Les traits ne sont jamais modifiés sur place : déplacer, recolorer ou couper un trait en crée un nouveau
 * (les contours calculés sont gardés en cache par objet). `pressures` : une valeur 0–1 par point, absent sans stylet.
 */
export interface InkStroke {
  /** Identifiant stable, gardé dans le PDF : l'historique (Annuler / Rétablir) s'y réfère. */
  id: string;
  /** Page, à partir de 0. */
  page: number;
  points: Pt[];
  pressures?: number[];
  color: Rgb;
  /** Épaisseur de base, en points. */
  width: number;
  pen: PenKind;
}

let counter = 0;
/** Identifiant court et unique d'un trait. */
export function newStrokeId(): string {
  counter = (counter + 1) % 1679616; // 36^4
  return `${Date.now().toString(36)}${counter.toString(36).padStart(4, '0')}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

/** Un stylet appuie rarement à fond : cette courbe donne l'épaisseur nominale pour une écriture légère normale. */
const pressureCurve = (p: number) => Math.min(1, Math.sqrt(Math.max(0, p)) * 1.05);

/** Contour (polygone) d'un trait : à remplir, pas à tracer. Jamais vide, même pour un simple point. `complete` : le trait est fini. */
export function inkOutline(points: Pt[], pressures: number[] | undefined, width: number, pen: PenKind, complete = true): Pt[] {
  const p = PENS[pen];
  const input = points.map((pt, i) => [pt[0], pt[1], pressures ? pressureCurve(pressures[i] ?? 0.5) : 0.5]);
  const out = getStroke(input, {
    size: Math.max(0.3, width),
    thinning: p.thinning,
    smoothing: p.smoothing,
    streamline: p.streamline,
    simulatePressure: pressures === undefined && p.simulate,
    start: { cap: true, taper: p.taperStart ? width * p.taperStart : 0 },
    end: { cap: true, taper: p.taperEnd ? width * p.taperEnd : 0 },
    last: complete,
  });
  if (out.length >= 3) return out as Pt[];
  // trait trop court pour la bibliothèque : un petit disque
  const [cx, cy] = points[0] ?? [0, 0];
  const r = Math.max(0.2, width / 2);
  return Array.from({ length: 12 }, (_, i): Pt => [cx + r * Math.cos((i * Math.PI) / 6), cy + r * Math.sin((i * Math.PI) / 6)]);
}

const outlines = new WeakMap<InkStroke, Pt[]>();
/** Contour d'un trait fini (gardé en cache : un trait ne change jamais). */
export function strokeOutline(s: InkStroke): Pt[] {
  let o = outlines.get(s);
  if (!o) outlines.set(s, (o = inkOutline(s.points, s.pressures, s.width, s.pen)));
  return o;
}

/**
 * Contour lissé : le polygone devient une suite de courbes (chaque sommet sert de point de contrôle, on passe par les milieux).
 * Renvoie le point de départ puis, pour chaque courbe quadratique, [contrôle, arrivée]. Même géométrie à l'écran et dans le PDF.
 */
export function smoothOutline(poly: Pt[]): { start: Pt; quads: [Pt, Pt][] } {
  const n = poly.length;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const quads: [Pt, Pt][] = [];
  for (let i = 0; i < n; i++) quads.push([poly[i], mid(poly[i], poly[(i + 1) % n])]);
  return { start: mid(poly[n - 1], poly[0]), quads };
}

/** Chemin PDF fermé (« m … c … h ») du contour lissé : les courbes quadratiques sont écrites en cubiques équivalentes. */
export function outlineOps(poly: Pt[], fmt: (n: number) => string): string {
  const { start, quads } = smoothOutline(poly);
  const out: string[] = [`${fmt(start[0])} ${fmt(start[1])} m`];
  let [px, py] = start;
  for (const [c, e] of quads) {
    out.push(`${fmt(px + ((c[0] - px) * 2) / 3)} ${fmt(py + ((c[1] - py) * 2) / 3)} ${fmt(e[0] + ((c[0] - e[0]) * 2) / 3)} ${fmt(e[1] + ((c[1] - e[1]) * 2) / 3)} ${fmt(e[0])} ${fmt(e[1])} c`);
    [px, py] = e;
  }
  out.push('h');
  return out.join(' ');
}

/** Rectangle qui contient tout le trait, épaisseur comprise. */
export function strokeBounds(points: Pt[], width: number): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; // boucle : un très long trait ferait dépasser la pile avec Math.min(...)
  for (const [x, y] of points) {
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  const m = width * 0.9 + 0.5; // la pression peut élargir le trait au-delà de l'épaisseur de base
  return [x1 - m, y1 - m, x2 + m, y2 + m];
}

const boxes = new WeakMap<InkStroke, Rect>();
/** Rectangle englobant d'un trait (en cache). */
export function strokeBox(s: InkStroke): Rect {
  let b = boxes.get(s);
  if (!b) boxes.set(s, (b = strokeBounds(s.points, s.width)));
  return b;
}

/** Distance d'un point à un segment. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Les segments [a, b] et [c, d] se croisent-ils ? */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Distance entre deux segments (0 s'ils se croisent). */
export function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b));
}

/** La gomme (cercle de rayon `radius` centré en `at`) touche-t-elle ce trait ? */
export function strokeTouched(points: Pt[], width: number, at: Pt, radius: number): boolean {
  return sweepTouches(points, width, at, at, radius);
}

/** La gomme, en glissant de `from` à `to`, touche-t-elle ce trait ? (Un geste rapide ne « saute » pas par-dessus un trait fin.) */
export function sweepTouches(points: Pt[], width: number, from: Pt, to: Pt, radius: number): boolean {
  const reach = radius + width / 2;
  if (points.length === 1) return distToSegment(points[0], from, to) <= reach;
  for (let i = 1; i < points.length; i++) if (segmentDistance(points[i - 1], points[i], from, to) <= reach) return true;
  return false;
}

/** Les rectangles se touchent-ils ? */
export const boxesMeet = (a: Rect, b: Rect) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/**
 * Gomme précise : retire du trait ce que la gomme (glissant de `from` à `to`, rayon `radius`) recouvre.
 * Renvoie `null` si le trait n'est pas touché, sinon les morceaux restants (aucun si tout est effacé). Les morceaux sont
 * de nouveaux traits (nouvel identifiant), de même style ; la pression suit.
 */
export function eraseFromStroke(s: InkStroke, from: Pt, to: Pt, radius: number): InkStroke[] | null {
  if (!sweepTouches(s.points, s.width, from, to, radius)) return null;
  const reach = radius + s.width / 2;
  // on resserre les points pour couper au plus près de la gomme (pas plus fin que le quart du rayon)
  const step = Math.max(0.5, radius / 4);
  const pts: Pt[] = [];
  const prs: number[] | undefined = s.pressures ? [] : undefined;
  for (let i = 0; i < s.points.length; i++) {
    if (i > 0) {
      const a = s.points[i - 1];
      const b = s.points[i];
      const n = Math.min(200, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 1; k < n; k++) {
        pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
        prs?.push(s.pressures![i - 1] + ((s.pressures![i] - s.pressures![i - 1]) * k) / n);
      }
    }
    pts.push(s.points[i]);
    prs?.push(s.pressures![i]);
  }
  const pieces: InkStroke[] = [];
  let run: number[] = [];
  const flush = () => {
    // un morceau d'un seul point ne vaut que si c'est tout ce qu'était le trait (un point posé)
    if (run.length >= 2 || (run.length === 1 && pts.length === 1)) {
      pieces.push({ ...s, id: newStrokeId(), points: run.map((i) => pts[i]), ...(prs ? { pressures: run.map((i) => prs[i]) } : {}) });
    }
    run = [];
  };
  for (let i = 0; i < pts.length; i++) {
    if (distToSegment(pts[i], from, to) <= reach) flush();
    else run.push(i);
  }
  flush();
  return pieces;
}

/** Déplace un trait (nouvel objet, même identifiant : c'est le même trait, ailleurs). */
export function moveStroke(s: InkStroke, dx: number, dy: number): InkStroke {
  return { ...s, points: s.points.map((p): Pt => [p[0] + dx, p[1] + dy]) };
}

/** Deux traits peuvent-ils partager la même annotation du PDF (même stylo, couleur, épaisseur, et pression présente ou non) ? */
export function sameStyle(a: InkStroke, b: InkStroke): boolean {
  return a.pen === b.pen && a.width === b.width && !a.pressures === !b.pressures && a.color.every((c, i) => Math.abs(c - b.color[i]) < 0.002);
}

/** Chemin PDF (« m l l … h ») d'un polygone. */
export function polygonOps(poly: Pt[], fmt: (n: number) => string): string {
  return poly.map((p, i) => `${fmt(p[0])} ${fmt(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h';
}
