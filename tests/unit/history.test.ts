import { describe, expect, it } from 'vitest';
import { History } from '../../src/data/history';

const b = (n: number, size = 10) => new Uint8Array(size).fill(n);

describe('historique', () => {
  it('annule et rétablit', () => {
    const h = new History(b(0), true);
    h.push(b(1), 'A');
    h.push(b(2), 'B');
    expect(h.undoLabel).toBe('B');
    expect(h.undo()?.[0]).toBe(1);
    expect(h.redoLabel).toBe('B');
    expect(h.redo()?.[0]).toBe(2);
    expect(h.redo()).toBeNull();
  });
  it('perd les « rétablir » après une nouvelle modification', () => {
    const h = new History(b(0), true);
    h.push(b(1), 'A');
    h.undo();
    h.push(b(9), 'C');
    expect(h.canRedo).toBe(false);
    expect(h.current[0]).toBe(9);
  });
  it('suit l’état enregistré', () => {
    const h = new History(b(0), true);
    expect(h.dirty).toBe(false);
    h.push(b(1), 'A');
    expect(h.dirty).toBe(true);
    h.markSaved();
    expect(h.dirty).toBe(false);
    h.undo();
    expect(h.dirty).toBe(true);
    h.redo();
    expect(h.dirty).toBe(false);
  });
  it('un document jamais enregistré est modifié dès le départ', () => {
    expect(new History(b(0), false).dirty).toBe(true);
  });
  it('oublie l’état enregistré s’il sort de l’historique', () => {
    const h = new History(b(0, 100), true, 250);
    h.push(b(1, 100), 'A');
    h.push(b(2, 100), 'B');
    h.push(b(3, 100), 'C');
    expect(h.dirty).toBe(true);
    while (h.undo()) {
      /* remonte au plus ancien état gardé */
    }
    expect(h.dirty).toBe(true);
  });
  it('garde au moins deux étapes', () => {
    const h = new History(b(0, 1000), true, 10);
    h.push(b(1, 1000), 'A');
    expect(h.canUndo).toBe(true);
  });
});
