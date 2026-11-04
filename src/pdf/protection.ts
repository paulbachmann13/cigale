/**
 * Protection par mot de passe : pdf-lib DÉCHIFFRE à l'ouverture et n'écrit plus de chiffrement à l'enregistrement.
 * Sans précaution, modifier un PDF protégé le rendrait lisible par tous. On retient donc, pour chaque document ouvert
 * avec mot de passe, ce qu'il faut pour le protéger de nouveau (même mot de passe d'ouverture, mêmes restrictions) :
 * `saveDoc` remplace `doc.save()` partout.
 */
import { PDFArray, PDFDict, type PDFDocument, PDFHexString, type PDFRef, PDFString } from '@cantoo/pdf-lib';

export interface Permissions {
  printing?: boolean | 'lowResolution' | 'highResolution';
  modifying?: boolean;
  copying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  contentAccessibility?: boolean;
  documentAssembly?: boolean;
}

export interface Protection {
  /** Mot de passe d'ouverture (vide : le document s'ouvre sans mot de passe, seules des restrictions s'appliquent). */
  password: string;
  permissions: Permissions;
  /** Mot de passe propriétaire choisi par l'utilisateur (lève les restrictions). Inconnu pour un document déjà protégé à l'ouverture. */
  ownerPassword?: string;
}

const registry = new WeakMap<PDFDocument, Protection>();

export const getProtection = (doc: PDFDocument): Protection | undefined => registry.get(doc);
export const setProtection = (doc: PDFDocument, p: Protection): void => void registry.set(doc, p);
/** Retire la protection : plus de chiffrement à l'écriture ET plus de référence « /Encrypt » dans le fichier (pdf-lib la laisse sinon). */
export function clearProtection(doc: PDFDocument): void {
  registry.delete(doc);
  delete doc.context.trailerInfo.Encrypt;
}

/** Le document `to` (créé à partir de pages de `from`) hérite de sa protection, s'il n'en a pas déjà une. */
export function inheritProtection(to: PDFDocument, from: PDFDocument): void {
  const p = registry.get(from);
  if (!p) return;
  const cur = registry.get(to);
  if (!cur) return void registry.set(to, p);
  // Plusieurs sources protégées (fusion) : le résultat garde un mot de passe d'ouverture s'il y en a un, et les restrictions de toutes.
  registry.set(to, { password: cur.password || p.password, permissions: intersect(cur.permissions, p.permissions) });
}

const level = (v: Permissions['printing']) => (v === 'highResolution' || v === true ? 2 : v === 'lowResolution' ? 1 : 0);

function intersect(a: Permissions, b: Permissions): Permissions {
  const and = (x?: boolean, y?: boolean) => !!x && !!y;
  const printing = Math.min(level(a.printing), level(b.printing));
  return {
    printing: printing === 2 ? 'highResolution' : printing === 1 ? 'lowResolution' : false,
    modifying: and(a.modifying, b.modifying),
    copying: and(a.copying, b.copying),
    annotating: and(a.annotating, b.annotating),
    fillingForms: and(a.fillingForms, b.fillingForms),
    contentAccessibility: and(a.contentAccessibility, b.contentAccessibility),
    documentAssembly: and(a.documentAssembly, b.documentAssembly),
  };
}

/** Si /P est illisible : on préfère trop restreindre que lever des restrictions sans le savoir. */
export const RESTRICTIVE: Permissions = { printing: false, modifying: false, copying: false, annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false };

export const ALL_ALLOWED: Permissions = { printing: 'highResolution', modifying: true, copying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true };

const unrestricted = (p: Permissions) => level(p.printing) === 2 && !!p.modifying && !!p.copying && !!p.annotating && !!p.fillingForms && !!p.contentAccessibility && !!p.documentAssembly;

/** Décode la valeur /P d'un dictionnaire de chiffrement (entier signé de 32 bits) en autorisations. */
export function permissionsFromP(p: number): Permissions {
  const bit = (n: number) => (p & (1 << (n - 1))) !== 0;
  return {
    printing: bit(3) ? (bit(12) ? 'highResolution' : 'lowResolution') : false,
    modifying: bit(4),
    copying: bit(5),
    annotating: bit(6),
    fillingForms: bit(9),
    contentAccessibility: bit(10),
    documentAssembly: bit(11),
  };
}

/** Mot de passe propriétaire aléatoire : l'ancien est inconnu ; les restrictions restent donc imposées aux lecteurs. */
function randomOwnerPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * pdf-lib ne chiffre que les chaînes situées directement dans un objet INDIRECT. Celles qui sont dans un dictionnaire ou un
 * tableau DIRECT imbriqué (action d'un lien « /A << /URI (…) >> », arbre des noms des pièces jointes…) restent en clair dans
 * le fichier protégé et deviennent illisibles pour les autres lecteurs. Avant de chiffrer, on rend donc indirects tous les
 * dictionnaires et tableaux imbriqués qui contiennent une chaîne (la relecture, elle, déchiffre correctement les imbriqués).
 */
const hasString = (v: unknown): boolean => {
  if (v instanceof PDFString || v instanceof PDFHexString) return true;
  if (v instanceof PDFDict) return v.entries().some(([, x]) => hasString(x));
  if (v instanceof PDFArray) return v.asArray().some(hasString);
  return false; // les flux sont chiffrés tels quels, les références n'ont pas de chaîne
};

function hoistStrings(doc: PDFDocument, parent: PDFDict | PDFArray): void {
  const lift = (child: unknown): PDFRef | undefined => {
    if (!(child instanceof PDFDict || child instanceof PDFArray) || !hasString(child)) return undefined;
    hoistStrings(doc, child); // d'abord ses propres enfants
    return doc.context.register(child);
  };
  if (parent instanceof PDFArray) {
    for (let i = 0; i < parent.size(); i++) {
      const ref = lift(parent.get(i));
      if (ref) parent.set(i, ref);
    }
    return;
  }
  for (const [key, value] of parent.entries()) {
    const ref = lift(value);
    if (ref) parent.set(key, ref);
  }
}

function hoistNestedStrings(doc: PDFDocument): void {
  for (const [, obj] of [...doc.context.enumerateIndirectObjects()]) {
    if (obj instanceof PDFDict || obj instanceof PDFArray) hoistStrings(doc, obj);
  }
}

/** Enregistre le document, protégé comme à l'ouverture le cas échéant. Chiffrement AES-256. */
export async function saveDoc(doc: PDFDocument): Promise<Uint8Array> {
  const p = registry.get(doc);
  if (p) {
    hoistNestedStrings(doc);
    doc.encrypt({
      userPassword: p.password,
      // Propriétaire inconnu. Sans restriction, le mot de passe d'ouverture sert aussi de propriétaire (rien à protéger de plus) ;
      // avec des restrictions, un propriétaire aléatoire les garde effectives : connaître le mot de passe d'ouverture ne les lève pas.
      ownerPassword: p.ownerPassword ?? (p.password && unrestricted(p.permissions) ? p.password : randomOwnerPassword()),
      permissions: p.permissions,
    });
  }
  // updateFieldAppearances: false : pdf-lib redessinerait sinon tous les champs de formulaire existants (polices, mise en forme)
  return doc.save({ updateFieldAppearances: false });
}
