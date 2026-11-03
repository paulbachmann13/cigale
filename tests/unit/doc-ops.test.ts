import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { jpegOrientation, mergeSources, splitDocument, topLevelBookmarks, zipParts } from '../../src/pdf/doc-ops';
import { addFlatOutline, makePdf, makePng, readOutline, readPages } from './helpers';
import { everything } from './helpers';

const texts = async (b: Uint8Array) => (await readPages(b)).map((p) => p.text);

async function docWithOutline(count: number, prefix: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) doc.addPage([595, 842]).drawText(`${prefix}${i}`, { x: 50, y: 700, size: 24, font });
  addFlatOutline(doc, [{ title: `${prefix} début`, page: 1 }, { title: `${prefix} fin`, page: count }]);
  return doc.save();
}

describe('fusion', () => {
  it('assemble les documents dans l’ordre', async () => {
    const r = await mergeSources([{ name: 'a.pdf', bytes: await makePdf(2) }, { name: 'b.pdf', bytes: await makePdf(3) }], { keepBookmarks: false });
    expect(r.pageCount).toBe(5);
    expect(await texts(r.bytes)).toEqual(['marque1', 'marque2', 'marque1', 'marque2', 'marque3']);
  });

  it('ne prend que les pages demandées, dans l’ordre demandé', async () => {
    const r = await mergeSources([{ name: 'a.pdf', bytes: await makePdf(5), pages: [4, 0, 1] }], { keepBookmarks: false });
    expect(await texts(r.bytes)).toEqual(['marque5', 'marque1', 'marque2']);
  });

  it('un signet par fichier, avec les signets d’origine dessous et les bonnes pages', async () => {
    const r = await mergeSources([{ name: 'Rapport.pdf', bytes: await docWithOutline(3, 'R') }, { name: 'Annexe.pdf', bytes: await docWithOutline(2, 'A') }], { keepBookmarks: true });
    const top = await readOutline(r.bytes);
    expect(top).toEqual([{ title: 'Rapport', page: 1 }, { title: 'Annexe', page: 4 }]);
    // sous-niveaux : relus avec pdf-lib
    const re = await PDFDocument.load(r.bytes);
    const outlines = re.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    const first = outlines.lookup(PDFName.of('First'), PDFDict);
    const child = first.lookup(PDFName.of('First'), PDFDict);
    expect(child.get(PDFName.of('Title'))?.toString()).toContain('');
    const dest = child.lookup(PDFName.of('Dest'), PDFArray);
    expect(re.getPages().findIndex((p) => p.ref === dest.get(0))).toBe(0);
  });

  it('un signet d’origine dont la page n’est pas gardée disparaît', async () => {
    const r = await mergeSources([{ name: 'a.pdf', bytes: await docWithOutline(4, 'R'), pages: [1, 2] }], { keepBookmarks: true });
    const re = await PDFDocument.load(r.bytes);
    const first = re.catalog.lookup(PDFName.of('Outlines'), PDFDict).lookup(PDFName.of('First'), PDFDict);
    expect(first.get(PDFName.of('First'))).toBeUndefined(); // ni « début » (page 1) ni « fin » (page 4)
  });

  it('insère des images : taille réduite à un A4, petite image gardée telle quelle', async () => {
    const r = await mergeSources(
      [{ name: 'scan.png', bytes: makePng(1654, 2339) }, { name: 'paysage.png', bytes: makePng(2339, 1654) }, { name: 'petite.png', bytes: makePng(200, 100) }],
      { keepBookmarks: false },
    );
    const pages = await readPages(r.bytes);
    expect([pages[0].width, pages[0].height]).toEqual([595, 842]);
    expect([pages[1].width, pages[1].height]).toEqual([842, 595]);
    expect([pages[2].width, pages[2].height]).toEqual([200, 100]);
  });

  it('PDF et images mélangés', async () => {
    const r = await mergeSources([{ name: 'a.pdf', bytes: await makePdf(1) }, { name: 'i.png', bytes: makePng(50, 50) }], { keepBookmarks: true });
    expect(r.pageCount).toBe(2);
    expect((await readOutline(r.bytes)).map((o) => o.title)).toEqual(['a', 'i']);
  });

  it('refuse un format d’image que le navigateur ne décode pas (hors navigateur)', async () => {
    await expect(mergeSources([{ name: 'x.webp', bytes: new Uint8Array([1, 2, 3, 4, 5, 6]) }], { keepBookmarks: false })).rejects.toMatchObject({ name: 'unsupportedImage' });
  });

  it('refuse un fichier que pdf-lib et pdf.js comptent différemment', async () => {
    await expect(mergeSources([{ name: 'a.pdf', bytes: await makePdf(3), expectedPages: 4 }], { keepBookmarks: false })).rejects.toMatchObject({ name: 'structure' });
  });

  it('document chiffré avec mot de passe', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ userPassword: 'secret', ownerPassword: 'chef', permissions: {} });
    const r = await mergeSources([{ name: 'c.pdf', bytes: await doc.save(), password: 'secret' }], { keepBookmarks: false });
    expect(r.pageCount).toBe(1);
  });

  it('10 fichiers de 100 pages en moins de 10 s', async () => {
    const one = await makePdf(100);
    const t0 = performance.now();
    const r = await mergeSources(Array.from({ length: 10 }, (_, i) => ({ name: `f${i}.pdf`, bytes: one })), { keepBookmarks: true });
    const ms = performance.now() - t0;
    expect(r.pageCount).toBe(1000);
    expect(ms).toBeLessThan(10_000);
    process.stderr.write(`PERF fusion 10×100 pages : ${Math.round(ms)} ms\n`);
  });

  it('un lien interne ne ramène pas tout le document source', async () => {
    const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 6; i++) doc.addPage([595, 842]).drawText(`SECRET${i}`, { x: 50, y: 700, size: 20, font });
    const ctx = doc.context;
    const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], Dest: [doc.getPage(5).ref, PDFName.of('Fit')] }));
    doc.getPage(0).node.set(PDFName.of('Annots'), ctx.obj([link]));
    const r = await mergeSources([{ name: 'l.pdf', bytes: await doc.save(), pages: [0] }], { keepBookmarks: false });
    expect(r.pageCount).toBe(1);
    expect((await readPages(r.bytes)).length).toBe(1);
    // le contenu des pages non gardées ne doit pas être resté dans le fichier
    const raw = everything(r.bytes);
    expect(raw).not.toContain('SECRET5');
    expect(raw).not.toContain('SECRET3');
  });
});

describe('EXIF', () => {
  it('lit l’orientation d’un JPEG', () => {
    const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0];
    const app1 = [0xff, 0xe1, 0, 8 + tiff.length, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0, 2]))).toBe(6);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
  });
});

describe('découpe', () => {
  it('une partie par plage, avec les bonnes pages', async () => {
    const parts = await splitDocument(await makePdf(6, { title: 'Titre' }), [{ from: 1, to: 2 }, { from: 3, to: 3 }, { from: 4, to: 6 }], ['p1.pdf', 'p2.pdf', 'p3.pdf']);
    expect(parts.map((p) => p.name)).toEqual(['p1.pdf', 'p2.pdf', 'p3.pdf']);
    expect(await texts(parts[0].bytes)).toEqual(['marque1', 'marque2']);
    expect(await texts(parts[1].bytes)).toEqual(['marque3']);
    expect(await texts(parts[2].bytes)).toEqual(['marque4', 'marque5', 'marque6']);
    expect((await PDFDocument.load(parts[2].bytes)).getTitle()).toBe('Titre');
  });

  it('refuse un document que pdf-lib et pdf.js comptent différemment', async () => {
    await expect(splitDocument(await makePdf(3), [{ from: 1, to: 1 }], ['a.pdf'], undefined, 4)).rejects.toMatchObject({ name: 'structure' });
  });

  it('lit les signets de premier niveau', async () => {
    expect(await topLevelBookmarks(await docWithOutline(5, 'R'))).toEqual([{ title: 'R début', page: 1 }, { title: 'R fin', page: 5 }]);
    expect(await topLevelBookmarks(await makePdf(2))).toEqual([]);
  });

  it('archive .zip : mêmes noms, mêmes octets', async () => {
    const parts = await splitDocument(await makePdf(4), [{ from: 1, to: 2 }, { from: 3, to: 4 }], ['Chapitre é 1.pdf', 'Chapitre 2.pdf']);
    const unzipped = unzipSync(zipParts(parts));
    expect(Object.keys(unzipped).sort()).toEqual(['Chapitre 2.pdf', 'Chapitre é 1.pdf']);
    expect(unzipped['Chapitre 2.pdf']).toEqual(parts[1].bytes);
  });
});
