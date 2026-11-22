import { describe, expect, it } from 'vitest';
import { nearestDock } from '../../src/app/pen-dock';

describe('barre flottante : bord le plus proche', () => {
  it('un point près d’un bord colle à ce bord, avec la position le long du bord', () => {
    expect(nearestDock(500, 790, 1000, 800)).toEqual({ edge: 'bottom', pos: 0.5 });
    expect(nearestDock(250, 8, 1000, 800)).toEqual({ edge: 'top', pos: 0.25 });
    expect(nearestDock(6, 600, 1000, 800)).toEqual({ edge: 'left', pos: 0.75 });
    expect(nearestDock(990, 200, 1000, 800)).toEqual({ edge: 'right', pos: 0.25 });
  });
  it('position toujours entre 0 et 1 (même pour un point hors de l’écran) ; égalité : en bas', () => {
    for (const [x, y] of [[-50, 799], [2000, 100], [500, -30], [500, 5000], [0, 0], [1000, 800]]) {
      const { pos } = nearestDock(x, y, 1000, 800);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(1);
    }
    expect(nearestDock(500, 400, 1000, 800).edge).toBe('bottom');
  });
});
