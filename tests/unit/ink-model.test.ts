import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import type { Pt } from '../../src/data/annotations';
import { History } from '../../src/data/history';
import { type InkStroke, eraseFromStroke, newStrokeId, outlineOps, inkOutline, sweepTouches } from '../../src/data/ink';
import { InkModel, invertAction } from '../../src/data/ink-model';
import { listMarks } from '../../src/pdf/annot-ops';
import { findInkLayer } from '../../src/pdf/ink-layer';
import { normalizeInk, setInk, sheetsFromStrokes, strokesFromAnnots } from '../../src/pdf/ink-ops';
import { makePdf } from './helpers';

const stroke = (page: number, y: number, extra: Partial<InkStroke> = {}): InkStroke => ({
  id: newStrokeId(),
  page,
  points: Array.from({ length: 30 }, (_, i): Pt => [100 + i * 5, y + Math.sin(i / 4) * 6]),
  color: [0.1, 0.1, 0.15],
  width: 1.5,
  pen: 'pen',
  ...extra,
});

describe('gomme précise', () => {
  it('coupe un trait en deux morceaux autour de la gomme, sans toucher au reste', () => {
    const s = stroke(0, 300);
    const pieces = eraseFromStroke(s, [175, 296], [175, 304], 4)!;
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => p.id !== s.id && p.pen === s.pen && p.width === s.width)).toBe(true);
    expect(Math.max(...pieces[0].points.map((p) => p[0]))).toBeLessThan(175);
    expect(Math.min(...pieces[1].points.map((p) => p[0]))).toBeGreaterThan(175);
  });
  it('trait loin de la gomme : null ; gomme qui recouvre tout : aucun morceau ; un geste rapide ne saute pas un trait fin', () => {
    const s = stroke(0, 300);
    expect(eraseFromStroke(s, [175, 400], [175, 410], 4)).toBeNull();
    expect(eraseFromStroke(s, [90, 300], [260, 300], 40)).toEqual([]);
    expect(sweepTouches(s.points, 1.5, [175, 280], [175, 320], 3)).toBe(true); // balayage vertical qui traverse le trait entre deux positions
  });
  it('la pression suit les morceaux', () => {
    const s = stroke(0, 300, { pressures: Array.from({ length: 30 }, (_, i) => i / 30) });
    const pieces = eraseFromStroke(s, [175, 296], [175, 304], 4)!;
    for (const p of pieces) expect(p.pressures).toHaveLength(p.points.length);
  });
});

describe('contour lissé', () => {
  it('chemin PDF fermé en courbes, sans valeur invalide', () => {
    const ops = outlineOps(inkOutline(stroke(0, 300).points, undefined, 2, 'fountain'), (n) => String(Math.round(n * 100) / 100));
    expect(ops.startsWith(String(ops.split(' ')[0]))).toBe(true);
    expect(ops.endsWith(' h')).toBe(true);
    expect(ops).not.toMatch(/NaN|Infinity/);
    expect((ops.match(/ c/g) ?? []).length).toBeGreaterThan(10);
  });
});

describe('modèle d’encre et actions', () => {
  it('ajouter, effacer, annuler, rétablir : les versions reviennent', () => {
    const m = new InkModel();
    const a = stroke(0, 100);
    const b = stroke(0, 140);
    const add = m.change(0, [a, b])!;
    expect(m.strokes(0)).toEqual([a, b]);
    expect(m.version(0)).toBe(add.after);
    const erase = m.change(0, [b])!;
    expect(m.strokes(0)).toEqual([b]);
    m.apply(invertAction(erase));
    expect(m.strokes(0).map((s) => s.id)).toEqual([a.id, b.id]); // remis à sa place
    expect(m.version(0)).toBe(add.after);
    m.apply(invertAction(add));
    expect(m.strokes(0)).toHaveLength(0);
    expect(m.version(0)).toBe(0);
    expect(m.change(0, [])).toBeNull(); // rien ne change
  });
  it('pages modifiées depuis un PDF lu ou écrit', () => {
    const m = new InkModel();
    m.reset([stroke(0, 100), stroke(2, 100)]);
    const baseline = m.snapshot();
    expect(m.changedSince(baseline)).toEqual([]);
    m.change(2, [stroke(2, 200)]);
    expect(m.changedSince(baseline)).toEqual([2]);
  });
});

describe('historique : étapes d’écriture légères', () => {
  it('ne copient pas le PDF et sont comptées une seule fois', () => {
    const base = new Uint8Array(1000);
    const h = new History(base, true, 1500);
    const m = new InkModel();
    for (let i = 0; i < 50; i++) {
      const act = m.change(0, [...m.strokes(0), stroke(0, 100 + i)])!;
      h.pushInk([act], 'écrire');
    }
    expect(h.canUndo).toBe(true);
    for (let i = 0; i < 50; i++) expect(h.undoInk).toBeDefined(), h.undo();
    expect(h.canUndo).toBe(false); // aucune étape n'a été oubliée : 50 étapes ne pèsent que 1 000 octets
    expect(h.current).toBe(base);
  });
  it('replaceCurrent garde l’état courant avec de nouveaux octets ; markSaved reconnaît l’étape courante', () => {
    const h = new History(new Uint8Array(5), true);
    const shared = new Uint8Array(5);
    h.push(shared, 'op');
    h.pushInk([], 'écrire');
    h.pushInk([], 'écrire');
    h.markSaved(h.current);
    expect(h.dirty).toBe(false);
    const written = new Uint8Array(7);
    h.replaceCurrent(written, new Map([[0, 4]]));
    expect(h.current).toBe(written);
    expect(h.inkVersions.get(0)).toBe(4);
    h.pushInk([], 'écrire');
    expect(h.inkVersions.get(0)).toBe(4); // une étape d'écriture partage les octets et leurs versions
  });
});

describe('encre ↔ PDF', () => {
  it('écrire des traits (styles différents, pression), les relire à l’identique, dans le calque dédié', async () => {
    const pressed = Array.from({ length: 30 }, (_, i) => 0.2 + i / 60);
    const strokes = [stroke(0, 300, { pressures: pressed }), stroke(0, 340, { pressures: pressed }), stroke(0, 380, { pen: 'highlighter', width: 14, color: [1, 0.9, 0.1] })];
    const bytes = await setInk(await makePdf(2), [{ page: 0, strokes }], undefined, 2, 'Paul');
    const { annots, inkLegacy } = await listMarks(bytes);
    expect(inkLegacy).toBe(false);
    const back = strokesFromAnnots(annots);
    expect(back.map((s) => s.id)).toEqual(strokes.map((s) => s.id)); // identifiants gardés, ordre gardé
    expect(back[2].pen).toBe('highlighter');
    expect(back[0].pressures).toHaveLength(30);
    expect(annots.filter((a) => a.kind === 'ink')).toHaveLength(2); // deux feuilles : les 2 traits de même style sont regroupés
    const doc = await PDFDocument.load(bytes);
    const layer = findInkLayer(doc);
    expect(layer).not.toBeNull();
    const annotsArr = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    for (let i = 0; i < annotsArr.size(); i++) expect(annotsArr.lookup(i, PDFDict).get(PDFName.of('OC'))).toBe(layer);
  });
  it('remplacer l’encre d’une page ne touche ni les autres pages ni les autres annotations ; une page vidée perd son encre', async () => {
    let bytes = await setInk(await makePdf(2), [{ page: 0, strokes: [stroke(0, 300)] }, { page: 1, strokes: [stroke(1, 300)] }], undefined, 2);
    bytes = await setInk(bytes, [{ page: 0, strokes: [] }], undefined, 2);
    const back = strokesFromAnnots((await listMarks(bytes)).annots);
    expect(back.map((s) => s.page)).toEqual([1]);
    expect(sheetsFromStrokes(0, [])).toEqual([]);
  });
  it('un ancien fichier (encre hors calque) est détecté puis rangé', async () => {
    const { addAnnotations } = await import('../../src/pdf/annot-ops');
    const legacy = await addAnnotations(await makePdf(1), [{ kind: 'ink', page: 0, color: [0, 0, 0], fill: null, opacity: 1, width: 2, contents: '', rect: [0, 0, 1, 1], strokes: [[[50, 50], [90, 80]]], pen: 'pen' }], undefined, 1);
    // addAnnotations passe par saveDoc : le calque est déjà là ; on simule un fichier ancien en le retirant
    const doc = await PDFDocument.load(legacy.bytes);
    doc.catalog.delete(PDFName.of('OCProperties'));
    const arr = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    arr.lookup(0, PDFDict).delete(PDFName.of('OC'));
    const old = await doc.save();
    expect((await listMarks(old)).inkLegacy).toBe(true);
    const fixed = await normalizeInk(old);
    expect((await listMarks(fixed)).inkLegacy).toBe(false);
    expect(strokesFromAnnots((await listMarks(fixed)).annots)).toHaveLength(1);
  });
  it('un fichier sans encre n’est pas modifié par le calque (aucun calque ajouté)', async () => {
    const bytes = await setInk(await makePdf(1), [], undefined, 1);
    expect(findInkLayer(await PDFDocument.load(bytes))).toBeNull();
  });
});
