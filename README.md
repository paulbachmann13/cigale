# Cigale

Éditeur PDF **local et gratuit**, pour remplacer Adobe Acrobat Pro au quotidien : lire, organiser, fusionner, découper et annoter.
Application web installable (PWA), **100 % locale**, en français, qui fonctionne **hors ligne**. Vos documents ne quittent jamais votre ordinateur.

Site : https://paulbachmann13.github.io/cigale/ — même philosophie que [Grillon](https://github.com/paulbachmann13/grillon).

## Ce que fait Cigale

- **Lire** : onglets, miniatures, signets, zoom, recherche, PDF protégés par mot de passe.
- **Organiser** : pivoter, supprimer, dupliquer, déplacer, extraire, **insérer des pages** (papier uni, ligné, quadrillé, Seyès…, copie d'une page, pages d'un autre PDF), annuler / rétablir, enregistrement sûr (version précédente gardée, copie `.bak` dans l'application).
- **Assembler** : combiner des PDF et des images, diviser (plages, tous les N, signets, `.zip`), extraire une zone d'une page en nouveau PDF.
- **Écrire à la main** (bouton « Stylet ») : stylo, plume à pression (Apple Pencil), surligneur, gomme, formes parfaites en maintenant le stylet, règle, lasso ; **carnets** (nouveau document sur papier uni, ligné, quadrillé, pointillé, Seyès, Cornell, musique, millimétré ou liste à cocher) ; images collées ou ajoutées.
- **Commenter et remplir** : surlignage, notes, zones de texte, formes, tampons, signature, formulaires, panneau Commentaires avec réponses.
- **Protéger et nettoyer** : mot de passe, **caviardage réel** (le texte disparaît vraiment du fichier), filigrane, en-têtes et pieds de page, recadrage, reconnaissance de texte (OCR) locale, export en images.

Tout se passe sur votre ordinateur, hors ligne : aucun document n'est envoyé nulle part, aucune télémétrie.
Le détail et les limites connues sont dans [docs/FONCTIONNALITES.md](docs/FONCTIONNALITES.md) ; la comparaison avec Acrobat dans
[docs/ACROBAT-COMPARAISON.md](docs/ACROBAT-COMPARAISON.md) ; la feuille de route dans [docs/PLAN.md](docs/PLAN.md) ; l'historique des versions dans [CHANGELOG.md](CHANGELOG.md).

## Application Mac (.dmg)

Téléchargez le `.dmg` dans les [Releases](https://github.com/paulbachmann13/cigale/releases) (ou dans GitHub → Actions → « Application Mac et Windows »), ouvrez-le et glissez Cigale dans Applications. Application non signée : au premier lancement, clic droit sur Cigale → Ouvrir.

## Application Windows (.exe)

Téléchargez `Cigale_…_x64-setup.exe` dans les [Releases](https://github.com/paulbachmann13/cigale/releases) et lancez-le (aucun droit d'administrateur nécessaire). Application non signée : au premier lancement, « Windows a protégé votre ordinateur » → *Informations complémentaires* → *Exécuter quand même*. Les mises à jour se font ensuite toutes seules (bouton « Version » ou Fichier → Rechercher les mises à jour).

## Installer l'application (PWA)

- **Chrome ou Edge (Mac, Windows)** : ouvrez le site, puis l'icône « Installer » dans la barre d'adresse (ou ⋮ → « Installer Cigale »).
  Cigale apparaît alors comme une application et peut s'ouvrir directement depuis un PDF (« Ouvrir avec »).
- **Safari (Mac)** : Fichier → « Ajouter au Dock ». **iPhone / iPad** : bouton Partager → « Sur l'écran d'accueil ».
- Après la première visite, tout fonctionne sans connexion.

## Travailler à plusieurs

La branche `main` est protégée : on propose ses changements par **branche + pull request**, relue par Paul. Les versions (étiquettes `vX.Y.Z`) sont publiées par Paul seulement. Le guide complet est dans [docs/CONTRIBUER.md](docs/CONTRIBUER.md).

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
