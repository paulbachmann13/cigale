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

## Décisions de l'étape 2 (organiser et enregistrer)

- **Modèle de document = octets.** Chaque opération prend les octets courants et en produit de nouveaux (`src/pdf/page-ops.ts`, pur, testé sous Node) ; l'affichage est rechargé depuis ces octets. Simple, sûr (un document n'est jamais « à moitié modifié »), et l'historique annuler/rétablir n'est qu'une pile d'octets (`src/data/history.ts`, plafond 400 Mo).
- **Web Worker par opération** (`ops.worker.ts`, `ops-client.ts`) : l'interface ne se fige pas ; Annuler = on arrête le worker ; le document n'est adopté qu'après avoir été rouvert avec succès dans pdf.js et avec le bon nombre de pages. Les opérations sont **sérialisées** (file d'attente) pour que ⌘Z maintenu ne crée pas d'états mélangés.
- **Garde-fou de structure** : pdf-lib et pdf.js doivent compter le même nombre de pages avant toute modification (pdf-lib ignore une page sans `/Type`, ce qui ferait supprimer la mauvaise page).
- **Purge des pages supprimées** (`pruneUnreachable`) : pdf-lib ne retire que la référence dans l'arbre des pages ; le contenu resterait dans le fichier. On repart de la racine et on ne garde que ce qui est atteignable ; les références vers une page supprimée (signets, liens, champs de formulaire posés dessus) ne sont pas suivies.
- **Déplacement** : l'arbre des pages est aplati en une seule liste (après avoir recopié dans chaque page ses attributs hérités : taille, rotation, ressources) ; `removePage`/`insertPage` de pdf-lib casse l'arbre quand il est vidé.
- **`updateMetadata: false`** partout : pdf-lib écraserait sinon le producteur, le créateur et les dates.
- **Chiffrement** : un document ouvert avec mot de passe reste chiffré avec le même mot de passe après modification (vérifié par `qpdf --check`).
- **Enregistrer** : `createWritable()` (fichier temporaire, remplacement à `close()`), puis relecture et comparaison SHA-256. Le nom et le « handle » de la session ne changent qu'après un enregistrement réussi. **Pas de `.bak` voisin** (un navigateur n'écrit que le fichier choisi) : l'ancienne version est gardée dans IndexedDB (5 dernières, réglage), téléchargeable depuis l'accueil.
- **Sans API de fichiers** (Safari, Firefox) : « Enregistrer » télécharge une copie et le dit.
- **Interface alignée sur Grillon** : barre du haut à 36 px avec le bouton « Fichier » plein couleur et son menu déroulant, accueil à colonne colorée et tuiles ; mêmes neutres (blanc, gris froids), couleur propre à Cigale (terracotta) pour que les applis se reconnaissent comme une famille.
- **Tests de contrôle** : `qpdf --check` sur chaque opération et sur un enchaînement de 20 (ignoré si qpdf est absent ; la CI l'installe), rendu identique au pixel des pages non touchées, texte et signets relus par pdf.js, enregistrement testé avec de vrais `FileSystemFileHandle` (OPFS).

## Licences

Voir `NOTICE`. Contrôlé en CI (aucune licence GPL/AGPL dans les dépendances de production).

## Tests

- Unitaires (Vitest, Node) pour `src/data/`.
- e2e (Playwright) sur le **build de production** servi sous `/cigale/` (comme Pages), Chromium (+ WebKit iPad pour la fumée).
- `npm run fixtures` génère `tests/fixtures/out/` (jamais versionné).
