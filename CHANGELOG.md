# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [1.6.1] — 2026-11-08

### Corrigé
- **Gomme** : elle efface maintenant aussi les rectangles, ellipses, lignes et flèches (par leur bord, ou par l'intérieur s'ils sont remplis), pas seulement les traits à main levée. Première modification proposée par Jérôme.

## [1.6.0] — 2026-11-08

### Ajouté
- **Nouveau carnet avec aperçus** : on voit chaque papier (vignettes dessinées comme les vraies pages) et on clique pour choisir. Neuf papiers : uni, ligné, quadrillé 5 mm, pointillé, Seyès, **Cornell** (pour les cours), **portées de musique**, **millimétré** et **liste à cocher**. Cinq couleurs de papier : blanc, crème, jaune pâle, vert pâle, bleu pâle. Les aperçus suivent le format et l'orientation choisis.
- **Insérer des pages, enfin partout** : « Insérer des pages… » propose une page avec un papier (avec aperçus), **la copie d'une page du document** (une ou plusieurs), ou les pages d'un autre PDF, **avant ou après une page précise**, au tout début ou à la fin.
- **Coller une image** : Ctrl+V (⌘V) avec une capture d'écran ou une image copiée la pose au milieu de la page affichée, prête à être déplacée ou redimensionnée. Le menu « Insérer » a aussi « Coller une image du presse-papiers » (utile sur iPad).

- **Bouton « Stylet »** (barre du haut) : d'un clic, toute l'interface d'écriture apparaît sur le PDF ouvert (stylos, favoris, gomme, règle, lasso, couleurs), sans passer par un carnet ; un second clic la referme. Pour annoter, ajouter des pages ou des images, tout est dans la même fenêtre. Réglage facultatif : « Ouvrir les PDF directement en mode stylet ».

### Corrigé
- **Plus de clignotement** après un trait, une rotation, un ajout de page, etc. : le nouvel affichage est préparé en coulisses et n'apparaît que lorsque la page est dessinée ; l'ancien reste à l'écran entre-temps. On n'interrompt plus un trait ou un geste de lasso en cours.
- **Lasso** : il choisit maintenant tout ce qui est vraiment dedans, y compris les traits redressés (qui n'ont que deux points), les formes, les images, les surlignages et les zones de texte (au moins la moitié de l'objet dans la boucle). Entourer juste après avoir écrit marche aussi : le lasso attend que les traits soient enregistrés. Dupliquer marche pour les traits, rectangles, ellipses, lignes, flèches et zones de texte.

### Modifié
- Pivoter, dupliquer, extraire, insérer : sans page sélectionnée, ces boutons agissent sur la **page affichée** au lieu d'être grisés.

## [1.5.0] — 2026-11-08

### Ajouté
- **Écrire à la main sur un PDF** (Commenter → l'outil « Écrire et dessiner »). Trois stylos : **Stylo**, **Plume** (le trait s'épaissit quand on appuie, avec un Apple Pencil ou un stylet) et **Surligneur** (translucide, il ne cache pas le texte). Chaque stylo retient sa couleur et son épaisseur. Le trait apparaît instantanément, sans attendre.
- **Gomme** : passez sur un trait pour l'effacer (il devient rouge avant de disparaître). Elle efface aussi les traits des versions précédentes.
- **Formes parfaites** : tracez une ligne, un cercle, une ellipse, un rectangle, un triangle ou un angle à main levée, puis **maintenez le stylet immobile une demi-seconde** : le trait devient parfait. Une ligne redressée suit encore le stylet pour régler sa longueur et son angle. L'écriture n'est jamais transformée.
- **Règle** (bouton à côté du stylo) : une règle apparaît ; déplacez-la par sa poignée centrale, tournez-la par la poignée ronde (elle s'aimante à 0°, 15°, 45°, 90°…). Un trait qui commence près de son bord devient une droite parfaite le long de ce bord.
- **Lasso** : entourez des traits pour les sélectionner, puis déplacez-les, dupliquez-les ou supprimez-les (touche Suppr). Un déplacement est une seule étape pour Annuler.
- **Nouveau carnet** (accueil, ou Fichier → Nouveau carnet) : un document neuf sur le papier de votre choix — uni, ligné, quadrillé 5 mm, pointillé ou **Seyès** — en A4, A5 ou Lettre, portrait ou paysage, de 1 à 500 pages. Il s'ouvre directement avec le stylo, et s'enregistre en PDF comme les autres.
- **Insérer des pages avec un papier** (menu Insérer des pages, ou clic droit sur une page) : une ou plusieurs pages lignées, quadrillées, Seyès… avant ou après la sélection, dans n'importe quel document.
- **Ajouter une image** (Commenter → Image) : une photo, une capture ou un schéma, posée d'un clic puis déplaçable et redimensionnable. L'orientation de la photo est respectée et les très grandes images sont réduites.
- **Stylos favoris** : trois stylos prêts à l'emploi (stylo noir, plume bleue, surligneur jaune). Un clic reprend le type, la couleur et l'épaisseur ; l'étoile permet de mémoriser le stylo en cours (six au plus) ou d'en retirer.
- **Réglages d'écriture** (Paramètres) : redresser ou non les traits quand on maintient le stylet ; laisser le doigt écrire aussi.
- **Tablette** : boutons de la barre d'outils plus grands sur un écran tactile ; le pincement à deux doigts zoome sans faire défiler la page ; le trait suit mieux le stylet (affichage à faible latence et anticipation de quelques points quand le navigateur le permet).
- **Annuler trait par trait** tant qu'on écrit ; Rétablir les rend.
- **Stylet et doigt** : une fois qu'un stylet a servi, le doigt fait défiler la page au lieu d'écrire (la paume ne laisse plus de traits).
- Les traits sont de vrais commentaires du PDF : on les retrouve dans Aperçu et Acrobat, avec la même forme. Un trait déplacé garde sa forme.

### Corrigé
- **Windows** : après avoir fermé Cigale, un double-clic sur un PDF (ou « Ouvrir avec ») ne l'ouvrait plus : le programme restait caché en tâche de fond. Fermer la fenêtre arrête maintenant vraiment Cigale.

### Modifié
- Un trait écrit n'est plus un pas « Annuler » à lui seul : tout ce qu'on écrit d'un coup forme une seule étape une fois envoyé au document (la page ne se recharge plus à chaque trait).

## [1.4.0] — 2026-11-08

### Ajouté
- **Cigale pour Windows** (64 bits) : un installateur `.exe`, sans droits d'administrateur. Même application que sur Mac : boîtes Ouvrir / Enregistrer natives, enregistrement sécurisé avec copie « .bak » à côté du fichier, double-clic sur un PDF (« Ouvrir avec »), et **mises à jour automatiques** (Fichier → Rechercher les mises à jour, ou le bouton « Version »). Au premier lancement, Windows affiche « Windows a protégé votre ordinateur » : cliquer sur « Informations complémentaires » puis « Exécuter quand même ».
- Si Cigale est déjà ouverte, un double-clic sur un autre PDF l'ajoute dans un nouvel onglet au lieu de lancer une deuxième fenêtre (Windows).

### Modifié
- Les raccourcis affichés dans les info-bulles et les menus suivent le système : Ctrl sur Windows, ⌘ sur Mac.

## [1.3.1] — 2026-11-05

### Corrigé
- **Caviardage** : la page ne « saute » plus d'un cran sous la souris quand on trace la première zone (la barre d'outils changeait de hauteur à ce moment-là).
- **Outils de l'accueil** : si un document est déjà ouvert, la tuile d'un outil l'utilise vraiment, même quand on regarde l'accueil, au lieu de redemander un fichier.
- **Enregistrement** : si vous continuez à travailler pendant qu'un enregistrement est en cours (ou annulez une étape), le document reste correctement marqué « modifié » : avant, il pouvait paraître enregistré alors que la dernière modification ne l'était pas.
- **PDF protégés par mot de passe** : le titre, l'auteur et les noms des pièces jointes ne se perdent plus quand on modifie puis enregistre un document protégé.
- Vérifications renforcées autour de l'enregistrement : une longue série de modifications (formulaire, commentaires, filigrane, recadrage, OCR…) est enregistrée puis relue pour s'assurer que rien n'est oublié ni abîmé.

## [1.3.0] — 2026-11-04

### Ajouté
- **Tous les outils sur l'accueil** : des tuiles pour Diviser, Recadrer, Filigrane, En-têtes et pieds de page, Protéger, Retirer la protection, Caviarder, Reconnaître le texte, Exporter en images et Extraire une zone. Cliquez sur une tuile : Cigale vous demande le PDF, puis ouvre l'outil dessus (si un document est déjà ouvert, elle l'utilise).
- **Extraire une zone en nouveau PDF** (Outils → Extraire une zone, ou la tuile de l'accueil) : tracez un rectangle sur une page, comme on rogne une image, et la zone devient un nouveau PDF d'une page. Au choix : en gardant le texte et les dessins (texte sélectionnable), ou en simple image (rien d'autre de la page n'est conservé, plus sûr si le reste est confidentiel). Votre document n'est pas modifié.

## [1.2.2] — 2026-11-04

### Corrigé
- **Rechercher les mises à jour** : les messages (« Vous avez la dernière version », erreurs) s'affichent maintenant dans Cigale et se ferment normalement. Avant, une fenêtre du système pouvait rester bloquée devant les Nouveautés. Le bouton est aussi grisé pendant la recherche.

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
