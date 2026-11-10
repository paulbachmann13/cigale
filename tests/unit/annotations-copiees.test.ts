import { describe, expect, it } from 'vitest';
import { mergeSources, splitDocument } from '../../src/pdf/doc-ops';
import { addAnnotations, listAnnotations } from '../../src/pdf/annot-ops';
import { setInk } from '../../src/pdf/ink-ops';
import { applyOp, extractPages } from '../../src/pdf/page-ops';
import { makePdf } from './helpers';

/** Un document de 3 pages avec, sur chacune, des annotations de sortes différentes (dont l'écriture manuscrite et une note avec sa bulle). */
async function annotated(): Promise<Uint8Array> {
  const base = { color: [1, 0, 0] as [number, number, number], fill: null, opacity: 1, width: 2, contents: '' };
  const added = await addAnnotations(
    await makePdf(3),
    [
      { ...base, kind: 'rect', page: 0, rect: [10, 10, 80, 60], contents: 'cadre' },
      { ...base, kind: 'note', page: 1, rect: [20, 20, 44, 44], contents: 'une note' },
      { ...base, kind: 'highlight', page: 2, rect: [10, 100, 90, 112], quads: [[10, 100, 90, 112]], contents: 'surligné' },
    ],
    undefined,
    3,
  );
  const stroke = (page: number) => ({ id: `s${page}`, page, points: [[30, 300], [80, 340], [140, 310]] as [number, number][], color: [0, 0, 0] as [number, number, number], width: 2, pen: 'pen' as const });
  return setInk(added.bytes, [0, 1, 2].map((p) => ({ page: p, strokes: [stroke(p)] })), undefined, 3);
}
const summary = async (bytes: Uint8Array) => (await listAnnotations(bytes)).map((a) => `${a.page}:${a.kind}`).sort();

describe('les annotations survivent aux opérations qui copient des pages', () => {
  it('fusion', async () => {
    const a = await annotated();
    const merged = await mergeSources([{ name: 'a.pdf', bytes: a }, { name: 'b.pdf', bytes: a }], { keepBookmarks: false });
    expect(await summary(merged.bytes)).toEqual(['0:ink', '0:rect', '1:ink', '1:note', '2:highlight', '2:ink', '3:ink', '3:rect', '4:ink', '4:note', '5:highlight', '5:ink'].sort());
  });
  it('découpe : chaque partie garde les annotations de ses pages', async () => {
    const parts = await splitDocument(await annotated(), [{ from: 1, to: 1 }, { from: 2, to: 3 }], ['p1.pdf', 'p2.pdf']);
    expect(await summary(parts[0].bytes)).toEqual(['0:ink', '0:rect']);
    expect(await summary(parts[1].bytes)).toEqual(['0:ink', '0:note', '1:highlight', '1:ink']);
  });
  it('extraction de pages', async () => {
    expect(await summary(await extractPages(await annotated(), [2, 0]))).toEqual(['0:ink', '0:rect', '1:highlight', '1:ink']); // les pages gardent l'ordre du document
  });
  it('insertion de pages d’un autre PDF, duplication et copie de page', async () => {
    const a = await annotated();
    const inserted = await applyOp(await makePdf(1), { op: 'insertFrom', at: 1, other: a }, undefined, 1);
    expect(await summary(inserted.bytes)).toEqual(['1:ink', '1:rect', '2:ink', '2:note', '3:highlight', '3:ink']);
    const dup = await applyOp(a, { op: 'duplicate', pages: [0] }, undefined, 3);
    expect((await summary(dup.bytes)).filter((s) => s.endsWith(':rect'))).toHaveLength(2);
    const copy = await applyOp(a, { op: 'insertCopy', at: 3, from: 1 }, undefined, 3);
    expect((await summary(copy.bytes)).filter((s) => s.endsWith(':note'))).toHaveLength(2);
  });
  it('supprimer une page emporte ses annotations, pas celles des autres', async () => {
    const r = await applyOp(await annotated(), { op: 'delete', pages: [1] }, undefined, 3);
    expect(await summary(r.bytes)).toEqual(['0:ink', '0:rect', '1:highlight', '1:ink']);
  });
});
