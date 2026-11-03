# Fonctionnalités et limites connues

État : **étape 1 (socle)**, version 0.1.0.

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

### Écran d'accueil
Ouvrir, Combiner (prévu, étape 3), Récents (noms et tailles gardés sur l'appareil ; rouverture directe avec Chrome/Edge), Reprendre (prévu, étape 5), Paramètres, Nouveautés, numéro de version.

### Confidentialité et hors-ligne
Aucune requête réseau avec des données ; CSP stricte ; aucune télémétrie ; service worker : fonctionne sans connexion après la première visite.

## Limites connues

| Limite | Détail | Prévu |
|---|---|---|
| Lecture seule | Pas encore d'enregistrement, d'organisation, de fusion ni d'annotation | Étapes 2 à 4 |
| Annotations existantes | Affichées, mais non modifiables | Étape 4 |
| Formulaires | Champs affichés, saisie non prise en charge | 1.x |
| Impression (⌘P) | Absente | Étape 5 |
| Reprise après fermeture | Pas encore de sauvegarde automatique (rien à perdre tant qu'il n'y a pas de modification) | Étape 5 |
| PDF réparés | Aucune réparation maison : seule la tolérance de pdf.js | Étape 5 |
| Rouvrir un récent | Safari et Firefox ne gardent pas l'accès au fichier : il faut repasser par « Ouvrir » | — |
| Chiffrement non pris en charge | Message d'erreur explicite ; pas de contournement | — |
| Rotation sur plusieurs documents | La rotation d'affichage est conservée par onglet, pas dans le fichier | Étape 2 (rotation réelle) |
| Mémoire | Le fichier est gardé deux fois en mémoire (original + copie pour pdf.js) | Étape 5 |
