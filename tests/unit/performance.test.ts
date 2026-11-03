/** Mesures de performance (consignées dans docs/PERFORMANCES.md) avec des plafonds larges pour détecter une régression grave. */
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { addAnnotations, listAnnotations } from '../../src/pdf/annot-ops';
import { mergeSources, splitDocument } from '../../src/pdf/doc-ops';
import { applyOp } from '../../src/pdf/page-ops';
import { makePng } from './helpers';

async function longDoc(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Page ${i}`, { x: 50, y: 780, size: 20, font });
    for (let l = 0; l < 30; l++) p.drawText(`Ligne ${l + 1} de la page ${i} : texte de remplissage pour le test.`, { x: 50, y: 740 - l * 20, size: 10, font });
  }
  return doc.save();
}

const log = (name: string, ms: number, extra = '') => process.stderr.write(`PERF ${name} : ${Math.round(ms)} ms ${extra}\n`);
async function time<T>(name: string, max: number, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  const ms = performance.now() - t0;
  log(name, ms);
  expect(ms, name).toBeLessThan(max);
  return r;
}

describe('performances (Node, un seul cœur : le navigateur fait la même chose dans un Web Worker)', () => {
  it('document de 500 pages', async () => {
    const t0 = performance.now();
    const src = await longDoc(500);
    log('création 500 pages', performance.now() - t0, `(${(src.length / 1e6).toFixed(1)} Mo)`);
    await time('pivoter 50 pages sur 500', 8000, () => applyOp(src, { op: 'rotate', pages: Array.from({ length: 50 }, (_, i) => i * 10), delta: 90 }, undefined, 500));
    const deleted = await time('supprimer 100 pages sur 500', 10_000, () => applyOp(src, { op: 'delete', pages: Array.from({ length: 100 }, (_, i) => i * 5) }, undefined, 500));
    expect(deleted.pageCount).toBe(400);
    await time('déplacer 20 pages sur 500', 10_000, () => applyOp(src, { op: 'move', pages: Array.from({ length: 20 }, (_, i) => i * 20), to: 250 }, undefined, 500));
    await time('commenter une page de 500', 8000, () => addAnnotations(src, [{ page: 250, kind: 'rect', rect: [10, 10, 100, 60], color: [1, 0, 0], fill: null, opacity: 1, width: 2, contents: 'x' }], undefined, 500));
    await time('lister les commentaires de 500 pages', 5000, () => listAnnotations(src, undefined, 500));
    await time('découper en 10 parties de 50 pages', 15_000, () => splitDocument(src, Array.from({ length: 10 }, (_, i) => ({ from: i * 50 + 1, to: i * 50 + 50 })), Array.from({ length: 10 }, (_, i) => `p${i}.pdf`), undefined, 500));
  }, 120_000);

  it('fusion de 10 fichiers de 100 pages', async () => {
    const one = await longDoc(100);
    const r = await time('fusion 10 × 100 pages avec signets', 10_000, () => mergeSources(Array.from({ length: 10 }, (_, i) => ({ name: `f${i}.pdf`, bytes: one })), { keepBookmarks: true }));
    expect(r.pageCount).toBe(1000);
  }, 60_000);

  it('scan : 40 pages d’images lourdes (≈ 2 Mo chacune)', async () => {
    const png = makePng(1654, 2339); // A4 à 200 dpi
    const t0 = performance.now();
    const r = await mergeSources(Array.from({ length: 40 }, (_, i) => ({ name: `s${i}.png`, bytes: png })), { keepBookmarks: false });
    log('40 scans A4 en un PDF', performance.now() - t0, `(${(r.bytes.length / 1e6).toFixed(0)} Mo)`);
    const rot = await time('pivoter 5 pages d’un PDF de scans', 15_000, () => applyOp(r.bytes, { op: 'rotate', pages: [0, 1, 2, 3, 4], delta: 90 }, undefined, 40));
    expect(rot.pageCount).toBe(40);
    await time('supprimer 10 pages d’un PDF de scans', 15_000, () => applyOp(r.bytes, { op: 'delete', pages: Array.from({ length: 10 }, (_, i) => i) }, undefined, 40));
  }, 120_000);
});
