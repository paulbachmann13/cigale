/** Règles pures sur l'ordre et la sélection des pages (indices à partir de 0). Testées sans navigateur. */

/** Ordre des pages après avoir déplacé `selected` juste avant la page d'origine `to` (0..n, n = à la fin). */
export function moveOrder(count: number, selected: number[], to: number): number[] {
  const sel = new Set(normalizeSelection(selected, count));
  const dest = Math.min(Math.max(to, 0), count);
  const before: number[] = [];
  const after: number[] = [];
  const moved: number[] = [];
  for (let i = 0; i < count; i++) {
    if (sel.has(i)) moved.push(i);
    else if (i < dest) before.push(i);
    else after.push(i);
  }
  return [...before, ...moved, ...after];
}

/** Indices triés, sans doublon, dans [0, count[. */
export function normalizeSelection(selected: number[], count: number): number[] {
  return [...new Set(selected)].filter((i) => Number.isInteger(i) && i >= 0 && i < count).sort((a, b) => a - b);
}

/** Sélection de `from` à `to` inclus (clic avec Maj). */
export function rangeSelection(from: number, to: number): number[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Une sélection est-elle un déplacement sans effet ? (pages déjà à cet endroit) */
export function isNoopMove(count: number, selected: number[], to: number): boolean {
  const order = moveOrder(count, selected, to);
  return order.every((v, i) => v === i);
}

/** Positions des pages d'origine dans le nouvel ordre : sert à garder la sélection après un déplacement. */
export function positionsAfter(order: number[], originals: number[]): number[] {
  const keep = new Set(originals);
  return order.flatMap((orig, pos) => (keep.has(orig) ? [pos] : []));
}

/** Découpe une sélection en paquets de pages consécutives (ex. [0,1,2,5,6] → [[0,1,2],[5,6]]). */
export function consecutiveRuns(selected: number[]): number[][] {
  const runs: number[][] = [];
  for (const i of [...new Set(selected)].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else runs.push([i]);
  }
  return runs;
}
