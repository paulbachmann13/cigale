import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** PDF synthétique : la page i contient le mot « marque{i} ». */
export async function makePdf(count: number, opts: { sizes?: [number, number][]; rotations?: number[]; title?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (opts.title) doc.setTitle(opts.title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) {
    const p = doc.addPage(opts.sizes?.[i - 1] ?? [595, 842]);
    p.drawText(`marque${i}`, { x: 50, y: 700, size: 24, font });
    const r = opts.rotations?.[i - 1];
    if (r) p.setRotation(degrees(r));
  }
  return doc.save();
}

export interface PageInfo {
  text: string;
  rotate: number;
  width: number;
  height: number;
}

/** Relit le PDF avec pdf.js (comme l'application) : texte, rotation et taille de chaque page. */
export async function readPages(bytes: Uint8Array): Promise<PageInfo[]> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false } as never);
  const pdf = await task.promise;
  const out: PageInfo[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    out.push({ text: tc.items.map((i) => ('str' in i ? i.str : '')).join(' ').trim(), rotate: page.rotate, width: Math.round(vp.width), height: Math.round(vp.height) });
  }
  await task.destroy();
  return out;
}

import { PDFDict, PDFHexString, PDFName, PDFNumber } from '@cantoo/pdf-lib';

/** Ajoute des signets simples (un niveau) : titre → numéro de page (à partir de 1). */
export function addFlatOutline(doc: PDFDocument, items: { title: string; page: number }[]): void {
  const ctx = doc.context;
  const pages = doc.getPages();
  const rootRef = ctx.nextRef();
  const refs = items.map(() => ctx.nextRef());
  items.forEach((it, i) => {
    const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Parent: rootRef, Dest: [pages[it.page - 1].ref, PDFName.of('Fit')] }) as PDFDict;
    if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1]);
    if (i < items.length - 1) d.set(PDFName.of('Next'), refs[i + 1]);
    ctx.assign(refs[i], d);
  });
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: PDFNumber.of(items.length) }));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
}

/** Titres des signets avec la page visée (0 si la page n’existe plus), relus avec pdf.js. */
export async function readOutline(bytes: Uint8Array): Promise<{ title: string; page: number | null }[]> {
  const task = getDocument({ data: bytes.slice() } as never);
  const pdf = await task.promise;
  const out: { title: string; page: number | null }[] = [];
  for (const o of (await pdf.getOutline()) ?? []) {
    let page: number | null = null;
    try {
      const dest = Array.isArray(o.dest) ? o.dest : await pdf.getDestination(o.dest as string);
      if (dest) page = (await pdf.getPageIndex(dest[0])) + 1;
    } catch {
      page = null;
    }
    out.push({ title: o.title, page });
  }
  await task.destroy();
  return out;
}
