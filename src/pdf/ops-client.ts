/**
 * Côté interface : lance une opération dans un Web Worker (l'écran ne se fige pas) et permet de l'annuler
 * (le worker est simplement arrêté : le document n'est jamais modifié tant que le résultat n'est pas adopté).
 */
import type { Annot, AnnotDraft, AnnotPatch } from '../data/annotations';
import type { Range } from '../data/page-ranges';
import type { AddResult } from './annot-ops';
import type { FillResult, FormValue } from './form-ops';
import type { MergeOptions, MergeSource, Part } from './doc-ops';
import type { MergeResult, WorkerRequest, WorkerResponse } from './ops.worker';
import type { Inspection, OpResult, PageOp } from './page-ops';

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

export interface OpHandle<T> {
  promise: Promise<T>;
  cancel: () => void;
}

function run<T>(req: WorkerRequest, onProgress?: (fraction: number) => void): OpHandle<T> {
  const worker = new Worker(new URL('./ops.worker.ts', import.meta.url), { type: 'module' });
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    reject = rej;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const data = e.data;
      if ('progress' in data) return onProgress?.(data.progress);
      worker.terminate();
      if (data.ok) res(data.result as T);
      else {
        const err = new Error(data.error) as Error & { file?: string };
        err.name = data.name;
        err.file = data.file;
        rej(err);
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      rej(new Error(e.message || 'Erreur du traitement'));
    };
  });
  // postMessage copie les données (clonage structuré) : les octets de l'interface (annuler/rétablir) restent intacts.
  worker.postMessage(req);
  return {
    promise,
    cancel: () => {
      worker.terminate();
      reject(new Cancelled());
    },
  };
}

export const applyOperation = (bytes: Uint8Array, op: PageOp, password?: string, expectedPages?: number) => run<OpResult>({ kind: 'apply', bytes, op, password, expectedPages });
export const extractOperation = (bytes: Uint8Array, pages: number[], password?: string, expectedPages?: number) => run<Uint8Array>({ kind: 'extract', bytes, pages, password, expectedPages });
export const inspectDocument = (bytes: Uint8Array, password?: string) => run<Inspection>({ kind: 'inspect', bytes, password });
export const normalizeOperation = (bytes: Uint8Array, password?: string) => run<Uint8Array>({ kind: 'normalize', bytes, password });
export const mergeOperation = (sources: MergeSource[], options: MergeOptions, onProgress?: (f: number) => void) => run<MergeResult>({ kind: 'merge', sources, options }, onProgress);
export const splitOperation = (bytes: Uint8Array, ranges: Range[], names: string[], password?: string, expectedPages?: number, onProgress?: (f: number) => void) =>
  run<Part[]>({ kind: 'split', bytes, ranges, names, password, expectedPages }, onProgress);
export const zipOperation = (parts: Part[]) => run<Uint8Array>({ kind: 'zip', parts });
export const bookmarksOperation = (bytes: Uint8Array, password?: string) => run<{ title: string; page: number }[]>({ kind: 'bookmarks', bytes, password });

export const listAnnotationsOp = (bytes: Uint8Array, password?: string, expectedPages?: number) => run<Annot[]>({ kind: 'annotList', bytes, password, expectedPages });
export const addAnnotationsOp = (bytes: Uint8Array, drafts: AnnotDraft[], password: string | undefined, expectedPages: number, author: string) => run<AddResult>({ kind: 'annotAdd', bytes, drafts, password, expectedPages, author });
export const updateAnnotationOp = (bytes: Uint8Array, id: string, patch: AnnotPatch, password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'annotUpdate', bytes, id, patch, password, expectedPages });
export const deleteAnnotationsOp = (bytes: Uint8Array, ids: string[], password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'annotDelete', bytes, ids, password, expectedPages });
export const fillFormOp = (bytes: Uint8Array, values: FormValue[], password: string | undefined, expectedPages: number) => run<FillResult>({ kind: 'formFill', bytes, values, password, expectedPages });
