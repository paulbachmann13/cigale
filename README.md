# Cigale

Éditeur PDF **local et gratuit**, pour remplacer Adobe Acrobat Pro au quotidien : lire, organiser, fusionner, découper et annoter.
Application web installable (PWA), **100 % locale**, en français, qui fonctionne **hors ligne**. Vos documents ne quittent jamais votre ordinateur.

Site : https://paulbachmann13.github.io/cigale/ — même philosophie que [Grillon](https://github.com/paulbachmann13/grillon).

## État

Version 0.4.0 (étapes 2 à 4) : ouvrir et afficher (onglets, miniatures, signets, zoom, recherche, PDF chiffrés), **organiser les pages**
(pivoter, supprimer, dupliquer, déplacer, insérer, extraire, vue grille), **annuler/rétablir** et **enregistrer** (⌘S vérifié, version précédente gardée), **combiner** des PDF et des images, **diviser** (plages, tous les N, signets, .zip), **commenter** (surlignage, notes, zones de texte, dessin, formes, tampons, panneau Commentaires avec réponses). Les étapes suivantes
(durcissement 1.0, application Mac) sont décrites dans [docs/PLAN.md](docs/PLAN.md) ; l'état détaillé et les limites dans
[docs/FONCTIONNALITES.md](docs/FONCTIONNALITES.md) ; la comparaison avec Acrobat dans [docs/ACROBAT-COMPARAISON.md](docs/ACROBAT-COMPARAISON.md).

## Installer l'application (PWA)

- **Chrome ou Edge (Mac, Windows)** : ouvrez le site, puis l'icône « Installer » dans la barre d'adresse (ou ⋮ → « Installer Cigale »).
  Cigale apparaît alors comme une application et peut s'ouvrir directement depuis un PDF (« Ouvrir avec »).
- **Safari (Mac)** : Fichier → « Ajouter au Dock ». **iPhone / iPad** : bouton Partager → « Sur l'écran d'accueil ».
- Après la première visite, tout fonctionne sans connexion.

## Développer

```bash
npm install
npm run dev            # http://localhost:5173
npm run typecheck
npm test               # Vitest (unitaires)
npm run fixtures       # génère les PDF de test dans tests/fixtures/out/
npm run test:e2e       # Playwright sur le build de production (Chromium + WebKit iPad)
npm run build
```

Avant de pousser : `npm run typecheck && npm test && npm run fixtures && npm run test:e2e`.
Les licences sont listées dans [NOTICE](NOTICE) ; la CI refuse toute dépendance GPL / AGPL.
