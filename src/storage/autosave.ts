import { idbDelete, idbGet, idbSet } from './idb';

/** Sauvegarde automatique : le travail non enregistré est gardé sur cet ordinateur (IndexedDB) et proposé à la réouverture. */
export interface Draft {
  id: string;
  name: string;
  size: number;
  at: number;
}

const INDEX = 'drafts-index';
/** Au-delà, on ne sauvegarde pas automatiquement (trop lourd pour le stockage du navigateur). */
export const MAX_DRAFT_BYTES = 150 * 1024 * 1024;

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export const newDraftId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function listDrafts(): Promise<Draft[]> {
  return (await idbGet<Draft[]>(INDEX).catch(() => undefined)) ?? [];
}

export const saveDraft = (id: string, name: string, bytes: Uint8Array): Promise<void> =>
  serial(async () => {
    if (bytes.length > MAX_DRAFT_BYTES) return;
    await idbSet(`draft:${id}`, bytes.slice());
    const others = (await listDrafts()).filter((d) => d.id !== id);
    await idbSet(INDEX, [{ id, name, size: bytes.length, at: Date.now() }, ...others]);
  });

export const deleteDraft = (id: string): Promise<void> =>
  serial(async () => {
    await idbDelete(`draft:${id}`).catch(() => undefined);
    await idbSet(INDEX, (await listDrafts()).filter((d) => d.id !== id));
  });

export const readDraft = (id: string): Promise<Uint8Array | undefined> => idbGet<Uint8Array>(`draft:${id}`).catch(() => undefined);
