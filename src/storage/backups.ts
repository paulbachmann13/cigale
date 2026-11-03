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

export async function addBackup(name: string, bytes: Uint8Array): Promise<void> {
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

export async function deleteBackup(id: string): Promise<void> {
  await idbDelete(`backup:${id}`).catch(() => undefined);
  await idbSet(INDEX, (await listBackups()).filter((b) => b.id !== id));
}
