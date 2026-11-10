/**
 * Côté interface : lance une opération dans un Web Worker (l'écran ne se fige pas) et permet de l'annuler
 * (le worker est simplement arrêté : le document n'est jamais modifié tant que le résultat n'est pas adopté).
 */
import type { NotebookOptions } from './notebook-ops';
import type { Annot, AnnotDraft, AnnotPatch } from '../data/annotations';
import type { Range } from '../data/page-ranges';
import type { AddResult, Marks } from './annot-ops';
import type { InkPage } from './ink-ops';
import type { CropMargins, CropResult } from './crop-ops';
import type { FillResult, FormValue } from './form-ops';
import type { ProtectOptions, ProtectResult } from './protect-ops';
import type { RedactOptions, RedactResult, RedactedPage } from './redact-ops';
import type { HeaderFooterOptions, WatermarkOptions } from './stamp-ops';
import type { OcrPage } from './ocr-ops';
import type { RegionRect } from './region-ops';
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
export const notebookOp = (options: NotebookOptions) => run<Uint8Array>({ kind: 'notebook', options });
export const mergeOperation = (sources: MergeSource[], options: MergeOptions, onProgress?: (f: number) => void) => run<MergeResult>({ kind: 'merge', sources, options }, onProgress);
export const splitOperation = (bytes: Uint8Array, ranges: Range[], names: string[], password?: string, expectedPages?: number, onProgress?: (f: number) => void) =>
  run<Part[]>({ kind: 'split', bytes, ranges, names, password, expectedPages }, onProgress);
export const zipOperation = (parts: Part[]) => run<Uint8Array>({ kind: 'zip', parts });
export const bookmarksOperation = (bytes: Uint8Array, password?: string) => run<{ title: string; page: number }[]>({ kind: 'bookmarks', bytes, password });

export const listMarksOp = (bytes: Uint8Array, password?: string, expectedPages?: number) => run<Marks>({ kind: 'marks', bytes, password, expectedPages });
export const setInkOp = (bytes: Uint8Array, pages: InkPage[], password: string | undefined, expectedPages: number, author: string) => run<Uint8Array>({ kind: 'inkSet', bytes, pages, password, expectedPages, author });
export const normalizeInkOp = (bytes: Uint8Array, password?: string) => run<Uint8Array>({ kind: 'inkNormalize', bytes, password });
export const listAnnotationsOp = (bytes: Uint8Array, password?: string, expectedPages?: number) => run<Annot[]>({ kind: 'annotList', bytes, password, expectedPages });
export const addAnnotationsOp = (bytes: Uint8Array, drafts: AnnotDraft[], password: string | undefined, expectedPages: number, author: string) => run<AddResult>({ kind: 'annotAdd', bytes, drafts, password, expectedPages, author });
export const updateAnnotationsOp = (bytes: Uint8Array, items: { id: string; patch: AnnotPatch }[], password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'annotUpdateMany', bytes, items, password, expectedPages });
export const updateAnnotationOp = (bytes: Uint8Array, id: string, patch: AnnotPatch, password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'annotUpdate', bytes, id, patch, password, expectedPages });
export const deleteAnnotationsOp = (bytes: Uint8Array, ids: string[], password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'annotDelete', bytes, ids, password, expectedPages });
export const fillFormOp = (bytes: Uint8Array, values: FormValue[], password: string | undefined, expectedPages: number) => run<FillResult>({ kind: 'formFill', bytes, values, password, expectedPages });
export const ocrLayerOp = (bytes: Uint8Array, pages: OcrPage[], password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'ocrLayer', bytes, pages, password, expectedPages });
export const watermarkOp = (bytes: Uint8Array, options: WatermarkOptions, password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'watermark', bytes, options, password, expectedPages });
export const headerFooterOp = (bytes: Uint8Array, options: HeaderFooterOptions, password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'headerFooter', bytes, options, password, expectedPages });
export const regionOp = (bytes: Uint8Array, page: number, rect: RegionRect, password: string | undefined, expectedPages: number) => run<Uint8Array>({ kind: 'region', bytes, page, rect, password, expectedPages });
export const regionImageOp = (png: Uint8Array, widthPt: number, heightPt: number) => run<Uint8Array>({ kind: 'regionImage', png, widthPt, heightPt });
export const cropOp = (bytes: Uint8Array, margins: CropMargins, pages: number[] | undefined, password: string | undefined, expectedPages: number) => run<CropResult>({ kind: 'crop', bytes, margins, pages, password, expectedPages });
export const redactOp = (bytes: Uint8Array, pages: RedactedPage[], options: RedactOptions, password: string | undefined, expectedPages: number) => run<RedactResult>({ kind: 'redact', bytes, pages, options, password, expectedPages });
export const protectOp = (bytes: Uint8Array, options: ProtectOptions, password: string | undefined, expectedPages: number) => run<ProtectResult>({ kind: 'protect', bytes, options, password, expectedPages });
export const unprotectOp = (bytes: Uint8Array, password: string | undefined, expectedPages: number) => run<ProtectResult>({ kind: 'unprotect', bytes, password, expectedPages });
