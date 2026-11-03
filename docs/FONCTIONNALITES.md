# Fonctionnalités et limites connues

État : **étape 4 (annotations et commentaires)** + application Mac, version 0.5.0.

## Fonctionnalités

### Ouvrir et afficher
- Ouvrir par **Ouvrir** (⌘O / Ctrl+O), par **glisser-déposer**, ou par « Ouvrir avec » (PWA installée). Plusieurs documents dans des **onglets** ; onglet **Accueil** toujours présent.
- Affichage : défilement continu, page par page, deux pages ; zoom 25 % à 800 % (liste, +/−, ⌘+ ⌘−), ajuster à la largeur (⌘2) ou à la page (⌘0), taille réelle (⌘1) ; rotation de l'affichage (⌘⇧R) ; aller à une page.
- **Miniatures** (dessinées à la demande, libérées hors écran), **signets** imbriqués repliables.
- **Recherche** (⌘F) avec surlignage, compteur « 3 sur 12 », suivant/précédent (Entrée, ⇧Entrée, ⌘G), option de casse et d'accents. Sélection et copie de texte.
- **PDF scannés** (image seule) : affichés par pdf.js, canevas limité à 33 Mpx.
- **PDF chiffrés** : demande du mot de passe, refus d'un mauvais mot de passe, annulation propre ; message clair si le chiffrement n'est pas pris en charge.
- **Fichiers invalides** : message clair (pas un PDF, vide, endommagé) ; les PDF tronqués sont ouverts quand pdf.js sait les réparer.
- Tactile : pincer pour zoomer (2 doigts), défilement à 2 doigts, Ctrl + molette / pavé tactile.
- Plein écran, thème clair / sombre / automatique, zoom à l'ouverture réglable.

### Organiser les pages (étape 2)
- **Sélection** dans les miniatures : clic, ⌘/Ctrl-clic, Maj-clic, flèches, ⌘A. Boutons de la barre d'outils, menu clic droit et touche ⌫ pour supprimer.
- **Pivoter** à gauche / à droite (dans le fichier, pas seulement à l'écran), **supprimer** (le contenu quitte vraiment le fichier), **dupliquer**, **déplacer** (glisser-déposer, « au début », « à la fin », « vers la page n° »), **insérer** une page vierge (même format que sa voisine) ou les pages d'un autre PDF, **extraire** vers un nouveau document (onglet non enregistré).
- **Vue « Organiser les pages »** : grille de miniatures, taille réglable, double-clic pour revenir à la page.
- **Annuler / rétablir** (⌘Z, ⇧⌘Z) sans limite pratique (octets complets gardés, plafonnés à 400 Mo).
- Toutes les opérations tournent dans un **Web Worker** (annulables) ; le document n'est adopté que si le résultat s'ouvre correctement et a le bon nombre de pages.
- Conservés : signets (ils suivent leurs pages), liens, métadonnées d'origine (titre, producteur…), pièces jointes, XMP, chiffrement (le document reste protégé par le même mot de passe).

### Application Mac (.dmg)
- Même code que la version web, dans une fenêtre native (Tauri 2). Installation : ouvrir le .dmg, glisser Cigale dans Applications.
- **Ouvrir avec** : double-clic sur un PDF du Finder (ou « Ouvrir avec → Cigale »), qu'elle soit déjà lancée ou non.
- Boîtes « Ouvrir » / « Enregistrer sous » natives ; ⌘S **réécrit le fichier de façon atomique** (fichier temporaire puis renommage) puis relit et compare ; **vrai `.bak`** à côté (« nom.pdf.bak », la version d'avant le dernier enregistrement), en plus des versions gardées dans Cigale.
- Fermeture de la fenêtre avec des modifications : question « Enregistrer / Ne pas enregistrer / Annuler ».
- Les récents gardent le chemin du fichier : rouverture directe.
- Application **non signée** (pas de compte développeur Apple) : au premier lancement, clic droit sur Cigale → Ouvrir. Pas de mise à jour automatique pour l'instant : télécharger le nouveau .dmg (Releases GitHub).

### Commenter (étape 4)
- **Outils** : surligner / souligner / barrer (d'après le texte sélectionné, une zone par ligne), note, zone de texte (texte qui passe à la ligne, taille réglable), dessin à main levée, rectangle, ellipse, ligne, flèche, tampons (6 modèles dessinés par Cigale). Couleur (7 teintes, mémorisée par outil) et épaisseur.
- **Vraies annotations PDF** (Highlight, Underline, StrikeOut, Text + Popup, FreeText, Ink, Square, Circle, Line, Stamp) avec **flux d'apparence** : le rendu vient du fichier lui-même. Auteur (réglable), date, `NM` unique.
- **Sélection** : déplacer (glisser), redimensionner (coins : rectangle, ellipse, zone de texte, tampon), couleur, épaisseur, taille du texte, double-clic pour modifier le texte, ⌫ pour supprimer.
- **Panneau Commentaires** : liste par page (auteur, date, texte), filtre, aller au commentaire, modifier, **répondre** (fils de discussion, `IRT`), supprimer (les réponses partent avec le parent). Commentaires d'autres logiciels listés et marqués « Créé dans un autre logiciel ».
- Chaque ajout est une étape de l'historique (annuler / rétablir) ; le document n'est écrit sur le disque que par « Enregistrer ». Les commentaires suivent leurs pages quand on les réorganise.

### Combiner et diviser (étape 3)
- **Combiner des fichiers** : PDF et images (JPEG, PNG ; WebP, GIF, BMP… si le navigateur sait les décoder), réordonner (↑ ↓), retirer, **plage de pages par fichier** (« 1-3, 5, 8- », ordre conservé), mots de passe demandés pour les PDF chiffrés. Si un document est ouvert, il est la première ligne.
- **Signets** : un signet par fichier (nom sans extension) avec dessous les signets d'origine, remappés sur les nouvelles pages (signets vers des pages non gardées retirés) ; option pour ne pas les garder.
- **Images** : page à la taille de l'image, réduite pour tenir dans un A4 (portrait ou paysage) ; orientation EXIF des JPEG respectée (page tournée).
- **Diviser** : par plages, tous les N pages, ou aux signets de premier niveau (les pages avant le premier signet forment une partie). Aperçu des noms (« rapport - pages 1–3.pdf », noms uniques, caractères interdits retirés), **.zip** (fflate) ou ouverture dans des onglets (10 parties au plus), 200 parties au plus.
- Tout tourne dans un Web Worker, avec **progression et Annuler** ; fusion de 10 × 100 pages en ≈ 0,2 s (cible : < 10 s).
- Les fichiers produits ne contiennent que le contenu atteignable depuis les pages gardées.

### Enregistrer (étape 2)
- **⌘S** remplace le fichier (Chrome, Edge : écriture sur place via un fichier temporaire, atomique), puis **relit le fichier et compare** (SHA-256) avec ce qui devait être écrit.
- **⇧⌘S** « Enregistrer sous ». Safari et Firefox n'ont pas cette API : Cigale **télécharge une copie** et le dit.
- **Version précédente** gardée avant chaque remplacement (5 dernières, sur l'ordinateur, désactivable), téléchargeable depuis Accueil → Versions précédentes.
- Indicateurs : point devant l'onglet, « Modifications non enregistrées / Enregistré à 14:32 », confirmation à la fermeture, avertissement du navigateur en quittant la page.
- Document **signé** : avertissement avant la première modification.

### Écran d'accueil
Même disposition que Grillon : colonne colorée (Accueil, Ouvrir, Versions précédentes, Paramètres, Nouveautés, version) et tuiles Ouvrir / Combiner (prévu, étape 3), Récents (noms et tailles gardés sur l'appareil ; rouverture directe avec Chrome/Edge). Menu **Fichier** en haut à gauche dans toute l'application.

### Confidentialité et hors-ligne
Aucune requête réseau avec des données ; CSP stricte ; aucune télémétrie ; service worker : fonctionne sans connexion après la première visite.

## Limites connues

| Limite | Détail | Prévu |
|---|---|---|
| Surlignage de scans | Surligner / souligner / barrer exigent du texte sélectionnable : sur un scan, utiliser un rectangle (OCR prévu) | 1.x |
| Zone de texte | Seuls les caractères du jeu Windows Latin-1 (accents français, œ, €…) sont dessinés ; les autres s'affichent « ? » (le texte exact reste dans le commentaire). Pages tournées : le texte tourne avec la page | 1.x |
| Formes | Pas de polygone, de nuage ni de gomme ; extrémités d'une ligne non modifiables (on la déplace ou on la refait) ; redimensionnement des seuls rectangle, ellipse, zone de texte, tampon | Étape 5 |
| Tampons | Six modèles fixes, pas de tampon image personnalisé ni de date | 1.x |
| Commentaires d'autres logiciels | Modifiables, mais si on change leur couleur ou leur forme, Cigale redessine leur apparence à sa façon | — |
| États de révision | Pas de statut (accepté / refusé) ni de réponse à une réponse dans l'interface | Étape 5 |
| Notes | Le texte s'affiche en bulle dans les autres lecteurs ; dans Cigale, au survol et dans le panneau | — |
| Fusion : formulaires | Les champs de formulaire des fichiers combinés ne sont pas repris (le contenu affiché l'est) | Étape 5 |
| Découpe : signets | Les parties ne reprennent pas les signets | Étape 5 |
| Fichier ajouté à « Combiner » | Le garde-fou de structure (pdf-lib / pdf.js comptent autant de pages) ne s'applique qu'au document déjà ouvert | Étape 5 |
| Images HEIC, TIFF | Acceptées seulement si le navigateur sait les décoder (Safari : HEIC ; Chrome : non) ; sinon message clair | — |
| Combiner : glisser-déposer | Réordonner avec ↑ ↓ (pas de glisser) ; pas de dépôt de fichiers dans la boîte | Étape 5 |
| « .bak » à côté du fichier | Navigateur : impossible (un seul fichier choisi), l'ancienne version est gardée dans Cigale (Accueil → Versions précédentes). **Application Mac : vrai .bak** | — |
| Application Mac : glisser-déposer d'un fichier de l'extérieur | Le Mac ne donne pas le chemin du fichier : il s'ouvre mais « Enregistrer » demande où écrire. Préférer « Ouvrir » ou le double-clic dans le Finder | — |
| Application Mac : mises à jour | Pas de mise à jour automatique ; non signée (voir ci-dessus) | Étape 5 |
| Safari / Firefox | Pas d'enregistrement sur place : copie téléchargée | — |
| Extraire | Le nouveau document ne reprend ni les signets ni les formulaires | Étape 5 |
| Signets et liens vers une page supprimée | Ne mènent plus nulle part (comme dans Acrobat) ; le contenu de la page supprimée n'est plus dans le fichier | — |
| Insérer d'un autre PDF | Les signets et formulaires du fichier inséré ne sont pas repris | Étape 5 |
| Structure inhabituelle | Si pdf-lib et pdf.js ne comptent pas le même nombre de pages (page sans /Type…), Cigale refuse de modifier plutôt que de risquer la mauvaise page | Étape 5 |
| Document signé | Toute modification invalide la signature (avertissement donné avant) | 1.x |
| Annuler | L'historique garde les octets complets : lourd pour de très gros PDF (plafond 400 Mo, les plus anciennes étapes sont oubliées) | Étape 5 |
| Annotations existantes | Affichées, mais non modifiables | Étape 4 |
| Formulaires | Champs affichés, saisie non prise en charge | 1.x |
| Impression (⌘P) | Absente | Étape 5 |
| Reprise après fermeture | Pas encore de sauvegarde automatique (rien à perdre tant qu'il n'y a pas de modification) | Étape 5 |
| PDF réparés | Aucune réparation maison : seule la tolérance de pdf.js | Étape 5 |
| Rouvrir un récent | Safari et Firefox ne gardent pas l'accès au fichier : il faut repasser par « Ouvrir » | — |
| Chiffrement non pris en charge | Message d'erreur explicite ; pas de contournement | — |
| Rotation de l'affichage | ⌘⇧R ne change que l'affichage ; « Pivoter les pages » (miniatures) modifie le fichier | — |
| Mémoire | Le fichier est gardé deux fois en mémoire (original + copie pour pdf.js) | Étape 5 |
