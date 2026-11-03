import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// GitHub Pages sert l'app sous /cigale/ ; en local on reste à la racine.
const base = process.env.CIGALE_BASE ?? '/';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Politique de sécurité stricte : tout vient de l'app elle-même, aucune requête vers l'extérieur.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  worker: { format: 'es' },
  plugins: [
    {
      // La CSP n'est posée qu'au build : le serveur de développement a besoin de scripts en ligne.
      name: 'cigale-csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Cigale — éditeur PDF',
        short_name: 'Cigale',
        description: 'Éditeur PDF local et gratuit : lire, organiser, fusionner et annoter, hors ligne.',
        lang: 'fr',
        theme_color: '#b4532a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [{ action: '.', accept: { 'application/pdf': ['.pdf'] } }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2,wasm,pfb,ttf,bcmap,icc}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: { include: ['tests/unit/**/*.test.ts'], testTimeout: 120_000 },
});
