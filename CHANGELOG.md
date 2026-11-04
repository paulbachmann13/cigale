# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [1.2.1] — 2026-11-04

### Ajouté
- **Mises à jour en un clic** : dans l'application Mac, un clic sur « Version … » (en bas à gauche de l'accueil) ouvre les Nouveautés, avec un bouton « Rechercher les mises à jour… » pour installer tout de suite la dernière version.

## [1.2.0] — 2026-11-04

### Ajouté
- **Reconnaître le texte (OCR)** (Outils) : sur un document numérisé, Cigale lit le texte des pages et l'ajoute, invisible, sous l'image. Vous pouvez ensuite chercher, sélectionner et copier ce texte, comme dans Acrobat. L'aspect des pages ne change pas, et l'opération s'annule comme les autres. Langues : français, anglais, ou les deux. Les pages qui contiennent déjà du texte sont ignorées (option). Tout se fait sur l'ordinateur, même hors ligne : rien n'est envoyé.

## [1.1.0] — 2026-11-04

### Ajouté
- **Formulaires** : les champs d'un formulaire PDF (texte, cases à cocher, boutons radio, listes) se remplissent directement dans la page. La saisie est enregistrée avec le document (⌘S), ou avec « Valider la saisie » ; elle compte comme une modification et s'annule comme le reste.
- **Signature** (outil « Signer » de la barre Commenter) : dessinez, tapez ou importez l'image de votre signature, puis cliquez sur la page pour la poser ; vous pouvez la déplacer et la redimensionner. Vos signatures sont gardées sur l'ordinateur pour les réutiliser. Il s'agit de l'image d'une signature, pas d'une signature numérique à certificat.
- **Caviardage réel** (Outils → Caviarder) : marquez des zones, puis « Appliquer le caviardage ». Les pages concernées deviennent des images : le texte, les images d'origine, les champs, les commentaires et les textes cachés disparaissent vraiment du fichier. Options (cochées par défaut) : retirer les informations du document, les signets, les pièces jointes ; effacer l'historique « Annuler » et ne garder aucune copie de l'ancienne version.
- **Filigrane** (Outils) : texte en diagonale ou horizontal, taille, couleur et opacité réglables, sur toutes les pages, la page affichée, la sélection ou des plages.
- **En-têtes, pieds de page et numérotation** (Outils) : textes à gauche, au centre et à droite, avec le numéro de page, le nombre de pages, la date et le titre ; fonctionne aussi sur les pages tournées.
- **Recadrer** (Outils) : retire des marges (en millimètres) sur les pages choisies.
- **Protéger par mot de passe** (Outils) : mot de passe d'ouverture, restrictions (impression, copie, modification, commentaires) avec mot de passe propriétaire, chiffrement AES-256 ; **Retirer la protection**. L'historique « Annuler » et les copies de sécurité non protégées sont effacés pour ce document.
- **Exporter les pages en images** (Outils) : PNG ou JPEG, 72 à 300 dpi, dans une archive .zip.

### Corrigé
- Les vérifications automatiques qui contrôlent qu'un contenu supprimé a vraiment disparu du fichier étaient trop faibles (le texte d'un PDF est codé et compressé) : elles sont refaites et elles échouent désormais si une suppression laissait des traces. Le comportement de Cigale n'était pas en cause.

## [1.0.0] — 2026-11-03

### Corrigé
- **Important — documents protégés par mot de passe** : dans les versions 0.2 à 0.5, un PDF protégé par mot de passe qu'on modifiait puis enregistrait pouvait être écrit **sans protection**. C'est corrigé : le document reste protégé avec le même mot de passe d'ouverture et les mêmes restrictions (impression, copie…), en chiffrement AES-256. Cigale prévient avant la première modification que l'ancien mot de passe « propriétaire » est remplacé. **Si vous avez enregistré un document protégé avec une version antérieure, vérifiez-le** (il s'ouvre sans mot de passe ?) et protégez-le de nouveau.
- Extraire, diviser et combiner à partir d'un document protégé protègent aussi le résultat.
- Les documents dont les restrictions s'appliquent sans mot de passe d'ouverture (copie ou impression interdites) peuvent maintenant être modifiés.

### Ajouté
- **Mises à jour automatiques de l'application Mac** : Cigale cherche discrètement une nouvelle version au démarrage (réglable) et dans Fichier → Rechercher les mises à jour. Elle affiche ce que la version apporte, télécharge, installe, puis redémarre toute seule ; votre travail non enregistré est mis de côté et proposé dans « Reprendre ». Les mises à jour sont signées : une copie falsifiée serait refusée.
- **Sauvegarde automatique** : votre travail non enregistré est gardé sur l'ordinateur ; après une fermeture imprévue il réapparaît dans « Reprendre » (accueil). Réglable dans les paramètres.
- **Imprimer** (⌘P) : toutes les pages, la page affichée ou des plages, commentaires compris ; la boîte du système permet aussi « Enregistrer au format PDF ».
- Vérifié sur un ensemble de PDF difficiles (fichiers abîmés, tronqués, chiffrés de plusieurs façons, structures inhabituelles) et sur 200 fichiers volontairement détériorés : Cigale ne plante pas et ne produit jamais un document faux ; elle refuse ou explique.
- Fonctionnement vérifié sur Safari en plus de Chrome.
- Performances mesurées : une modification sur un document de 500 pages prend moins d'une seconde.

## [0.5.0] — 2026-11-03

### Ajouté
- **Application Mac** : Cigale s'installe maintenant comme une vraie application (fichier .dmg, Mac Intel et Apple Silicon), à côté de la version dans le navigateur.
- Double-clic sur un PDF dans le Finder, ou « Ouvrir avec Cigale » : le document s'ouvre dans un nouvel onglet.
- Boîtes « Ouvrir » et « Enregistrer sous » du Mac, et enregistrement sur place sans autorisation à redemander.
- **Vraie copie de sécurité** : en enregistrant, l'ancienne version est gardée à côté du fichier (« rapport.pdf.bak »).
- Quand vous fermez la fenêtre avec des modifications non enregistrées, Cigale demande quoi faire.
- Barre des menus du Mac en français.

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
