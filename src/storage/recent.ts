import { type RecentEntry, addRecent, parseRecents, removeRecent } from '../data/recent';
import { pathOfHandle, tauriHandleFromPath } from '../app/tauri-files';
import { idbClear, idbDelete, idbGet, idbSet } from './idb';

const KEY = 'cigale-recents';

export function loadRecents(): RecentEntry[] {
  try {
    return parseRecents(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

function save(list: RecentEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : la liste ne sera simplement pas gardée */
  }
}

/** Mémorise le fichier ; le « handle » (Chrome, Edge) permet de le rouvrir sans repasser par le sélecteur. */
export async function rememberFile(name: string, size: number, handle?: FileSystemFileHandle): Promise<void> {
  const id = `${name}:${size}`;
  save(addRecent(loadRecents(), { id, name, size, openedAt: Date.now() }));
  if (handle) {
    try {
      // Application Mac : on garde le chemin (le « handle » maison n'est pas stockable)
      const path = pathOfHandle(handle);
      await idbSet(`handle:${id}`, path ?? handle);
    } catch {
      /* ignoré */
    }
  }
}

export async function forgetRecent(id: string): Promise<void> {
  save(removeRecent(loadRecents(), id));
  await idbDelete(`handle:${id}`).catch(() => undefined);
}

export async function clearRecents(): Promise<void> {
  save([]);
  await idbClear().catch(() => undefined);
}

export async function recentHandle(id: string): Promise<FileSystemFileHandle | undefined> {
  const stored = await idbGet<FileSystemFileHandle | string>(`handle:${id}`).catch(() => undefined);
  return typeof stored === 'string' ? tauriHandleFromPath(stored) : stored;
}
