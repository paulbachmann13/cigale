import { describe, expect, it } from 'vitest';
import { PDFArray, PDFContentStream, PDFDocument, PDFRawStream, decodePDFRawStream, degrees } from '@cantoo/pdf-lib';
import { PAPER_SIZES, PAPER_TEMPLATES, createNotebook } from '../../src/pdf/notebook-ops';
import { applyOp } from '../../src/pdf/page-ops';
import { makePdf, readPages } from './helpers';

/** Nombre de segments tracés dans le contenu d'une page (opérateur « l »), flux décompressés. */
async function strokes(bytes: Uint8Array, page: number): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(page).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  let text = '';
  for (const r of refs) {
    const stream = doc.context.lookup(r);
    if (stream instanceof PDFRawStream) text += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1') + '\n';
    else if (stream instanceof PDFContentStream) text += Buffer.from(stream.getUnencodedContents()).toString('latin1') + '\n';
  }
  return (text.match(/ l\b/g) ?? []).length;
}

describe('carnets', () => {
  it('chaque papier produit des pages de la bonne taille, et le papier uni reste vide', async () => {
    for (const template of PAPER_TEMPLATES) {
      const bytes = await createNotebook({ template, size: 'a4', landscape: false, pages: 3 });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(3);
      const [w, h] = PAPER_SIZES.a4;
      expect(doc.getPage(0).getSize().width).toBeCloseTo(w, 1);
      expect(doc.getPage(0).getSize().height).toBeCloseTo(h, 1);
      if (template === 'blank') expect(await strokes(bytes, 0)).toBe(0);
      else if (template !== 'dots') expect(await strokes(bytes, 0)).toBeGreaterThan(20);
    }
  });
  it('le Seyès a beaucoup plus de lignes que le papier ligné', async () => {
    const seyes = await strokes(await createNotebook({ template: 'seyes', size: 'a4', landscape: false, pages: 1 }), 0);
    const lined = await strokes(await createNotebook({ template: 'lined', size: 'a4', landscape: false, pages: 1 }), 0);
    expect(seyes).toBeGreaterThan(lined * 4);
  });
  it('paysage et autres formats', async () => {
    const doc = await PDFDocument.load(await createNotebook({ template: 'grid', size: 'a5', landscape: true, pages: 1 }));
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
    expect(width).toBeCloseTo(PAPER_SIZES.a5[1], 1);
  });
  it('nombre de pages invalide : refusé', async () => {
    for (const pages of [0, -1, 501, NaN]) await expect(createNotebook({ template: 'blank', size: 'a4', landscape: false, pages })).rejects.toMatchObject({ name: 'pageCount' });
  });
  it('ouvrable par pdf.js', async () => {
    expect((await readPages(await createNotebook({ template: 'seyes', size: 'letter', landscape: false, pages: 2 }))).length).toBe(2);
  });
});

describe('insérer des pages avec un papier', () => {
  it('3 pages quadrillées après la page 1 : même taille que la voisine, papier dessiné, sélectionnées', async () => {
    const src = await makePdf(2);
    const r = await applyOp(src, { op: 'insertBlank', at: 1, template: 'grid', count: 3 }, undefined, 2);
    expect(r.pageCount).toBe(5);
    expect(r.selection).toEqual([1, 2, 3]);
    expect(await strokes(r.bytes, 1)).toBeGreaterThan(20);
    expect(await strokes(r.bytes, 0)).toBeLessThan(5); // la page d'origine n'a pas été touchée
  });
  it('sans papier : comme avant (une page vierge)', async () => {
    const r = await applyOp(await makePdf(2), { op: 'insertBlank', at: 0 }, undefined, 2);
    expect(r.pageCount).toBe(3);
    expect(r.selection).toEqual([0]);
    expect(await strokes(r.bytes, 0)).toBe(0);
  });
});

describe('papier partagé et cas limites', () => {
  it('500 pages pointillées ne pèsent pas 500 fois une page (flux partagé)', async () => {
    const one = (await createNotebook({ template: 'dots', size: 'a4', landscape: false, pages: 1 })).length;
    const many = (await createNotebook({ template: 'dots', size: 'a4', landscape: false, pages: 200 })).length;
    expect(many).toBeLessThan(one * 6);
    const doc = await PDFDocument.load(await createNotebook({ template: 'dots', size: 'a4', landscape: false, pages: 3 }));
    expect(doc.getPageCount()).toBe(3);
  });
  it('un nombre de pages NaN à l’insertion : une seule page', async () => {
    const r = await applyOp(await makePdf(1), { op: 'insertBlank', at: 1, template: 'lined', count: NaN }, undefined, 1);
    expect(r.pageCount).toBe(2);
    expect(r.selection).toEqual([1]);
  });
  it('à côté d’une page tournée de 90°, le papier est droit (largeur et hauteur échangées, pas de rotation)', async () => {
    const src = await PDFDocument.load(await makePdf(1));
    src.getPage(0).setRotation(degrees(90));
    const r = await applyOp(await src.save(), { op: 'insertBlank', at: 1, template: 'grid' }, undefined, 1);
    const doc = await PDFDocument.load(r.bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect(doc.getPage(1).getRotation().angle).toBe(0);
    expect(doc.getPage(1).getSize().width).toBeCloseTo(height, 1);
    expect(doc.getPage(1).getSize().height).toBeCloseTo(width, 1);
  });
});

import { PAPER_COLORS, PAPER_COLOR_NAMES, paperPrims } from '../../src/data/paper';

describe('tous les papiers et couleurs', () => {
  it('chaque papier (sauf l’uni) a des formes, dans les limites de la page', () => {
    for (const template of PAPER_TEMPLATES) {
      const prims = paperPrims(template, 595.28, 841.89);
      if (template === 'blank') {
        expect(prims).toHaveLength(0);
        continue;
      }
      expect(prims.length, template).toBeGreaterThan(5);
      for (const p of prims) {
        const xs = p.k === 'line' ? [p.x1, p.x2] : [p.x];
        const ys = p.k === 'line' ? [p.y1, p.y2] : [p.y];
        for (const x of xs) expect(x).toBeGreaterThanOrEqual(-0.01), expect(x).toBeLessThanOrEqual(595.3);
        for (const y of ys) expect(y).toBeGreaterThanOrEqual(-0.01), expect(y).toBeLessThanOrEqual(841.9);
      }
    }
  });
  it('musique : des portées de 5 lignes ; Cornell : le cadre est dessiné ; millimétré : trois épaisseurs', () => {
    expect(paperPrims('music', 595.28, 841.89).length % 5).toBe(0);
    const cornell = paperPrims('cornell', 595.28, 841.89).filter((p) => p.k === 'line' && p.w >= 0.9);
    expect(cornell).toHaveLength(3); // titre, résumé, colonne de mots-clés
    expect(new Set(paperPrims('mm', 595.28, 841.89).map((p) => (p.k === 'line' ? p.w : 0))).size).toBe(3);
  });
  it('papier de couleur : le fond est dans le PDF, pour chaque couleur ; le blanc n’ajoute rien', async () => {
    for (const color of PAPER_COLOR_NAMES.filter((c) => c !== 'white')) {
      const bytes = await createNotebook({ template: 'blank', color, size: 'a5', landscape: false, pages: 2 });
      const doc = await PDFDocument.load(bytes);
      const ref = doc.getPage(0).node.Contents();
      expect(ref).toBeTruthy();
      expect((await readPages(bytes)).length).toBe(2);
      void PAPER_COLORS[color];
    }
    const white = await createNotebook({ template: 'blank', size: 'a5', landscape: false, pages: 1 });
    const cream = await createNotebook({ template: 'blank', color: 'cream', size: 'a5', landscape: false, pages: 1 });
    expect(cream.length).toBeGreaterThan(white.length);
  });
});

describe('insérer une copie d’une page', () => {
  it('2 copies de la page 2, après la page 1 : 4 pages, copies distinctes et sélectionnées', async () => {
    const src = await makePdf(3);
    const r = await applyOp(src, { op: 'insertCopy', at: 1, from: 1, count: 2 }, undefined, 3);
    expect(r.pageCount).toBe(5);
    expect(r.selection).toEqual([1, 2]);
    const pages = await readPages(r.bytes);
    expect(pages[1].text).toBe(pages[3].text); // la copie a le même texte que la page 2 d'origine (maintenant en 4)
    expect(pages[2].text).toBe(pages[3].text);
    expect(pages[0].text).not.toBe(pages[1].text);
    const doc = await PDFDocument.load(r.bytes);
    const refs = new Set(doc.getPages().map((p) => p.ref.toString()));
    expect(refs.size).toBe(5); // aucune page n'apparaît deux fois dans l'arbre
  });
  it('page source inexistante : refusé', async () => {
    await expect(applyOp(await makePdf(2), { op: 'insertCopy', at: 0, from: 5 }, undefined, 2)).rejects.toMatchObject({ name: 'structure' });
  });
  it('insérer au tout début et à la toute fin', async () => {
    const start = await applyOp(await makePdf(2), { op: 'insertCopy', at: 0, from: 1 }, undefined, 2);
    expect(start.selection).toEqual([0]);
    const end = await applyOp(await makePdf(2), { op: 'insertBlank', at: 2, template: 'dots', color: 'cream' }, undefined, 2);
    expect(end.pageCount).toBe(3);
    expect(end.selection).toEqual([2]);
  });
});
