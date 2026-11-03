/** Protéger un PDF par mot de passe, ou retirer sa protection. Chiffrement AES-256. Logique pure : octets → octets. */
import { PageOpError, loadForEdit, pruneUnreachable } from './page-ops';
import { type Permissions, clearProtection, getProtection, saveDoc, setProtection } from './protection';

export interface ProtectOptions {
  /** Mot de passe d'ouverture (vide : le document s'ouvre sans mot de passe, seules les restrictions s'appliquent). */
  userPassword: string;
  /** Mot de passe propriétaire (lève les restrictions). Obligatoire s'il y a des restrictions. */
  ownerPassword: string;
  permissions: Permissions;
}

export interface ProtectResult {
  bytes: Uint8Array;
  /** Vrai si le document était protégé avant l'opération. */
  wasProtected: boolean;
}

/** Protège le document (remplace l'éventuelle protection actuelle). */
export async function protectDocument(bytes: Uint8Array, opts: ProtectOptions, password?: string, expectedPages?: number): Promise<ProtectResult> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new PageOpError('structure');
  const wasProtected = getProtection(doc) !== undefined;
  const restricted = Object.values(opts.permissions).some((v) => v === false);
  if (!opts.userPassword && !restricted) throw new PageOpError('keepOne'); // ni mot de passe ni restriction : rien à protéger
  setProtection(doc, { password: opts.userPassword, ownerPassword: opts.ownerPassword || undefined, permissions: opts.permissions });
  pruneUnreachable(doc); // l'ancien dictionnaire de chiffrement et l'ancienne table des références ne restent pas dans le fichier
  return { bytes: await saveDoc(doc), wasProtected };
}

/** Retire la protection : le document s'ouvrira sans mot de passe et sans restriction. */
export async function unprotectDocument(bytes: Uint8Array, password?: string, expectedPages?: number): Promise<ProtectResult> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new PageOpError('structure');
  const wasProtected = getProtection(doc) !== undefined;
  clearProtection(doc);
  pruneUnreachable(doc); // sans cela, l'ancien dictionnaire de chiffrement (et l'ancienne table des références qui le cite) resteraient dans le fichier
  return { bytes: await saveDoc(doc), wasProtected };
}
