/**
 * Fichiers dans l'application Mac (Tauri) : boîtes de dialogue natives, écriture atomique du fichier d'origine
 * et vraie copie « .bak » à côté. Les modules @tauri-apps ne sont chargés que dans l'application de bureau.
 *
 * Le reste de l'appli manipule un « handle » à la manière de l'API File System Access (getFile / createWritable) :
 * on en fabrique un qui lit et écrit un chemin du disque.
 */

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface TauriFileHandle {
  kind: 'file';
  name: string;
  /** Chemin sur le disque (sert aussi à retrouver le fichier après un redémarrage). */
  path: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}

export const baseName = (path: string): string => path.split('/').pop() || path;

interface AtomicFs {
  writeFile(path: string, data: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Fichier temporaire à côté de l'original (même disque : le renommage est instantané). Pas de point au début : les autorisations de Tauri refusent les fichiers cachés. */
export const tempPathFor = (path: string): string => `${path}.cigale-tmp`;
export const backupPathFor = (path: string): string => `${path}.bak`;

/**
 * Écrit d'abord une copie complète à côté, puis la renomme sur l'original : si Cigale est coupée ou si le disque est plein
 * pendant l'écriture, l'ancien fichier reste intact. Jamais de repli en écriture directe : un disque plein tronquerait l'original.
 */
export async function writeAtomic(path: string, data: Uint8Array, fs: AtomicFs): Promise<void> {
  const tmp = tempPathFor(path);
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, path);
  } catch (e) {
    await fs.remove(tmp).catch(() => undefined);
    throw e;
  }
}

export function tauriHandleFromPath(path: string): FileSystemFileHandle {
  const name = baseName(path);
  const handle: TauriFileHandle = {
    kind: 'file',
    name,
    path,
    async getFile() {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      return new File([(await readFile(path)) as BlobPart], name);
    },
    async createWritable() {
      let out: Uint8Array | null = null;
      return {
        async write(data) {
          out = data;
        },
        async close() {
          if (!out) throw new Error('rien à écrire');
          await writeAtomic(path, out, await import('@tauri-apps/plugin-fs'));
        },
        async abort() {
          out = null;
        },
      };
    },
  };
  return handle as unknown as FileSystemFileHandle;
}

export const pathOfHandle = (handle: FileSystemFileHandle | undefined): string | undefined => (handle as unknown as Partial<TauriFileHandle> | undefined)?.path;

/** Copie le fichier actuel en « nom.pdf.bak » (écrase le .bak précédent) avant de le remplacer. */
export async function writeBackupCopy(path: string): Promise<void> {
  const { copyFile, exists } = await import('@tauri-apps/plugin-fs');
  if (await exists(path)) await copyFile(path, backupPathFor(path));
}

const PDF_FILTER = [{ name: 'Documents PDF', extensions: ['pdf'] }];
const IMAGE_FILTER = [{ name: 'PDF et images', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'] }];

export async function tauriPickOpen(multiple: boolean, withImages = false): Promise<FileSystemFileHandle[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const res = await open({ multiple, directory: false, filters: withImages ? IMAGE_FILTER : PDF_FILTER });
  const paths = res === null ? [] : Array.isArray(res) ? res : [res];
  return paths.map(tauriHandleFromPath);
}

/** Boîte « Enregistrer sous » native. Renvoie null si l'utilisateur annule. */
export async function tauriPickSave(defaultPath: string, filters = PDF_FILTER): Promise<FileSystemFileHandle | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath, filters });
  return path ? tauriHandleFromPath(path) : null;
}

/** « Télécharger » dans l'application Mac : boîte « Enregistrer sous », puis écriture du fichier. */
export async function tauriSaveBytes(name: string, bytes: Uint8Array, ext: string): Promise<boolean> {
  const handle = await tauriPickSave(name, [{ name: ext.toUpperCase(), extensions: [ext] }]);
  if (!handle) return false;
  const w = await handle.createWritable();
  await w.write(bytes.slice());
  await w.close();
  return true;
}

/** Fichiers demandés par le Finder avant le démarrage de l'interface. */
export async function takeStartupOpens(): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('take_pending_opens');
}

/** Fichiers ouverts par le Finder pendant que Cigale tourne. Renvoie la fonction qui arrête l'écoute. */
export async function onFinderOpen(cb: (paths: string[]) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<string[]>('cigale://open', (e) => cb(e.payload));
}

/** Demande à la fenêtre de se fermer (déjà confirmé par l'utilisateur). */
export async function destroyWindow(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().destroy();
}

/** Appelle `cb` quand l'utilisateur ferme la fenêtre (⌘W, bouton rouge, ⌘Q) ; `cb` peut empêcher la fermeture. */
export async function onCloseRequested(cb: (prevent: () => void) => Promise<void> | void): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().onCloseRequested(async (event) => {
    await cb(() => event.preventDefault());
  });
}
