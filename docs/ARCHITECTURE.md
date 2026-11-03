# Architecture de Cigale

## Vue d'ensemble

Application web statique (Vite + TypeScript, sans framework), installable (PWA), qui tourne entièrement dans le navigateur.
Hébergée sur GitHub Pages (`/cigale/`) ; une application Mac Tauri suivra.

```
src/
  main.ts            point d'entrée (thème, App, service worker) ; expose window.cigale pour les tests e2e
  i18n/fr.ts         tous les textes de l'interface (jamais en dur ailleurs) + fmt()
  data/              logique pure, sans DOM, testée (zoom, récents, changelog, détection de PDF/erreurs)
  pdf/engine.ts      ouverture via pdf.js (worker, mot de passe, annulation, ressources locales)
  pdf/viewer.ts      DocView : PDFViewer de pdf.js (défilement, zoom, texte, recherche) pour un onglet
  app/               interface : App (onglets, barre d'outils, raccourcis), home, miniatures, signets, dialogues
  storage/           récents (localStorage + IndexedDB pour les « handles » de fichiers)
scripts/             copie des ressources pdf.js, génération des PDF de test
tests/unit, e2e, fixtures/out (générées)
```

## Décisions

- **pdf.js + ses composants `pdf_viewer.mjs`** pour l'affichage : on ne réécrit pas le défilement, la couche de texte ni la recherche.
  `pdfjs-dist` 6.x (nouvelle version majeure) : `isEvalSupported` n'existe plus ; le worker est servi par Vite (`?url`).
- **Ressources pdf.js locales** (`public/pdfjs/` copié depuis `node_modules` par `scripts/copy-pdfjs-assets.mjs`, non versionné) :
  cartes de caractères, polices standard, wasm (JBIG2, JPEG 2000, couleurs). Rien n'est chargé depuis un CDN.
- **Un `DocView` par onglet**, chacun avec son `PDFViewer` ; seul l'onglet actif est visible. L'original (`Session.bytes`) n'est jamais modifié.
- **Miniatures maison** : dessinées à la demande (IntersectionObserver) et libérées quand elles sortent de l'écran.
- **CSP stricte posée au build** (`vite.config.ts`) : `default-src 'self'`, workers `self`/`blob:`, `wasm-unsafe-eval` pour les décodeurs wasm,
  aucun `connect-src` externe. Le test e2e vérifie qu'aucune requête ne sort de `localhost`.
- **Hors-ligne** : service worker (Workbox, précache de tout, wasm et polices compris, ≈ 5 Mo). Mise à jour sur confirmation (toast).
- **Raccourcis AZERTY** : les touches de zoom utilisent `key` ET `code` ; ⌘0/1/2 = page / taille réelle / largeur (comme Acrobat) via `code` (chiffres non décalés sur AZERTY).
  Rotation de l'affichage : ⌘⇧R (⇧⌘+ d'Acrobat est ambigu sur AZERTY où « + » demande déjà Maj).
- **Pincer pour zoomer** : événements tactiles (2 doigts) et Ctrl + molette (pavé tactile), via `PDFViewer.updateScale`.

## Licences

Voir `NOTICE`. Contrôlé en CI (aucune licence GPL/AGPL dans les dépendances de production).

## Tests

- Unitaires (Vitest, Node) pour `src/data/`.
- e2e (Playwright) sur le **build de production** servi sous `/cigale/` (comme Pages), Chromium (+ WebKit iPad pour la fumée).
- `npm run fixtures` génère `tests/fixtures/out/` (jamais versionné).
