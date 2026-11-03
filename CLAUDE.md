# Cigale — consignes pour Claude Code

Cigale est un **éditeur PDF local et gratuit** qui remplace Adobe Acrobat Pro au quotidien. PWA (puis application Mac Tauri),
interface **en français**, 100 % locale, hors ligne. Dépôt public : paulbachmann13/cigale — site : https://paulbachmann13.github.io/cigale/
Même philosophie que Grillon (paulbachmann13/grillon) dont on reprend les conventions.

## Façon de travailler (préférences de Paul)

- **Parler français** ; textes de l'interface uniquement dans `src/i18n/fr.ts` (jamais en dur ailleurs).
- **Autonomie** : décider, noter la décision dans `docs/ARCHITECTURE.md`, avancer. Ne demander que si une décision bloque vraiment.
- **Acrobat est la référence** (ergonomie, disposition, raccourcis, comportement). `docs/ACROBAT-COMPARAISON.md` = feuille de route. Ne reprendre ni code, ni logo, ni icônes d'Adobe.
- **Fiabilité d'abord** : ne jamais perdre ni abîmer un document. Toute opération produit un nouveau document en mémoire ; l'original n'est écrasé que par un enregistrement explicite. Préserver ce qu'on ne comprend pas (XMP, pièces jointes, signets, liens, calques, formulaires) ou avertir AVANT.
- **Licences** : Apache-2.0 / MIT / BSD / ISC uniquement. Jamais GPL/AGPL (MuPDF, Ghostscript…), jamais de paquet « Pro ». Lister dans `NOTICE` ; `npm run check:licenses` tourne en CI. Vérifier version, maintenance et licence avant d'adopter une bibliothèque ; ne jamais inventer d'API (lire les types installés dans `node_modules`).
- **Confidentialité** : documents d'entreprise confidentiels. Aucune requête réseau avec des données, CSP stricte (`vite.config.ts`), aucune télémétrie.
- Traitements lourds dans des Web Workers, avec progression et Annuler ; l'interface ne se fige jamais.
- Le `CHANGELOG.md` est **lu par Paul dans l'application** (Nouveautés) : phrases simples, sans jargon. Une entrée `## [X.Y.Z] — AAAA-MM-JJ` pour la version de `package.json` est obligatoire (testée), avec `### Ajouté` / `### Corrigé` / `### Modifié`.
- Fin d'étape : tests verts, CHANGELOG, `docs/FONCTIONNALITES.md` (limites connues), `docs/ACROBAT-COMPARAISON.md`, `docs/VERIFICATION-MANUELLE.md`, ce fichier, déploiement, puis **résumé en 5 lignes maximum** à Paul. Ne jamais dire « terminé » sans avoir lancé les tests ET vu l'appli réelle (Playwright, captures).
- **Commits** : Conventional Commits en français (`feat:`, `fix:`, `test:`, `docs:`, `ci:`). Pousser sur `main` : la CI déploie sur GitHub Pages si les tests passent.
- Versions des dépendances **figées** (sans `^`).

## Commandes

```bash
npm install
npm run dev            # http://localhost:5173 (copie d'abord les ressources pdf.js dans public/pdfjs/)
npm run typecheck
npm test               # Vitest (src/data)
npm run fixtures       # PDF de test → tests/fixtures/out/ (non versionné)
npm run test:e2e       # Playwright sur le build de production sous /cigale/ ; Chromium + WebKit iPad (smoke)
npm run build          # build de production
npm run check:licenses
```

Avant de pousser : `npm run typecheck && npm test && npm run fixtures && npm run test:e2e`.
Les tests e2e tournent sur le **build de production** : pas d'import dynamique de `/src/...` ; utiliser `window.cigale.app` (exposé par `src/main.ts`).
Un `vite preview` déjà lancé sur le port 4173 est réutilisé par Playwright (reconstruire `dist` avant : `CIGALE_BASE=/cigale/ npm run build`).

## Architecture (voir docs/ARCHITECTURE.md)

`src/data/` logique pure testée · `src/pdf/` pdf.js (engine, DocView) · `src/app/` interface (App, home, miniatures, signets, dialogues) · `src/storage/` récents · `scripts/` fixtures et ressources pdf.js.

## Pièges connus

- **pdfjs-dist 6.x** : pas d'option `isEvalSupported` ; le worker se charge via `pdfjs-dist/build/pdf.worker.min.mjs?url` ; les composants du visualiseur sont dans `pdfjs-dist/web/pdf_viewer.mjs` (+ `pdf_viewer.css`). Les ressources (cmaps, polices, wasm, icc) sont copiées dans `public/pdfjs/` (gitignoré) par `scripts/copy-pdfjs-assets.mjs`.
- `PDFViewer` doit être créé dans un conteneur **déjà visible** (sinon « offsetParent is not set — cannot scroll » et pages absentes) : `DocView` reçoit son parent et l'application affiche l'espace de travail avant.
- pdf.js transfère le tampon au worker : on lui passe une copie (`bytes.slice()`) ; `Session.bytes` garde l'original intact.
- Les erreurs de pdf.js se reconnaissent par `err.name` (`PasswordException`, `InvalidPDFException`…), pas par `instanceof`.
- Raccourcis : AZERTY — utiliser `e.code` pour les chiffres (⌘0/1/2), `e.key` et `e.code` pour + et −. ⌘⇧R = rotation (⇧⌘+ est ambigu sur AZERTY).
- `@cantoo/pdf-lib` (fork maintenu de pdf-lib, MIT) pour modifier les PDF (à partir de l'étape 2) ; pas d'API de signets : écrire `/Outlines` à la main (voir `scripts/make-fixtures.ts`).
- Le chemin de base est `/cigale/` sur GitHub Pages (`CIGALE_BASE`), `/` en local.

## Feuille de route

1 Socle ✔ · 2 Organiser les pages + enregistrer · 3 Fusionner et découper · 4 Annotations + panneau Commentaires · 5 Durcissement (v1.0) · 6 Formulaires, signature, caviardage réel, OCR, compression, protection, filigrane, comparaison, conversions, app Mac Tauri. Détail dans `docs/PLAN.md`.

## Pas encore vérifié (à faire à la main, voir docs/VERIFICATION-MANUELLE.md)

- Rendu comparé à Aperçu et à Acrobat avec de vrais scans manuscrits ; Safari (macOS) et iPad réel (tactile : pincer, Apple Pencil).
- Installation PWA et « Ouvrir avec » depuis le Finder.
