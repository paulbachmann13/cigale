import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from '@cantoo/pdf-lib';
import type { AnnotDraft } from '../../src/data/annotations';
import { addAnnotations, deleteAnnotations, listAnnotations, updateAnnotation } from '../../src/pdf/annot-ops';
import { mergeLines } from '../../src/data/annotations';
import { makePdf, readPages } from './helpers';

const base = { page: 0, color: [1, 0, 0] as [number, number, number], fill: null, opacity: 1, width: 2, contents: '', rect: [100, 600, 200, 650] as [number, number, number, number] };
const draft = (d: Partial<AnnotDraft> & Pick<AnnotDraft, 'kind'>): AnnotDraft => ({ ...base, ...d });

describe('annotations : écriture et relecture', () => {
  it('surlignage : plusieurs lignes, couleur, opacité', async () => {
    const { bytes, ids } = await addAnnotations(await makePdf(2), [draft({ kind: 'highlight', color: [1, 0.9, 0.1], opacity: 0.5, quads: [[50, 700, 150, 715], [50, 680, 120, 695]], rect: [50, 680, 150, 715], contents: 'à voir' })], undefined, 2, 'Paul');
    expect(ids).toHaveLength(1);
    const [a] = await listAnnotations(bytes);
    expect(a).toMatchObject({ kind: 'highlight', page: 0, contents: 'à voir', author: 'Paul', opacity: 0.5, foreign: false });
    expect(a.quads).toEqual([[50, 700, 150, 715], [50, 680, 120, 695]]);
    expect(a.rect).toEqual([50, 680, 150, 715]);
    expect(a.id).toBe(ids[0]);
    expect((await readPages(bytes)).length).toBe(2); // pdf.js relit le document
  });

  it('chaque type s’écrit et se relit avec sa géométrie', async () => {
    const drafts: AnnotDraft[] = [
      draft({ kind: 'underline', quads: [[50, 500, 150, 512]], rect: [50, 500, 150, 512] }),
      draft({ kind: 'strikeout', quads: [[50, 450, 150, 462]], rect: [50, 450, 150, 462] }),
      draft({ kind: 'rect', rect: [10, 10, 110, 60], fill: [0.9, 0.9, 0.2] }),
      draft({ kind: 'ellipse', rect: [10, 100, 110, 160] }),
      draft({ kind: 'line', line: [10, 200, 110, 260], rect: [10, 200, 110, 260] }),
      draft({ kind: 'arrow', line: [10, 300, 110, 360], rect: [10, 300, 110, 360] }),
      draft({ kind: 'ink', strokes: [[[20, 400], [40, 420], [60, 400]], [[70, 400]]], rect: [20, 400, 70, 420] }),
      draft({ kind: 'freetext', rect: [200, 300, 360, 360], contents: 'Bonjour — éàç œ € ≠ 日本', fontSize: 14 }),
      draft({ kind: 'note', rect: [300, 700, 324, 724], contents: 'Une note', color: [1, 0.85, 0.2] }),
      draft({ kind: 'stamp', rect: [300, 400, 460, 450], stamp: 'approved', contents: 'APPROUVÉ' }),
    ];
    const { bytes } = await addAnnotations(await makePdf(1), drafts, undefined, 1, 'A');
    const list = await listAnnotations(bytes);
    expect(list.map((a) => a.kind)).toEqual(['underline', 'strikeout', 'rect', 'ellipse', 'line', 'arrow', 'ink', 'freetext', 'note', 'stamp']);
    const by = Object.fromEntries(list.map((a) => [a.kind, a]));
    expect(by.rect.fill).toEqual([0.9, 0.9, 0.2]);
    expect(by.line.line).toEqual([10, 200, 110, 260]);
    expect(by.arrow.line).toEqual([10, 300, 110, 360]);
    expect(by.ink.strokes).toEqual([[[20, 400], [40, 420], [60, 400]], [[70, 400]]]);
    expect(by.freetext.fontSize).toBe(14);
    expect(by.freetext.contents).toBe('Bonjour — éàç œ € ≠ 日本'); // le texte d'origine est gardé tel quel dans /Contents
    expect(by.stamp.stamp).toBe('approved');
    expect(by.note.contents).toBe('Une note');
    expect((await readPages(bytes)).length).toBe(1);
  });

  it('chaque annotation a un flux d’apparence et un identifiant propre', async () => {
    const { bytes } = await addAnnotations(await makePdf(1), [draft({ kind: 'rect' }), draft({ kind: 'highlight', quads: [[0, 0, 10, 10]], rect: [0, 0, 10, 10] })], undefined, 1);
    const doc = await PDFDocument.load(bytes);
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    for (let i = 0; i < annots.size(); i++) {
      const d = annots.lookup(i, PDFDict);
      if (d.get(PDFName.of('Subtype')) === PDFName.of('Popup')) continue;
      expect(d.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
      expect(d.get(PDFName.of('NM'))?.toString()).toContain('cigale-');
    }
  });

  it('une note crée aussi sa bulle (Popup) et ne pollue pas la liste', async () => {
    const { bytes } = await addAnnotations(await makePdf(1), [draft({ kind: 'note', rect: [10, 10, 34, 34], contents: 'x' })], undefined, 1);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(2);
    expect(await listAnnotations(bytes)).toHaveLength(1);
  });

  it('modifier : couleur, texte, position', async () => {
    const { bytes, ids } = await addAnnotations(await makePdf(1), [draft({ kind: 'rect', rect: [10, 10, 110, 60] })], undefined, 1);
    const moved = await updateAnnotation(bytes, ids[0], { rect: [20, 30, 120, 80], color: [0, 0, 1], contents: 'déplacé', width: 4 }, undefined, 1);
    const [a] = await listAnnotations(moved);
    expect(a).toMatchObject({ rect: [20, 30, 120, 80], color: [0, 0, 1], contents: 'déplacé', width: 4 });
  });

  it('déplacer un dessin déplace ses points', async () => {
    const { bytes, ids } = await addAnnotations(await makePdf(1), [draft({ kind: 'ink', strokes: [[[10, 10], [20, 20]]], rect: [10, 10, 20, 20] })], undefined, 1);
    const out = await updateAnnotation(bytes, ids[0], { strokes: [[[110, 10], [120, 20]]] }, undefined, 1);
    const [a] = await listAnnotations(out);
    expect(a.strokes).toEqual([[[110, 10], [120, 20]]]);
    expect(a.rect[0]).toBeGreaterThan(100);
  });

  it('supprimer retire l’annotation, sa bulle et ses réponses', async () => {
    const r1 = await addAnnotations(await makePdf(1), [draft({ kind: 'note', rect: [10, 10, 34, 34], contents: 'parent' })], undefined, 1);
    const r2 = await addAnnotations(r1.bytes, [draft({ kind: 'note', rect: [10, 10, 34, 34], contents: 'réponse', replyTo: r1.ids[0] })], undefined, 1);
    const r3 = await addAnnotations(r2.bytes, [draft({ kind: 'note', rect: [10, 10, 34, 34], contents: 'réponse 2', replyTo: r2.ids[0] })], undefined, 1);
    const all = await listAnnotations(r3.bytes);
    expect(all.filter((a) => a.replyTo)).toHaveLength(2);
    expect(all.find((a) => a.contents === 'réponse')?.replyTo).toBe(r1.ids[0]);
    const out = await deleteAnnotations(r3.bytes, [r1.ids[0]], undefined, 1);
    expect(await listAnnotations(out)).toEqual([]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.size() ?? 0).toBe(0);
    expect(out.length).toBeLessThan(r3.bytes.length);
  });

  it('supprimer une annotation inconnue : erreur, rien n’est produit', async () => {
    await expect(deleteAnnotations(await makePdf(1), ['999 0'], undefined, 1)).rejects.toMatchObject({ name: 'notFound' });
  });

  it('lit une annotation d’un autre logiciel (sans nos marques) et la déclare « étrangère »', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const ctx = doc.context;
    const hl = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [10, 10, 100, 30], QuadPoints: [10, 30, 100, 30, 10, 10, 100, 10], C: [1, 1, 0], T: PDFHexString.fromText('Marie'), Contents: PDFHexString.fromText('relire') }));
    const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 5, 5] }));
    page.node.set(PDFName.of('Annots'), ctx.obj([hl, link]));
    const list = await listAnnotations(await doc.save());
    expect(list).toHaveLength(1); // le lien n'est pas un commentaire
    expect(list[0]).toMatchObject({ kind: 'highlight', foreign: true, author: 'Marie', contents: 'relire', color: [1, 1, 0] });
  });

  it('un commentaire d’un autre logiciel peut être modifié ou supprimé', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const ctx = doc.context;
    const hl = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [10, 10, 100, 30], QuadPoints: [10, 30, 100, 30, 10, 10, 100, 10], C: [1, 1, 0] }));
    page.node.set(PDFName.of('Annots'), ctx.obj([hl]));
    const src = await doc.save();
    const [a] = await listAnnotations(src);
    const edited = await updateAnnotation(src, a.id, { contents: 'ok', color: [0, 1, 0] }, undefined, 1);
    expect((await listAnnotations(edited))[0]).toMatchObject({ contents: 'ok', color: [0, 1, 0] });
    expect(await listAnnotations(await deleteAnnotations(edited, [a.id], undefined, 1))).toEqual([]);
  });

  it('page inexistante : erreur', async () => {
    await expect(addAnnotations(await makePdf(1), [draft({ kind: 'rect', page: 3 })], undefined, 1)).rejects.toMatchObject({ name: 'badPage' });
  });

  it('refuse un document dont les pages sont comptées autrement', async () => {
    await expect(addAnnotations(await makePdf(2), [draft({ kind: 'rect' })], undefined, 3)).rejects.toMatchObject({ name: 'structure' });
  });

  it('les annotations survivent à une opération sur les pages (déplacement)', async () => {
    const { applyOp } = await import('../../src/pdf/page-ops');
    const { bytes } = await addAnnotations(await makePdf(3), [draft({ kind: 'rect', page: 2, contents: 'p3' })], undefined, 3);
    const moved = await applyOp(bytes, { op: 'move', pages: [2], to: 0 }, undefined, 3);
    const [a] = await listAnnotations(moved.bytes);
    expect(a).toMatchObject({ page: 0, contents: 'p3' });
  });

  it('déplacer 30 fois une annotation ne fait pas grossir le fichier', async () => {
    let { bytes, ids } = await addAnnotations(await makePdf(1), [draft({ kind: 'freetext', rect: [100, 600, 300, 650], contents: 'Bonjour', fontSize: 12 })], undefined, 1);
    const size0 = bytes.length;
    for (let i = 0; i < 30; i++) bytes = await updateAnnotation(bytes, ids[0], { rect: [100 + i, 600, 300 + i, 650] }, undefined, 1);
    expect(bytes.length).toBeLessThan(size0 * 1.1);
  });

  it('une zone de texte porte ses ressources par défaut (DR) pour qu’Acrobat puisse la modifier', async () => {
    const { bytes } = await addAnnotations(await makePdf(1), [draft({ kind: 'freetext', rect: [100, 600, 300, 650], contents: 'x' })], undefined, 1);
    const doc = await PDFDocument.load(bytes);
    const d = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(d.lookup(PDFName.of('DR'), PDFDict).lookup(PDFName.of('Font'), PDFDict).get(PDFName.of('Helv'))).toBeDefined();
  });

  it('un commentaire étranger simplement déplacé garde son apparence d’origine', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const ctx = doc.context;
    const ap = ctx.register(ctx.stream('1 0 0 rg 0 0 100 20 re f', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20] }));
    const a = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Square', Rect: [10, 10, 110, 30], C: [1, 0, 0], AP: { N: ap } }));
    page.node.set(PDFName.of('Annots'), ctx.obj([a]));
    const src = await doc.save();
    const [x] = await listAnnotations(src);
    const moved = await updateAnnotation(src, x.id, { rect: [60, 70, 160, 90] }, undefined, 1);
    const re = await PDFDocument.load(moved);
    const d = re.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const stream = d.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N')) as unknown as { getContentsString(): string };
    expect(stream.getContentsString()).toContain('1 0 0 rg'); // même flux d'apparence que l'original
    expect((await listAnnotations(moved))[0].rect).toEqual([60, 70, 160, 90]);
  });

  it('fusionne les rectangles d’une même ligne (repère écran)', () => {
    expect(mergeLines([[10, 100, 50, 112], [52, 101, 90, 113], [10, 130, 60, 142]])).toEqual([[10, 100, 90, 113], [10, 130, 60, 142]]);
  });
});

describe('zones à caviarder (marques standard /Redact)', () => {
  it('s’écrit comme une vraie annotation Redact et se relit', async () => {
    const { bytes } = await addAnnotations(await makePdf(1), [draft({ kind: 'redact', rect: [50, 600, 250, 640], fill: [0, 0, 0], quads: [[50, 600, 250, 640]] })], undefined, 1);
    const doc = await PDFDocument.load(bytes);
    const d = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(d.get(PDFName.of('Subtype'))).toBe(PDFName.of('Redact'));
    expect(d.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
    const [a] = await listAnnotations(bytes);
    expect(a).toMatchObject({ kind: 'redact', rect: [50, 600, 250, 640] });
  });
});

describe('signature (image)', () => {
  it('s’écrit comme un tampon-image, se relit, et se déplace sans perdre son image', async () => {
    const { makePng } = await import('./helpers');
    const png = makePng(60, 20);
    const { bytes, ids } = await addAnnotations(await makePdf(1), [draft({ kind: 'signature', rect: [100, 600, 250, 650], image: png, width: 0 })], undefined, 1);
    const [a] = await listAnnotations(bytes);
    expect(a).toMatchObject({ kind: 'signature', rect: [100, 600, 250, 650] });
    const apOf = async (b: Uint8Array) => {
      const doc = await PDFDocument.load(b);
      const d = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
      const form = d.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N')) as unknown as { dict: PDFDict };
      return form.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('XObject'), PDFDict).keys().length;
    };
    expect(await apOf(bytes)).toBe(1);
    const moved = await updateAnnotation(bytes, ids[0], { rect: [200, 500, 350, 550] }, undefined, 1);
    expect(await apOf(moved)).toBe(1); // l'image est toujours là
    expect((await listAnnotations(moved))[0]).toMatchObject({ kind: 'signature', rect: [200, 500, 350, 550] });
  });
});
