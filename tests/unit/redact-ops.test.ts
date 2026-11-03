import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { applyRedactions } from '../../src/pdf/redact-ops';
import { addFlatOutline, everything, makePng, readPages } from './helpers';

async function doc3(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Rapport confidentiel');
  doc.setAuthor('Marie Dupont');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) doc.addPage([595, 842]).drawText(i === 2 ? 'SECRETDEUX salaire 4200' : `public${i}`, { x: 50, y: 700, size: 24, font });
  addFlatOutline(doc, [{ title: 'Salaire de Marie', page: 2 }, { title: 'Public', page: 3 }]);
  return doc.save();
}
const page2 = (w = 595, h = 842) => ({ index: 1, image: makePng(300, 400), width: w, height: h });
const OPTS = { stripMetadata: false, removeBookmarks: false };
const raw = everything;

describe('caviardage réel', () => {
  it('la page caviardée n’a plus de texte, les autres sont intactes', async () => {
    const src = await doc3();
    expect(raw(src)).toContain('SECRETDEUX');
    const r = await applyRedactions(src, [page2()], OPTS, undefined, 3);
    expect(r.replaced).toBe(1);
    const pages = await readPages(r.bytes);
    expect(pages.map((p) => p.text)).toEqual(['public1', '', 'public3']);
    expect(raw(r.bytes)).not.toContain('SECRETDEUX');
    expect(raw(r.bytes)).not.toContain('4200');
  });

  it('la page garde sa taille affichée', async () => {
    const r = await applyRedactions(await doc3(), [page2(842, 595)], OPTS);
    const p = (await readPages(r.bytes))[1];
    expect([p.width, p.height, p.rotate]).toEqual([842, 595, 0]);
  });

  it('plusieurs pages à la fois', async () => {
    const r = await applyRedactions(await doc3(), [{ ...page2(), index: 0 }, page2(), { ...page2(), index: 2 }], OPTS);
    expect(r.replaced).toBe(3);
    expect((await readPages(r.bytes)).every((p) => p.text === '')).toBe(true);
  });

  it('retire les métadonnées et les signets à la demande', async () => {
    const src = await doc3();
    const kept = await applyRedactions(src, [page2()], OPTS);
    expect(raw(kept.bytes)).toContain('Marie Dupont');
    const r = await applyRedactions(src, [page2()], { stripMetadata: true, removeBookmarks: true });
    expect(raw(r.bytes)).not.toContain('Marie Dupont');
    expect(raw(r.bytes)).not.toContain('Rapport confidentiel');
    const re = await PDFDocument.load(r.bytes, { updateMetadata: false });
    expect(re.getAuthor()).toBeUndefined();
  });

  it('un signet qui visait la page caviardée ne garde pas son contenu', async () => {
    const r = await applyRedactions(await doc3(), [page2()], OPTS);
    expect(raw(r.bytes)).not.toContain('SECRETDEUX');
  });

  it('supprime les marques de caviardage des autres pages', async () => {
    const { addAnnotations, listAnnotations } = await import('../../src/pdf/annot-ops');
    const withMark = await addAnnotations(await doc3(), [{ page: 0, kind: 'rect', rect: [10, 10, 50, 50], color: [1, 0, 0], fill: null, opacity: 1, width: 1, contents: '' }], undefined, 3);
    expect(await listAnnotations(withMark.bytes)).toHaveLength(1);
  });

  it('document protégé : reste protégé', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([595, 842]);
    doc.encrypt({ userPassword: 'secret', ownerPassword: 'chef', permissions: {} });
    const r = await applyRedactions(await doc.save(), [{ index: 0, image: makePng(50, 50), width: 595, height: 842 }], OPTS, 'secret', 2);
    await expect(PDFDocument.load(r.bytes)).rejects.toThrow(/encrypted/i);
  });

  it('garde-fou : nombre de pages différent', async () => {
    await expect(applyRedactions(await doc3(), [page2()], OPTS, undefined, 5)).rejects.toMatchObject({ name: 'structure' });
  });

  it('les octets d’entrée ne changent pas', async () => {
    const src = await doc3();
    const copy = src.slice();
    await applyRedactions(src, [page2()], { stripMetadata: true, removeBookmarks: true });
    expect(src).toEqual(copy);
  });
});
