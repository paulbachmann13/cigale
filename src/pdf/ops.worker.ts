/// <reference lib="webworker" />
import type { Range } from '../data/page-ranges';
import { type MergeOptions, type MergeSource, type Part, mergeSources, splitDocument, topLevelBookmarks, zipParts } from './doc-ops';
import type { Annot, AnnotDraft, AnnotPatch } from '../data/annotations';
import { type AddResult, addAnnotations, deleteAnnotations, listAnnotations, updateAnnotation } from './annot-ops';
import { type Inspection, type OpResult, type PageOp, applyOp, extractPages, inspect, normalizeDocument } from './page-ops';

export type WorkerRequest =
  | { kind: 'apply'; bytes: Uint8Array; op: PageOp; password?: string; expectedPages?: number }
  | { kind: 'extract'; bytes: Uint8Array; pages: number[]; password?: string; expectedPages?: number }
  | { kind: 'inspect'; bytes: Uint8Array; password?: string }
  | { kind: 'normalize'; bytes: Uint8Array; password?: string }
  | { kind: 'merge'; sources: MergeSource[]; options: MergeOptions }
  | { kind: 'split'; bytes: Uint8Array; ranges: Range[]; names: string[]; password?: string; expectedPages?: number }
  | { kind: 'zip'; parts: Part[] }
  | { kind: 'bookmarks'; bytes: Uint8Array; password?: string }
  | { kind: 'annotList'; bytes: Uint8Array; password?: string; expectedPages?: number }
  | { kind: 'annotAdd'; bytes: Uint8Array; drafts: AnnotDraft[]; password?: string; expectedPages?: number; author: string }
  | { kind: 'annotUpdate'; bytes: Uint8Array; id: string; patch: AnnotPatch; password?: string; expectedPages?: number }
  | { kind: 'annotDelete'; bytes: Uint8Array; ids: string[]; password?: string; expectedPages?: number };

export type MergeResult = { bytes: Uint8Array; pageCount: number };

export type WorkerResponse =
  | { ok: true; result: OpResult | MergeResult | Part[] | Uint8Array | Inspection | AddResult | Annot[] | { title: string; page: number }[] }
  | { ok: false; error: string; name: string; file?: string }
  | { progress: number };

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
const buffers = (...arrays: Uint8Array[]) => arrays.map((a) => a.buffer as ArrayBuffer);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const progress = (fraction: number) => post({ progress: fraction });
  try {
    switch (req.kind) {
      case 'apply': {
        const result = await applyOp(req.bytes, req.op, req.password, req.expectedPages);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'extract': {
        const bytes = await extractPages(req.bytes, req.pages, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'normalize': {
        const bytes = await normalizeDocument(req.bytes, req.password);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'merge': {
        const result = await mergeSources(req.sources, req.options, progress);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'split': {
        const parts = await splitDocument(req.bytes, req.ranges, req.names, req.password, req.expectedPages, progress);
        return post({ ok: true, result: parts }, buffers(...parts.map((p) => p.bytes)));
      }
      case 'zip': {
        const zip = zipParts(req.parts);
        return post({ ok: true, result: zip }, buffers(zip));
      }
      case 'bookmarks':
        return post({ ok: true, result: await topLevelBookmarks(req.bytes, req.password) });
      case 'annotList':
        return post({ ok: true, result: await listAnnotations(req.bytes, req.password, req.expectedPages) });
      case 'annotAdd': {
        const result = await addAnnotations(req.bytes, req.drafts, req.password, req.expectedPages, req.author);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'annotUpdate': {
        const bytes = await updateAnnotation(req.bytes, req.id, req.patch, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'annotDelete': {
        const bytes = await deleteAnnotations(req.bytes, req.ids, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'inspect':
        return post({ ok: true, result: await inspect(req.bytes, req.password) });
    }
  } catch (err) {
    const error = err as Error & { file?: string };
    post({ ok: false, error: String(error?.message ?? err), name: error?.name ?? 'Error', file: error.file });
  }
};
