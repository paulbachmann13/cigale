/**
 * Opérations sur les pages d'un PDF (@cantoo/pdf-lib). Fonctions pures : octets en entrée, octets en sortie.
 * Aucun accès au DOM : elles tournent dans un Web Worker (ops.worker.ts) et sous Node pour les tests.
 *
 * Règles de fiabilité :
 *  - on ne touche jamais aux octets d'entrée ; on rend toujours un nouveau document ;
 *  - les métadonnées d'origine sont conservées (`updateMetadata: false`) ;
 *  - les pages supprimées disparaissent VRAIMENT du fichier (contenu compris) : voir `pruneUnreachable`.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  type PDFObject,
  type PDFPage,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  degrees,
} from '@cantoo/pdf-lib';
import { moveOrder, normalizeSelection } from '../data/page-order';
import { type PaperColor, type PaperTemplate, drawPaper, sharePaper } from './notebook-ops';
import { type Permissions, RESTRICTIVE, getProtection, inheritProtection, permissionsFromP, saveDoc, setProtection } from './protection';

export type PageOp =
  | { op: 'rotate'; pages: number[]; delta: 90 | -90 | 180 }
  | { op: 'delete'; pages: number[] }
  | { op: 'duplicate'; pages: number[] }
  | { op: 'move'; pages: number[]; to: number }
  | { op: 'insertBlank'; at: number; /** Papier des nouvelles pages (vierge si absent), sa couleur et leur nombre (1 si absent). */ template?: PaperTemplate; color?: PaperColor; count?: number }
  /** Insère `count` copies de la page `from` (du même document) à la position `at`. */
  | { op: 'insertCopy'; at: number; from: number; count?: number }
  | { op: 'insertFrom'; at: number; other: Uint8Array; otherPassword?: string; otherPages?: number[] };

export interface OpResult {
  bytes: Uint8Array;
  /** Nombre de pages du document obtenu. */
  pageCount: number;
  /** Pages (indices) à sélectionner dans le nouveau document. */
  selection: number[];
}

/** Erreur « attendue » : `name` est un code que l'interface traduit (les textes sont dans fr.ts). */
export class PageOpError extends Error {
  constructor(readonly code: 'noSelection' | 'keepOne' | 'structure') {
    super(code);
    this.name = code;
  }
}

export interface Inspection {
  pageCount: number;
  encrypted: boolean;
  /** Le fichier contient une signature numérique : toute modification l'invalide. */
  signed: boolean;
  hasForm: boolean;
  hasOutline: boolean;
  hasAttachments: boolean;
}

// preserveXFA : sinon pdf-lib supprime les formulaires XFA (ils deviendraient vides dans Acrobat)
const loadOpts = (password?: string) => ({ updateMetadata: false, password, throwOnInvalidObject: false, preserveXFA: true });

/**
 * Document déchiffré par pdf-lib : la référence « /Info » (titre, auteur, dates…) est perdue du trailer, donc absente à
 * l'écriture suivante : un PDF protégé perdait son titre et son auteur à chaque modification. On la retrouve : c'est le
 * dictionnaire sans /Type dont toutes les clés sont des clés d'information de document.
 */
export function restoreInfoReference(doc: PDFDocument): void {
  if (doc.context.trailerInfo.Info) return;
  const STANDARD = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];
  let best: { ref: PDFRef; score: number } | undefined;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.has(PDFName.of('Type')) || obj.has(PDFName.of('Subtype'))) continue;
    // un signet (entrée d'outline) a aussi un /Title : on écarte tout dictionnaire qui a l'allure d'un nœud d'arbre
    if (['Parent', 'Prev', 'Next', 'First', 'Last', 'Kids', 'Count', 'Dest', 'A', 'S'].some((k) => obj.has(PDFName.of(k)))) continue;
    const score = STANDARD.filter((k) => obj.has(PDFName.of(k))).length;
    // Il faut au moins un titre, un auteur, un sujet, des mots-clés ou une date : « Producer » seul est trop courant ailleurs.
    const meaningful = ['Title', 'Author', 'Subject', 'Keywords', 'CreationDate', 'ModDate'].some((k) => obj.has(PDFName.of(k)));
    if (meaningful && (!best || score > best.score)) best = { ref, score };
  }
  if (best) doc.context.trailerInfo.Info = best.ref;
}

export async function loadForEdit(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  let pw = password;
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, loadOpts(pw));
  } catch (err) {
    // Document chiffré SANS mot de passe d'ouverture (restrictions seules) : pdf.js l'ouvre sans rien demander, pdf-lib veut « '' ».
    if (pw !== undefined || !/encrypted/i.test((err as Error).message)) throw err;
    pw = '';
    doc = await PDFDocument.load(bytes, loadOpts(pw));
  }
  // pdf-lib déchiffre à l'ouverture : on retient comment le protéger de nouveau à l'enregistrement.
  if (doc.context.isDecrypted && pw !== undefined) {
    restoreInfoReference(doc);
    let permissions: Permissions = RESTRICTIVE;
    try {
      const raw = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
      const enc = raw.context.lookup(raw.context.trailerInfo.Encrypt, PDFDict);
      const P = enc?.lookupMaybe(PDFName.of('P'), PDFNumber)?.asNumber();
      if (P !== undefined) permissions = permissionsFromP(P | 0);
    } catch {
      /* /P illisible : aucune restriction connue, le mot de passe est quand même gardé */
    }
    setProtection(doc, { password: pw, permissions });
  }
  return doc;
}

/** Ce que contient le document, pour avertir AVANT d'écrire quelque chose que Cigale ne sait pas conserver. */
export async function inspect(bytes: Uint8Array, password?: string): Promise<Inspection> {
  const doc = await loadForEdit(bytes, password);
  const cat = doc.catalog;
  const acro = cat.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  let signed = false;
  if (acro) {
    const flags = acro.lookupMaybe(PDFName.of('SigFlags'), PDFNumber);
    signed = !!flags && flags.asNumber() > 0;
    if (!signed) signed = hasSignatureField(doc, acro);
  }
  const names = cat.lookupMaybe(PDFName.of('Names'), PDFDict);
  return {
    pageCount: doc.getPageCount(),
    encrypted: getProtection(doc) !== undefined || doc.isEncrypted,
    signed,
    hasForm: !!acro,
    hasOutline: !!cat.lookupMaybe(PDFName.of('Outlines'), PDFDict),
    hasAttachments: !!names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict),
  };
}

function hasSignatureField(doc: PDFDocument, acro: PDFDict): boolean {
  const fields = acro.lookupMaybe(PDFName.of('Fields'), PDFArray);
  if (!fields) return false;
  const seen = new Set<PDFObject>();
  const walk = (arr: PDFArray): boolean => {
    for (let i = 0; i < arr.size(); i++) {
      const f = arr.lookupMaybe(i, PDFDict);
      if (!f || seen.has(f)) continue;
      seen.add(f);
      if (f.get(PDFName.of('FT')) === PDFName.of('Sig') && f.has(PDFName.of('V'))) return true;
      const kids = f.lookupMaybe(PDFName.of('Kids'), PDFArray);
      if (kids && walk(kids)) return true;
    }
    return false;
  };
  void doc;
  return walk(fields);
}

/**
 * Garde-fou : pdf-lib et pdf.js doivent compter le même nombre de pages. Certains PDF mal formés (pages sans /Type…)
 * sont lus différemment ; modifier un tel document pourrait toucher la mauvaise page, donc on refuse.
 */
function checkStructure(doc: PDFDocument, expectedPages?: number): void {
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new PageOpError('structure');
}

/** Applique une opération et rend le nouveau document. Lève une erreur sans rien modifier en cas de problème. */
export async function applyOp(bytes: Uint8Array, op: PageOp, password?: string, expectedPages?: number): Promise<OpResult> {
  const doc = await loadForEdit(bytes, password);
  checkStructure(doc, expectedPages);
  const count = doc.getPageCount();
  const before = doc.getPages().map((p) => p.ref);
  let selection: number[] = [];

  switch (op.op) {
    case 'rotate': {
      const pages = normalizeSelection(op.pages, count);
      const all = doc.getPages();
      for (const i of pages) all[i].setRotation(degrees((((all[i].getRotation().angle + op.delta) % 360) + 360) % 360));
      selection = pages;
      break;
    }
    case 'delete': {
      const pages = normalizeSelection(op.pages, count);
      if (pages.length === 0) throw new PageOpError('noSelection');
      if (pages.length >= count) throw new PageOpError('keepOne');
      for (const i of [...pages].reverse()) doc.removePage(i);
      pruneUnreachable(doc, before);
      selection = [Math.min(pages[0], count - pages.length - 1)];
      break;
    }
    case 'duplicate': {
      const pages = normalizeSelection(op.pages, count);
      const copies = await doc.copyPages(doc, pages);
      const insertAt = pages[pages.length - 1] + 1;
      copies.forEach((p, k) => doc.insertPage(insertAt + k, p));
      selection = copies.map((_, k) => insertAt + k);
      break;
    }
    case 'move': {
      const pages = normalizeSelection(op.pages, count);
      const order = moveOrder(count, pages, op.to);
      reorderPages(doc, order);
      const keep = new Set(pages);
      selection = order.flatMap((orig, pos) => (keep.has(orig) ? [pos] : []));
      break;
    }
    case 'insertBlank': {
      const at = Math.min(Math.max(op.at, 0), count);
      const ref = doc.getPage(Math.min(Math.max(at - 1, 0), count - 1));
      const { width, height } = ref.getSize();
      const many = Number.isFinite(op.count) ? Math.min(Math.max(Math.floor(op.count!), 1), 200) : 1;
      const rot = ref.getRotation().angle;
      // Avec un papier, la page est droite : pour une voisine tournée de 90° ou 270°, on échange largeur et hauteur au lieu de la tourner
      // (sinon les lignes du papier apparaîtraient à la verticale).
      const upright = !!(op.template || op.color) && rot % 180 !== 0;
      selection = [];
      let firstNew: PDFPage | undefined;
      for (let k = 0; k < many; k++) {
        const page = doc.insertPage(at + k, upright ? [height, width] : [width, height]);
        if (rot && !upright) page.setRotation(degrees(rot));
        if (op.template || op.color) {
          if (!firstNew) {
            drawPaper(page, op.template ?? 'blank', op.color);
            firstNew = page;
          } else sharePaper(firstNew, page);
        }
        selection.push(at + k);
      }
      break;
    }
    case 'insertCopy': {
      if (!(op.from >= 0 && op.from < count)) throw new PageOpError('structure');
      const many = Number.isFinite(op.count) ? Math.min(Math.max(Math.floor(op.count!), 1), 200) : 1;
      const at = Math.min(Math.max(op.at, 0), count);
      // un appel par copie : copier la même page plusieurs fois en un seul appel pourrait renvoyer deux fois le même objet de page
      selection = [];
      for (let k = 0; k < many; k++) {
        const [copy] = await doc.copyPages(doc, [op.from]);
        doc.insertPage(at + k, copy);
        selection.push(at + k);
      }
      break;
    }
    case 'insertFrom': {
      const other = await loadForEdit(op.other, op.otherPassword);
      const wanted = op.otherPages ?? Array.from({ length: other.getPageCount() }, (_, i) => i);
      const copies = await doc.copyPages(other, wanted);
      const at = Math.min(Math.max(op.at, 0), count);
      copies.forEach((p, k) => doc.insertPage(at + k, p));
      selection = copies.map((_, k) => at + k);
      break;
    }
  }
  const out = await saveDoc(doc);
  return { bytes: out, pageCount: doc.getPageCount(), selection };
}

const INHERITABLE = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map((k) => PDFName.of(k));

/**
 * Réordonne en place : l'arbre des pages devient plat (une seule liste de pages). Les attributs que les pages héritaient
 * des nœuds intermédiaires (taille, rotation, ressources) sont d'abord recopiés dans chaque page pour ne rien perdre.
 */
function reorderPages(doc: PDFDocument, order: number[]): void {
  const ctx = doc.context;
  const pages = doc.getPages();
  for (const page of pages) {
    const leaf = page.node;
    for (const key of INHERITABLE) {
      if (leaf.has(key)) continue;
      let parent = leaf.get(PDFName.of('Parent'));
      for (let guard = 0; parent && guard < 64; guard++) {
        const node = ctx.lookupMaybe(parent as PDFRef, PDFDict);
        if (!node) break;
        const v = node.get(key);
        if (v) {
          leaf.set(key, v instanceof PDFRef ? v : v.clone(ctx)); // copie : les pages ne partagent pas d'objet modifiable
          break;
        }
        parent = node.get(PDFName.of('Parent'));
      }
    }
  }
  const rootRef = doc.catalog.get(PDFName.of('Pages')) as PDFRef;
  const root = ctx.lookup(rootRef, PDFDict);
  for (const page of pages) page.node.set(PDFName.of('Parent'), rootRef);
  root.set(PDFName.of('Kids'), ctx.obj(order.map((i) => pages[i].ref)));
  root.set(PDFName.of('Count'), PDFNumber.of(order.length));
  pruneUnreachable(doc);
}

/** Nouveau document contenant seulement les pages demandées (les signets et formulaires ne sont pas repris). */
export async function extractPages(bytes: Uint8Array, pages: number[], password?: string, expectedPages?: number): Promise<Uint8Array> {
  const src = await loadForEdit(bytes, password);
  checkStructure(src, expectedPages);
  const wanted = normalizeSelection(pages, src.getPageCount());
  if (wanted.length === 0) throw new PageOpError('noSelection');
  const out = await PDFDocument.create({ updateMetadata: false });
  inheritProtection(out, src);
  const copies = await out.copyPages(src, wanted);
  copies.forEach((p) => out.addPage(p));
  const title = src.getTitle();
  if (title) out.setTitle(title, { showInWindowTitleBar: false });
  pruneUnreachable(out);
  return saveDoc(out);
}

/** Ré-écrit le document tel quel (chiffrement retiré, objets inutiles écartés) : base de « Enregistrer ». */
export async function normalizeDocument(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  const doc = await loadForEdit(bytes, password);
  pruneUnreachable(doc);
  return saveDoc(doc);
}

/**
 * pdf-lib ne retire de l'arbre des pages que la référence : la page supprimée, ses images et ses polices restent dans le
 * fichier. Pour un document confidentiel c'est inacceptable : on repart de la racine et on garde seulement ce qui est
 * atteignable. Les références vers une page supprimée (signets, liens) ne sont pas suivies : elles deviennent « nulles ».
 */
export function pruneUnreachable(doc: PDFDocument, pagesBefore: PDFRef[] = [], alsoDead: PDFRef[] = []): number {
  const ctx = doc.context;
  const live = new Set<PDFRef>(doc.getPages().map((p) => p.ref));
  // Annotations copiées avec leur page (fusion, découpe, extraction, insertion, duplication) : pdf-lib laisse leur /P (page) pointer vers
  // un clone égaré de la page d'origine. Sans ce rattachement, elles passeraient plus bas pour « posées sur une page supprimée »
  // et seraient effacées : commentaires, signatures, images et écriture manuscrite perdus en silence.
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    for (let i = 0; annots && i < annots.size(); i++) {
      const a = annots.lookupMaybe(i, PDFDict);
      const p = a?.get(PDFName.of('P'));
      if (a && p !== undefined && !(p instanceof PDFRef && live.has(p))) a.set(PDFName.of('P'), page.ref);
    }
  }
  // pages qui existaient avant l'opération et ont disparu : on ne les suit jamais, même si leur /Type manque
  const dead = new Set<PDFRef>(pagesBefore.filter((r) => !live.has(r)));
  for (const r of alsoDead) dead.add(r); // objets à ne jamais suivre (ex. champs de formulaire d'une page caviardée)
  const keep = new Set<PDFRef>();
  const stack: PDFObject[] = [];
  for (const root of [ctx.trailerInfo.Root, ctx.trailerInfo.Info, ctx.trailerInfo.Encrypt]) if (root) stack.push(root);

  const isDeadPage = (ref: PDFRef, obj: PDFObject | undefined) => {
    if (dead.has(ref)) return true;
    return obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Page') && !live.has(ref);
  };
  /** Annotation (lien, champ de formulaire…) posée sur une page supprimée : elle disparaît avec elle. */
  const isOrphanAnnotation = (obj: PDFObject | undefined) => {
    if (!(obj instanceof PDFDict)) return false;
    if (!obj.has(PDFName.of('Subtype')) && obj.get(PDFName.of('Type')) !== PDFName.of('Annot')) return false; // pas une annotation
    const p = obj.get(PDFName.of('P'));
    return p instanceof PDFRef && !live.has(p) && (dead.has(p) || isDeadPage(p, ctx.lookup(p) as PDFObject | undefined));
  };

  while (stack.length) {
    const obj = stack.pop()!;
    if (obj instanceof PDFRef) {
      if (keep.has(obj) || (dead.has(obj) && !live.has(obj))) continue;
      const target = ctx.lookup(obj);
      if (isDeadPage(obj, target as PDFObject | undefined)) continue; // page supprimée : on ne la suit pas
      if (isOrphanAnnotation(target as PDFObject | undefined)) continue;
      keep.add(obj);
      if (target) stack.push(target as PDFObject);
    } else if (obj instanceof PDFDict) {
      for (const v of obj.values()) stack.push(v);
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    } else if (obj instanceof PDFArray) {
      for (const v of obj.asArray()) stack.push(v);
    }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!keep.has(ref)) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
}
