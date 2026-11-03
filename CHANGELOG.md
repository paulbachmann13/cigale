# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

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
