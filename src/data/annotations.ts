/** Modèle des annotations et géométrie associée : logique pure (aucun accès au PDF ni au DOM). Coordonnées en espace utilisateur PDF. */

export type AnnotKind = 'highlight' | 'underline' | 'strikeout' | 'note' | 'freetext' | 'ink' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'stamp' | 'other';

export type Rgb = [number, number, number];
export type Rect = [number, number, number, number];
export type Pt = [number, number];

export interface Annot {
  /** Référence de l'objet dans le PDF (« 12 0 ») ; stable tant que le document n'est pas réécrit par un autre logiciel. */
  id: string;
  /** Page, à partir de 0. */
  page: number;
  kind: AnnotKind;
  /** x1, y1, x2, y2 (x1 < x2, y1 < y2). */
  rect: Rect;
  color: Rgb;
  /** Remplissage (rectangle, ellipse) ; null = aucun. */
  fill: Rgb | null;
  opacity: number;
  /** Épaisseur du trait en points. */
  width: number;
  contents: string;
  author: string;
  /** Date de modification (ISO 8601). */
  date: string;
  /** Surlignage, soulignement, barré : un rectangle par ligne de texte. */
  quads?: Rect[];
  /** Dessin à main levée : une liste de points par trait. */
  strokes?: Pt[][];
  /** Ligne ou flèche : x1, y1, x2, y2 (la flèche est à la fin). */
  line?: Rect;
  fontSize?: number;
  /** Clé du tampon (voir STAMPS). */
  stamp?: string;
  /** Réponse : identifiant du commentaire parent. */
  replyTo?: string;
  /** Créée par un autre logiciel : modifiable, mais son apparence d'origine est conservée tant qu'on ne la change pas. */
  foreign: boolean;
}

/** Ce qu'il faut fournir pour créer une annotation (le reste est rempli à l'écriture). */
export type AnnotDraft = Omit<Annot, 'id' | 'foreign' | 'author' | 'date'> & { author?: string };

/** Ce qu'on peut changer sur une annotation existante. */
export type AnnotPatch = Partial<Pick<Annot, 'color' | 'fill' | 'opacity' | 'width' | 'contents' | 'rect' | 'quads' | 'strokes' | 'line' | 'fontSize' | 'stamp'>>;

/** Tampons proposés (dessins maison : jamais ceux d'Adobe). */
export const STAMPS: Record<string, { label: string; color: Rgb }> = {
  approved: { label: 'APPROUVÉ', color: [0.1, 0.5, 0.2] },
  rejected: { label: 'REFUSÉ', color: [0.75, 0.1, 0.1] },
  confidential: { label: 'CONFIDENTIEL', color: [0.75, 0.1, 0.1] },
  draft: { label: 'BROUILLON', color: [0.35, 0.35, 0.4] },
  review: { label: 'À REVOIR', color: [0.8, 0.45, 0.05] },
  received: { label: 'REÇU', color: [0.1, 0.3, 0.7] },
};

export const COLORS: { name: string; rgb: Rgb }[] = [
  { name: 'Jaune', rgb: [1, 0.9, 0.1] },
  { name: 'Vert', rgb: [0.3, 0.8, 0.35] },
  { name: 'Bleu', rgb: [0.2, 0.5, 0.95] },
  { name: 'Rouge', rgb: [0.85, 0.15, 0.15] },
  { name: 'Orange', rgb: [1, 0.55, 0.1] },
  { name: 'Violet', rgb: [0.6, 0.3, 0.85] },
  { name: 'Noir', rgb: [0, 0, 0] },
];

export const rgbToCss = (c: Rgb) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

export function normalizeRect(r: Rect): Rect {
  return [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
}

export function unionRect(rects: Rect[]): Rect {
  return [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))];
}

export function inflate(r: Rect, d: number): Rect {
  return [r[0] - d, r[1] - d, r[2] + d, r[3] + d];
}

export function pointsBounds(points: Pt[]): Rect {
  return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
}

/** Déplace une annotation de (dx, dy) : le rectangle ET toute la géométrie qui en dépend. */
export function translate<T extends Pick<Annot, 'rect' | 'quads' | 'strokes' | 'line'>>(a: T, dx: number, dy: number): Pick<Annot, 'rect' | 'quads' | 'strokes' | 'line'> {
  const mv = (r: Rect): Rect => [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
  return {
    rect: mv(a.rect),
    quads: a.quads?.map(mv),
    strokes: a.strokes?.map((s) => s.map((p): Pt => [p[0] + dx, p[1] + dy])),
    line: a.line ? mv(a.line) : undefined,
  };
}

/** Redimensionne : la géométrie est transformée proportionnellement de l'ancien rectangle vers le nouveau. */
export function resize<T extends Pick<Annot, 'rect' | 'quads' | 'strokes' | 'line'>>(a: T, next: Rect): Pick<Annot, 'rect' | 'quads' | 'strokes' | 'line'> {
  const [x1, y1, x2, y2] = a.rect;
  const sx = x2 - x1 ? (next[2] - next[0]) / (x2 - x1) : 1;
  const sy = y2 - y1 ? (next[3] - next[1]) / (y2 - y1) : 1;
  const px = (x: number) => next[0] + (x - x1) * sx;
  const py = (y: number) => next[1] + (y - y1) * sy;
  const rr = (r: Rect): Rect => [px(r[0]), py(r[1]), px(r[2]), py(r[3])];
  return {
    rect: next,
    quads: a.quads?.map(rr),
    strokes: a.strokes?.map((s) => s.map((p): Pt => [px(p[0]), py(p[1])])),
    line: a.line ? rr(a.line) : undefined,
  };
}

/** Date PDF (« D:20261103201500Z ») depuis une date JavaScript, en UTC. */
export function toPdfDate(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Date JavaScript (ISO) depuis une date PDF ; chaîne vide si illisible. */
export function fromPdfDate(s: string): string {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:Z|([+-])(\d{2})'?(\d{2})?'?)?/.exec(s);
  if (!m) return '';
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', sign, oh = '00', om = '00'] = m;
  let t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  if (sign) t -= (sign === '+' ? 1 : -1) * (Number(oh) * 60 + Number(om)) * 60000;
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
