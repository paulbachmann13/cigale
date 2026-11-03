# Fonctionnalités et limites connues

État : **étape 2 (organiser les pages et enregistrer)**, version 0.2.0.

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
| Pas de fusion ni d'annotation | Seules les pages s'organisent pour l'instant | Étapes 3 et 4 |
| « .bak » à côté du fichier | Un navigateur ne peut pas créer de fichier voisin : l'ancienne version est gardée dans Cigale (Accueil → Versions précédentes). L'application Mac pourra écrire un vrai .bak | App Mac |
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
