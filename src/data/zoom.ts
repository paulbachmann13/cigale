/** Logique de zoom (pure, testée). Les échelles sont des facteurs : 1 = 100 %. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8];

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/** Palier suivant (dir = 1) ou précédent (dir = -1) ; reste borné entre 25 % et 800 %. */
export function stepZoom(current: number, dir: 1 | -1): number {
  const eps = 1e-3;
  if (dir === 1) return ZOOM_PRESETS.find((p) => p > current + eps) ?? ZOOM_MAX;
  return [...ZOOM_PRESETS].reverse().find((p) => p < current - eps) ?? ZOOM_MIN;
}

export function formatZoom(scale: number): string {
  return `${Math.round(scale * 100)} %`;
}

/** Lit « 150 », « 150% », « 150 % » ou « 1,5x » (non : seulement des pourcentages). Renvoie null si illisible. */
export function parseZoom(text: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(text);
  if (!m) return null;
  const pct = Number(m[1].replace(',', '.'));
  return pct > 0 ? clampZoom(pct / 100) : null;
}
