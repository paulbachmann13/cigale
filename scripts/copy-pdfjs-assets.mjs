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
