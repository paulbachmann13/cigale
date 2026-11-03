import { idbDelete, idbGet, idbSet } from './idb';

/** Signatures enregistrées pour les réutiliser (PNG sur cet ordinateur, jamais envoyées ailleurs). */
export interface SignatureInfo {
  id: string;
  at: number;
  width: number;
  height: number;
}

const INDEX = 'signatures-index';
export const MAX_SIGNATURES = 6;

export async function listSignatures(): Promise<SignatureInfo[]> {
  return (await idbGet<SignatureInfo[]>(INDEX).catch(() => undefined)) ?? [];
}

export async function saveSignature(png: Uint8Array, width: number, height: number): Promise<void> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await idbSet(`sig:${id}`, png.slice());
  const list = [{ id, at: Date.now(), width, height }, ...(await listSignatures())];
  await idbSet(INDEX, list.slice(0, MAX_SIGNATURES));
  for (const old of list.slice(MAX_SIGNATURES)) await idbDelete(`sig:${old.id}`).catch(() => undefined);
}

export const readSignature = (id: string): Promise<Uint8Array | undefined> => idbGet<Uint8Array>(`sig:${id}`).catch(() => undefined);

export async function deleteSignature(id: string): Promise<void> {
  await idbDelete(`sig:${id}`).catch(() => undefined);
  await idbSet(INDEX, (await listSignatures()).filter((s) => s.id !== id));
}
