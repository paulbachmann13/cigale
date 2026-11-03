import { describe, expect, it } from 'vitest';
import { consecutiveRuns, isNoopMove, moveOrder, normalizeSelection, positionsAfter, rangeSelection } from '../../src/data/page-order';

describe('ordre des pages', () => {
  it('déplace des pages juste avant une position', () => {
    expect(moveOrder(5, [3], 1)).toEqual([0, 3, 1, 2, 4]);
    expect(moveOrder(5, [0, 1], 5)).toEqual([2, 3, 4, 0, 1]);
    expect(moveOrder(5, [1, 3], 0)).toEqual([1, 3, 0, 2, 4]);
  });
  it('garde l’ordre relatif des pages déplacées', () => {
    expect(moveOrder(6, [4, 1], 3)).toEqual([0, 2, 1, 4, 3, 5]);
  });
  it('reconnaît un déplacement sans effet', () => {
    expect(isNoopMove(5, [2], 2)).toBe(true);
    expect(isNoopMove(5, [2], 3)).toBe(true);
    expect(isNoopMove(5, [2], 4)).toBe(false);
  });
  it('normalise la sélection', () => {
    expect(normalizeSelection([3, 1, 3, -1, 9, 2.5], 5)).toEqual([1, 3]);
  });
  it('sélectionne une plage dans les deux sens', () => {
    expect(rangeSelection(2, 4)).toEqual([2, 3, 4]);
    expect(rangeSelection(4, 2)).toEqual([2, 3, 4]);
  });
  it('retrouve les positions après un déplacement', () => {
    expect(positionsAfter(moveOrder(5, [3], 1), [3])).toEqual([1]);
  });
  it('regroupe les pages consécutives', () => {
    expect(consecutiveRuns([6, 0, 1, 2, 5])).toEqual([[0, 1, 2], [5, 6]]);
  });
});
