/**
 * Comparaison de deux textes mot à mot (plus longue suite commune). Logique pure : sert à « Comparer deux PDF ».
 * Les extrémités communes sont retirées d'abord (cas le plus courant : une page presque identique), ce qui garde le calcul léger.
 */
export type DiffKind = 'equal' | 'add' | 'del';
export interface DiffOp {
  kind: DiffKind;
  words: string[];
}

/** Au-delà de ce nombre de cases, le milieu de la page est traité comme « entièrement remplacé » plutôt que calculé. */
const MAX_CELLS = 4_000_000;

export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function push(out: DiffOp[], kind: DiffKind, words: string[]) {
  if (words.length === 0) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.words.push(...words);
  else out.push({ kind, words: [...words] });
}

/** Différences entre deux suites de mots : ce qui est commun, supprimé (dans `a` seulement), ajouté (dans `b` seulement). */
export function diffWords(a: readonly string[], b: readonly string[]): DiffOp[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const out: DiffOp[] = [];
  push(out, 'equal', a.slice(0, start));
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  if (x.length === 0 || y.length === 0 || x.length * y.length > MAX_CELLS) {
    push(out, 'del', x);
    push(out, 'add', y);
  } else {
    // table des longueurs de la plus longue suite commune (suffixes), puis parcours
    const n = x.length;
    const m = y.length;
    const lcs = new Uint32Array((n + 1) * (m + 1));
    const at = (i: number, j: number) => i * (m + 1) + j;
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[at(i, j)] = x[i] === y[j] ? lcs[at(i + 1, j + 1)] + 1 : Math.max(lcs[at(i + 1, j)], lcs[at(i, j + 1)]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        push(out, 'equal', [x[i]]);
        i++;
        j++;
      } else if (lcs[at(i + 1, j)] >= lcs[at(i, j + 1)]) push(out, 'del', [x[i++]]);
      else push(out, 'add', [y[j++]]);
    }
    push(out, 'del', x.slice(i));
    push(out, 'add', y.slice(j));
  }
  push(out, 'equal', a.slice(endA));
  return out;
}

export interface PageDiff {
  /** Page, à partir de 0 (dans le premier document ; dans le second si la page n'existe que là). */
  page: number;
  ops: DiffOp[];
  added: number;
  removed: number;
  /** La page n'existe que dans l'un des deux documents. */
  only?: 'first' | 'second';
}

export interface Comparison {
  pages: PageDiff[];
  /** Pages qui diffèrent. */
  changed: PageDiff[];
  added: number;
  removed: number;
}

/** Compare deux documents page par page (la page n du premier avec la page n du second). `texts` : le texte de chaque page. */
export function compareDocuments(first: readonly string[], second: readonly string[]): Comparison {
  const pages: PageDiff[] = [];
  const total = Math.max(first.length, second.length);
  for (let i = 0; i < total; i++) {
    const a = i < first.length ? tokenize(first[i]) : [];
    const b = i < second.length ? tokenize(second[i]) : [];
    const ops = diffWords(a, b);
    const added = ops.filter((o) => o.kind === 'add').reduce((n, o) => n + o.words.length, 0);
    const removed = ops.filter((o) => o.kind === 'del').reduce((n, o) => n + o.words.length, 0);
    pages.push({ page: i, ops, added, removed, ...(i >= first.length ? { only: 'second' as const } : i >= second.length ? { only: 'first' as const } : {}) });
  }
  const changed = pages.filter((p) => p.added + p.removed > 0 || p.only);
  return { pages, changed, added: pages.reduce((n, p) => n + p.added, 0), removed: pages.reduce((n, p) => n + p.removed, 0) };
}

/** Ne garde que les modifications et quelques mots autour (le texte inchangé est abrégé par « … »). */
export function withContext(ops: readonly DiffOp[], context = 6): DiffOp[] {
  const out: DiffOp[] = [];
  ops.forEach((op, i) => {
    if (op.kind !== 'equal') return void out.push(op);
    const first = i === 0;
    const last = i === ops.length - 1;
    if (op.words.length <= context * 2 + 1 && !first && !last) return void out.push(op);
    const head = first ? [] : op.words.slice(0, context);
    const tail = last ? [] : op.words.slice(-context);
    if (head.length + tail.length >= op.words.length) return void out.push(op);
    if (head.length) out.push({ kind: 'equal', words: head });
    out.push({ kind: 'equal', words: ['…'] });
    if (tail.length) out.push({ kind: 'equal', words: tail });
  });
  return out;
}
