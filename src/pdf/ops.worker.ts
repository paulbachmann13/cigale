/// <reference lib="webworker" />
import { type Inspection, type OpResult, type PageOp, applyOp, extractPages, inspect, normalizeDocument } from './page-ops';

export type WorkerRequest =
  | { kind: 'apply'; bytes: Uint8Array; op: PageOp; password?: string }
  | { kind: 'extract'; bytes: Uint8Array; pages: number[]; password?: string }
  | { kind: 'inspect'; bytes: Uint8Array; password?: string }
  | { kind: 'normalize'; bytes: Uint8Array; password?: string };

export type WorkerResponse =
  | { ok: true; result: OpResult | Uint8Array | Inspection }
  | { ok: false; error: string; name: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'apply') {
      const result = await applyOp(req.bytes, req.op, req.password);
      (self as unknown as Worker).postMessage({ ok: true, result } satisfies WorkerResponse, [result.bytes.buffer as ArrayBuffer]);
    } else if (req.kind === 'extract') {
      const bytes = await extractPages(req.bytes, req.pages, req.password);
      (self as unknown as Worker).postMessage({ ok: true, result: bytes } satisfies WorkerResponse, [bytes.buffer as ArrayBuffer]);
    } else if (req.kind === 'normalize') {
      const bytes = await normalizeDocument(req.bytes, req.password);
      (self as unknown as Worker).postMessage({ ok: true, result: bytes } satisfies WorkerResponse, [bytes.buffer as ArrayBuffer]);
    } else {
      (self as unknown as Worker).postMessage({ ok: true, result: await inspect(req.bytes, req.password) } satisfies WorkerResponse);
    }
  } catch (err) {
    const error = err as Error;
    (self as unknown as Worker).postMessage({ ok: false, error: String(error?.message ?? err), name: error?.name ?? 'Error' } satisfies WorkerResponse);
  }
};
