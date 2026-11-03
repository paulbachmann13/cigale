# Plan de Cigale

Cigale est un éditeur PDF **local et gratuit** (PWA, puis application Mac Tauri) qui vise à remplacer Adobe Acrobat Pro
pour l'usage quotidien : lire, organiser, fusionner, découper et annoter. Interface en français. Aucune donnée ne quitte
l'ordinateur.

## Principes

1. **Ne jamais perdre ni abîmer un document.** Toute opération produit un nouveau document en mémoire ; l'original n'est
   écrasé que par un enregistrement explicite. Ce qu'on ne comprend pas est préservé ; sinon on avertit **avant**.
2. **Confidentialité.** Aucune requête réseau avec des données, CSP stricte, pas de télémétrie, hors-ligne par service worker.
3. **Licences permissives uniquement** (Apache-2.0, MIT, BSD, ISC). Jamais GPL/AGPL (MuPDF, Ghostscript…), jamais de « Pro ».
4. **Interface jamais figée.** Les traitements lourds sont dans des Web Workers, avec progression et bouton Annuler.
5. **Vérifier avant d'affirmer.** Tests unitaires + e2e sur le build de production, et contrôles automatiques de PDF.

## Bibliothèques (vérifiées le 2026-11-03)

| Rôle | Choix | Version | Licence | Justification |
|---|---|---|---|---|
| Affichage | **pdf.js** (`pdfjs-dist`) | 6.5.438 | Apache-2.0 | Référence ; worker intégré ; composants du visualiseur (`pdf_viewer.mjs`) : défilement continu, zoom, couche de texte, recherche avec surlignage, liens, modes de page. Maintenu activement (publié le 1er nov. 2026). |
| Modification | **@cantoo/pdf-lib** | 2.11.1 | MIT | `pdf-lib` d'origine n'a plus de publication depuis mai 2022. Le fork de Cantoo est maintenu (sept. 2026), compatible, et ajoute le chiffrement. |
| Archives (ZIP) | **fflate** | 0.8.3 | MIT | Rapide, sans dépendance, utilisable en worker. `jszip` est « MIT ou GPL » : écarté pour éviter toute ambiguïté. |
| Outillage | Vite 8, TypeScript 7, Vitest 5, Playwright 1.64, vite-plugin-pwa 2 | figées | MIT / Apache-2.0 | Mêmes conventions que Grillon. |
| Plus tard | qpdf (WebAssembly), Tesseract.js, HEIC (décodeur à choisir : `heic-decode` ISC ; `libheif-js` est LGPL, écarté) | — | — | À revérifier au moment de l'étape. |

Pas de framework d'interface : TypeScript + DOM, comme l'écran d'accueil de Grillon, pour rester léger et testable.

## Étapes

1. ✔ **Socle** — dépôt, Vite + TypeScript, CI, PWA, accueil, ouverture et affichage, miniatures, signets, zoom, recherche, tests, déploiement.
2. ✔ **Organiser les pages** (réordonner, pivoter, supprimer, dupliquer, insérer, extraire) et **enregistrer** (⌘S vérifié, version précédente, annuler/rétablir).
3. ✔ **Fusionner et découper** (plages, images, signets conservés, export en lot zip).
4. ✔ **Annotations** (vraies annotations PDF avec apparences) et panneau Commentaires.
5. ✔ **Durcissement** : corpus de tests, performances, PDF cassés ou chiffrés, sauvegarde automatique, limites. **Version 1.0.**
6. **1.x** (✔ 1.1 : formulaires, signature image, caviardage réel, filigrane, en-têtes et numérotation, recadrage, export en images ; protection par mot de passe ; reste : OCR, compression, comparaison, signature numérique, édition de texte limitée) : formulaires, signature, caviardage réel, OCR, compression, protection, en-têtes/pieds, recadrage, comparaison, conversions, édition de texte limitée.
7. ✔ **Application Mac (Tauri, installation par .dmg)** comme Grillon : même structure (`src-tauri/`, workflow `mac.yml` sur GitHub Actions), vrai `.bak` à côté du fichier, associations de fichiers PDF, mises à jour. À placer après l'étape 5 (v1.0), ou plus tôt si Paul le demande.

## Contrôles automatiques de fiabilité (à partir de l'étape 2)

Pour chaque opération qui produit un PDF : (1) se rouvre dans pdf.js sans erreur ; (2) `qpdf --check` ; (3) rendu des pages
non modifiées identique (pixels) ; (4) texte extrait inchangé ; (5) signets et liens présents ; (6) annotations relues à l'identique.

## Performances visées (mesurées et consignées dans docs/PERFORMANCES.md)

Première page d'un PDF de 500 pages < 2 s ; défilement fluide ; fusion de 10 × 100 pages < 10 s ; mémoire maîtrisée.
