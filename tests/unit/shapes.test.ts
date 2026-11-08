import { describe, expect, it } from 'vitest';
import type { Pt } from '../../src/data/annotations';
import { annotSamples, densify, distToLine, eraseOutline, eraseTouched, lassoSelects, magnetAngle, nearestRulerEdge, pointInPolygon, projectOnLine, projectOnSegment, recognizeShape, resample, rulerEdges, simplify } from '../../src/data/shapes';

/** Bruit déterministe (graine fixe) : la main tremble un peu. */
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 2;
const jitter = (pts: Pt[], amp: number): Pt[] => pts.map((p): Pt => [p[0] + rnd() * amp, p[1] + rnd() * amp]);
const along = (a: Pt, b: Pt, n: number): Pt[] => Array.from({ length: n }, (_, i): Pt => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)]);
const polyline = (vs: Pt[], per = 20): Pt[] => vs.slice(1).flatMap((v, i) => along(vs[i], v, per).slice(i ? 1 : 0));

describe('reconnaissance de formes', () => {
  it('ligne droite tremblée → ligne', () => {
    const s = recognizeShape(jitter(along([0, 0], [200, 30], 60), 2.5));
    expect(s?.kind).toBe('line');
    expect(s!.points).toHaveLength(2);
  });
  it('un trait courbe n’est pas une ligne', () => {
    const arc = Array.from({ length: 60 }, (_, i): Pt => [i * 4, Math.sin(i / 10) * 40]);
    expect(recognizeShape(arc)?.kind).not.toBe('line');
  });
  it('cercle tremblé, ouvert un peu → cercle parfait fermé', () => {
    const c = jitter(Array.from({ length: 80 }, (_, i): Pt => [100 + 60 * Math.cos((i / 80) * Math.PI * 2.05), 100 + 60 * Math.sin((i / 80) * Math.PI * 2.05)]), 3);
    const s = recognizeShape(c)!;
    expect(s.kind).toBe('circle');
    const rs = s.points.map((p) => Math.hypot(p[0] - 100, p[1] - 100));
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(8);
    expect(s.points[0]).toEqual(s.points[s.points.length - 1]);
  });
  it('ellipse aplatie → ellipse', () => {
    const e = jitter(Array.from({ length: 80 }, (_, i): Pt => [150 + 100 * Math.cos((i / 80) * Math.PI * 2.04), 100 + 40 * Math.sin((i / 80) * Math.PI * 2.04)]), 2);
    expect(recognizeShape(e)?.kind).toBe('ellipse');
  });
  it('rectangle à main levée → rectangle parfait aligné sur les axes', () => {
    const r = jitter(polyline([[10, 10], [210, 12], [208, 110], [8, 108], [12, 14]]), 2);
    const s = recognizeShape(r)!;
    expect(s.kind).toBe('rect');
    const xs = new Set(s.points.map((p) => Math.round(p[0])));
    expect(xs.size).toBe(2);
    expect(s.points).toHaveLength(5);
  });
  it('triangle → polygone à 3 sommets', () => {
    const t = jitter(polyline([[100, 10], [200, 170], [0, 165], [102, 14]]), 2);
    const s = recognizeShape(t)!;
    expect(s.kind).toBe('polygon');
    expect(s.points).toHaveLength(4); // 3 sommets + fermeture
  });
  it('angle (un L) → angle à 3 points', () => {
    const l = jitter(polyline([[10, 10], [10, 150], [140, 152]]), 2);
    const s = recognizeShape(l)!;
    expect(s.kind).toBe('angle');
    expect(s.points).toHaveLength(3);
    expect(Math.abs(s.points[1][0] - 10)).toBeLessThan(10);
  });
  it('écriture, zigzag, spirale, petit point : rien n’est reconnu', () => {
    const zig = polyline([[0, 0], [30, 40], [60, 0], [90, 40], [120, 0], [150, 40]], 12);
    expect(recognizeShape(zig)).toBeNull();
    const spiral = Array.from({ length: 120 }, (_, i): Pt => [100 + (10 + i) * 0.6 * Math.cos(i / 8), 100 + (10 + i) * 0.6 * Math.sin(i / 8)]);
    expect(recognizeShape(spiral)).toBeNull();
    expect(recognizeShape([[1, 1], [2, 2], [3, 1], [2, 0], [1, 1]])).toBeNull();
    const letterS = Array.from({ length: 60 }, (_, i): Pt => [30 + Math.sin(i / 9) * 25, i * 2.2]);
    expect(recognizeShape(letterS)).toBeNull();
  });
  it('indépendant du repère (y vers le haut ou vers le bas)', () => {
    const base = polyline([[10, 10], [210, 12], [208, 110], [8, 108], [12, 14]]);
    const flipped = base.map((p): Pt => [p[0], 500 - p[1]]);
    expect(recognizeShape(flipped)?.kind).toBe('rect');
  });
});

describe('outils géométriques', () => {
  it('rééchantillonnage : n points régulièrement espacés', () => {
    const r = resample([[0, 0], [100, 0]], 11);
    expect(r).toHaveLength(11);
    expect(r[5][0]).toBeCloseTo(50);
  });
  it('simplification d’un chemin droit', () => {
    expect(simplify(along([0, 0], [100, 0], 30), 1)).toHaveLength(2);
  });
  it('projection sur la règle', () => {
    expect(projectOnLine([5, 7], [0, 0], [10, 0])).toEqual([5, 0]);
    expect(distToLine([5, 7], [0, 0], [10, 0])).toBe(7);
    const [x, y] = projectOnLine([3, 5], [0, 0], [10, 10]);
    expect(x).toBeCloseTo(4);
    expect(y).toBeCloseTo(4);
  });
  it('point dans un polygone (lasso)', () => {
    const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon([5, 5], sq)).toBe(true);
    expect(pointInPolygon([15, 5], sq)).toBe(false);
    expect(pointInPolygon([5, -1], sq)).toBe(false);
  });
});

describe('règle', () => {
  it('bords d’une règle horizontale et inclinée', () => {
    const [top, bottom] = rulerEdges([100, 100], 0, 200, 40);
    expect(top).toEqual([[0, 80], [200, 80]]);
    expect(bottom).toEqual([[0, 120], [200, 120]]);
    const [t45] = rulerEdges([0, 0], Math.PI / 4, 100, 0);
    expect(t45[0][0]).toBeCloseTo(-35.36, 1);
    expect(t45[1][1]).toBeCloseTo(35.36, 1);
  });
  it('choisit le bord le plus proche, ou aucun s’il est trop loin', () => {
    const edges = rulerEdges([100, 100], 0, 200, 40);
    expect(nearestRulerEdge([50, 85], edges, 22)).toEqual(edges[0]);
    expect(nearestRulerEdge([50, 118], edges, 22)).toEqual(edges[1]);
    expect(nearestRulerEdge([50, 200], edges, 22)).toBeNull();
    expect(nearestRulerEdge([400, 100], edges, 22)).toBeNull(); // au-delà du bout de la règle
  });
  it('le trait reste dans les limites de la règle', () => {
    expect(projectOnSegment([300, 50], [0, 80], [200, 80])).toEqual([200, 80]);
    expect(projectOnSegment([-5, 50], [0, 80], [200, 80])).toEqual([0, 80]);
    expect(projectOnSegment([60, 50], [0, 80], [200, 80])).toEqual([60, 80]);
  });
  it('aimant : 0°, 15°, 45°, 90° à 2,5° près', () => {
    const rad = (d: number) => (d * Math.PI) / 180;
    expect(magnetAngle(rad(1.5))).toBe(0);
    expect(magnetAngle(rad(44))).toBeCloseTo(rad(45));
    expect(magnetAngle(rad(91.9))).toBeCloseTo(rad(90));
    expect(magnetAngle(rad(37))).toBeCloseTo(rad(37)); // loin d'un multiple de 15° : inchangé
  });
});

describe('lasso : qu’est-ce qui est entouré ?', () => {
  const box: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  it('un long trait droit à deux points est entouré s’il est dedans (pas seulement ses deux bouts)', () => {
    expect(lassoSelects({ rect: [10, 50, 90, 50], strokes: [[[10, 50], [90, 50]]] }, box)).toBe(true);
    // à cheval : seul un bout est dedans mais la majorité du tracé est dehors
    expect(lassoSelects({ rect: [90, 50, 400, 50], strokes: [[[90, 50], [400, 50]]] }, box)).toBe(false);
    // à cheval, mais surtout dedans
    expect(lassoSelects({ rect: [10, 50, 130, 50], strokes: [[[10, 50], [130, 50]]] }, box)).toBe(true);
  });
  it('une forme ou une image : au moins la moitié de sa surface dans la boucle', () => {
    expect(lassoSelects({ rect: [20, 20, 80, 80] }, box)).toBe(true);
    expect(lassoSelects({ rect: [60, 20, 160, 80] }, box)).toBe(false); // 40 % dedans
    expect(lassoSelects({ rect: [40, 20, 140, 80] }, box)).toBe(true); // 60 % dedans
    expect(lassoSelects({ rect: [200, 200, 300, 300] }, box)).toBe(false);
  });
  it('un surlignage (plusieurs rectangles) et une ligne', () => {
    expect(lassoSelects({ rect: [10, 10, 90, 40], quads: [[10, 30, 90, 40], [10, 10, 60, 20]] }, box)).toBe(true);
    expect(lassoSelects({ rect: [10, 10, 90, 90], line: [10, 10, 90, 90] }, box)).toBe(true);
  });
  it('un point (trait d’un seul point) et densification', () => {
    expect(lassoSelects({ rect: [50, 50, 50, 50], strokes: [[[50, 50]]] }, box)).toBe(true);
    expect(densify([[0, 0], [30, 0]], 3).length).toBeGreaterThan(9);
    expect(annotSamples({ rect: [0, 0, 10, 10] })).toHaveLength(49);
  });
  it('un lasso mal fermé (le départ n’est pas la fin) entoure quand même', () => {
    const open: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100], [5, 8]];
    expect(lassoSelects({ rect: [20, 20, 80, 80] }, open)).toBe(true);
  });
});

describe('gomme : formes', () => {
  const base = { page: 0, width: 2, fill: null as null | [number, number, number] };
  const rect = { ...base, kind: 'rect', rect: [100, 100, 200, 160] as [number, number, number, number] };
  it('rectangle vide : touché par le bord, pas par le centre', () => {
    expect(eraseTouched(rect, [100, 130], 3)).toBe(true);
    expect(eraseTouched(rect, [150, 100], 3)).toBe(true);
    expect(eraseTouched(rect, [150, 130], 3)).toBe(false);
    expect(eraseTouched(rect, [300, 300], 3)).toBe(false);
  });
  it('rectangle rempli : touché aussi à l’intérieur', () => {
    expect(eraseTouched({ ...rect, fill: [1, 0, 0] }, [150, 130], 3)).toBe(true);
    expect(eraseTouched({ ...rect, fill: [1, 0, 0] }, [300, 300], 3)).toBe(false);
  });
  it('ellipse, ligne et flèche', () => {
    const ell = { ...base, kind: 'ellipse', rect: [0, 0, 100, 60] as [number, number, number, number] };
    expect(eraseOutline(ell)[0]).toHaveLength(49);
    expect(eraseTouched(ell, [100, 30], 3)).toBe(true);
    expect(eraseTouched(ell, [50, 30], 3)).toBe(false);
    expect(eraseTouched({ ...ell, fill: [0, 0, 1] }, [50, 30], 3)).toBe(true);
    for (const kind of ['line', 'arrow']) {
      const l = { ...base, kind, rect: [0, 0, 100, 100] as [number, number, number, number], line: [0, 0, 100, 100] as [number, number, number, number] };
      expect(eraseTouched(l, [50, 51], 3)).toBe(true);
      expect(eraseTouched(l, [50, 80], 3)).toBe(false);
    }
  });
});
