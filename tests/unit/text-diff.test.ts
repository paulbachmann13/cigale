import { describe, expect, it } from 'vitest';
import { compareDocuments, diffWords, tokenize, withContext } from '../../src/data/text-diff';

const d = (a: string, b: string) => diffWords(tokenize(a), tokenize(b)).map((o) => `${o.kind}:${o.words.join(' ')}`);

describe('différences mot à mot', () => {
  it('identiques : rien ; vide contre texte : tout ajouté ou supprimé', () => {
    expect(d('un deux trois', 'un deux trois')).toEqual(['equal:un deux trois']);
    expect(d('', 'un deux')).toEqual(['add:un deux']);
    expect(d('un deux', '')).toEqual(['del:un deux']);
    expect(d('', '')).toEqual([]);
  });
  it('mot remplacé, ajouté, supprimé', () => {
    expect(d('le chat dort', 'le chien dort')).toEqual(['equal:le', 'del:chat', 'add:chien', 'equal:dort']);
    expect(d('a b d', 'a b c d')).toEqual(['equal:a b', 'add:c', 'equal:d']);
    expect(d('a b c d', 'a d')).toEqual(['equal:a', 'del:b c', 'equal:d']);
  });
  it('plusieurs modifications dans une même page', () => {
    expect(d('Le total est de 100 euros pour 3 pièces', 'Le total est de 120 euros pour 4 pièces')).toEqual(['equal:Le total est de', 'del:100', 'add:120', 'equal:euros pour', 'del:3', 'add:4', 'equal:pièces']);
  });
  it('très long texte presque identique : rapide (extrémités communes retirées)', () => {
    const a = Array.from({ length: 50_000 }, (_, i) => `mot${i}`);
    const b = [...a];
    b[25_000] = 'changé';
    const t0 = Date.now();
    const ops = diffWords(a, b);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(ops.filter((o) => o.kind !== 'equal').map((o) => `${o.kind}:${o.words}`)).toEqual(['del:mot25000', 'add:changé']);
  });
  it('deux textes entièrement différents et énormes : traités comme remplacés, sans exploser la mémoire', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 5000 }, (_, i) => `b${i}`);
    expect(diffWords(a, b).map((o) => o.kind)).toEqual(['del', 'add']);
  });
});

describe('comparer deux documents', () => {
  it('page par page, avec les pages en plus ou en moins', () => {
    const c = compareDocuments(['page un identique', 'le chat dort', 'fin'], ['page un identique', 'le chien dort', 'fin', 'page ajoutée']);
    expect(c.pages).toHaveLength(4);
    expect(c.changed.map((p) => p.page)).toEqual([1, 3]);
    expect(c.pages[1]).toMatchObject({ added: 1, removed: 1 });
    expect(c.pages[3]).toMatchObject({ only: 'second', added: 2, removed: 0 });
    expect(c.added).toBe(3);
    expect(c.removed).toBe(1);
    expect(compareDocuments(['a b'], ['a b']).changed).toEqual([]);
    expect(compareDocuments(['a', 'b'], ['a']).pages[1]).toMatchObject({ only: 'first', removed: 1 });
  });
  it('contexte : le texte inchangé est abrégé autour des modifications', () => {
    const a = tokenize(Array.from({ length: 40 }, (_, i) => `m${i}`).join(' '));
    const b = [...a];
    b[20] = 'X';
    const ctx = withContext(diffWords(a, b), 3).map((o) => `${o.kind}:${o.words.join(' ')}`);
    expect(ctx).toEqual(['equal:…', 'equal:m17 m18 m19', 'del:m20', 'add:X', 'equal:m21 m22 m23', 'equal:…']);
  });
});
