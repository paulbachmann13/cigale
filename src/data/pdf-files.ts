/** Détection et classement des erreurs à l'ouverture (pur, testé). */

/** Un PDF commence par « %PDF- » dans ses 1 024 premiers octets (les lecteurs tolèrent du texte avant). */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 1024);
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d];
  for (let i = 0; i + sig.length <= n; i++) {
    let ok = true;
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export type OpenErrorKind = 'password' | 'invalid' | 'unsupportedEncryption' | 'unknown';

/** Range une exception de pdf.js (reconnue par son nom : les classes ne survivent pas au worker). */
export function classifyPdfError(err: unknown): OpenErrorKind {
  const e = err as { name?: string; message?: string } | null;
  const name = e?.name ?? '';
  const msg = e?.message ?? '';
  if (name === 'PasswordException') return 'password';
  if (name === 'InvalidPDFException' || name === 'MissingPDFException' || name === 'FormatError') return 'invalid';
  if (/unsupported.*(encrypt|security handler)|encryption.*(unsupported|not supported)/i.test(msg)) return 'unsupportedEncryption';
  return 'unknown';
}
