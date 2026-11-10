import { describe, expect, it } from 'vitest';
import type { AnnotDraft, Pt } from '../../src/data/annotations';
import { PENS, distToSegment, inkOutline, strokeBounds, strokeTouched } from '../../src/data/ink';
import { addAnnotations, listAnnotations, updateAnnotation } from '../../src/pdf/annot-ops';
import { translate } from '../../src/data/annotations';
import { everything, makePdf, readPages } from './helpers';

const wave: Pt[] = Array.from({ length: 40 }, (_, i) => [100 + i * 4, 400 + Math.sin(i / 4) * 20]);
const press = wave.map((_, i) => 0.2 + (i / 40) * 0.7);

describe('écriture manuscrite : contour d’un trait', () => {
  it('un trait a un contour fermé qui entoure les points', () => {
    for (const pen of ['pen', 'fountain', 'highlighter'] as const) {
      const poly = inkOutline(wave, press, PENS[pen].width, pen);
      expect(poly.length).toBeGreaterThan(10);
      const xs = poly.map((p) => p[0]);
      expect(Math.min(...xs)).toBeLessThan(104);
      expect(Math.max(...xs)).toBeGreaterThan(250);
    }
  });
  it('la pression change l’épaisseur de la plume, pas celle du surligneur', () => {
    const thickness = (pen: 'fountain' | 'highlighter', pr: number[]) => {
      const poly = inkOutline(wave, pr, 6, pen);
      const ys = poly.map((p) => p[1]);
      return Math.max(...ys) - Math.min(...ys);
    };
    const light = wave.map(() => 0.1);
    const heavy = wave.map(() => 0.95);
    expect(thickness('fountain', heavy)).toBeGreaterThan(thickness('fountain', light) + 1);
    expect(Math.abs(thickness('highlighter', heavy) - thickness('highlighter', light))).toBeLessThan(1.5);
  });
  it('un simple point ou un trait très court donnent un petit disque, jamais rien', () => {
    for (const pts of [[[50, 50]], [[50, 50], [50.1, 50]]] as Pt[][]) {
      const poly = inkOutline(pts, undefined, 4, 'pen');
      expect(poly.length).toBeGreaterThanOrEqual(3);
      expect(poly.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
    }
  });
  it('sans pression (souris) : pression simulée, résultat valide', () => {
    const poly = inkOutline(wave, undefined, 3, 'fountain');
    expect(poly.length).toBeGreaterThan(10);
  });
  it('rectangle englobant : contient toujours le contour', () => {
    const [x1, y1, x2, y2] = strokeBounds(wave, 8);
    for (const p of inkOutline(wave, press, 8, 'fountain')) {
      expect(p[0]).toBeGreaterThanOrEqual(x1);
      expect(p[0]).toBeLessThanOrEqual(x2);
      expect(p[1]).toBeGreaterThanOrEqual(y1);
      expect(p[1]).toBeLessThanOrEqual(y2);
    }
  });
});

describe('gomme', () => {
  it('distance à un segment', () => {
    expect(distToSegment([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(distToSegment([-4, 3], [0, 0], [10, 0])).toBe(5);
    expect(distToSegment([1, 1], [0, 0], [0, 0])).toBeCloseTo(Math.SQRT2);
  });
  it('touche un trait seulement s’il est à portée', () => {
    expect(strokeTouched(wave, 2, [140, 412], 6)).toBe(true);
    expect(strokeTouched(wave, 2, [140, 300], 6)).toBe(false);
    expect(strokeTouched([[10, 10]], 2, [12, 10], 3)).toBe(true);
    expect(strokeTouched([[10, 10]], 2, [40, 10], 3)).toBe(false);
  });
});

const draft = (d: Partial<AnnotDraft>): AnnotDraft => ({ kind: 'ink', page: 0, color: [0.1, 0.2, 0.6], fill: null, opacity: 1, width: 3, contents: '', rect: [0, 0, 1, 1], strokes: [wave], pressures: [press], pen: 'fountain', ...d });

describe('écriture manuscrite : dans le PDF', () => {
  it('un trait au stylo s’écrit, se relit (stylo et pression compris) et le PDF s’ouvre', async () => {
    const { bytes } = await addAnnotations(await makePdf(1), [draft({}), draft({ pen: 'highlighter', opacity: 0.4, width: 14, color: [1, 0.9, 0.1], pressures: undefined, strokes: [[[50, 500], [200, 500]]] })], undefined, 1, 'Paul');
    const list = await listAnnotations(bytes);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ kind: 'ink', pen: 'fountain', width: 3, foreign: false });
    expect(list[0].strokes![0]).toHaveLength(40);
    list[0].pressures![0].forEach((v, i) => expect(Math.abs(v - press[i])).toBeLessThan(0.006)); // arrondi à 0,01
    expect(list[1]).toMatchObject({ pen: 'highlighter', opacity: 0.4 });
    expect(list[1].pressures).toBeUndefined();
    expect((await readPages(bytes)).length).toBe(1);
  });
  it('déplacer un trait garde le stylo et la pression, et le dessin suit', async () => {
    const { bytes, ids } = await addAnnotations(await makePdf(1), [draft({})], undefined, 1);
    const [a] = await listAnnotations(bytes);
    const moved = await updateAnnotation(bytes, ids[0], translate(a, 30, -20), undefined, 1);
    const [b] = await listAnnotations(moved);
    expect(b.pen).toBe('fountain');
    expect(b.pressures![0]).toHaveLength(40);
    expect(b.strokes![0][0][0]).toBeCloseTo(130, 1);
    expect(b.rect[0]).toBeCloseTo(a.rect[0] + 30, 1);
  });
  it('les anciens traits (sans stylo) restent des traits d’épaisseur constante', async () => {
    const { bytes } = await addAnnotations(await makePdf(1), [draft({ pen: undefined, pressures: undefined })], undefined, 1);
    const [a] = await listAnnotations(bytes);
    expect(a.pen).toBeUndefined();
    expect(a.strokes).toHaveLength(1);
  });
  it('rien ne fuit : le fichier se relit sans erreur après plusieurs traits', async () => {
    const many = Array.from({ length: 25 }, (_, i) => draft({ strokes: [wave.map((p): Pt => [p[0], p[1] + i * 8])], pressures: [press] }));
    const { bytes } = await addAnnotations(await makePdf(1), many, undefined, 1);
    expect(await listAnnotations(bytes)).toHaveLength(25);
    expect((await everything(bytes)).length).toBeGreaterThan(0);
  });
});

describe('images ajoutées sur une page', () => {
  const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
  const img = (image: Uint8Array): AnnotDraft => ({ kind: 'image', page: 0, color: [0, 0, 0], fill: null, opacity: 1, width: 0, contents: '', rect: [100, 500, 220, 560], image });

  it('PNG et JPEG : écrits comme annotation « image », relus comme telle, sans passer pour une signature', async () => {
    for (const image of [PNG, JPEG]) {
      const { bytes } = await addAnnotations(await makePdf(1), [img(image)], undefined, 1);
      const [a] = await listAnnotations(bytes);
      expect(a.kind).toBe('image');
      expect(a.rect).toEqual([100, 500, 220, 560]);
      expect((await readPages(bytes)).length).toBe(1);
    }
  });
  it('déplacée, l’image garde son contenu ; image illisible : refusée proprement', async () => {
    const { bytes, ids } = await addAnnotations(await makePdf(1), [img(PNG)], undefined, 1);
    const [a] = await listAnnotations(bytes);
    const moved = await updateAnnotation(bytes, ids[0], translate(a, 40, 40), undefined, 1);
    const [b] = await listAnnotations(moved);
    expect(b.kind).toBe('image');
    expect(b.rect[0]).toBeCloseTo(140, 1);
    await expect(addAnnotations(await makePdf(1), [img(Uint8Array.from([1, 2, 3]))], undefined, 1)).rejects.toMatchObject({ name: 'badImage' });
  });
});
