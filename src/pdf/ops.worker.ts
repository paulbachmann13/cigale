/// <reference lib="webworker" />
import type { Range } from '../data/page-ranges';
import { type MergeOptions, type MergeSource, type Part, mergeSources, splitDocument, topLevelBookmarks, zipParts } from './doc-ops';
import type { Annot, AnnotDraft, AnnotPatch } from '../data/annotations';
import { type ProtectOptions, type ProtectResult, protectDocument, unprotectDocument } from './protect-ops';
import { type CropMargins, type CropResult, cropPages } from './crop-ops';
import { type RedactOptions, type RedactResult, type RedactedPage, applyRedactions } from './redact-ops';
import { type HeaderFooterOptions, type WatermarkOptions, addHeaderFooter, addWatermark } from './stamp-ops';
import { type OcrPage, addTextLayer } from './ocr-ops';
import { type RegionRect, extractRegion, regionImagePdf } from './region-ops';
import { type FillResult, type FormValue, fillForm } from './form-ops';
import { type NotebookOptions, createNotebook } from './notebook-ops';
import { type AddResult, type Marks, addAnnotations, deleteAnnotations, listAnnotations, listMarks, updateAnnotation, updateAnnotations } from './annot-ops';
import { type InkPage, normalizeInk, setInk } from './ink-ops';
import { type Inspection, type OpResult, type PageOp, applyOp, extractPages, inspect, normalizeDocument } from './page-ops';

export type WorkerRequest =
  | { kind: 'apply'; bytes: Uint8Array; op: PageOp; password?: string; expectedPages?: number }
  | { kind: 'extract'; bytes: Uint8Array; pages: number[]; password?: string; expectedPages?: number }
  | { kind: 'inspect'; bytes: Uint8Array; password?: string }
  | { kind: 'normalize'; bytes: Uint8Array; password?: string }
  | { kind: 'merge'; sources: MergeSource[]; options: MergeOptions }
  | { kind: 'notebook'; options: NotebookOptions }
  | { kind: 'split'; bytes: Uint8Array; ranges: Range[]; names: string[]; password?: string; expectedPages?: number }
  | { kind: 'zip'; parts: Part[] }
  | { kind: 'bookmarks'; bytes: Uint8Array; password?: string }
  | { kind: 'annotList'; bytes: Uint8Array; password?: string; expectedPages?: number }
  | { kind: 'marks'; bytes: Uint8Array; password?: string; expectedPages?: number }
  | { kind: 'inkSet'; bytes: Uint8Array; pages: InkPage[]; password?: string; expectedPages?: number; author?: string }
  | { kind: 'inkNormalize'; bytes: Uint8Array; password?: string }
  | { kind: 'annotAdd'; bytes: Uint8Array; drafts: AnnotDraft[]; password?: string; expectedPages?: number; author: string }
  | { kind: 'annotUpdate'; bytes: Uint8Array; id: string; patch: AnnotPatch; password?: string; expectedPages?: number }
  | { kind: 'annotUpdateMany'; bytes: Uint8Array; items: { id: string; patch: AnnotPatch }[]; password?: string; expectedPages?: number }
  | { kind: 'formFill'; bytes: Uint8Array; values: FormValue[]; password?: string; expectedPages?: number }
  | { kind: 'watermark'; bytes: Uint8Array; options: WatermarkOptions; password?: string; expectedPages?: number }
  | { kind: 'region'; bytes: Uint8Array; page: number; rect: RegionRect; password?: string; expectedPages?: number }
  | { kind: 'regionImage'; png: Uint8Array; widthPt: number; heightPt: number }
  | { kind: 'ocrLayer'; bytes: Uint8Array; pages: OcrPage[]; password?: string; expectedPages?: number }
  | { kind: 'headerFooter'; bytes: Uint8Array; options: HeaderFooterOptions; password?: string; expectedPages?: number }
  | { kind: 'crop'; bytes: Uint8Array; margins: CropMargins; pages?: number[]; password?: string; expectedPages?: number }
  | { kind: 'redact'; bytes: Uint8Array; pages: RedactedPage[]; options: RedactOptions; password?: string; expectedPages?: number }
  | { kind: 'protect'; bytes: Uint8Array; options: ProtectOptions; password?: string; expectedPages?: number }
  | { kind: 'unprotect'; bytes: Uint8Array; password?: string; expectedPages?: number }
  | { kind: 'annotDelete'; bytes: Uint8Array; ids: string[]; password?: string; expectedPages?: number };

export type MergeResult = { bytes: Uint8Array; pageCount: number };

export type WorkerResponse =
  | { ok: true; result: OpResult | MergeResult | Part[] | Uint8Array | Inspection | AddResult | FillResult | CropResult | RedactResult | ProtectResult | Marks | Annot[] | { title: string; page: number }[] }
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
      case 'notebook': {
        const bytes = await createNotebook(req.options);
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
      case 'marks':
        return post({ ok: true, result: await listMarks(req.bytes, req.password, req.expectedPages) });
      case 'inkSet': {
        const bytes = await setInk(req.bytes, req.pages, req.password, req.expectedPages, req.author);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'inkNormalize': {
        const bytes = await normalizeInk(req.bytes, req.password);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'annotAdd': {
        const result = await addAnnotations(req.bytes, req.drafts, req.password, req.expectedPages, req.author);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'annotUpdate': {
        const bytes = await updateAnnotation(req.bytes, req.id, req.patch, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'annotUpdateMany': {
        const bytes = await updateAnnotations(req.bytes, req.items, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'formFill': {
        const result = await fillForm(req.bytes, req.values, req.password, req.expectedPages);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'watermark': {
        const bytes = await addWatermark(req.bytes, req.options, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'ocrLayer': {
        const bytes = await addTextLayer(req.bytes, req.pages, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'headerFooter': {
        const bytes = await addHeaderFooter(req.bytes, req.options, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'region': {
        const bytes = await extractRegion(req.bytes, req.page, req.rect, req.password, req.expectedPages);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'regionImage': {
        const bytes = await regionImagePdf(req.png, req.widthPt, req.heightPt);
        return post({ ok: true, result: bytes }, buffers(bytes));
      }
      case 'crop': {
        const result = await cropPages(req.bytes, req.margins, req.pages, req.password, req.expectedPages);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'redact': {
        const result = await applyRedactions(req.bytes, req.pages, req.options, req.password, req.expectedPages);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'protect': {
        const result = await protectDocument(req.bytes, req.options, req.password, req.expectedPages);
        return post({ ok: true, result }, buffers(result.bytes));
      }
      case 'unprotect': {
        const result = await unprotectDocument(req.bytes, req.password, req.expectedPages);
        return post({ ok: true, result }, buffers(result.bytes));
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
