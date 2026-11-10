import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib';
import { applyOp, extractPages, inspect, normalizeDocument } from '../../src/pdf/page-ops';
import { makePdf, readPages } from './helpers';
import { everything } from './helpers';

const texts = async (b: Uint8Array) => (await readPages(b)).map((p) => p.text);

describe('opérations sur les pages', () => {
  it('ne modifie jamais les octets d’entrée', async () => {
    const src = await makePdf(3);
    const copy = src.slice();
    await applyOp(src, { op: 'rotate', pages: [0], delta: 90 });
    expect(src).toEqual(copy);
  });

  it('pivote seulement les pages choisies, dans les deux sens', async () => {
    const src = await makePdf(3);
    const a = await applyOp(src, { op: 'rotate', pages: [1], delta: 90 });
    expect((await readPages(a.bytes)).map((p) => p.rotate)).toEqual([0, 90, 0]);
    const b = await applyOp(a.bytes, { op: 'rotate', pages: [1], delta: -90 });
    expect((await readPages(b.bytes)).map((p) => p.rotate)).toEqual([0, 0, 0]);
    const c = await applyOp(src, { op: 'rotate', pages: [0], delta: -90 });
    expect((await readPages(c.bytes))[0].rotate).toBe(270);
  });

  it('supprime des pages et les retire vraiment du fichier', async () => {
    const src = await makePdf(4);
    const r = await applyOp(src, { op: 'delete', pages: [1, 2] });
    expect(await texts(r.bytes)).toEqual(['marque1', 'marque4']);
    // le contenu supprimé n’est plus lisible dans les octets (flux non compressés par pdf-lib : on le cherche)
    const raw = everything(r.bytes);
    expect(raw).not.toContain('marque2');
    expect(raw).not.toContain('marque3');
    expect(r.bytes.length).toBeLessThan(src.length);
  });

  it('refuse de supprimer toutes les pages', async () => {
    const src = await makePdf(2);
    await expect(applyOp(src, { op: 'delete', pages: [0, 1] })).rejects.toThrow();
  });

  it('duplique juste après la sélection', async () => {
    const r = await applyOp(await makePdf(3), { op: 'duplicate', pages: [0, 1] });
    expect(await texts(r.bytes)).toEqual(['marque1', 'marque2', 'marque1', 'marque2', 'marque3']);
    expect(r.selection).toEqual([2, 3]);
  });

  it('déplace des pages et rend la nouvelle sélection', async () => {
    const r = await applyOp(await makePdf(5), { op: 'move', pages: [3], to: 1 });
    expect(await texts(r.bytes)).toEqual(['marque1', 'marque4', 'marque2', 'marque3', 'marque5']);
    expect(r.selection).toEqual([1]);
    const end = await applyOp(await makePdf(4), { op: 'move', pages: [0], to: 4 });
    expect(await texts(end.bytes)).toEqual(['marque2', 'marque3', 'marque4', 'marque1']);
  });

  it('insère une page vierge de la taille de sa voisine', async () => {
    const src = await makePdf(2, { sizes: [[595, 842], [300, 400]] });
    const r = await applyOp(src, { op: 'insertBlank', at: 2 });
    const pages = await readPages(r.bytes);
    expect(pages).toHaveLength(3);
    expect([pages[2].width, pages[2].height]).toEqual([300, 400]);
    expect(pages[2].text).toBe('');
    const first = await applyOp(src, { op: 'insertBlank', at: 0 });
    expect((await readPages(first.bytes))[0].width).toBe(595);
  });

  it('insère des pages d’un autre document', async () => {
    const a = await makePdf(2);
    const other = await PDFDocument.create();
    const b = await makePdf(3);
    void other;
    const r = await applyOp(a, { op: 'insertFrom', at: 1, other: b, otherPages: [0, 2] });
    expect(await texts(r.bytes)).toEqual(['marque1', 'marque1', 'marque3', 'marque2']);
    expect(r.selection).toEqual([1, 2]);
  });

  it('extrait des pages dans un nouveau document', async () => {
    const out = await extractPages(await makePdf(5, { title: 'Mon titre' }), [4, 1]);
    expect(await texts(out)).toEqual(['marque2', 'marque5']);
    expect((await PDFDocument.load(out)).getTitle()).toBe('Mon titre');
  });

  it('conserve les métadonnées d’origine (titre, producteur)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setProducer('Producteur d’origine');
    doc.setTitle('Titre d’origine');
    const src = await doc.save({ updateFieldAppearances: false });
    const r = await applyOp(src, { op: 'rotate', pages: [0], delta: 90 });
    const re = await PDFDocument.load(r.bytes, { updateMetadata: false });
    expect(re.getProducer()).toBe('Producteur d’origine');
    expect(re.getTitle()).toBe('Titre d’origine');
  });

  it('inspecte un document simple', async () => {
    const info = await inspect(await makePdf(3));
    expect(info).toMatchObject({ pageCount: 3, encrypted: false, signed: false, hasForm: false, hasOutline: false });
  });

  it('ré-écrit un document sans le modifier visiblement', async () => {
    const src = await makePdf(3);
    expect(await texts(await normalizeDocument(src))).toEqual(['marque1', 'marque2', 'marque3']);
  });
});

import { addFlatOutline, readOutline } from './helpers';
import { StandardFonts } from '@cantoo/pdf-lib';

async function withOutline(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 4; i++) doc.addPage([595, 842]).drawText(`marque${i}`, { x: 50, y: 700, size: 24, font });
  addFlatOutline(doc, [
    { title: 'Un', page: 1 },
    { title: 'Deux', page: 2 },
    { title: 'Trois', page: 3 },
    { title: 'Quatre', page: 4 },
  ]);
  return doc.save();
}

describe('conservation du reste du document', () => {
  it('les signets suivent leurs pages quand on les déplace', async () => {
    const r = await applyOp(await withOutline(), { op: 'move', pages: [3], to: 0 });
    expect(await texts(r.bytes)).toEqual(['marque4', 'marque1', 'marque2', 'marque3']);
    expect(await readOutline(r.bytes)).toEqual([
      { title: 'Un', page: 2 },
      { title: 'Deux', page: 3 },
      { title: 'Trois', page: 4 },
      { title: 'Quatre', page: 1 },
    ]);
  });

  it('les signets des autres pages restent justes après une suppression, et le contenu supprimé disparaît', async () => {
    const r = await applyOp(await withOutline(), { op: 'delete', pages: [1] });
    const outline = await readOutline(r.bytes);
    expect(outline.find((o) => o.title === 'Un')?.page).toBe(1);
    expect(outline.find((o) => o.title === 'Trois')?.page).toBe(2);
    expect(outline.find((o) => o.title === 'Quatre')?.page).toBe(3);
    expect(everything(r.bytes)).not.toContain('marque2');
  });

  it('garde la taille et la rotation héritées d’un nœud intermédiaire quand on réordonne', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([300 + i * 100, 400]);
    // les attributs passent sur le nœud « Pages » : les pages les héritent (cas fréquent dans les vrais PDF)
    const root = doc.context.lookup(doc.catalog.get(PDFName.of('Pages')) as never, PDFDict);
    const leaves = doc.getPages();
    root.set(PDFName.of('Rotate'), PDFNumber.of(90));
    for (const p of leaves) p.node.delete(PDFName.of('Rotate'));
    const src = await doc.save();
    const before = await readPages(src);
    const r = await applyOp(src, { op: 'move', pages: [0], to: 3 });
    const after = await readPages(r.bytes);
    expect(after.map((p) => [p.width, p.height, p.rotate])).toEqual([before[1], before[2], before[0]].map((p) => [p.width, p.height, p.rotate]));
  });

  it('signale un document chiffré (pour avertir avant) ; la protection elle-même est testée dans corpus.test.ts', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ userPassword: 'secret', ownerPassword: 'chef', permissions: {} });
    const info = await inspect(await doc.save(), 'secret');
    expect(info.encrypted).toBe(true);
  });

  it('refuse un mot de passe faux sans rien produire', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ userPassword: 'secret', ownerPassword: 'chef', permissions: {} });
    const src = await doc.save();
    await expect(applyOp(src, { op: 'rotate', pages: [0], delta: 90 }, 'faux')).rejects.toThrow();
  });
});

import { PDFString } from '@cantoo/pdf-lib';

describe('purge des pages supprimées (cas difficiles)', () => {
  it('refuse de modifier un document que pdf-lib et pdf.js comptent différemment (page sans /Type)', async () => {
    const doc = await PDFDocument.create();
    for (let i = 1; i <= 3; i++) doc.addPage([595, 842]);
    doc.getPage(1).node.delete(PDFName.of('Type'));
    const src = await doc.save();
    // pdf.js compte 3 pages ; pdf-lib en voit 2 : toucher ce document pourrait supprimer la mauvaise page
    await expect(applyOp(src, { op: 'delete', pages: [1] }, undefined, 3)).rejects.toMatchObject({ name: 'structure' });
    await expect(extractPages(src, [0], undefined, 3)).rejects.toMatchObject({ name: 'structure' });
  });

  it('un champ de formulaire posé sur une page supprimée disparaît avec elle', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([595, 842]);
    const ctx = doc.context;
    const widget = ctx.obj({
      Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFString.of('champ'), V: PDFString.of('CONFIDENTIEL-PAGE-DEUX'),
      Rect: [10, 10, 100, 30], P: doc.getPage(1).ref,
    });
    const widgetRef = ctx.register(widget);
    doc.getPage(1).node.set(PDFName.of('Annots'), ctx.obj([widgetRef]));
    doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [widgetRef] }));
    const src = await doc.save({ useObjectStreams: false });
    expect(everything(src)).toContain('CONFIDENTIEL-PAGE-DEUX');
    const r = await applyOp(src, { op: 'delete', pages: [1] });
    expect(everything(r.bytes)).not.toContain('CONFIDENTIEL-PAGE-DEUX');
    expect((await readPages(r.bytes)).length).toBe(2);
  });

  it('les pages gardent leur propre copie des attributs hérités (pas d’objet partagé)', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 2; i++) doc.addPage([300, 400]);
    const root = doc.context.lookup(doc.catalog.get(PDFName.of('Pages')) as never, PDFDict);
    const mb = doc.getPage(0).node.get(PDFName.of('MediaBox'));
    for (const p of doc.getPages()) p.node.delete(PDFName.of('MediaBox'));
    root.set(PDFName.of('MediaBox'), mb!);
    const r = await applyOp(await doc.save(), { op: 'move', pages: [0], to: 2 });
    const re = await PDFDocument.load(r.bytes);
    const a = re.getPage(0).node.get(PDFName.of('MediaBox'));
    const b = re.getPage(1).node.get(PDFName.of('MediaBox'));
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(re.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  });
});

describe('remplacer des pages', () => {
  it('2 pages remplacées par les 3 d’un autre document : à la place de la première, le reste décalé, rien d’orphelin', async () => {
    const target = await makePdf(5); // pages « marque1 » … « marque5 »
    const other = await makePdf(3);
    const r = await applyOp(target, { op: 'replace', pages: [1, 2], other }, undefined, 5);
    expect(r.pageCount).toBe(6);
    expect(r.selection).toEqual([1, 2, 3]);
    const pages = await readPages(r.bytes);
    // le document cible a « marque1 » … « marque5 », l'autre « marque1 » … « marque3 » : les pages 2 et 3 d'origine ont disparu
    expect(pages.map((p) => p.text)).toEqual(['marque1', 'marque1', 'marque2', 'marque3', 'marque4', 'marque5']);
  });
  it('toutes les pages remplacées : le document n’est jamais vide ; une seule page remplace une seule', async () => {
    const r = await applyOp(await makePdf(2), { op: 'replace', pages: [0, 1], other: await makePdf(1) }, undefined, 2);
    expect(r.pageCount).toBe(1);
    const r2 = await applyOp(await makePdf(3), { op: 'replace', pages: [2], other: await makePdf(2), otherPages: [1] }, undefined, 3);
    expect(r2.pageCount).toBe(3);
    expect((await readPages(r2.bytes)).map((p) => p.text)).toEqual(['marque1', 'marque2', 'marque2']); // la 3ᵉ page est devenue la page 2 de l'autre document
  });
  it('sélection vide ou autre document sans page demandée : refusé', async () => {
    await expect(applyOp(await makePdf(2), { op: 'replace', pages: [], other: await makePdf(1) }, undefined, 2)).rejects.toMatchObject({ name: 'noSelection' });
    await expect(applyOp(await makePdf(2), { op: 'replace', pages: [0], other: await makePdf(1), otherPages: [] }, undefined, 2)).rejects.toMatchObject({ name: 'noSelection' });
  });
});
