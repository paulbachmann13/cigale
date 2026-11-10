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

## Étape 5 (version 1.0)

1. **Protection** : avec `chiffre.pdf` (mot de passe `secret`) pivoter une page, enregistrer sous « protege.pdf ». Dans **Aperçu** : demande le mot de passe `secret`. Dans **Acrobat** : idem ; Propriétés > Sécurité : chiffrement AES 256 bits. Puis avec un de vos PDF « copie interdite » : après modification il reste interdit à la copie.
2. **Sauvegarde automatique** : modifier un document, attendre 3 s, fermer l'onglet du navigateur (ou ⌘Q de l'application Mac, « Annuler » puis forcer l'arrêt), rouvrir Cigale : « Reprendre » propose le travail.
3. **Impression** : ⌘P sur un document de 3 pages avec un commentaire : l'aperçu de la boîte système montre les 3 pages et le commentaire ; « Enregistrer au format PDF » produit un fichier lisible.
4. **Safari** (le vôtre) : ouvrir, organiser, commenter, combiner ; ⌘S télécharge une copie. **Application Mac** : voir la section suivante.
5. Un de vos vrais PDF « difficiles » (scan multipage, formulaire, protégé, très gros) : s'ouvre, se modifie, se rouvre dans Acrobat sans message.

## Version 1.1 — Aperçu ET Acrobat

1. **Formulaire** : remplir `formulaire.pdf`, enregistrer sous « rempli.pdf » : Aperçu et Acrobat affichent les valeurs ; dans Acrobat les champs restent modifiables.
2. **Signature** : poser une signature dessinée sur un PDF, enregistrer : visible à l'identique dans Aperçu et Acrobat ; dans Acrobat c'est un tampon (déplaçable).
3. **Caviardage** : sur un vrai PDF avec un nom et un montant : marquer, appliquer, enregistrer sous « caviarde.pdf ». Dans Acrobat : Édition > Copier / chercher le mot caviardé : **introuvable**, y compris dans Propriétés (titre, auteur) et dans le volet Pièces jointes / Signets. Ouvrir le fichier dans un éditeur de texte (ou `strings caviarde.pdf | grep mot`) : rien. Vérifier aussi qu'il n'existe pas de fichier « .bak » du document d'origine à côté.
4. **Filigrane, en-têtes, numérotation, recadrage** sur un PDF mélangeant portrait, paysage et page tournée : position et sens corrects dans Aperçu et Acrobat.
5. **Export en images** : le .zip s'ouvre ; images nettes à 150 dpi.

## Version 1.2 — OCR

- [ ] Un vrai scan (photocopieur, téléphone) : Outils → Reconnaître le texte ; ⌘F trouve un mot ; sélectionner et copier un paragraphe donne un texte lisible.
- [ ] Le PDF obtenu dans Aperçu ET Acrobat : aspect identique, recherche et copie fonctionnent, sélection au bon endroit.
- [ ] Dans l'application Mac (pas seulement le site) : l'OCR marche, y compris sans réseau (Wi-Fi coupé).
- [ ] Un document de 20 pages : durée acceptable, « Annuler » rend la main tout de suite.

## Version 1.3 — Accueil « Tous les outils » et extraction de zone

- [ ] Accueil : les tuiles (Diviser, Recadrer, Filigrane, En-têtes, Protéger, Retirer la protection, Caviarder, OCR, Exporter en images, Extraire une zone) demandent un PDF puis ouvrent l'outil ; avec un document déjà ouvert, l'outil s'ouvre directement.
- [ ] Extraire une zone : tracer un rectangle sur une page d'un vrai document ; vectoriel (texte sélectionnable, bonne taille) et image (netteté) ; ouvrir le résultat dans Aperçu et Acrobat.
- [ ] Page tournée (90°) et page avec CropBox : la zone extraite est bien celle qu'on a tracée.

## Version 1.3.1 — Enregistrement (à vérifier avec de vrais fichiers)

- [ ] Un PDF avec formulaire : remplir, ⌘S, fermer, rouvrir dans Cigale PUIS dans Aperçu et Acrobat : les valeurs sont là.
- [ ] Un PDF protégé par mot de passe : modifier, enregistrer, rouvrir (mot de passe demandé) : titre et auteur conservés (Propriétés du document dans Acrobat).
- [ ] Un PDF avec pièce jointe et signets : modifier plusieurs choses, enregistrer, rouvrir : tout est là.
- [ ] Enregistrer pendant qu'on continue à travailler (annuler, repivoter) : l'indicateur « modifié » reste juste.
- [ ] Application Mac : fichier sur le Bureau et sur iCloud Drive / clé USB ; ⌘S ; le .bak apparaît ; rouvrir.

## Écriture manuscrite (1.5) — à essayer sur l'iPad avec l'Apple Pencil

1. Ouvrir un PDF dans Cigale (Safari ou PWA installée) → Commenter → « Écrire et dessiner ».
2. Stylo, Plume, Surligneur : le trait suit-il le Pencil sans retard gênant ? La Plume s'épaissit-elle quand on appuie ?
3. Poser la paume sur l'écran en écrivant : aucun trait parasite ? Un doigt fait-il défiler la page (après un premier trait au Pencil) ?
4. Gomme ; Annuler / Rétablir (trait par trait) ; attendre 2 s puis enregistrer, rouvrir dans Aperçu / Acrobat : même forme, surligneur transparent sur le texte.
5. Tracer un cercle, un rectangle, une ligne puis maintenir le Pencil : forme parfaite ? Ça ne transforme pas l'écriture ?
6. Règle : bouton à côté du stylo ; la déplacer, la tourner (aimant), tracer le long du bord au Pencil.
7. Lasso : entourer des traits au Pencil ; les déplacer avec le doigt/Pencil ; Dupliquer ; Supprimer.
8. Nouveau carnet (accueil) : Seyès, quadrillé, ligné, pointillé ; imprimer une page Seyès et vérifier les carreaux (2 mm / 8 mm) ; ouvrir le carnet enregistré dans Aperçu / Acrobat.
9. Ajouter une image (photo prise à l'iPad) : l'orientation est-elle bonne ? la déplacer, la redimensionner.
10. Étoile à côté des stylos : mémoriser un stylo, le retrouver après avoir fermé et rouvert Cigale. Paramètres → Écriture à la main : essayer les deux réglages.
11. Nouveau carnet : les 9 vignettes ressemblent-elles aux vraies pages ? (Cornell, musique, millimétré). Imprimer une page millimétrée : 1 mm / 5 mm / 10 mm justes ? Coller une capture d'écran (⌘V) dans un PDF ; « Insérer des pages… » → copie de la page 3 après la page 1.
12. Ouvrir un PDF quelconque, cliquer « Stylet » : écrire, gommer, lasso, ajouter une page ; plus aucun clignotement après chaque trait ? Lasso : entourer un trait redressé, une image, un rectangle.
13. Pendant l'écriture : le zoom (boutons) et le défilement (doigt) restent-ils utilisables ?

## Version 1.7 — à essayer
1. **Écriture** (iPad / Pencil) : plus aucun clignotement ni retard ; la gomme coupe un trait au milieu ; lasso : déplacer en direct ; Annuler trait par trait.
2. Ouvrir dans **Aperçu** et **Acrobat** un PDF écrit dans Cigale : l'écriture est là ; dans Acrobat, le panneau « Calques » montre « Écriture manuscrite (Cigale) » (on peut le masquer).
3. **Convertir en Word** un PDF de cours : ouvrir le .docx dans Word / Pages : texte lisible, un saut de page par page ?
4. **Propriétés** : changer le titre, enregistrer, rouvrir dans Aperçu (Outils → Inspecteur) : le titre est-il bon ?
5. **Remplacer des pages** sur un vrai document.

## Application Windows (.exe) — à faire sur un vrai PC (jamais testée avant la 1.4.0)

1. Télécharger `Cigale_…_x64-setup.exe` (Releases) ; l'installer ; passer l'avertissement SmartScreen (Informations complémentaires → Exécuter quand même).
2. Ouvrir un PDF (⌘ = Ctrl) ; Ctrl+S ; vérifier que le `.bak` apparaît à côté ; modifier une page, enregistrer, rouvrir.
3. Fichier sur un disque autre que C: et sur une clé USB : ouvrir, enregistrer.
4. Double-clic sur un PDF (Cigale fermée, puis ouverte) ; « Ouvrir avec » ; un 2ᵉ PDF double-cliqué s'ouvre dans la même fenêtre.
5. Fermer avec des modifications non enregistrées : la question apparaît.
6. Bouton « Version » → Rechercher les mises à jour (nécessite une version plus récente publiée) ; imprimer (Ctrl+P).
7. Associer Cigale comme lecteur PDF par défaut (Paramètres Windows → Applications par défaut).

## Application Mac (.dmg)

1. GitHub → Actions → « Application Mac » → Run workflow ; télécharger l'artefact `Cigale-mac` (ou, après une étiquette `vX.Y.Z`, le .dmg des Releases).
2. Ouvrir le .dmg, glisser Cigale dans Applications ; premier lancement : clic droit → Ouvrir (application non signée).
3. Double-clic sur un PDF du Bureau avec « Ouvrir avec → Cigale » : il s'ouvre dans un onglet. Refaire avec Cigale déjà lancée : nouvel onglet, pas de deuxième fenêtre.
4. Pivoter une page, ⌘S : « Enregistré », le fichier `.bak` est apparu à côté (ouvrir le .bak : c'est l'ancienne version) ; le PDF enregistré s'ouvre dans Aperçu.
5. Modifier, puis ⌘W ou ⌘Q : la question « Enregistrer les modifications ? » apparaît ; « Annuler » garde la fenêtre.
6. « Ouvrir » et « Enregistrer sous » : boîtes natives ; les récents rouvrent le fichier directement.
7. Diviser en .zip : la boîte « Enregistrer sous » propose le nom ; le zip s'ouvre dans l'Archive Utility.
8. **Mise à jour** : installer la version N dans Applications, publier N+1 (étiquette), lancer Cigale N : 5 s après, la fenêtre « Installer et redémarrer » montre les nouveautés ; accepter : progression, redémarrage, une seule icône dans le Dock ; Accueil → Nouveautés. Avec un document modifié non enregistré avant la mise à jour : il est proposé dans « Reprendre » au retour. Depuis le .dmg monté (sans copier dans Applications) : message qui demande de déplacer l'application.

## Étapes suivantes (à compléter au fur et à mesure)

- **Étapes 2 et 3** : pour chaque PDF produit (réorganisé, extrait, fusionné, découpé) — s'ouvre sans message d'erreur dans Aperçu **et** Acrobat ; nombre et ordre des pages ; signets et liens conservés ; Acrobat ne propose pas d'« enregistrer les modifications » à la fermeture sans raison.
- **Étape 4** : pour chaque type d'annotation (surlignage, soulignement, barré, zone de texte, dessin, rectangle, ellipse, ligne, polygone, note, tampon) — l'annotation s'affiche à l'identique dans Aperçu et Acrobat (couleur, épaisseur, opacité, texte) ; elle est modifiable dans Acrobat ; la note s'ouvre en pop-up.
