import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const assets = `${import.meta.env.BASE_URL}pdfjs/`;

export interface LoadHandlers {
  /** Appelé quand le document est chiffré ; renvoie le mot de passe, ou null pour annuler. */
  password: (incorrect: boolean) => Promise<string | null>;
  onProgress?: (fraction: number) => void;
}

export interface LoadHandle {
  promise: Promise<PDFDocumentProxy>;
  cancel: () => void;
}

/** Ouvre un PDF depuis des octets. `bytes` n'est pas consommé : pdf.js travaille sur une copie. */
export function loadPdf(bytes: Uint8Array, handlers: LoadHandlers): LoadHandle {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
    enableXfa: false,
  });
  task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
    if (total) handlers.onProgress?.(loaded / total);
  };
  task.onPassword = (update: (pw: string) => void, reason: number) => {
    const incorrect = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    void handlers.password(incorrect).then((pw) => {
      if (pw === null) void task.destroy();
      else update(pw);
    });
  };
  return { promise: task.promise, cancel: () => void task.destroy() };
}

export { pdfjs };
