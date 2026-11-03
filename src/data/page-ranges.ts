/** Plages de pages (« 1-3, 5, 8- ») et noms de fichiers : logique pure, testée sans navigateur. Pages à partir de 1. */

export interface Range {
  from: number;
  to: number;
}

export type RangeError = { code: 'empty' | 'syntax' | 'outOfRange'; token: string };

/**
 * « 1-3, 5, 8- » : plages séparées par des virgules ou des points-virgules. « a- » va jusqu'à la fin, « -b » part de la page 1.
 * L'ordre saisi est conservé (on peut vouloir « 5, 1-2 »).
 */
export function parseRanges(text: string, total: number): { ok: true; ranges: Range[] } | ({ ok: false } & RangeError) {
  const tokens = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) return { ok: false, code: 'empty', token: '' };
  const ranges: Range[] = [];
  for (const token of tokens) {
    const m = /^(\d*)\s*(-)?\s*(\d*)$/.exec(token);
    if (!m || (!m[1] && !m[3])) return { ok: false, code: 'syntax', token };
    let from: number;
    let to: number;
    if (!m[2]) {
      if (m[3]) return { ok: false, code: 'syntax', token };
      from = to = Number(m[1]);
    } else {
      from = m[1] ? Number(m[1]) : 1;
      to = m[3] ? Number(m[3]) : total;
    }
    if (from < 1 || to > total || from > to) return { ok: false, code: 'outOfRange', token };
    ranges.push({ from, to });
  }
  return { ok: true, ranges };
}

/** Indices (à partir de 0) de toutes les pages couvertes, dans l'ordre saisi. */
export function rangesToIndices(ranges: Range[]): number[] {
  return ranges.flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from - 1 + i));
}

/** Parties de N pages (la dernière peut être plus courte). */
export function splitEvery(total: number, n: number): Range[] {
  const size = Math.max(1, Math.floor(n));
  const out: Range[] = [];
  for (let from = 1; from <= total; from += size) out.push({ from, to: Math.min(total, from + size - 1) });
  return out;
}

/** Une partie par page de départ (signets de premier niveau) ; les pages avant la première forment une partie à part. */
export function splitAtStarts(total: number, starts: number[]): Range[] {
  const cuts = [...new Set(starts.filter((s) => s >= 1 && s <= total))].sort((a, b) => a - b);
  if (cuts.length === 0) return [{ from: 1, to: total }];
  if (cuts[0] !== 1) cuts.unshift(1);
  return cuts.map((from, i) => ({ from, to: i + 1 < cuts.length ? cuts[i + 1] - 1 : total }));
}

export function rangeLabel(r: Range): string {
  return r.from === r.to ? String(r.from) : `${r.from}–${r.to}`;
}

/** Nom de fichier sûr (sans /, :, caractères de contrôle…), jamais vide, limité en longueur. */
export function sanitizeFileName(name: string, fallback = 'document'): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
}

/** Rend des noms uniques en ajoutant « (2) », « (3) »… (comparaison sans tenir compte de la casse, comme le Mac). */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
