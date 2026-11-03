import { idbDelete, idbGet, idbSet } from './idb';

/** Versions précédentes : avant d'écraser un fichier, on garde l'ancien contenu sur cet ordinateur (IndexedDB). */
export interface BackupInfo {
  id: string;
  name: string;
  size: number;
  at: number;
}

const INDEX = 'backups-index';
export const MAX_BACKUPS = 5;

export async function listBackups(): Promise<BackupInfo[]> {
  return (await idbGet<BackupInfo[]>(INDEX).catch(() => undefined)) ?? [];
}

let chain: Promise<unknown> = Promise.resolve();
/** Les modifications de l'index se font l'une après l'autre (deux enregistrements rapprochés ne s'écrasent pas). */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export const addBackup = (name: string, bytes: Uint8Array) => serial(() => addBackupNow(name, bytes));
export const deleteBackup = (id: string) => serial(() => deleteBackupNow(id));

async function addBackupNow(name: string, bytes: Uint8Array): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await idbSet(`backup:${id}`, bytes.slice());
  const list = [{ id, name, size: bytes.length, at: Date.now() }, ...(await listBackups())];
  const kept = list.slice(0, MAX_BACKUPS);
  await idbSet(INDEX, kept);
  for (const old of list.slice(MAX_BACKUPS)) await idbDelete(`backup:${old.id}`).catch(() => undefined);
}

export async function readBackup(id: string): Promise<Uint8Array | undefined> {
  return idbGet<Uint8Array>(`backup:${id}`).catch(() => undefined);
}

async function deleteBackupNow(id: string): Promise<void> {
  await idbDelete(`backup:${id}`).catch(() => undefined);
  await idbSet(INDEX, (await listBackups()).filter((b) => b.id !== id));
}
