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

import { deflateSync } from 'node:zlib';

/** PNG en niveaux de gris de w × h pixels (pour tester l'insertion d'images). */
export function makePng(w: number, h: number): Uint8Array {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x + y) % 256;
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 0; // gris
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
