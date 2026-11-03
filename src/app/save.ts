/** Écriture des fichiers : enregistrement sur place (File System Access) avec vérification, ou téléchargement. */

type SavePicker = (opts: unknown) => Promise<FileSystemFileHandle>;
type WithPermission = { queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string> };

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Demande (si besoin) l'autorisation d'écrire. Doit être appelé pendant un geste de l'utilisateur. */
export async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const p = handle as unknown as WithPermission;
  const opts = { mode: 'readwrite' };
  let state = (await p.queryPermission?.(opts)) ?? 'granted';
  if (state !== 'granted') state = (await p.requestPermission?.(opts)) ?? 'denied';
  return state === 'granted';
}

/**
 * Écrit puis relit le fichier pour vérifier que ce qui est sur le disque est exactement ce qu'on voulait écrire.
 * `createWritable` travaille sur un fichier temporaire et ne remplace l'original qu'à `close()` : une panne en cours
 * d'écriture laisse l'original intact.
 */
export async function writeVerified(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<boolean> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes.slice());
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => undefined);
    throw err;
  }
  const back = new Uint8Array(await (await handle.getFile()).arrayBuffer());
  return back.length === bytes.length && (await sha256(back)) === (await sha256(bytes));
}

/** Boîte « Enregistrer sous ». `undefined` : le navigateur n'en a pas ; `null` : annulée. */
export async function pickSaveHandle(suggestedName: string): Promise<FileSystemFileHandle | null | undefined> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (!picker) return undefined;
  try {
    return await picker({ suggestedName, types: [{ description: 'Documents PDF', accept: { 'application/pdf': ['.pdf'] } }] });
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return null;
    throw err;
  }
}

export function downloadBytes(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function withPdfExtension(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
