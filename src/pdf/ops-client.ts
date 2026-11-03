/**
 * Côté interface : lance une opération dans un Web Worker (l'écran ne se fige pas) et permet de l'annuler
 * (le worker est simplement arrêté : le document n'est jamais modifié tant que le résultat n'est pas adopté).
 */
import type { Inspection, OpResult, PageOp } from './page-ops';
import type { WorkerRequest, WorkerResponse } from './ops.worker';

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

function run<T>(req: WorkerRequest): OpHandle<T> {
  const worker = new Worker(new URL('./ops.worker.ts', import.meta.url), { type: 'module' });
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    reject = rej;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (e.data.ok) res(e.data.result as T);
      else {
        const err = new Error(e.data.error);
        err.name = e.data.name;
        rej(err);
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      rej(new Error(e.message || 'Erreur du traitement'));
    };
  });
  // `bytes` est copié : l'original (annuler/rétablir) reste intact dans l'interface.
  worker.postMessage({ ...req, bytes: req.bytes.slice() });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      reject(new Cancelled());
    },
  };
}

export const applyOperation = (bytes: Uint8Array, op: PageOp, password?: string) => run<OpResult>({ kind: 'apply', bytes, op, password });
export const extractOperation = (bytes: Uint8Array, pages: number[], password?: string) => run<Uint8Array>({ kind: 'extract', bytes, pages, password });
export const inspectDocument = (bytes: Uint8Array, password?: string) => run<Inspection>({ kind: 'inspect', bytes, password });
export const normalizeOperation = (bytes: Uint8Array, password?: string) => run<Uint8Array>({ kind: 'normalize', bytes, password });
