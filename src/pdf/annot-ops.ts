/**
 * Annotations PDF réelles (avec flux d'apparence), lues et écrites avec @cantoo/pdf-lib. Fonctions pures : octets → octets.
 * Ce que Cigale écrit s'affiche à l'identique dans pdf.js, Aperçu et Acrobat parce que l'apparence est dans le fichier.
 */
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFObject,
  type PDFPage,
  PDFRef,
  PDFString,
  StandardFonts,
  type PDFFont,
} from '@cantoo/pdf-lib';
import {
  type Annot,
  type AnnotDraft,
  type AnnotKind,
  type AnnotPatch,
  type Pt,
  type Rect,
  type Rgb,
  STAMPS,
  fromPdfDate,
  inflate,
  normalizeRect,
  pointsBounds,
  toPdfDate,
  unionRect,
} from '../data/annotations';
import { PENS, inkOutline, isPenKind, outlineOps, strokeBounds } from '../data/ink';
import { inkNeedsLayer } from './ink-layer';
import { loadForEdit, pruneUnreachable } from './page-ops';
import { saveDoc } from './protection';

export class AnnotError extends Error {
  constructor(readonly code: 'notFound' | 'badPage' | 'structure' | 'badImage') {
    super(code);
    this.name = code;
  }
}

const N = (s: string) => PDFName.of(s);
const num = (n: number) => PDFNumber.of(Math.round(n * 1000) / 1000);
const f = (n: number) => String(Math.round(n * 1000) / 1000);
/** Deux décimales (0,0035 mm) : bien assez pour le contour d'un trait, et des flux d'apparence plus légers. */
const f2 = (n: number) => String(Math.round(n * 100) / 100);
const colorOp = (c: Rgb, stroke: boolean) => `${f(c[0])} ${f(c[1])} ${f(c[2])} ${stroke ? 'RG' : 'rg'}`;
const idOf = (ref: PDFRef) => `${ref.objectNumber} ${ref.generationNumber}`;
const refOf = (id: string): PDFRef => {
  const [n, g] = id.split(' ').map(Number);
  return PDFRef.of(n, g || 0);
};
const text = (o: PDFObject | undefined) => (o instanceof PDFHexString || o instanceof PDFString ? o.decodeText() : '');
const arr4 = (a: PDFArray | undefined): Rect | undefined => {
  if (!a || a.size() < 4) return undefined;
  const v = [0, 1, 2, 3].map((i) => (a.lookup(i) instanceof PDFNumber ? (a.lookup(i) as PDFNumber).asNumber() : NaN));
  return v.some(Number.isNaN) ? undefined : (v as Rect);
};

// ───────────── lecture ─────────────

const SUBTYPES: Record<string, AnnotKind> = {
  Highlight: 'highlight',
  Underline: 'underline',
  StrikeOut: 'strikeout',
  Text: 'note',
  FreeText: 'freetext',
  Ink: 'ink',
  Square: 'rect',
  Circle: 'ellipse',
  Line: 'line',
  Stamp: 'stamp',
  Redact: 'redact',
};
/** Ces sous-types ne sont pas des commentaires : liens, champs de formulaire, bulles. */
const HIDDEN = new Set(['Link', 'Widget', 'Popup', 'Screen', 'Movie', 'Sound', 'TrapNet', 'PrinterMark', 'Watermark']);

function colorOf(dict: PDFDict, key: string): Rgb | null {
  const a = dict.lookupMaybe(N(key), PDFArray);
  if (!a) return null;
  const v = Array.from({ length: a.size() }, (_, i) => (a.lookup(i) instanceof PDFNumber ? (a.lookup(i) as PDFNumber).asNumber() : 0));
  if (v.length === 1) return [v[0], v[0], v[0]];
  if (v.length === 3) return [v[0], v[1], v[2]];
  if (v.length === 4) return [(1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]), (1 - v[2]) * (1 - v[3])];
  return null;
}

function numbers(a: PDFArray | undefined): number[] {
  return a ? Array.from({ length: a.size() }, (_, i) => (a.lookup(i) instanceof PDFNumber ? (a.lookup(i) as PDFNumber).asNumber() : 0)) : [];
}

function readAnnot(doc: PDFDocument, pageIndex: number, ref: PDFRef, d: PDFDict): Annot | null {
  const sub = (d.lookupMaybe(N('Subtype'), PDFName)?.decodeText() ?? '').trim();
  if (!sub || HIDDEN.has(sub)) return null;
  let kind: AnnotKind = SUBTYPES[sub] ?? 'other';
  const rect = arr4(d.lookupMaybe(N('Rect'), PDFArray));
  if (!rect) return null;
  const nm = text(d.get(N('NM')));
  const a: Annot = {
    id: idOf(ref),
    page: pageIndex,
    kind,
    rect: normalizeRect(rect),
    color: colorOf(d, 'C') ?? (kind === 'highlight' ? [1, 0.9, 0.1] : [0, 0, 0]),
    fill: colorOf(d, 'IC'),
    opacity: d.lookupMaybe(N('CA'), PDFNumber)?.asNumber() ?? 1,
    width: d.lookupMaybe(N('BS'), PDFDict)?.lookupMaybe(N('W'), PDFNumber)?.asNumber() ?? numbers(d.lookupMaybe(N('Border'), PDFArray))[2] ?? 1,
    contents: text(d.get(N('Contents'))),
    author: text(d.get(N('T'))),
    date: fromPdfDate(text(d.get(N('M'))) || text(d.get(N('CreationDate')))),
    foreign: !nm.startsWith('cigale-'),
  };
  if (kind === 'highlight' || kind === 'underline' || kind === 'strikeout') {
    const q = numbers(d.lookupMaybe(N('QuadPoints'), PDFArray));
    a.quads = [];
    for (let i = 0; i + 7 < q.length; i += 8) {
      const xs = [q[i], q[i + 2], q[i + 4], q[i + 6]];
      const ys = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
      a.quads.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    if (a.quads.length === 0) a.quads = [a.rect];
  } else if (kind === 'ink') {
    const list = d.lookupMaybe(N('InkList'), PDFArray);
    a.strokes = [];
    for (let i = 0; list && i < list.size(); i++) {
      const v = numbers(list.lookupMaybe(i, PDFArray));
      const pts: Pt[] = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      if (pts.length) a.strokes.push(pts);
    }
    const pen = d.lookupMaybe(N('CigalePen'), PDFName)?.decodeText();
    if (isPenKind(pen)) {
      a.pen = pen;
      const pl = d.lookupMaybe(N('CigaleP'), PDFArray);
      if (pl && pl.size() === a.strokes.length) a.pressures = a.strokes.map((s, i) => numbers(pl.lookupMaybe(i, PDFArray)).slice(0, s.length));
      const ul = d.lookupMaybe(N('CigaleU'), PDFArray);
      if (ul && ul.size() === a.strokes.length) a.strokeIds = a.strokes.map((_, i) => text(ul.lookup(i)));
    }
  } else if (kind === 'line') {
    const l = arr4(d.lookupMaybe(N('L'), PDFArray));
    if (l) a.line = l;
    const le = d.lookupMaybe(N('LE'), PDFArray);
    const end = le && le.size() > 1 ? le.lookupMaybe(1, PDFName)?.decodeText() : undefined;
    if (end && end !== 'None') {
      kind = 'arrow';
      a.kind = 'arrow';
    }
  } else if (kind === 'freetext') {
    const m = /(\d+(?:\.\d+)?)\s+Tf/.exec(text(d.get(N('DA'))) || d.lookupMaybe(N('DA'), PDFString)?.asString() || '');
    a.fontSize = m ? Number(m[1]) : 12;
  } else if (kind === 'stamp') {
    const name = d.lookupMaybe(N('Name'), PDFName)?.decodeText() ?? '';
    a.stamp = name.startsWith('Cigale-') ? name.slice(7) : undefined;
    if (name === 'Cigale-signature' || name === 'Cigale-image') {
      a.kind = name === 'Cigale-image' ? 'image' : 'signature';
      a.stamp = undefined;
    }
  }
  const irt = d.get(N('IRT'));
  if (irt instanceof PDFRef) a.replyTo = idOf(irt);
  return a;
}

/** Les annotations de la page `page` (pdf-lib), avec leur référence. */
function pageAnnots(doc: PDFDocument, page: PDFPage): { ref: PDFRef; dict: PDFDict }[] {
  const arr = page.node.lookupMaybe(N('Annots'), PDFArray);
  const out: { ref: PDFRef; dict: PDFDict }[] = [];
  for (let i = 0; arr && i < arr.size(); i++) {
    const ref = arr.get(i);
    const dict = arr.lookupMaybe(i, PDFDict);
    if (ref instanceof PDFRef && dict) out.push({ ref, dict });
  }
  return out;
}

export async function listAnnotations(bytes: Uint8Array, password?: string, expectedPages?: number): Promise<Annot[]> {
  return (await listMarks(bytes, password, expectedPages)).annots;
}

export interface Marks {
  /** Toutes les annotations, écriture manuscrite de Cigale comprise (celles qui ont un `pen`). */
  annots: Annot[];
  /** De l'encre Cigale n'est pas dans son calque (fichier d'une ancienne version) : à ranger avant de la dessiner nous-mêmes. */
  inkLegacy: boolean;
}

/** Une seule lecture du document pour tout ce qui est posé sur les pages. */
export async function listMarks(bytes: Uint8Array, password?: string, expectedPages?: number): Promise<Marks> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new AnnotError('structure');
  return { annots: collect(doc), inkLegacy: inkNeedsLayer(doc) };
}

function collect(doc: PDFDocument): Annot[] {
  const out: Annot[] = [];
  doc.getPages().forEach((page, i) => {
    for (const { ref, dict } of pageAnnots(doc, page)) {
      const a = readAnnot(doc, i, ref, dict);
      if (a) out.push(a);
    }
  });
  return out;
}

// ───────────── apparences ─────────────

/** Texte sûr pour Helvetica (WinAnsi) : les caractères hors jeu sont remplacés par « ? ». */
function safeText(font: PDFFont, s: string): string {
  const set = new Set(font.getCharacterSet());
  return Array.from(s.replace(/\r\n?/g, '\n'))
    .map((ch) => (ch === '\n' || set.has(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

function wrap(font: PDFFont, s: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line && font.widthOfTextAtSize(next.trimEnd(), size) > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

interface Built {
  content: string;
  bbox: Rect;
  resources: Record<string, unknown>;
}

const ellipsePath = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = (x2 - x1) / 2;
  const ry = (y2 - y1) / 2;
  const k = 0.5522847498;
  return [
    `${f(cx + rx)} ${f(cy)} m`,
    `${f(cx + rx)} ${f(cy + k * ry)} ${f(cx + k * rx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} c`,
    `${f(cx - k * rx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + k * ry)} ${f(cx - rx)} ${f(cy)} c`,
    `${f(cx - rx)} ${f(cy - k * ry)} ${f(cx - k * rx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} c`,
    `${f(cx + k * rx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - k * ry)} ${f(cx + rx)} ${f(cy)} c`,
    'h',
  ].join('\n');
};

/** Pointe de flèche (deux traits) à l'extrémité (x2, y2) d'une ligne partant de (x1, y1). */
function arrowHead(x1: number, y1: number, x2: number, y2: number, width: number): string {
  const len = Math.max(8, width * 5);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a = (Math.PI * 25) / 180;
  const p = (da: number): Pt => [x2 - len * Math.cos(ang + da), y2 - len * Math.sin(ang + da)];
  const [l, r] = [p(a), p(-a)];
  return `${f(l[0])} ${f(l[1])} m ${f(x2)} ${f(y2)} l ${f(r[0])} ${f(r[1])} l S`;
}

/** Contenu du flux d'apparence pour une annotation (sans le dictionnaire). */
function buildAppearance(a: Pick<Annot, 'kind' | 'rect' | 'color' | 'fill' | 'opacity' | 'width' | 'contents' | 'quads' | 'strokes' | 'line' | 'fontSize' | 'stamp' | 'pen' | 'pressures'>, fonts: { helv: PDFFont; bold: PDFFont }): Built {
  const gs = (blend: 'Normal' | 'Multiply' = 'Normal') => ({ GS: { Type: 'ExtGState', CA: a.opacity, ca: a.opacity, BM: blend } });
  const [x1, y1, x2, y2] = a.rect;
  switch (a.kind) {
    case 'highlight': {
      const body = (a.quads ?? [a.rect]).map((q) => `${f(q[0])} ${f(q[1])} ${f(q[2] - q[0])} ${f(q[3] - q[1])} re f`).join('\n');
      return { content: `/GS gs\n${colorOp(a.color, false)}\n${body}`, bbox: a.rect, resources: { ExtGState: gs('Multiply') } };
    }
    case 'underline':
    case 'strikeout': {
      const w = Math.max(0.5, a.width);
      const body = (a.quads ?? [a.rect])
        .map((q) => {
          const y = a.kind === 'underline' ? q[1] + w : (q[1] + q[3]) / 2;
          return `${f(q[0])} ${f(y)} m ${f(q[2])} ${f(y)} l S`;
        })
        .join('\n');
      return { content: `/GS gs\n${colorOp(a.color, true)}\n${f(w)} w\n${body}`, bbox: a.rect, resources: { ExtGState: gs() } };
    }
    case 'rect':
    case 'ellipse': {
      const w = Math.max(0, a.width);
      const [ix1, iy1, ix2, iy2] = [x1 + w / 2, y1 + w / 2, x2 - w / 2, y2 - w / 2];
      const path = a.kind === 'rect' ? `${f(ix1)} ${f(iy1)} ${f(ix2 - ix1)} ${f(iy2 - iy1)} re` : ellipsePath(ix1, iy1, ix2, iy2);
      const paint = a.fill && w > 0 ? 'B' : a.fill ? 'f' : w > 0 ? 'S' : 'n';
      return {
        content: `/GS gs\n${colorOp(a.color, true)}\n${a.fill ? colorOp(a.fill, false) + '\n' : ''}${f(w)} w\n${path}\n${paint}`,
        bbox: a.rect,
        resources: { ExtGState: gs() },
      };
    }
    case 'line':
    case 'arrow': {
      const [lx1, ly1, lx2, ly2] = a.line ?? [x1, y1, x2, y2];
      const w = Math.max(0.5, a.width);
      const head = a.kind === 'arrow' ? '\n' + arrowHead(lx1, ly1, lx2, ly2, w) : '';
      return { content: `/GS gs\n${colorOp(a.color, true)}\n${f(w)} w 1 J 1 j\n${f(lx1)} ${f(ly1)} m ${f(lx2)} ${f(ly2)} l S${head}`, bbox: a.rect, resources: { ExtGState: gs() } };
    }
    case 'ink': {
      if (a.pen && a.strokes?.length) {
        // stylo : chaque trait est un contour rempli (épaisseur selon la pression), identique à l'aperçu à l'écran
        const body = a.strokes.map((s, i) => `${outlineOps(inkOutline(s, a.pressures?.[i], a.width, a.pen!), f2)} f`).join('\n');
        return { content: `/GS gs\n${colorOp(a.color, false)}\n${body}`, bbox: a.rect, resources: { ExtGState: gs(PENS[a.pen].blend) } };
      }
      const w = Math.max(0.5, a.width);
      const body = (a.strokes ?? [])
        .map((s) => (s.length === 1 ? `${f(s[0][0])} ${f(s[0][1])} m ${f(s[0][0] + 0.01)} ${f(s[0][1])} l S` : s.map((p, i) => `${f(p[0])} ${f(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' S'))
        .join('\n');
      return { content: `/GS gs\n${colorOp(a.color, true)}\n${f(w)} w 1 J 1 j\n${body}`, bbox: a.rect, resources: { ExtGState: gs() } };
    }
    case 'freetext': {
      const size = a.fontSize ?? 12;
      const pad = 3;
      const lines = wrap(fonts.helv, safeText(fonts.helv, a.contents), size, x2 - x1 - 2 * pad);
      const body = lines.map((l, i) => `BT /Helv ${f(size)} Tf ${colorOp(a.color, false)} ${f(x1 + pad)} ${f(y2 - pad - size * 0.85 - i * size * 1.2)} Td ${fonts.helv.encodeText(l).toString()} Tj ET`).join('\n');
      const border = a.width > 0 ? `${colorOp(a.color, true)} ${f(a.width)} w ${f(x1 + a.width / 2)} ${f(y1 + a.width / 2)} ${f(x2 - x1 - a.width)} ${f(y2 - y1 - a.width)} re S\n` : '';
      const fill = a.fill ? `${colorOp(a.fill, false)} ${f(x1)} ${f(y1)} ${f(x2 - x1)} ${f(y2 - y1)} re f\n` : '';
      return { content: `q ${f(x1)} ${f(y1)} ${f(x2 - x1)} ${f(y2 - y1)} re W n\n${fill}${border}${body}\nQ`, bbox: a.rect, resources: { Font: { Helv: fonts.helv.ref } } };
    }
    case 'redact': {
      // marque de caviardage : cadre rouge et voile rouge léger (le noir n'est appliqué que par « Appliquer le caviardage »)
      const w = x2 - x1;
      const h = y2 - y1;
      return {
        content: `/GSF gs 0.85 0.1 0.1 rg ${f(x1)} ${f(y1)} ${f(w)} ${f(h)} re f\n/GS gs 0.85 0.1 0.1 RG 1.5 w ${f(x1 + 0.75)} ${f(y1 + 0.75)} ${f(w - 1.5)} ${f(h - 1.5)} re S`,
        bbox: a.rect,
        resources: { ExtGState: { GS: { Type: 'ExtGState', CA: 1, ca: 1 }, GSF: { Type: 'ExtGState', CA: 0.2, ca: 0.2 } } },
      };
    }
    case 'note': {
      // petite note jaune au coin replié
      const s = Math.min(x2 - x1, y2 - y1);
      const c = a.color;
      return {
        content:
          `${colorOp(c, false)} ${f(x1)} ${f(y1)} ${f(s)} ${f(s)} re f\n0.25 0.2 0 RG 1 w ${f(x1 + 0.5)} ${f(y1 + 0.5)} ${f(s - 1)} ${f(s - 1)} re S\n` +
          [0.3, 0.5, 0.7].map((k) => `${f(x1 + s * 0.2)} ${f(y1 + s * k)} m ${f(x1 + s * 0.8)} ${f(y1 + s * k)} l S`).join('\n'),
        bbox: [x1, y1, x1 + s, y1 + s],
        resources: {},
      };
    }
    case 'stamp': {
      const def = STAMPS[a.stamp ?? ''] ?? { label: a.contents || 'TAMPON', color: a.color };
      const label = safeText(fonts.bold, def.label);
      const w = x2 - x1;
      const h = y2 - y1;
      const size = Math.min(h * 0.5, ((w - 16) / Math.max(1, fonts.bold.widthOfTextAtSize(label, 100))) * 100);
      const tw = fonts.bold.widthOfTextAtSize(label, size);
      return {
        content:
          `/GS gs\n${colorOp(def.color, true)} ${colorOp(def.color, false)} 2 w ${f(x1 + 1)} ${f(y1 + 1)} ${f(w - 2)} ${f(h - 2)} re S\n` +
          `BT /HelvB ${f(size)} Tf ${f(x1 + (w - tw) / 2)} ${f(y1 + (h - size * 0.72) / 2)} Td ${fonts.bold.encodeText(label).toString()} Tj ET`,
        bbox: a.rect,
        resources: { ExtGState: gs(), Font: { HelvB: fonts.bold.ref } },
      };
    }
    default:
      return { content: '', bbox: a.rect, resources: {} };
  }
}

// ───────────── écriture ─────────────

const SUBTYPE_OF: Record<AnnotKind, string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'StrikeOut',
  note: 'Text',
  freetext: 'FreeText',
  ink: 'Ink',
  rect: 'Square',
  ellipse: 'Circle',
  line: 'Line',
  arrow: 'Line',
  stamp: 'Stamp',
  redact: 'Redact',
  signature: 'Stamp',
  image: 'Stamp',
  other: '',
};

/** Rectangle de l'annotation d'après sa géométrie (+ marge pour l'épaisseur du trait). */
export function boundsOf(a: Pick<Annot, 'kind' | 'rect' | 'width' | 'quads' | 'strokes' | 'line'> & { pen?: Annot['pen'] }): Rect {
  if (a.quads?.length) return unionRect(a.quads);
  if (a.pen && a.strokes?.length) return strokeBounds(a.strokes.flat(), a.width);
  if (a.strokes?.length) return inflate(pointsBounds(a.strokes.flat()), Math.max(1, a.width) / 2 + 0.5);
  if (a.line) return inflate(normalizeRect(a.line), a.kind === 'arrow' ? Math.max(8, a.width * 5) : Math.max(1, a.width) / 2 + 0.5);
  return normalizeRect(a.rect);
}

async function fontsFor(doc: PDFDocument) {
  return { helv: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

function setAppearance(doc: PDFDocument, dict: PDFDict, built: Built): void {
  const ctx = doc.context;
  const stream = ctx.stream(built.content, { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: built.bbox, Resources: built.resources as never });
  dict.set(N('AP'), ctx.obj({ N: ctx.register(stream) }));
}

function writeGeometry(dict: PDFDict, a: Pick<Annot, 'kind' | 'rect' | 'width' | 'quads' | 'strokes' | 'line' | 'fill' | 'pen' | 'pressures' | 'strokeIds'>, ctx: PDFDocument['context']): void {
  const rect = boundsOf(a);
  dict.set(N('Rect'), ctx.obj(rect.map(num)));
  if (a.quads) dict.set(N('QuadPoints'), ctx.obj(a.quads.flatMap((q) => [q[0], q[3], q[2], q[3], q[0], q[1], q[2], q[1]].map(num))));
  if (a.strokes) dict.set(N('InkList'), ctx.obj(a.strokes.map((s) => s.flatMap((p) => [num(p[0]), num(p[1])]))));
  if (a.pen && a.strokes) {
    // clés propres à Cigale (ignorées par les autres lecteurs) : le stylo et la pression, pour redessiner le même trait après un déplacement
    dict.set(N('CigalePen'), N(a.pen));
    if (a.pressures) dict.set(N('CigaleP'), ctx.obj(a.pressures.map((s) => s.map((v) => PDFNumber.of(Math.round(v * 100) / 100)))));
    else dict.delete(N('CigaleP'));
    if (a.strokeIds) dict.set(N('CigaleU'), ctx.obj(a.strokeIds.map((id) => PDFString.of(id))));
  }
  if (a.line) {
    dict.set(N('L'), ctx.obj(a.line.map(num)));
    dict.set(N('LE'), ctx.obj([N('None'), N(a.kind === 'arrow' ? 'OpenArrow' : 'None')]));
  }
  if (a.kind === 'rect' || a.kind === 'ellipse' || a.kind === 'freetext' || a.kind === 'line' || a.kind === 'arrow' || a.kind === 'ink' || a.kind === 'underline' || a.kind === 'strikeout') {
    dict.set(N('BS'), ctx.obj({ W: num(a.width), S: 'S' }));
  }
}

function writeStyle(dict: PDFDict, a: Pick<Annot, 'color' | 'fill' | 'opacity'>, ctx: PDFDocument['context']): void {
  dict.set(N('C'), ctx.obj(a.color.map(num)));
  if (a.fill) dict.set(N('IC'), ctx.obj(a.fill.map(num)));
  else dict.delete(N('IC'));
  dict.set(N('CA'), num(a.opacity));
}

const newId = () => `cigale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface AddResult {
  bytes: Uint8Array;
  /** Identifiants (références) des annotations créées. */
  ids: string[];
}

/** Ajoute des annotations (avec apparence). Les brouillons visent chacun une page (`page`, à partir de 0). */
export async function addAnnotations(bytes: Uint8Array, drafts: AnnotDraft[], password?: string, expectedPages?: number, author = '', now = new Date()): Promise<AddResult> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new AnnotError('structure');
  const ids = await addAnnotationsToDoc(doc, drafts, author, now);
  pruneUnreachable(doc); // polices non utilisées par ces annotations
  return { bytes: await saveDoc(doc), ids };
}

/** Ajoute des annotations à un document déjà ouvert (sans l'enregistrer). Renvoie leurs identifiants. */
export async function addAnnotationsToDoc(doc: PDFDocument, drafts: AnnotDraft[], author = '', now = new Date()): Promise<string[]> {
  const ctx = doc.context;
  const fonts = await fontsFor(doc);
  const ids: string[] = [];
  for (const draft of drafts) {
    const page = doc.getPages()[draft.page];
    if (!page) throw new AnnotError('badPage');
    const a = { ...draft, rect: boundsOf(draft) };
    const dict = ctx.obj({
      Type: 'Annot',
      Subtype: SUBTYPE_OF[draft.kind] || 'Text',
      F: draft.kind === 'note' ? 28 : 4,
      P: page.ref,
      NM: PDFString.of(newId()),
      T: PDFHexString.fromText(draft.author ?? author),
      M: PDFString.of(toPdfDate(now)),
      CreationDate: PDFString.of(toPdfDate(now)),
      Contents: PDFHexString.fromText(draft.contents),
    }) as PDFDict;
    writeGeometry(dict, a, ctx);
    writeStyle(dict, a, ctx);
    if (draft.kind === 'freetext') {
      dict.set(N('DA'), PDFString.of(`/Helv ${f(draft.fontSize ?? 12)} Tf ${colorOp(draft.color, false)}`));
      dict.set(N('Q'), PDFNumber.of(0));
      dict.set(N('DR'), ctx.obj({ Font: { Helv: fonts.helv.ref } })); // ressources par défaut : Acrobat peut régénérer l'apparence
    }
    if (draft.kind === 'note') dict.set(N('Name'), N('Note'));
    if (draft.kind === 'signature') dict.set(N('Name'), N('Cigale-signature'));
    if (draft.kind === 'image') dict.set(N('Name'), N('Cigale-image'));
    if (draft.kind === 'stamp') dict.set(N('Name'), N(`Cigale-${draft.stamp && STAMPS[draft.stamp] ? draft.stamp : 'custom'}`));
    if (draft.replyTo) {
      dict.set(N('IRT'), refOf(draft.replyTo));
      dict.set(N('RT'), N('R'));
      dict.set(N('Name'), N('Comment'));
      setAppearance(doc, dict, { content: '', bbox: [0, 0, 1, 1], resources: {} }); // aucune icône : seule la liste des commentaires l'affiche
    } else if (draft.kind === 'signature' || draft.kind === 'image') {
      if (!draft.image) throw new AnnotError('badImage');
      // l'image (signature ou image ajoutée) est intégrée au document et dessinée dans l'apparence
      let img;
      try {
        img = draft.image[0] === 0xff && draft.image[1] === 0xd8 ? await doc.embedJpg(draft.image) : await doc.embedPng(draft.image);
      } catch {
        throw new AnnotError('badImage');
      }
      const [x1, y1, x2, y2] = a.rect;
      setAppearance(doc, dict, { content: `q ${f(x2 - x1)} 0 0 ${f(y2 - y1)} ${f(x1)} ${f(y1)} cm /Img Do Q`, bbox: a.rect, resources: { XObject: { Img: img.ref } } });
    } else {
      setAppearance(doc, dict, buildAppearance(a, fonts));
    }
    const ref = ctx.register(dict);
    if (draft.kind === 'note' && !draft.replyTo) {
      const [nx1, , nx2, ny2] = a.rect;
      const popup = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [num(nx2 + 4), num(ny2 - 100), num(nx2 + 204), num(ny2)], Parent: ref, Open: PDFBool.False }));
      dict.set(N('Popup'), popup);
      appendAnnot(page, ctx, popup);
      void nx1;
    }
    appendAnnot(page, ctx, ref);
    ids.push(idOf(ref));
  }
  return ids;
}

function appendAnnot(page: PDFPage, ctx: PDFDocument['context'], ref: PDFRef): void {
  let arr = page.node.lookupMaybe(N('Annots'), PDFArray);
  if (!arr) {
    arr = ctx.obj([]);
    page.node.set(N('Annots'), arr);
  }
  arr.push(ref);
}

function find(doc: PDFDocument, id: string): { page: PDFPage; pageIndex: number; ref: PDFRef; dict: PDFDict } | null {
  const ref = refOf(id);
  const pages = doc.getPages();
  for (const [pageIndex, page] of pages.entries()) {
    for (const x of pageAnnots(doc, page)) if (x.ref === ref || (x.ref.objectNumber === ref.objectNumber && x.ref.generationNumber === ref.generationNumber)) return { page, pageIndex, ...x };
  }
  return null;
}

/** Modifie une annotation : style, texte, position… L'apparence est reconstruite à partir des nouvelles valeurs. */
export function updateAnnotation(bytes: Uint8Array, id: string, patch: AnnotPatch, password?: string, expectedPages?: number, now = new Date()): Promise<Uint8Array> {
  return updateAnnotations(bytes, [{ id, patch }], password, expectedPages, now);
}

/** Modifie plusieurs annotations en une seule lecture/écriture du document (déplacer une sélection de traits). */
export async function updateAnnotations(bytes: Uint8Array, items: { id: string; patch: AnnotPatch }[], password?: string, expectedPages?: number, now = new Date()): Promise<Uint8Array> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new AnnotError('structure');
  for (const { id, patch } of items) await applyUpdate(doc, id, patch, now);
  pruneUnreachable(doc); // l'ancien flux d'apparence et les polices inutilisées ne restent pas dans le fichier
  return saveDoc(doc);
}

async function applyUpdate(doc: PDFDocument, id: string, patch: AnnotPatch, now: Date): Promise<void> {
  const hit = find(doc, id);
  if (!hit) throw new AnnotError('notFound');
  const current = readAnnot(doc, hit.pageIndex, hit.ref, hit.dict);
  if (!current) throw new AnnotError('notFound');
  const next = { ...current, ...patch } as Annot;
  const ctx = doc.context;
  const geometryChanged = patch.rect || patch.quads || patch.strokes || patch.line || patch.width !== undefined;
  const styleChanged = patch.color || patch.fill !== undefined || patch.opacity !== undefined || patch.fontSize !== undefined || patch.stamp !== undefined;
  if (geometryChanged) {
    const rect = patch.rect && !patch.quads && !patch.strokes && !patch.line ? normalizeRect(patch.rect) : boundsOf(next);
    next.rect = rect;
    if (current.kind === 'other') hit.dict.set(N('Rect'), ctx.obj(rect.map(num)));
    else writeGeometry(hit.dict, next, ctx);
  }
  if (styleChanged && current.kind !== 'other') {
    writeStyle(hit.dict, next, ctx);
    if (next.kind === 'freetext') hit.dict.set(N('DA'), PDFString.of(`/Helv ${f(next.fontSize ?? 12)} Tf ${colorOp(next.color, false)}`));
  }
  if (patch.contents !== undefined) hit.dict.set(N('Contents'), PDFHexString.fromText(patch.contents));
  hit.dict.set(N('M'), PDFString.of(toPdfDate(now)));
  // L'apparence est refaite si le dessin change, sauf pour un commentaire d'un autre logiciel dont on ne touche que le texte.
  // Un commentaire d'un autre logiciel simplement DÉPLACÉ garde son apparence d'origine (le lecteur la replace dans le nouveau rectangle).
  const sameSize = !!patch.rect && Math.abs(patch.rect[2] - patch.rect[0] - (current.rect[2] - current.rect[0])) < 0.01 && Math.abs(patch.rect[3] - patch.rect[1] - (current.rect[3] - current.rect[1])) < 0.01;
  const translateOnly = current.foreign && !styleChanged && patch.width === undefined && sameSize;
  const redraw = !translateOnly && (geometryChanged || styleChanged || (patch.contents !== undefined && (next.kind === 'freetext' || next.kind === 'stamp'))) && next.kind !== 'other' && next.kind !== 'signature' && next.kind !== 'image' && !next.replyTo; // une signature garde son image : le lecteur l'étire dans le nouveau rectangle
  if (patch.stamp !== undefined && next.kind === 'stamp') hit.dict.set(N('Name'), N(`Cigale-${STAMPS[patch.stamp] ? patch.stamp : 'custom'}`));
  if (redraw) setAppearance(doc, hit.dict, buildAppearance(next, await fontsFor(doc)));
}

/** Supprime des annotations, avec leurs réponses et leur bulle (Popup). */
export async function deleteAnnotations(bytes: Uint8Array, ids: string[], password?: string, expectedPages?: number): Promise<Uint8Array> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new AnnotError('structure');
  const doomed = new Set(ids.map((i) => i.split(' ').map(Number)[0]));
  // les réponses (IRT) des annotations supprimées partent avec elles, à tous les niveaux
  let grew = true;
  while (grew) {
    grew = false;
    for (const page of doc.getPages()) {
      for (const { ref, dict } of pageAnnots(doc, page)) {
        const irt = dict.get(N('IRT'));
        if (irt instanceof PDFRef && doomed.has(irt.objectNumber) && !doomed.has(ref.objectNumber)) {
          doomed.add(ref.objectNumber);
          grew = true;
        }
      }
    }
  }
  let removed = 0;
  for (const page of doc.getPages()) {
    const arr = page.node.lookupMaybe(N('Annots'), PDFArray);
    if (!arr) continue;
    for (let i = arr.size() - 1; i >= 0; i--) {
      const ref = arr.get(i);
      const dict = arr.lookupMaybe(i, PDFDict);
      const parent = dict?.get(N('Parent'));
      const isDoomed = ref instanceof PDFRef && doomed.has(ref.objectNumber);
      const orphanPopup = dict?.get(N('Subtype')) === N('Popup') && parent instanceof PDFRef && doomed.has(parent.objectNumber);
      if (isDoomed || orphanPopup) {
        arr.remove(i);
        if (isDoomed) removed++;
      }
    }
  }
  if (removed === 0) throw new AnnotError('notFound');
  pruneUnreachable(doc);
  return saveDoc(doc);
}
