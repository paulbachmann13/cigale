import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { type PageOp, applyOp, extractPages } from '../../src/pdf/page-ops';
import { mergeSources, splitDocument } from '../../src/pdf/doc-ops';
import type { AnnotDraft } from '../../src/data/annotations';
import { addAnnotations, deleteAnnotations, updateAnnotation } from '../../src/pdf/annot-ops';
import { addFlatOutline, makePdf, makePng } from './helpers';

/** Contrôle structurel externe : qpdf --check (ignoré si qpdf n'est pas installé ; la CI l'installe). */
const hasQpdf = spawnSync('qpdf', ['--version']).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'cigale-qpdf-'));

function check(bytes: Uint8Array, name: string, password?: string) {
  const file = join(dir, name);
  writeFileSync(file, bytes);
  const args = [...(password ? [`--password=${password}`] : []), '--check', file];
  const r = spawnSync('qpdf', args, { encoding: 'utf8' });
  // 0 = aucun problème ; 3 = avertissements seulement. Une erreur (2) fait échouer le test.
  expect([0, 3], `${name}: ${r.stdout}${r.stderr}`).toContain(r.status);
  void execFileSync;
}

async function withOutline(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) doc.addPage([595, 842]).drawText(`marque${i}`, { x: 50, y: 700, size: 24, font });
  addFlatOutline(doc, [{ title: 'A', page: 1 }, { title: 'B', page: 3 }, { title: 'C', page: 5 }]);
  return doc.save();
}

describe.skipIf(!hasQpdf)('qpdf --check sur les documents produits', () => {
  const ops: [string, PageOp][] = [
    ['pivoter', { op: 'rotate', pages: [0, 2], delta: 90 }],
    ['supprimer', { op: 'delete', pages: [1, 3] }],
    ['dupliquer', { op: 'duplicate', pages: [0, 4] }],
    ['déplacer', { op: 'move', pages: [4], to: 0 }],
    ['page vierge', { op: 'insertBlank', at: 2 }],
  ];
  for (const [label, op] of ops) {
    it(`${label}`, async () => {
      const r = await applyOp(await withOutline(), op);
      check(r.bytes, `${label}.pdf`);
    });
  }
  it('insérer d’un autre document', async () => {
    const r = await applyOp(await withOutline(), { op: 'insertFrom', at: 1, other: await makePdf(3), otherPages: [1, 2] });
    check(r.bytes, 'inserer.pdf');
  });
  it('extraire', async () => {
    check(await extractPages(await withOutline(), [0, 2, 4]), 'extraire.pdf');
  });
  it('document chiffré : reste chiffré et valide', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    doc.encrypt({ userPassword: 'secret', ownerPassword: 'chef', permissions: {} });
    const r = await applyOp(await doc.save(), { op: 'rotate', pages: [0], delta: 90 }, 'secret');
    check(r.bytes, 'chiffre.pdf', 'secret');
  });
  it('enchaînement de 20 opérations', async () => {
    let bytes = await withOutline();
    const seq: PageOp[] = [
      { op: 'move', pages: [0], to: 5 }, { op: 'duplicate', pages: [1] }, { op: 'delete', pages: [0] }, { op: 'rotate', pages: [2], delta: -90 },
      { op: 'insertBlank', at: 0 }, { op: 'move', pages: [1, 2], to: 4 }, { op: 'duplicate', pages: [0, 3] }, { op: 'delete', pages: [4] },
    ];
    for (const op of [...seq, ...seq, ...seq.slice(0, 4)]) bytes = (await applyOp(bytes, op)).bytes;
    check(bytes, 'enchainement.pdf');
  });
  it('fusion avec signets, images et sous-ensemble de pages', async () => {
    const r = await mergeSources(
      [{ name: 'a.pdf', bytes: await withOutline(), pages: [0, 2, 4] }, { name: 'i.png', bytes: makePng(300, 200) }, { name: 'b.pdf', bytes: await makePdf(3) }],
      { keepBookmarks: true },
    );
    check(r.bytes, 'fusion.pdf');
  });
  it('découpe', async () => {
    const parts = await splitDocument(await withOutline(), [{ from: 1, to: 2 }, { from: 3, to: 5 }], ['a.pdf', 'b.pdf']);
    parts.forEach((p) => check(p.bytes, p.name));
  });
  it('annotations de tous les types, modification et suppression', async () => {
    const b = { page: 0, color: [1, 0, 0] as [number, number, number], fill: null, opacity: 0.8, width: 2, contents: 'é', rect: [100, 600, 200, 650] as [number, number, number, number] };
    const drafts: AnnotDraft[] = [
      { ...b, kind: 'highlight', quads: [[50, 700, 150, 715]], rect: [50, 700, 150, 715] },
      { ...b, kind: 'underline', quads: [[50, 500, 150, 512]], rect: [50, 500, 150, 512] },
      { ...b, kind: 'strikeout', quads: [[50, 450, 150, 462]], rect: [50, 450, 150, 462] },
      { ...b, kind: 'rect', fill: [1, 1, 0] },
      { ...b, kind: 'ellipse' },
      { ...b, kind: 'arrow', line: [10, 300, 110, 360], rect: [10, 300, 110, 360] },
      { ...b, kind: 'ink', strokes: [[[20, 400], [40, 420], [60, 400]]], rect: [20, 400, 60, 420] },
      { ...b, kind: 'freetext', rect: [200, 300, 360, 360], contents: 'Texte libre qui doit passer à la ligne plusieurs fois dans la zone', fontSize: 12 },
      { ...b, kind: 'note', rect: [300, 700, 324, 724] },
      { ...b, kind: 'stamp', rect: [300, 400, 460, 450], stamp: 'review' },
    ];
    const r = await addAnnotations(await withOutline(), drafts, undefined, 5, 'Paul');
    check(r.bytes, 'annots.pdf');
    const reply = await addAnnotations(r.bytes, [{ ...b, kind: 'note', rect: [300, 700, 324, 724], replyTo: r.ids[8] }], undefined, 5);
    check(reply.bytes, 'reponse.pdf');
    const edited = await updateAnnotation(reply.bytes, r.ids[3], { rect: [120, 620, 220, 670], color: [0, 0, 1] }, undefined, 5);
    check(edited, 'modifie.pdf');
    check(await deleteAnnotations(edited, [r.ids[8], r.ids[0]], undefined, 5), 'supprime.pdf');
  });
});
