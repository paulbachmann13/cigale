/**
 * Opérations qui produisent de NOUVEAUX documents : fusion (PDF et images), découpe, signets de premier niveau.
 * Octets en entrée, octets en sortie ; sans DOM (sauf le décodage d'images rares, qui demande OffscreenCanvas dans un worker).
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, type PDFPage, PDFRef, PDFString, degrees } from '@cantoo/pdf-lib';
import { zipSync } from 'fflate';
import { type Range, rangesToIndices } from '../data/page-ranges';
import { loadForEdit, pruneUnreachable } from './page-ops';

export class DocOpError extends Error {
  constructor(readonly code: 'unsupportedImage' | 'noSources' | 'structure', readonly file = '') {
    super(code);
    this.name = code;
  }
}

export interface MergeSource {
  name: string;
  bytes: Uint8Array;
  password?: string;
  /** Pages à prendre (indices à partir de 0, dans l'ordre voulu) ; toutes si absent. Sans effet pour une image. */
  pages?: number[];
  /** Nombre de pages vu par pdf.js : s'il diffère de celui de pdf-lib, on refuse (voir page-ops.checkStructure). */
  expectedPages?: number;
}

export interface MergeOptions {
  keepBookmarks: boolean;
}

export type Progress = (fraction: number) => void;

// ───────────── signets ─────────────

export interface OutlineNode {
  title: string;
  /** Page visée (référence dans le document d'origine), si on a su la résoudre. */
  page: PDFRef | null;
  children: OutlineNode[];
}

const N = (s: string) => PDFName.of(s);

function textOf(o: PDFObject | undefined): string {
  return o instanceof PDFHexString || o instanceof PDFString ? o.decodeText() : '';
}

/** Lit un nom de destination dans /Dests (ancien format) ou dans l'arbre /Names /Dests. */
function lookupNamedDest(doc: PDFDocument, name: string): PDFObject | undefined {
  const cat = doc.catalog;
  const dests = cat.lookupMaybe(N('Dests'), PDFDict);
  const fromDict = dests?.get(N(name));
  if (fromDict) return doc.context.lookup(fromDict);
  const root = cat.lookupMaybe(N('Names'), PDFDict)?.lookupMaybe(N('Dests'), PDFDict);
  if (!root) return undefined;
  const walk = (node: PDFDict, depth: number): PDFObject | undefined => {
    if (depth > 12) return undefined;
    const names = node.lookupMaybe(N('Names'), PDFArray);
    if (names) {
      for (let i = 0; i + 1 < names.size(); i += 2) {
        if (textOf(names.lookup(i)) === name) return doc.context.lookup(names.get(i + 1));
      }
    }
    const kids = node.lookupMaybe(N('Kids'), PDFArray);
    if (kids) {
      for (let i = 0; i < kids.size(); i++) {
        const kid = kids.lookupMaybe(i, PDFDict);
        const found = kid && walk(kid, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(root, 0);
}

function destPage(doc: PDFDocument, item: PDFDict): PDFRef | null {
  let dest: PDFObject | undefined = item.get(N('Dest'));
  if (!dest) {
    const action = item.lookupMaybe(N('A'), PDFDict);
    if (action && action.get(N('S')) === N('GoTo')) dest = action.get(N('D'));
  }
  if (!dest) return null;
  let resolved: PDFObject | undefined = doc.context.lookup(dest);
  if (resolved instanceof PDFName) resolved = lookupNamedDest(doc, resolved.decodeText());
  else if (resolved instanceof PDFString || resolved instanceof PDFHexString) resolved = lookupNamedDest(doc, resolved.decodeText());
  if (resolved instanceof PDFDict) resolved = doc.context.lookup(resolved.get(N('D')));
  if (resolved instanceof PDFArray) {
    const first = resolved.get(0);
    return first instanceof PDFRef ? first : null;
  }
  return null;
}

export function readOutline(doc: PDFDocument): OutlineNode[] {
  const root = doc.catalog.lookupMaybe(N('Outlines'), PDFDict);
  if (!root) return [];
  const seen = new Set<PDFDict>();
  let budget = 20000;
  const readLevel = (first: PDFObject | undefined, depth: number): OutlineNode[] => {
    const out: OutlineNode[] = [];
    let cur = first ? doc.context.lookup(first) : undefined;
    while (cur instanceof PDFDict && !seen.has(cur) && budget-- > 0) {
      seen.add(cur);
      out.push({
        title: textOf(cur.lookup(N('Title'))) || '—',
        page: destPage(doc, cur),
        children: depth < 24 ? readLevel(cur.get(N('First')), depth + 1) : [],
      });
      cur = cur.get(N('Next')) ? doc.context.lookup(cur.get(N('Next'))!) : undefined;
    }
    return out;
  };
  return readLevel(root.get(N('First')), 0);
}

/** Titre et page (à partir de 1) de chaque signet de premier niveau qui mène à une page. */
export async function topLevelBookmarks(bytes: Uint8Array, password?: string): Promise<{ title: string; page: number }[]> {
  const doc = await loadForEdit(bytes, password);
  const refs = new Map(doc.getPages().map((p, i) => [p.ref, i + 1] as const));
  return readOutline(doc).flatMap((n) => {
    const page = n.page ? refs.get(n.page) : undefined;
    return page ? [{ title: n.title, page }] : [];
  });
}

/** Garde les signets dont la page est conservée (ou qui ont un descendant conservé) et remplace les pages par `map`. */
function remapOutline(nodes: OutlineNode[], map: Map<PDFRef, PDFRef>): OutlineNode[] {
  return nodes.flatMap((n) => {
    const children = remapOutline(n.children, map);
    const page = n.page ? (map.get(n.page) ?? null) : null;
    return page || children.length ? [{ title: n.title, page, children }] : [];
  });
}

function firstPageOf(nodes: OutlineNode[]): PDFRef | null {
  for (const n of nodes) {
    const p = n.page ?? firstPageOf(n.children);
    if (p) return p;
  }
  return null;
}

function countAll(nodes: OutlineNode[]): number {
  return nodes.reduce((n, x) => n + 1 + countAll(x.children), 0);
}

/** pdf-lib n'a pas d'API de signets : on écrit l'arbre /Outlines à la main. */
export function writeOutline(doc: PDFDocument, nodes: OutlineNode[]): void {
  if (nodes.length === 0) return;
  const ctx = doc.context;
  const build = (list: OutlineNode[], parent: PDFRef): { first: PDFRef; last: PDFRef } => {
    const refs = list.map(() => ctx.nextRef());
    list.forEach((node, i) => {
      const dict = ctx.obj({ Title: PDFHexString.fromText(node.title), Parent: parent }) as PDFDict;
      if (node.page) dict.set(N('Dest'), ctx.obj([node.page, N('Fit')]));
      if (i > 0) dict.set(N('Prev'), refs[i - 1]);
      if (i < list.length - 1) dict.set(N('Next'), refs[i + 1]);
      if (node.children.length) {
        const sub = build(node.children, refs[i]);
        dict.set(N('First'), sub.first);
        dict.set(N('Last'), sub.last);
        dict.set(N('Count'), PDFNumber.of(countAll(node.children)));
      }
      ctx.assign(refs[i], dict);
    });
    return { first: refs[0], last: refs[refs.length - 1] };
  };
  const rootRef = ctx.nextRef();
  const tree = build(nodes, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: tree.first, Last: tree.last, Count: PDFNumber.of(countAll(nodes)) }));
  doc.catalog.set(N('Outlines'), rootRef);
}

// ───────────── images ─────────────

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Orientation EXIF d'un JPEG (1 à 8), 1 si absente. Les photos de téléphone en dépendent. */
export function jpegOrientation(b: Uint8Array): number {
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xff) {
      i++; // octet de bourrage
      continue;
    }
    if (len < 2) break;
    if (marker === 0xe1 && len >= 16 && i + 2 + len <= b.length && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10; // début de l'en-tête TIFF
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      if (ifd + 2 > b.length) return 1;
      const entries = u16(ifd);
      for (let e = 0; e < entries; e++) {
        const o = ifd + 2 + e * 12;
        if (o + 12 > b.length) break;
        if (u16(o) === 0x0112) return u16(o + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return 1;
}

/** Formats autres que JPEG/PNG (WebP, GIF, BMP, HEIC sur Safari…) : le navigateur les décode, on récupère un PNG. */
async function decodeToPng(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') throw new Error('indisponible');
    const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // fond blanc pour les images transparentes
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  } catch {
    throw new DocOpError('unsupportedImage', name);
  }
}

const A4 = { w: 595.28, h: 841.89 };

export function isImageBytes(b: Uint8Array): boolean {
  return !(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) && b.length > 4; // « %PDF »
}

async function addImagePage(out: PDFDocument, src: MergeSource): Promise<PDFPage> {
  let bytes = src.bytes;
  let orientation = 1;
  let image;
  if (isJpeg(bytes)) {
    orientation = jpegOrientation(bytes);
    image = await out.embedJpg(bytes);
  } else {
    if (!isPng(bytes)) bytes = await decodeToPng(bytes, src.name);
    image = await out.embedPng(bytes);
  }
  // La page a la taille de l'image, réduite pour tenir dans un A4 (portrait ou paysage selon l'image).
  const landscape = image.width > image.height;
  const max = landscape ? { w: A4.h, h: A4.w } : A4;
  const scale = Math.min(1, max.w / image.width, max.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const page = out.addPage([w, h]);
  page.drawImage(image, { x: 0, y: 0, width: w, height: h });
  // Photo prise « de côté » : on tourne la page (le contenu reste intact).
  const rot = orientation === 6 ? 90 : orientation === 3 ? 180 : orientation === 8 ? 270 : 0;
  if (rot) page.setRotation(degrees(rot));
  return page;
}

// ───────────── fusion ─────────────

export async function mergeSources(sources: MergeSource[], opts: MergeOptions, progress?: Progress): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (sources.length === 0) throw new DocOpError('noSources');
  const out = await PDFDocument.create({ updateMetadata: false });
  const outline: OutlineNode[] = [];
  for (const [k, src] of sources.entries()) {
    const stem = src.name.replace(/\.[^.]+$/, '');
    if (isImageBytes(src.bytes)) {
      const page = await addImagePage(out, src);
      outline.push({ title: stem, page: page.ref, children: [] });
    } else {
      const doc = await loadForEdit(src.bytes, src.password);
      if (src.expectedPages !== undefined && doc.getPageCount() !== src.expectedPages) throw new DocOpError('structure', src.name);
      const indices = src.pages ?? Array.from({ length: doc.getPageCount() }, (_, i) => i);
      const originals = doc.getPages().map((p) => p.ref);
      const copies = await out.copyPages(doc, indices);
      copies.forEach((p) => out.addPage(p));
      if (copies.length) {
        const map = new Map<PDFRef, PDFRef>();
        indices.forEach((srcIndex, i) => map.set(originals[srcIndex], copies[i].ref));
        const children = opts.keepBookmarks ? remapOutline(readOutline(doc), map) : [];
        outline.push({ title: stem, page: children.length ? (firstPageOf(children) ?? copies[0].ref) : copies[0].ref, children });
      }
    }
    progress?.((k + 1) / sources.length);
  }
  if (opts.keepBookmarks) writeOutline(out, outline);
  pruneUnreachable(out); // rien d'autre que ce qui est atteignable depuis les pages gardées
  return { bytes: await out.save(), pageCount: out.getPageCount() };
}

// ───────────── découpe ─────────────

export interface Part {
  name: string;
  bytes: Uint8Array;
}

/** Un nouveau document par plage. Les signets ne sont pas repris dans les parties (limite documentée). */
export async function splitDocument(bytes: Uint8Array, ranges: Range[], names: string[], password?: string, expectedPages?: number, progress?: Progress): Promise<Part[]> {
  const src = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && src.getPageCount() !== expectedPages) throw new DocOpError('structure');
  const parts: Part[] = [];
  for (const [i, r] of ranges.entries()) {
    const out = await PDFDocument.create({ updateMetadata: false });
    const copies = await out.copyPages(src, rangesToIndices([r]));
    copies.forEach((p) => out.addPage(p));
    const title = src.getTitle();
    if (title) out.setTitle(title, { showInWindowTitleBar: false });
    pruneUnreachable(out);
    parts.push({ name: names[i], bytes: await out.save() });
    progress?.((i + 1) / ranges.length);
  }
  return parts;
}

/** Archive .zip (sans recompression : un PDF est déjà compressé). */
export function zipParts(parts: Part[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const p of parts) files[p.name] = p.bytes;
  return zipSync(files, { level: 0 });
}
