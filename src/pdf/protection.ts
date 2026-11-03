/**
 * Protection par mot de passe : pdf-lib DÉCHIFFRE à l'ouverture et n'écrit plus de chiffrement à l'enregistrement.
 * Sans précaution, modifier un PDF protégé le rendrait lisible par tous. On retient donc, pour chaque document ouvert
 * avec mot de passe, ce qu'il faut pour le protéger de nouveau (même mot de passe d'ouverture, mêmes restrictions) :
 * `saveDoc` remplace `doc.save()` partout.
 */
import type { PDFDocument } from '@cantoo/pdf-lib';

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
}

const registry = new WeakMap<PDFDocument, Protection>();

export const getProtection = (doc: PDFDocument): Protection | undefined => registry.get(doc);
export const setProtection = (doc: PDFDocument, p: Protection): void => void registry.set(doc, p);

/** Le document `to` (créé à partir de pages de `from`) hérite de sa protection, s'il n'en a pas déjà une. */
export function inheritProtection(to: PDFDocument, from: PDFDocument): void {
  const p = registry.get(from);
  if (p && !registry.has(to)) registry.set(to, p);
}

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

/** Enregistre le document, protégé comme à l'ouverture le cas échéant. Chiffrement AES-256. */
export async function saveDoc(doc: PDFDocument): Promise<Uint8Array> {
  const p = registry.get(doc);
  if (p) {
    doc.encrypt({
      userPassword: p.password,
      // Ouvert avec le mot de passe d'ouverture : on ne connaît pas le propriétaire. S'il n'y a pas de mot de passe
      // d'ouverture (restrictions seules), un propriétaire aléatoire garde les restrictions effectives.
      ownerPassword: p.password || randomOwnerPassword(),
      permissions: p.permissions,
    });
  }
  // updateFieldAppearances: false : pdf-lib redessinerait sinon tous les champs de formulaire existants (polices, mise en forme)
  return doc.save({ updateFieldAppearances: false });
}
