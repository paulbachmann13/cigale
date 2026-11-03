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

## Étape 2 (organiser et enregistrer) — à faire dans Aperçu ET Acrobat

Avec `simple-3p.pdf`, `signets.pdf`, `tailles-mixtes.pdf` et `chiffre.pdf` (mot de passe `secret`) :

1. Dans Cigale : pivoter la page 2, déplacer la page 3 au début, dupliquer la page 1, supprimer la page 2 d'origine, insérer une page vierge ; **Enregistrer sous** « essai.pdf ».
2. Ouvrir `essai.pdf` dans **Aperçu** puis **Acrobat** : s'ouvre sans message, bon nombre et bon ordre de pages, la page pivotée est pivotée, accents intacts. Acrobat ne propose pas « Enregistrer les modifications ? » à la fermeture.
3. `signets.pdf` : déplacer la page 6 en première position, enregistrer ; dans Aperçu/Acrobat, le signet « Section B.1 » mène bien à la page déplacée (maintenant la 1re).
4. Supprimer une page d'un PDF : vérifier dans Acrobat (Fichier > Propriétés) que la taille du fichier a diminué.
5. `chiffre.pdf` : pivoter, enregistrer ; le fichier demande toujours le mot de passe `secret` dans Aperçu et Acrobat.
6. Avec **Chrome** : ouvrir un PDF du Mac, modifier, ⌘S ; fermer, rouvrir depuis Récents (accepter la permission) : modifications présentes. Vérifier dans Accueil → Versions précédentes que l'ancienne version est téléchargeable et identique à l'original.
7. Avec **Safari** : ⌘S télécharge une copie (message explicite).

## Étape 3 (fusionner et découper) — Aperçu ET Acrobat

1. Combiner `simple-3p.pdf` + `signets.pdf` + une photo JPEG prise au téléphone en portrait : enregistrer sous « combine.pdf ». Dans Aperçu et Acrobat : 10 pages, la photo est à l'endroit et entière, accents intacts.
2. Panneau Signets (Aperçu : Affichage > Signets ; Acrobat : volet Signets) : « simple-3p », « signets » (avec Partie A, Partie B… dessous) et la photo ; chaque clic mène à la bonne page.
3. Combiner avec une plage « 2-3, 6 » sur `signets.pdf` : 3 pages, les bonnes.
4. Diviser `signets.pdf` par signets de premier niveau (3 parties), puis en .zip : décompresser avec l'Archive Utility du Mac ; les noms accentués sont corrects et chaque PDF s'ouvre dans Aperçu/Acrobat.
5. Un vrai scan (plusieurs pages d'images) : combiner 3 scans, vérifier netteté et poids du fichier (pas de recompression des images : le poids doit être voisin de la somme des originaux).

## Étape 4 (commentaires) — Aperçu ET Acrobat

Dans Cigale, sur `simple-3p.pdf` : un surlignage jaune sur une ligne, un souligné, un barré, une note (« Test note »), une zone de texte avec « Éléphant à l'été — vérifié », un dessin à main levée, un rectangle rempli, une ellipse, une flèche, un tampon « Confidentiel », une réponse à la note. Enregistrer sous « commentaires.pdf », puis :

1. **Aperçu** : tous les commentaires s'affichent, mêmes couleurs ; le surlignage est translucide (le texte reste lisible) ; la zone de texte montre les accents ; le panneau d'annotations d'Aperçu liste les commentaires.
2. **Acrobat** : mêmes constats ; panneau Commentaires : auteur « Utilisateur » (ou votre nom réglé dans Cigale), date juste ; la note s'ouvre en bulle avec son texte ; la réponse apparaît **dans le fil** de la note ; on peut sélectionner et déplacer le rectangle, modifier la zone de texte.
3. Dans Acrobat, ajouter un surlignage et un commentaire, enregistrer, rouvrir dans Cigale : ils sont listés (« Créé dans un autre logiciel »), supprimables, et le reste est intact.
4. Impression en PDF depuis Aperçu : les commentaires sont imprimés (drapeau « imprimer » posé).
5. Avec un scan réel : rectangle et dessin au stylet (iPad / Apple Pencil) fonctionnent ; le tracé suit le doigt sans retard sensible.

## Application Mac (.dmg)

1. GitHub → Actions → « Application Mac » → Run workflow ; télécharger l'artefact `Cigale-mac` (ou, après une étiquette `vX.Y.Z`, le .dmg des Releases).
2. Ouvrir le .dmg, glisser Cigale dans Applications ; premier lancement : clic droit → Ouvrir (application non signée).
3. Double-clic sur un PDF du Bureau avec « Ouvrir avec → Cigale » : il s'ouvre dans un onglet. Refaire avec Cigale déjà lancée : nouvel onglet, pas de deuxième fenêtre.
4. Pivoter une page, ⌘S : « Enregistré », le fichier `.bak` est apparu à côté (ouvrir le .bak : c'est l'ancienne version) ; le PDF enregistré s'ouvre dans Aperçu.
5. Modifier, puis ⌘W ou ⌘Q : la question « Enregistrer les modifications ? » apparaît ; « Annuler » garde la fenêtre.
6. « Ouvrir » et « Enregistrer sous » : boîtes natives ; les récents rouvrent le fichier directement.
7. Diviser en .zip : la boîte « Enregistrer sous » propose le nom ; le zip s'ouvre dans l'Archive Utility.

## Étapes suivantes (à compléter au fur et à mesure)

- **Étapes 2 et 3** : pour chaque PDF produit (réorganisé, extrait, fusionné, découpé) — s'ouvre sans message d'erreur dans Aperçu **et** Acrobat ; nombre et ordre des pages ; signets et liens conservés ; Acrobat ne propose pas d'« enregistrer les modifications » à la fermeture sans raison.
- **Étape 4** : pour chaque type d'annotation (surlignage, soulignement, barré, zone de texte, dessin, rectangle, ellipse, ligne, polygone, note, tampon) — l'annotation s'affiche à l'identique dans Aperçu et Acrobat (couleur, épaisseur, opacité, texte) ; elle est modifiable dans Acrobat ; la note s'ouvre en pop-up.
