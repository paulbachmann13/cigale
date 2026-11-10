/**
 * Calque PDF de l'écriture manuscrite. Les annotations d'encre de Cigale sont rangées dans un calque (« contenu optionnel », OCG)
 * nommé : les autres lecteurs l'affichent normalement, et Cigale peut le MASQUER dans pdf.js pour dessiner l'encre elle-même
 * (gomme, lasso et annulation deviennent instantanés, sans recharger le document).
 *
 * `normalizeInkLayer` est appelé à chaque enregistrement (`saveDoc`) : quelle que soit l'opération (fusion, copie de pages,
 * fichier écrit par une ancienne version…), toute annotation d'encre de Cigale pointe vers l'unique calque déclaré.
 */
import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from '@cantoo/pdf-lib';
import { INK_LAYER_NAME } from '../data/ink';

const N = (s: string) => PDFName.of(s);

/** Une annotation d'encre écrite par Cigale (elle porte le type de stylo). */
export const isInkSheet = (dict: PDFDict): boolean => dict.get(N('Subtype')) === N('Ink') && dict.has(N('CigalePen'));

function layerName(d: PDFDict): string {
  const n = d.lookup(N('Name'));
  return n instanceof PDFHexString || n instanceof PDFString ? n.decodeText() : '';
}

/** Le calque d'encre déclaré dans le document, s'il existe. */
export function findInkLayer(doc: PDFDocument): PDFRef | null {
  const groups = doc.catalog.lookupMaybe(N('OCProperties'), PDFDict)?.lookupMaybe(N('OCGs'), PDFArray);
  for (let i = 0; groups && i < groups.size(); i++) {
    const ref = groups.get(i);
    const d = groups.lookupMaybe(i, PDFDict);
    if (ref instanceof PDFRef && d && layerName(d) === INK_LAYER_NAME) return ref;
  }
  return null;
}

/** Le calque d'encre, créé et déclaré s'il n'existe pas (les calques déjà présents dans le document sont conservés). */
export function ensureInkLayer(doc: PDFDocument): PDFRef {
  const found = findInkLayer(doc);
  if (found) return found;
  const ctx = doc.context;
  const ref = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFHexString.fromText(INK_LAYER_NAME) }));
  let props = doc.catalog.lookupMaybe(N('OCProperties'), PDFDict);
  if (!props) {
    props = ctx.obj({ OCGs: [], D: { Order: [] } }) as PDFDict;
    doc.catalog.set(N('OCProperties'), props);
  }
  let groups = props.lookupMaybe(N('OCGs'), PDFArray);
  if (!groups) props.set(N('OCGs'), (groups = ctx.obj([]) as PDFArray));
  groups.push(ref);
  let config = props.lookupMaybe(N('D'), PDFDict);
  if (!config) props.set(N('D'), (config = ctx.obj({}) as PDFDict));
  // visible dans la liste des calques des autres lecteurs (on peut y masquer l'écriture)
  let order = config.lookupMaybe(N('Order'), PDFArray);
  if (!order) config.set(N('Order'), (order = ctx.obj([]) as PDFArray));
  order.push(ref);
  // Document dont les calques sont tous masqués par défaut (/BaseState /OFF) : le nôtre doit rester visible, sinon l'écriture disparaîtrait
  if (config.get(N('BaseState')) === N('OFF')) {
    let on = config.lookupMaybe(N('ON'), PDFArray);
    if (!on) config.set(N('ON'), (on = ctx.obj([]) as PDFArray));
    on.push(ref);
  }
  return ref;
}

function sheets(doc: PDFDocument): PDFDict[] {
  const out: PDFDict[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(N('Annots'), PDFArray);
    for (let i = 0; annots && i < annots.size(); i++) {
      const d = annots.lookupMaybe(i, PDFDict);
      if (d && isInkSheet(d)) out.push(d);
    }
  }
  return out;
}

/** Y a-t-il de l'encre Cigale qui n'est pas (ou plus) dans le calque déclaré ? (Fichier d'une ancienne version, ou passé par un autre logiciel.) */
export function inkNeedsLayer(doc: PDFDocument): boolean {
  const all = sheets(doc);
  if (all.length === 0) return false;
  const layer = findInkLayer(doc);
  return !layer || all.some((d) => d.get(N('OC')) !== layer);
}

/** Range toute l'encre Cigale dans l'unique calque déclaré. Ne touche à rien si le document n'a pas d'encre. */
export function normalizeInkLayer(doc: PDFDocument): void {
  const all = sheets(doc);
  if (all.length === 0) return;
  const layer = ensureInkLayer(doc);
  for (const d of all) if (d.get(N('OC')) !== layer) d.set(N('OC'), layer);
}
