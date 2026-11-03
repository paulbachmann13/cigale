import { describe, expect, it } from 'vitest';
import { clampZoom, formatZoom, parseZoom, stepZoom, ZOOM_MAX, ZOOM_MIN } from '../../src/data/zoom';

describe('zoom', () => {
  it('reste entre 25 % et 800 %', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(50)).toBe(ZOOM_MAX);
    expect(clampZoom(NaN)).toBe(1);
  });
  it('passe au palier suivant et précédent', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(0.25, -1)).toBe(0.25);
  });
  it('formate et lit les pourcentages', () => {
    expect(formatZoom(1.5)).toBe('150 %');
    expect(parseZoom('150')).toBe(1.5);
    expect(parseZoom(' 87,5 % ')).toBeCloseTo(0.875);
    expect(parseZoom('9999')).toBe(ZOOM_MAX);
    expect(parseZoom('abc')).toBeNull();
    expect(parseZoom('0')).toBeNull();
  });
});
