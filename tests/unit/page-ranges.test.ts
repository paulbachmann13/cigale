import { describe, expect, it } from 'vitest';
import { parseRanges, rangesToIndices, sanitizeFileName, splitAtStarts, splitEvery, uniqueNames } from '../../src/data/page-ranges';

describe('plages de pages', () => {
  it('lit pages, plages et bornes ouvertes', () => {
    expect(parseRanges('1-3, 5, 8-', 10)).toEqual({ ok: true, ranges: [{ from: 1, to: 3 }, { from: 5, to: 5 }, { from: 8, to: 10 }] });
    expect(parseRanges('-2;4', 6)).toEqual({ ok: true, ranges: [{ from: 1, to: 2 }, { from: 4, to: 4 }] });
  });
  it('garde l’ordre saisi', () => {
    const r = parseRanges('5, 1-2', 6);
    expect(r.ok && rangesToIndices(r.ranges)).toEqual([4, 0, 1]);
  });
  it('refuse le vide, la syntaxe fausse et les pages hors document', () => {
    expect(parseRanges('  ', 5)).toMatchObject({ ok: false, code: 'empty' });
    expect(parseRanges('a-3', 5)).toMatchObject({ ok: false, code: 'syntax', token: 'a-3' });
    expect(parseRanges('3 4', 5)).toMatchObject({ ok: false, code: 'syntax' });
    expect(parseRanges('0-2', 5)).toMatchObject({ ok: false, code: 'outOfRange' });
    expect(parseRanges('2-9', 5)).toMatchObject({ ok: false, code: 'outOfRange', token: '2-9' });
    expect(parseRanges('4-2', 5)).toMatchObject({ ok: false, code: 'outOfRange' });
  });
  it('découpe tous les N pages', () => {
    expect(splitEvery(7, 3)).toEqual([{ from: 1, to: 3 }, { from: 4, to: 6 }, { from: 7, to: 7 }]);
    expect(splitEvery(2, 5)).toEqual([{ from: 1, to: 2 }]);
  });
  it('découpe aux pages de départ des signets', () => {
    expect(splitAtStarts(10, [4, 8])).toEqual([{ from: 1, to: 3 }, { from: 4, to: 7 }, { from: 8, to: 10 }]);
    expect(splitAtStarts(10, [1, 6, 6])).toEqual([{ from: 1, to: 5 }, { from: 6, to: 10 }]);
    expect(splitAtStarts(5, [])).toEqual([{ from: 1, to: 5 }]);
  });
});

describe('noms de fichiers', () => {
  it('nettoie les caractères interdits', () => {
    expect(sanitizeFileName('Chap. 1 : Intro/Suite?')).toBe('Chap. 1 Intro Suite');
    expect(sanitizeFileName('///')).toBe('document');
    expect(sanitizeFileName('..caché')).toBe('caché');
    expect(sanitizeFileName('NUL')).toBe('document');
    expect(sanitizeFileName('a'.repeat(79) + '. suite')).not.toMatch(/[. ]$/);
  });
  it('rend les noms uniques', () => {
    expect(uniqueNames(['a.pdf', 'b.pdf', 'A.pdf', 'a.pdf'])).toEqual(['a.pdf', 'b.pdf', 'A (2).pdf', 'a (3).pdf']);
  });
});
