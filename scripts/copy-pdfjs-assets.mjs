// Copie les ressources de pdf.js (polices, cartes de caractères, wasm) dans public/pdfjs/,
// pour qu'elles soient servies par l'app et mises en cache hors ligne (aucun CDN).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const src = (p) => fileURLToPath(new URL(`node_modules/pdfjs-dist/${p}`, root));
const dst = fileURLToPath(new URL('public/pdfjs/', root));

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) cpSync(src(dir), `${dst}${dir}`, { recursive: true });
// icônes des annotations (seulement celles-là : on ne charge rien depuis l'extérieur)
cpSync(src('web/images'), `${dst}images`, { recursive: true, filter: (f) => !f.includes('.') || /annotation-[a-z-]+\.svg$/.test(f) });

// Reconnaissance de texte (OCR) : tesseract.js, son cœur WebAssembly (LSTM + SIMD) et les données
// français et anglais (« best_int ») → public/ocr/. Tout est local : aucune requête vers un CDN.
const nm = (p) => fileURLToPath(new URL(`node_modules/${p}`, root));
const ocr = fileURLToPath(new URL('public/ocr/', root));
rmSync(ocr, { recursive: true, force: true });
mkdirSync(ocr, { recursive: true });
cpSync(nm('tesseract.js/dist/worker.min.js'), `${ocr}worker.min.js`);
cpSync(nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'), `${ocr}tesseract-core-simd-lstm.wasm.js`);
for (const lang of ['fra', 'eng']) cpSync(nm(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`), `${ocr}${lang}.traineddata.gz`);
