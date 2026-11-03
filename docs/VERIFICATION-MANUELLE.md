# Vérification manuelle (Aperçu macOS et Acrobat)

Ce que les tests automatiques ne peuvent pas faire : confirmer, à la main, que les PDF produits par Cigale s'ouvrent et
s'affichent correctement dans **Aperçu** et **Adobe Acrobat**. À dérouler à la fin de chaque étape qui produit des PDF.

Les fichiers de test se génèrent avec `npm run fixtures` (dossier `tests/fixtures/out/`).

## Étape 1 (socle) — rien à vérifier dans Aperçu / Acrobat

Cette étape ne produit aucun PDF (lecture seule). Comparez seulement l'**affichage** :

1. Ouvrir `tests/fixtures/out/simple-3p.pdf` dans Cigale **et** dans Aperçu : mêmes pages, accents (« Éléphant à l'été ») intacts.
2. Ouvrir `signets.pdf` : l'arbre de signets (Introduction, Partie A > A.1, A.2, Partie B > B.1) est identique à celui d'Aperçu (Affichage > Signets) ; chaque clic mène à la même page.
3. Ouvrir `tailles-mixtes.pdf` : 4 pages de formats différents, la 4e est tournée de 90° ; même rendu que dans Aperçu.
4. Ouvrir `chiffre.pdf` (mot de passe : `secret`) dans Cigale et Aperçu.
5. Ouvrir un de vos scans manuscrits réels (200–300 dpi) : netteté comparable à Aperçu, temps d'ouverture acceptable.

## Étapes suivantes (à compléter au fur et à mesure)

- **Étapes 2 et 3** : pour chaque PDF produit (réorganisé, extrait, fusionné, découpé) — s'ouvre sans message d'erreur dans Aperçu **et** Acrobat ; nombre et ordre des pages ; signets et liens conservés ; Acrobat ne propose pas d'« enregistrer les modifications » à la fermeture sans raison.
- **Étape 4** : pour chaque type d'annotation (surlignage, soulignement, barré, zone de texte, dessin, rectangle, ellipse, ligne, polygone, note, tampon) — l'annotation s'affiche à l'identique dans Aperçu et Acrobat (couleur, épaisseur, opacité, texte) ; elle est modifiable dans Acrobat ; la note s'ouvre en pop-up.
