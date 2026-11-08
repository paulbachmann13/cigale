# Fonctionnalités et limites connues

État : **version 1.1** (1.0 + formulaires, signature, caviardage, filigrane, en-têtes, recadrage, export en images).

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

### Formulaires, signature, caviardage, outils de page (1.1)
- **Remplir un formulaire** (AcroForm) : champs texte, cases, radios, listes déroulantes, directement dans la page (pdf.js) ; la saisie est écrite dans les champs avec leur apparence (`fillForm`, seuls les champs modifiés sont redessinés) à ⌘S, « Valider la saisie » ou avant toute autre opération ; une étape annuler/rétablir. Les formulaires XFA sont conservés, pas modifiés.
- **Signature (image)** : dessin à la souris / au stylet, texte en écriture cursive, image importée (fond blanc rendu transparent) ; posée comme un tampon-image (vraie annotation /Stamp avec l'image dans l'apparence), déplaçable et redimensionnable ; 6 signatures gardées dans IndexedDB. **Pas de signature numérique à certificat** (limite).
- **Caviardage** : marques standard /Redact (visibles dans Acrobat), puis « Appliquer » : les pages marquées sont rendues à 200 dpi avec les zones noircies et **remplacent** les pages d'origine ; purge de tout ce qui les référençait (champs de formulaire, annotations, structure logique, fils d'articles) ; options : informations du document, signets, pièces jointes, historique « Annuler » et copies de sécurité (par défaut oui). Après un caviardage, « Enregistrer » ne garde aucune copie de l'ancienne version. Vérifié sur page tournée.
- **Protection par mot de passe** (`protect-ops.ts`) : mot de passe d'ouverture et/ou restrictions (impression, copie, modification, commentaires) + mot de passe propriétaire, AES-256 (vérifié avec `qpdf`) ; **retirer la protection**. Après l'opération : historique effacé, copies de sécurité non protégées supprimées, plus aucune copie de l'ancienne version. Les restrictions sont respectées par les lecteurs courants mais ne sont pas une protection technique : seul le mot de passe d'ouverture chiffre.
- **Filigrane**, **en-têtes / pieds de page / numérotation** (jetons {page} {pages} {date} {title}), **recadrage** (marges comme à l'écran, pages tournées comprises), **export en images** (PNG/JPEG → .zip). Portée : toutes les pages, page affichée, sélection ou plages. Chaque outil est une étape annuler/rétablir.

### Fiabilité (étape 5)
- **Documents protégés** : un PDF ouvert avec mot de passe reste protégé après toute opération (modifier, commenter, extraire, diviser, combiner) : même mot de passe d'ouverture, mêmes restrictions, AES-256. Avertissement avant la première modification (l'ancien mot de passe propriétaire est remplacé). Un PDF à restrictions seules (copie interdite, sans mot de passe d'ouverture) se modifie aussi et garde ses restrictions.
- **Sauvegarde automatique** : 2 s après la dernière modification (et quand la page est masquée), copie dans IndexedDB ; « Reprendre » sur l'accueil ; supprimée à l'enregistrement, à la fermeture ou sur choix ; réglable ; jamais envoyée ailleurs. Les documents protégés restent chiffrés dans la sauvegarde.
- **Imprimer** (⌘P) : toutes les pages / page affichée / plages ; commentaires compris ; chaque page est dessinée à 200 dpi puis la boîte du système s'ouvre (« Enregistrer au format PDF » possible) ; dans l'application Mac aussi.
- **Corpus de PDF difficiles** (`tests/unit/corpus.test.ts`) : octets parasites avant l'en-tête, nombre de pages faux, page sans type, fichier tronqué, table des références fausse, page tournée avec zone de recadrage décalée, attributs hérités, chiffrement AES-256 / AES-128 / RC4, restrictions seules, 30 pages liées entre elles, formulaires et XFA. Pour chacun et pour chaque opération : refus clair ou résultat qui se rouvre avec le bon nombre de pages. **200 mutations aléatoires** d'un PDF (octets changés, morceaux supprimés ou dupliqués, troncature) : aucun blocage, aucun résultat faux.
- **Safari** : toute la batterie de tests automatiques tourne aussi sur WebKit.

### Application Mac (.dmg)
- Même code que la version web, dans une fenêtre native (Tauri 2). Installation : ouvrir le .dmg, glisser Cigale dans Applications.
- **Ouvrir avec** : double-clic sur un PDF du Finder (ou « Ouvrir avec → Cigale »), qu'elle soit déjà lancée ou non.
- Boîtes « Ouvrir » / « Enregistrer sous » natives ; ⌘S **réécrit le fichier de façon atomique** (fichier temporaire puis renommage) puis relit et compare ; **vrai `.bak`** à côté (« nom.pdf.bak », la version d'avant le dernier enregistrement), en plus des versions gardées dans Cigale.
- Fermeture de la fenêtre avec des modifications : question « Enregistrer / Ne pas enregistrer / Annuler ».
- Les récents gardent le chemin du fichier : rouverture directe.
- Application **non signée** (pas de compte développeur Apple) : au premier lancement, clic droit sur Cigale → Ouvrir. **Mises à jour automatiques** : vérification discrète 5 s après le démarrage (réglable) et Fichier → Rechercher les mises à jour ; notes de la version, téléchargement avec progression, installation, redémarrage sans deuxième icône dans le Dock ; le travail non enregistré est sauvegardé avant le redémarrage ; refus propre si Cigale est lancée depuis le .dmg ou Téléchargements ; signature vérifiée.

### Application Windows (.exe, 1.4)
- Même code que sur Mac (Tauri 2, WebView2). Installateur `Cigale_X.Y.Z_x64-setup.exe`, installation pour l'utilisateur courant (pas de droits d'administrateur, donc mises à jour sans question de Windows). Mêmes fonctions de fichiers que sur Mac (écriture atomique, `.bak`, récents, « Ouvrir avec », fermeture avec modifications).
- Double-clic sur un PDF alors que Cigale tourne déjà : le fichier s'ouvre dans un onglet de la fenêtre existante (instance unique).
- **Limites** : non signée par Microsoft (pas de certificat de signature de code) → au premier lancement, « Informations complémentaires » puis « Exécuter quand même » ; WebView2 doit être présent (déjà installé sur Windows 10/11 à jour, sinon l'installateur le télécharge) ; Windows sur ARM : tourne par émulation ; **jamais testée sur un vrai PC par l'auteur** avant la première installation (voir docs/VERIFICATION-MANUELLE.md).

### Écriture manuscrite (1.5, étape A du mode « Notes »)
- Outil « Écrire et dessiner » : Stylo, Plume (pression), Surligneur (multiplication avec le texte), couleurs et épaisseurs par stylo, Gomme (trait entier). Les traits vivent d'abord en mémoire (`ink-store.ts`) et sont écrits d'un coup (annotations `Ink` avec flux d'apparence rempli, clés `/CigalePen` et `/CigaleP` pour garder stylo et pression) après 1,5 s sans écrire, à tout changement d'outil, et avant toute autre opération ou enregistrement.
- **Étape B** : maintenir le stylet 0,55 s sans bouger redresse le trait (`src/data/shapes.ts`, pur et testé : ligne, angle, cercle/ellipse, rectangle aligné ou tourné, polygone de 3 à 6 sommets ; prudent : écriture, zigzag, spirale non reconnus). Règle virtuelle (bords aimantés à 22 px, aimant d'angle 15°, position gardée par session). Lasso sur les traits enregistrés (au moins la moitié du trait dans la boucle) : déplacer (une étape), dupliquer, supprimer ; les traits encore en attente sont d'abord envoyés au document quand on choisit le lasso. Limites : le lasso ne choisit que les traits écrits au stylo (pas les surlignages de texte ni les formes de l'outil Formes) ; pas de rotation ni de redimensionnement de la sélection ; la règle se déplace et tourne mais n'a pas de graduation chiffrée ; formes reconnues approximatives pour un rectangle très incliné.
- Stylet : pression et événements groupés (`getCoalescedEvents`) ; dès qu'un stylet a servi, le doigt fait défiler. **Limites** : pas de pincement pour zoomer pendant qu'on écrit (zoom par les boutons) ; la latence est celle d'une page web (un peu supérieure à une application native) ; **jamais essayé avec un vrai Apple Pencil** (voir VERIFICATION-MANUELLE) ; pas encore de règle, de formes ni de lasso (étape B) ; la gomme efface un trait entier, pas une partie.

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

### Reconnaissance de texte (OCR, 1.2)
- **Outils → Reconnaître le texte (OCR)** : chaque page est dessinée à 300 dpi par pdf.js, lue par tesseract.js (moteur LSTM, WebAssembly, données « best_int » français et anglais), puis le texte est ajouté **invisible** (mode de rendu 3) à l'emplacement exact de chaque mot : recherche, sélection et copie fonctionnent ; l'aspect des pages ne change pas. Pages tournées et recadrées prises en charge. Option (cochée) : ignorer les pages qui ont déjà du texte. Une étape annuler/rétablir. Tout est local et hors ligne (≈ 7,5 Mo de ressources mises en cache).

## Limites connues

| Limite | Détail | Prévu |
|---|---|---|
| Surlignage de scans | Surligner / souligner / barrer exigent du texte sélectionnable : sur un scan, lancer d'abord Outils → Reconnaître le texte | — |
| OCR | Français et anglais seulement ; pages scannées à l'envers ou de travers non redressées ; écriture manuscrite mal reconnue ; caractères hors Latin-1 écrits « ? » dans la couche de texte ; environ 3 à 10 s par page selon l'ordinateur ; un texte reconnu ne se « dé-reconnaît » qu'avec Annuler | 1.x |
| Zone de texte | Seuls les caractères du jeu Windows Latin-1 (accents français, œ, €…) sont dessinés ; les autres s'affichent « ? » (le texte exact reste dans le commentaire). Pages tournées : le texte tourne avec la page | 1.x |
| Formes | Pas de polygone, de nuage ni de gomme ; extrémités d'une ligne non modifiables (on la déplace ou on la refait) ; redimensionnement des seuls rectangle, ellipse, zone de texte, tampon | Étape 5 |
| Tampons | Six modèles fixes, pas de tampon image personnalisé ni de date | 1.x |
| Commentaires d'autres logiciels | Modifiables, mais si on change leur couleur ou leur forme, Cigale redessine leur apparence à sa façon | — |
| États de révision | Pas de statut (accepté / refusé) ni de réponse à une réponse dans l'interface | Étape 5 |
| Notes | Le texte s'affiche en bulle dans les autres lecteurs ; dans Cigale, au survol et dans le panneau | — |
| Caviardage | Les pages caviardées deviennent des images (texte non sélectionnable, liens et commentaires perdus) ; le texte des AUTRES pages reste ; un .bak déjà présent à côté du fichier n'est pas supprimé par Cigale ; aucune comparaison avec le contenu « invisible » d'images scannées (OCR) | — |
| Signature | Image seulement, pas de certificat ; les polices cursives dépendent de l'ordinateur | 1.x |
| Filigrane / en-têtes | Police Helvetica, caractères hors Latin-1 remplacés par « ? » ; texte posé par-dessus le contenu (pas en dessous) | 1.x |
| Recadrer | Réduit la zone visible sans supprimer le contenu (utiliser le caviardage pour supprimer) | — |
| Extraire une zone | Une zone tracée sur UNE page devient un PDF d'une page. Mode vectoriel : le texte reste sélectionnable mais le reste de la page reste caché dans le fichier (comme « Recadrer ») ; mode image : seule l'image de la zone est gardée. Pas de zone sur plusieurs pages | — |
| Formulaires | Pas de création de champs, pas de calculs JavaScript ni de validation de formats ; signature numérique des champs de signature non prise en charge | 1.x |
| Fusion : formulaires | Les champs de formulaire des fichiers combinés ne sont pas repris (le contenu affiché l'est) | Étape 5 |
| Découpe : signets | Les parties ne reprennent pas les signets | Étape 5 |
| Fichier ajouté à « Combiner » | Le garde-fou de structure (pdf-lib / pdf.js comptent autant de pages) ne s'applique qu'au document déjà ouvert | Étape 5 |
| Images HEIC, TIFF | Acceptées seulement si le navigateur sait les décoder (Safari : HEIC ; Chrome : non) ; sinon message clair | — |
| Combiner : glisser-déposer | Réordonner avec ↑ ↓ (pas de glisser) ; pas de dépôt de fichiers dans la boîte | Étape 5 |
| « .bak » à côté du fichier | Navigateur : impossible (un seul fichier choisi), l'ancienne version est gardée dans Cigale (Accueil → Versions précédentes). **Application Mac : vrai .bak** | — |
| Application Mac : glisser-déposer d'un fichier de l'extérieur | Le Mac ne donne pas le chemin du fichier : il s'ouvre mais « Enregistrer » demande où écrire. Préférer « Ouvrir » ou le double-clic dans le Finder | — |
| Application Mac : signature Apple | Non signée par Apple (pas de compte développeur) : premier lancement par clic droit → Ouvrir. Les mises à jour, elles, sont signées (clé propre à Cigale) | — |
| Safari / Firefox | Pas d'enregistrement sur place : copie téléchargée | — |
| Extraire | Le nouveau document ne reprend ni les signets ni les formulaires | Étape 5 |
| Signets et liens vers une page supprimée | Ne mènent plus nulle part (comme dans Acrobat) ; le contenu de la page supprimée n'est plus dans le fichier | — |
| Insérer d'un autre PDF | Les signets et formulaires du fichier inséré ne sont pas repris | Étape 5 |
| Structure inhabituelle | Si pdf-lib et pdf.js ne comptent pas le même nombre de pages (page sans /Type…), Cigale refuse de modifier plutôt que de risquer la mauvaise page | Étape 5 |
| Document signé | Toute modification invalide la signature (avertissement donné avant) | 1.x |
| Annuler | L'historique garde les octets complets : lourd pour de très gros PDF (plafond 400 Mo, les plus anciennes étapes sont oubliées) | Étape 5 |
| Annotations existantes | Affichées, mais non modifiables | Étape 4 |
| Formulaires | Champs affichés, saisie non prise en charge | 1.x |
| Impression | Chaque page est une image à 200 dpi : le PDF « enregistré » depuis la boîte d'impression n'a plus de texte sélectionnable ; toutes les pages sortent au format de la première ; 300 pages au plus à la fois | 1.x |
| Sauvegarde automatique | Documents de plus de 150 Mo non sauvegardés ; « Reprendre » rouvre un nouveau document (sans lien avec le fichier d'origine : « Enregistrer sous ») | — |
| Protection | AES-256 systématique (même si l'original était RC4/AES-128) ; le mot de passe propriétaire d'origine est remplacé ; les restrictions sont conservées | — |
| PDF réparés | Cigale ne répare pas un PDF abîmé : si pdf.js le lit mais que pdf-lib compte autrement les pages, elle refuse de le modifier (lecture et impression restent possibles) | — |
| Rouvrir un récent | Safari et Firefox ne gardent pas l'accès au fichier : il faut repasser par « Ouvrir » | — |
| Chiffrement non pris en charge | Message d'erreur explicite ; pas de contournement | — |
| Rotation de l'affichage | ⌘⇧R ne change que l'affichage ; « Pivoter les pages » (miniatures) modifie le fichier | — |
| Mémoire | L'historique garde les octets de chaque étape (plafond 400 Mo) | — |
