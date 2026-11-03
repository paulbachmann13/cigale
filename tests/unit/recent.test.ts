import { describe, expect, it } from 'vitest';
import { addRecent, formatSize, parseRecents, removeRecent, type RecentEntry } from '../../src/data/recent';

const e = (id: string, t = 1): RecentEntry => ({ id, name: id, size: 10, openedAt: t });

describe('récents', () => {
  it('met le dernier en tête sans doublon et borne la liste', () => {
    let l: RecentEntry[] = [];
    for (const id of ['a', 'b', 'c']) l = addRecent(l, e(id), 3);
    expect(l.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    l = addRecent(l, e('a', 9), 3);
    expect(l.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    l = addRecent(l, e('d'), 3);
    expect(l.map((x) => x.id)).toEqual(['d', 'a', 'c']);
  });
  it('retire un élément', () => expect(removeRecent([e('a'), e('b')], 'a').map((x) => x.id)).toEqual(['b']));
  it('lit un JSON abîmé sans planter', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('{pas du json')).toEqual([]);
    expect(parseRecents('{"a":1}')).toEqual([]);
    expect(parseRecents(JSON.stringify([e('a'), { id: 1 }]))).toEqual([e('a')]);
  });
  it('formate les tailles', () => {
    expect(formatSize(500)).toBe('500 o');
    expect(formatSize(1536)).toMatch(/^1,5 Ko$/);
    expect(formatSize(5 * 1024 * 1024)).toMatch(/^5,0? ?Mo$|^5 Mo$/);
  });
});
