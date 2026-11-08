/**
 * Reconnaissance de formes à la GoodNotes : un trait tracé à main levée devient une ligne droite, un angle,
 * une ellipse (ou un cercle), un rectangle ou un polygone parfait quand on maintient le stylet. Logique pure
 * (aucune dépendance au DOM ni au PDF), indépendante du repère (y vers le haut ou vers le bas).
 */
import type { Pt } from './annotations';
import { distToSegment, strokeTouched } from './ink';

export type ShapeKind = 'line' | 'angle' | 'ellipse' | 'circle' | 'rect' | 'polygon';
export interface Shape {
  kind: ShapeKind;
  /** Points du trait parfait (fermé pour une forme fermée : le dernier point égale le premier). */
  points: Pt[];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Longueur d'un chemin. */
export function pathLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Rééchantillonne à n points régulièrement espacés le long du chemin. */
export function resample(pts: Pt[], n: number): Pt[] {
  const total = pathLength(pts);
  if (n < 2 || pts.length < 2 || total === 0) return pts.slice(0, Math.max(0, n < 2 ? n : pts.length));
  const step = total / (n - 1);
  const out: Pt[] = [pts[0]];
  let acc = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    let seg = dist(prev, pts[i]);
    while (acc + seg >= step && out.length < n) {
      const t = (step - acc) / seg;
      const p: Pt = [prev[0] + (pts[i][0] - prev[0]) * t, prev[1] + (pts[i][1] - prev[1]) * t];
      out.push(p);
      prev = p;
      seg = dist(prev, pts[i]);
      acc = 0;
    }
    acc += seg;
    prev = pts[i];
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

/** Ramer–Douglas–Peucker sur un chemin ouvert. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  const a = simplify(pts.slice(0, idx + 1), eps);
  const b = simplify(pts.slice(idx), eps);
  return [...a.slice(0, -1), ...b];
}

function bbox(pts: Pt[]) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, diag: Math.hypot(x2 - x1, y2 - y1) };
}

/** Écart d'un angle à l'angle droit, en degrés. */
function offRight(a: Pt, b: Pt, c: Pt): number {
  const v1: Pt = [a[0] - b[0], a[1] - b[1]];
  const v2: Pt = [c[0] - b[0], c[1] - b[1]];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
  return Math.abs((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI - 90);
}

/**
 * Reconnaît la forme d'un trait. `null` quand le trait est de l'écriture ou un dessin libre (on n'y touche pas).
 * Prudent : mieux vaut ne rien reconnaître que transformer une lettre en cercle.
 */
export function recognizeShape(raw: Pt[]): Shape | null {
  if (raw.length < 5) return null;
  const length = pathLength(raw);
  const b = bbox(raw);
  if (b.diag < 12 || length < 12) return null; // trop petit : un point, un tiret d'écriture
  const first = raw[0];
  const last = raw[raw.length - 1];
  const chord = dist(first, last);
  const pts = resample(raw, 64);

  // ── ligne droite : le chemin ne s'écarte presque pas de la corde
  if (chord / length > 0.6) { // (un aller-retour sur place a une corde presque nulle : exclu)
    const dev = Math.max(...pts.map((p) => distToSegment(p, first, last)));
    if (dev / chord < 0.07) return { kind: 'line', points: [first, last] };
  }

  const closed = chord < b.diag * 0.22 && length > b.diag * 1.6;
  if (closed) {
    // ── ellipse / cercle : tous les points à peu près sur l'ellipse inscrite dans le cadre
    if (b.w > 8 && b.h > 8) {
      const rx = b.w / 2;
      const ry = b.h / 2;
      const rs = pts.map((p) => Math.hypot((p[0] - b.cx) / rx, (p[1] - b.cy) / ry));
      const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
      const dev = Math.sqrt(rs.reduce((s, v) => s + (v - mean) ** 2, 0) / rs.length);
      if (Math.abs(mean - 1) < 0.1 && dev < 0.1) {
        const circle = Math.abs(rx - ry) / Math.max(rx, ry) < 0.14;
        const r = (rx + ry) / 2;
        const ring: Pt[] = Array.from({ length: 73 }, (_, i): Pt => {
          const a = (i / 72) * Math.PI * 2;
          return [b.cx + (circle ? r : rx) * Math.cos(a), b.cy + (circle ? r : ry) * Math.sin(a)];
        });
        ring[72] = ring[0]; // fermé exactement
        return { kind: circle ? 'circle' : 'ellipse', points: ring };
      }
    }
    // ── polygone fermé : on garde les sommets (3 à 6), le rectangle bien droit devient un vrai rectangle
    const loop = [...pts.slice(0, -1), pts[0]];
    // on part du point le plus éloigné du centre pour que le départ du trait ne coupe pas un côté
    const start = loop.slice(0, -1).reduce((best, p, i, arr) => (dist(p, [b.cx, b.cy]) > dist(arr[best], [b.cx, b.cy]) ? i : best), 0);
    const rot = [...loop.slice(start, -1), ...loop.slice(0, start), loop[start]];
    const poly = simplify(rot, b.diag * 0.06);
    const verts = poly.slice(0, -1);
    if (verts.length >= 3 && verts.length <= 6) {
      const sides = verts.map((v, i) => dist(v, verts[(i + 1) % verts.length]));
      if (Math.min(...sides) > b.diag * 0.08) {
        if (verts.length === 4 && verts.every((v, i) => offRight(verts[(i + 3) % 4], v, verts[(i + 1) % 4]) < 12)) {
          // rectangle : droit s'il est aligné sur les axes, sinon tourné mais aux angles droits
          const axis = verts.every((v, i) => Math.abs(v[0] - verts[(i + 1) % 4][0]) < b.diag * 0.06 || Math.abs(v[1] - verts[(i + 1) % 4][1]) < b.diag * 0.06);
          if (axis) return { kind: 'rect', points: [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2], [b.x1, b.y1]] };
          return { kind: 'rect', points: [...verts, verts[0]] };
        }
        return { kind: 'polygon', points: [...verts, verts[0]] };
      }
    }
    return null;
  }

  // ── angle : deux segments bien droits (un « V », un « L », une flèche à une pointe)
  const open = simplify(pts, b.diag * 0.06);
  if (open.length === 3 && chord > b.diag * 0.25) {
    const [p, q, r] = open;
    if (dist(p, q) > b.diag * 0.2 && dist(q, r) > b.diag * 0.2) {
      const devs = Math.max(...pts.map((x) => Math.min(distToSegment(x, p, q), distToSegment(x, q, r))));
      if (devs < b.diag * 0.05) return { kind: 'angle', points: [first, q, last] };
    }
  }
  return null;
}

/** Projette un point sur une droite (règle) passant par `a` et `b` : la position le long de la droite est conservée. */
export function projectOnLine(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Distance d'un point à une droite infinie. */
export function distToLine(p: Pt, a: Pt, b: Pt): number {
  const q = projectOnLine(p, a, b);
  return dist(p, q);
}

/** Point dans un polygone (lasso). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Les deux grands bords d'une règle (centre, angle en radians, longueur, épaisseur), chacun comme un segment [début, fin]. */
export function rulerEdges(center: Pt, angle: number, length: number, thickness: number): [[Pt, Pt], [Pt, Pt]] {
  const d: Pt = [Math.cos(angle), Math.sin(angle)];
  const n: Pt = [-Math.sin(angle), Math.cos(angle)];
  const edge = (side: number): [Pt, Pt] => {
    const c: Pt = [center[0] + (n[0] * thickness * side) / 2, center[1] + (n[1] * thickness * side) / 2];
    return [[c[0] - (d[0] * length) / 2, c[1] - (d[1] * length) / 2], [c[0] + (d[0] * length) / 2, c[1] + (d[1] * length) / 2]];
  };
  return [edge(-1), edge(1)];
}

/** Le bord de règle le plus proche de `p`, s'il est à moins de `reach` ; sinon null. */
export function nearestRulerEdge(p: Pt, edges: [Pt, Pt][], reach: number): [Pt, Pt] | null {
  let best: [Pt, Pt] | null = null;
  let bestD = reach;
  for (const e of edges) {
    const d = distToSegment(p, e[0], e[1]);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Projette `p` sur le segment (la position reste dans les limites de la règle). */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Angle de règle ramené au multiple de 15° voisin s'il est à moins de `tol` degrés (aimant), sinon inchangé. */
export function magnetAngle(angle: number, tol = 2.5): number {
  const deg = (angle * 180) / Math.PI;
  const near = Math.round(deg / 15) * 15;
  return Math.abs(deg - near) <= tol ? (near * Math.PI) / 180 : angle;
}

/** Ajoute des points le long d'un chemin pour qu'aucun segment ne dépasse `step` (sinon un long trait droit n'a que ses deux bouts). */
export function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i === 0) continue;
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.min(400, Math.floor(dist(a, b) / step));
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Points qui représentent une annotation quand on teste si le lasso l'entoure : le tracé pour un trait, une grille sur la boîte sinon. */
export function annotSamples(a: { rect: [number, number, number, number]; strokes?: Pt[][]; quads?: [number, number, number, number][]; line?: [number, number, number, number] }): Pt[] {
  const grid = (r: [number, number, number, number], nx: number, ny: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) out.push([r[0] + ((r[2] - r[0]) * i) / nx, r[1] + ((r[3] - r[1]) * j) / ny]);
    return out;
  };
  if (a.strokes?.length) return a.strokes.flatMap((s) => densify(s, 3));
  if (a.quads?.length) return a.quads.flatMap((q) => grid(q, 6, 1));
  if (a.line) return densify([[a.line[0], a.line[1]], [a.line[2], a.line[3]]], 3);
  return grid(a.rect, 6, 6);
}

/** Part des points (0 à 1) qui sont dans le polygone. */
export function insideFraction(points: Pt[], poly: Pt[]): number {
  if (!points.length) return 0;
  let n = 0;
  for (const p of points) if (pointInPolygon(p, poly)) n++;
  return n / points.length;
}

/** Le lasso `poly` entoure-t-il l'annotation ? Oui si au moins la moitié de ce qui la représente est dedans. */
export function lassoSelects(a: Parameters<typeof annotSamples>[0], poly: Pt[]): boolean {
  return insideFraction(annotSamples(a), poly) >= 0.5;
}

// ───────────── gomme : contour des annotations ─────────────

/** Ce dont la gomme a besoin pour une annotation. */
type Erasable = { kind: string; rect: [number, number, number, number]; strokes?: Pt[][]; line?: [number, number, number, number]; fill?: unknown; width: number };

/** Contour d'une annotation en lignes brisées : traits (ink), 4 côtés (rectangle), polygone de 48 côtés (ellipse), segment (ligne, flèche). */
export function eraseOutline(a: Erasable): Pt[][] {
  if (a.kind === 'ink') return a.strokes ?? [];
  if (a.kind === 'rect') {
    const [x1, y1, x2, y2] = a.rect;
    return [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]];
  }
  if (a.kind === 'ellipse') {
    const [x1, y1, x2, y2] = a.rect;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    const ring: Pt[] = Array.from({ length: 49 }, (_, i): Pt => {
      const t = (i / 48) * Math.PI * 2;
      return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
    });
    ring[48] = ring[0];
    return [ring];
  }
  if ((a.kind === 'line' || a.kind === 'arrow') && a.line) return [[[a.line[0], a.line[1]], [a.line[2], a.line[3]]]];
  return [];
}

/** La gomme (centre `at`, rayon `radius`) touche-t-elle l'annotation ? Par son contour ; aussi par l'intérieur d'un rectangle ou d'une ellipse remplis. */
export function eraseTouched(a: Erasable, at: Pt, radius: number): boolean {
  if (eraseOutline(a).some((st) => strokeTouched(st, a.width, at, radius))) return true;
  if (!a.fill) return false;
  if (a.kind === 'rect') {
    const [x1, y1, x2, y2] = a.rect;
    return at[0] >= Math.min(x1, x2) && at[0] <= Math.max(x1, x2) && at[1] >= Math.min(y1, y2) && at[1] <= Math.max(y1, y2);
  }
  if (a.kind === 'ellipse') return pointInPolygon(at, eraseOutline(a)[0]);
  return false;
}
