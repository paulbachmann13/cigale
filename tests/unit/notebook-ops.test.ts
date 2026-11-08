import { describe, expect, it } from 'vitest';
import { PDFArray, PDFContentStream, PDFDocument, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';
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
