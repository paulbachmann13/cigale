# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.4.0] — 2026-11-03

### Ajouté
- **Commenter** (bouton en haut, à droite des outils de pages) : surligner, souligner ou barrer du texte ; ajouter une note, une zone de texte, un dessin à main levée, un rectangle, une ellipse, une ligne, une flèche ou un tampon (Approuvé, Refusé, Confidentiel, Brouillon, À revoir, Reçu).
- Ce sont de **vrais commentaires PDF** : ils sont enregistrés dans le fichier avec leur apparence, donc visibles à l'identique dans Aperçu, Acrobat et les autres lecteurs.
- **Panneau Commentaires** : tous les commentaires du document, page par page, avec leur auteur et leur date ; filtre ; clic pour aller au commentaire ; modification du texte ; **réponses** ; suppression.
- Sélectionner un commentaire pour le **déplacer**, le **redimensionner**, changer sa **couleur** ou son **épaisseur**, ou le supprimer (touche ⌫).
- Les commentaires faits dans un autre logiciel (Acrobat, Aperçu…) sont affichés dans le panneau et peuvent être modifiés ou supprimés.
- Réglage du **nom inscrit dans vos commentaires** (Paramètres).
- Annuler et rétablir fonctionnent aussi pour les commentaires, et la page reste à la même place après chaque ajout.

### Modifié
- Le panneau de gauche est un peu plus large pour loger l'onglet Commentaires.

## [0.3.0] — 2026-11-03

### Ajouté
- **Combiner des fichiers** (menu Fichier ou tuile de l'accueil) : assemblez des PDF et des images (JPEG, PNG, et selon votre navigateur WebP, GIF, BMP) dans l'ordre voulu, avec pour chaque PDF une plage de pages facultative (par exemple « 1-3, 5 »). Le résultat s'ouvre dans un nouvel onglet ; rien n'est enregistré sans votre accord.
- **Signets conservés** à la fusion : un signet par fichier, avec ses propres signets dessous.
- Les photos prises « de côté » (téléphone) sont redressées, et les grandes images sont ramenées à la taille d'une page A4.
- **Diviser le document** (menu Fichier) : par plages de pages, tous les N pages, ou d'après les signets de premier niveau. Un aperçu des fichiers s'affiche avant de partir ; vous pouvez les ouvrir dans des onglets ou les enregistrer d'un coup dans une archive .zip.
- Une barre de progression avec « Annuler » pour les fusions et les découpes longues.

### Modifié
- Les nouveaux documents créés (extrait, combiné, parties) ne contiennent que ce qui est utile : rien d'autre du fichier d'origine n'est resté caché dedans.

## [0.2.0] — 2026-11-03

### Ajouté
- **Organiser les pages** : sélectionnez une ou plusieurs pages (clic, ⌘-clic, Maj-clic) dans le panneau de miniatures, puis pivotez, supprimez, dupliquez, déplacez par glisser-déposer, insérez une page vierge ou les pages d'un autre PDF, ou extrayez-les dans un nouveau document. Un clic droit sur une miniature ouvre le même menu.
- **Vue « Organiser les pages »** : une grande grille de miniatures (taille réglable) pour réorganiser un long document d'un coup d'œil.
- **Enregistrer** (⌘S) et **Enregistrer sous** (⇧⌘S). Cigale relit le fichier après l'écriture pour vérifier qu'il est correct. L'original n'est jamais touché tant que vous n'enregistrez pas.
- **Annuler et rétablir** (⌘Z, ⇧⌘Z) pour toutes les modifications de pages.
- **Versions précédentes** : avant de remplacer un fichier, Cigale garde l'ancienne version sur votre ordinateur (les 5 dernières) ; vous pouvez la télécharger depuis l'accueil. Réglable dans les paramètres.
- Un point devant le nom de l'onglet signale les modifications non enregistrées ; Cigale demande quoi faire avant de fermer un document modifié.
- Avertissement avant de modifier un document signé numériquement (la signature deviendrait invalide).

### Modifié
- Nouvelle présentation, dans le même esprit que Grillon : bouton « Fichier » coloré en haut à gauche avec son menu, accueil avec colonne colorée et tuiles.
- Les pages supprimées disparaissent vraiment du fichier (leur contenu aussi), ce qui compte pour les documents confidentiels.

## [0.1.0] — 2026-11-03

### Ajouté
- **Première version de Cigale** : un lecteur PDF qui fonctionne entièrement sur votre ordinateur, même sans connexion.
- Ouvrir un PDF avec « Ouvrir », par glisser-déposer, ou avec « Ouvrir avec » une fois l'application installée. Plusieurs documents s'ouvrent dans des onglets.
- Affichage en défilement continu, page par page ou deux pages ; zoom de 25 % à 800 % (ajuster à la largeur ou à la page) ; rotation de l'affichage ; aller à une page.
- Panneau de miniatures et de signets (plan du document).
- Recherche dans le texte (⌘F) avec surlignage et boutons suivant / précédent ; sélection et copie du texte.
- Documents protégés par mot de passe : Cigale demande le mot de passe, et explique clairement quand un fichier ne peut pas être ouvert.
- Écran d'accueil avec les fichiers récents (seuls les noms sont gardés), thème clair ou sombre, et ces nouveautés.
