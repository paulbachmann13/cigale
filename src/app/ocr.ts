/**
 * Reconnaître le texte (OCR) : chaque page est rendue en image par pdf.js, lue par tesseract.js
 * (WebAssembly, dans son propre Web Worker), puis une couche de texte invisible est ajoutée
 * au document par `Editing.ocrLayer` (opération annulable, dans le worker des opérations).
 * Tout est local : le moteur et les données de langue sont servis par l'app (public/ocr/).
 */
import { fmt, t } from '../i18n/fr';
import type { OcrLine, OcrPage } from '../pdf/ocr-ops';
import { modal } from './dialogs';
import { h, toast } from './dom';
import type { Editing } from './editing';
import { scopeControls } from './page-tools';
import type { Session } from './session';

export type OcrLang = 'fra+eng' | 'fra' | 'eng';

/** Résolution de lecture : 300 dpi, plafonnée pour les très grandes pages. */
const DPI = 300;
const MAX_PIXELS = 2 ** 24;
/** En dessous de cette confiance (0–100), le mot est considéré comme du bruit. */
const MIN_CONFIDENCE = 20;

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

/** Adresse absolue d'une ressource OCR servie par l'app. */
function asset(name: string): string {
  return new URL(`${import.meta.env.BASE_URL}ocr/${name}`, location.href).href;
}

async function createOcrWorker(lang: OcrLang, onProgress: (p: number) => void): Promise<TesseractWorker> {
  const { createWorker, OEM } = await import('tesseract.js');
  return createWorker(lang.split('+'), OEM.LSTM_ONLY, {
    workerPath: asset('worker.min.js'),
    corePath: asset('tesseract-core-simd-lstm.wasm.js'),
    langPath: new URL(`${import.meta.env.BASE_URL}ocr`, location.href).href,
    workerBlobURL: false, // pas de blob: le worker est un fichier de l'app
    cacheMethod: 'none', // le service worker met déjà ces fichiers en cache ; rien dans IndexedDB
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(m.progress);
    },
  });
}

export function openOcrDialog(s: Session, editing: Editing, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void): void {
  const lang = h('select', { id: 'ocr-lang' }, ...(Object.keys(t.docTools.ocrLangs) as OcrLang[]).map((k) => h('option', { value: k }, t.docTools.ocrLangs[k])));
  const skip = h('input', { type: 'checkbox', id: 'ocr-skip', checked: true });
  const error = h('p', { class: 'dialog-error', id: 'ocr-error', role: 'alert' });
  const scope = scopeControls(s, error);
  modal((close) => [
    h('h2', {}, t.docTools.ocrTitle),
    h('p', { class: 'hint' }, t.docTools.ocrHint),
    h('label', { class: 'form-row' }, t.docTools.ocrLang, lang),
    scope.el,
    h('label', { class: 'check' }, skip, t.docTools.ocrSkip),
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'tool-cancel', onclick: close }, t.docTools.cancel),
      h(
        'button',
        {
          type: 'button',
          id: 'tool-apply',
          class: 'primary',
          onclick: () => {
            const pages = scope.read();
            if (pages === null) return;
            close();
            const list = pages ?? Array.from({ length: s.view.pageCount }, (_, i) => i);
            void editing.flushForm(s).then(() => runOcr(s, editing, list, lang.value as OcrLang, skip.checked, overlay, idle));
          },
        },
        t.docTools.ocrGo,
      ),
    ),
  ]).id = 'dialog-ocr';
}

/** La page contient-elle déjà du texte (document numérique ou déjà reconnu) ? */
async function hasText(s: Session, index: number): Promise<boolean> {
  const page = await s.view.pdf.getPage(index + 1);
  const content = await page.getTextContent();
  return content.items.some((it) => 'str' in it && it.str.trim() !== '');
}

async function runOcr(s: Session, editing: Editing, pages: number[], lang: OcrLang, skipText: boolean, overlay: (text: string, onCancel: () => void) => (f: number) => void, idle: () => void) {
  let cancelled = false;
  let worker: TesseractWorker | undefined;
  const stop = () => {
    const w = worker;
    worker = undefined;
    void w?.terminate().catch(() => undefined);
  };
  // Annuler rend la main tout de suite ; la suite du traitement est abandonnée (et ne touche plus l'interface).
  const progress = overlay(t.docTools.ocrLoading, () => {
    cancelled = true;
    idle();
    stop();
  });
  const done = () => !cancelled && (idle(), true);
  const setText = (text: string) => {
    const el = document.querySelector('.loading-box p');
    if (el && !cancelled) el.textContent = text;
  };
  try {
    const todo: number[] = [];
    for (const i of [...new Set(pages)].sort((a, b) => a - b)) {
      if (cancelled) return;
      if (!skipText || !(await hasText(s, i))) todo.push(i);
    }
    if (todo.length === 0) return void (done() && toast(t.docTools.ocrNothing));
    let k = 0;
    worker = await createOcrWorker(lang, (p) => !cancelled && progress((k + p) / todo.length));
    const results: OcrPage[] = [];
    for (const index of todo) {
      if (cancelled) return;
      setText(fmt(t.docTools.ocrProgress, { k: k + 1, n: todo.length }));
      results.push(await recognizePage(s, worker!, index));
      k++;
      progress(k / todo.length);
    }
    stop();
    if (!done()) return;
    const found = results.filter((p) => p.lines.length > 0);
    if (found.length === 0) return void toast(t.docTools.ocrNoText);
    if (await editing.ocrLayer(s, found)) toast(fmt(t.docTools.ocrDone, { n: found.length }));
  } catch (err) {
    if (done()) toast(fmt(t.docTools.failed, { detail: String((err as Error)?.message ?? err) }));
  } finally {
    // dans tous les cas (fin, erreur, annulation pendant le chargement) : plus aucun worker OCR
    stop();
  }
}

async function recognizePage(s: Session, worker: TesseractWorker, index: number): Promise<OcrPage> {
  const page = await s.view.pdf.getPage(index + 1);
  const b = page.getViewport({ scale: 1 });
  const scale = Math.min(DPI / 72, Math.sqrt(MAX_PIXELS / (b.width * b.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  try {
    // Contenu de la page seulement : les commentaires ont déjà leur propre texte.
    await page.render({ canvas, viewport, annotationMode: 0 }).promise;
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    const lines: OcrLine[] = [];
    for (const block of data.blocks ?? [])
      for (const para of block.paragraphs)
        for (const line of para.lines) {
          const words = line.words
            .filter((w) => w.text.trim() !== '' && w.confidence >= MIN_CONFIDENCE)
            .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
          if (words.length) lines.push({ words });
        }
    return { index, imageWidth: canvas.width, imageHeight: canvas.height, lines };
  } finally {
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
}
