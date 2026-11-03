# Cigale face à Adobe Acrobat

Inventaire des commandes d'Acrobat (Pro, version française) et de leur état dans Cigale. C'est la feuille de route.

Légende : **Oui** = disponible · **Partiel** = avec des limites (voir la note) · **Non** = absent.

## Fichier

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Ouvrir (⌘O), glisser-déposer, Ouvrir avec | Oui | Plusieurs onglets |
| Fichiers récents | Oui | Noms seulement, sur l'appareil |
| Enregistrer (⌘S), Enregistrer sous (⇧⌘S) | Oui | Écriture vérifiée ; version précédente gardée ; Safari/Firefox : copie téléchargée |
| Annuler / Rétablir (⌘Z, ⇧⌘Z) | Oui | Pages seulement pour l'instant |
| Imprimer (⌘P) | Partiel | Pages, plages, commentaires ; pages rasterisées à 200 dpi ; pas de mise à l'échelle ni de réglages avancés |
| Propriétés du document | Non | |
| Protéger par mot de passe / retirer la protection | Oui | AES-256 ; restrictions + mot de passe propriétaire |
| Ouvrir un PDF protégé par mot de passe | Oui | Reste protégé après modification |
| Combiner des fichiers | Oui | PDF et images, plages par fichier, signets conservés |
| Créer un PDF depuis une image | Oui | Via « Combiner » (JPEG, PNG, WebP…) |
| Exporter vers images | Oui | PNG / JPEG en .zip |
| Exporter vers Word, Excel | Non | Hors périmètre |

## Affichage

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Zoom (liste, ⌘+, ⌘−), largeur (⌘2), page (⌘0), taille réelle (⌘1) | Oui | |
| Affichage de page : une page, continu, deux pages | Oui | « Deux pages » défile en continu |
| Pivoter l'affichage (⇧⌘+ / ⇧⌘−) | Partiel | ⌘⇧R, un sens ; l'affichage seulement |
| Plein écran | Oui | |
| Aller à la page | Oui | |
| Panneau Miniatures, Signets | Oui | |
| Panneau Commentaires | Oui | Par page, filtre, réponses ; pas de statuts de révision |
| Rechercher (⌘F), suivant/précédent | Oui | Pas de recherche multi-fichiers |
| Sélection et copie de texte | Oui | |
| Outil Main / Sélection | Partiel | Sélection de texte ; outil « Sélectionner » dans Commenter |
| Mode sombre | Oui | |
| Lecture à voix haute | Non | Hors périmètre |

## Organiser les pages

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Réordonner (glisser-déposer, grille), pivoter, supprimer, dupliquer, insérer (vierge ou autre PDF), extraire | Oui | Étape 2 |
| Recadrer | Oui | Marges en mm |
| Remplacer des pages | Non | 1.x |
| Diviser un document | Oui | Plages, tous les N pages, signets ; .zip ou onglets |
| Numéros de page, en-têtes, pieds, filigrane | Oui | Texte par-dessus ; Helvetica |

## Commenter

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Surligner, souligner, barrer, zone de texte, note, dessin, formes (rectangle, ellipse, ligne, flèche), tampons | Oui | Gomme, polygone, nuage : non |
| Afficher les annotations existantes | Oui | Modifiables dans Commenter |
| Liste des commentaires, réponses | Oui | |

## Autres outils

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Remplir un formulaire (texte, cases, radios, listes) | Oui | Sans calculs JavaScript |
| Signer (image de signature : dessin, texte, image) | Oui | Pas de signature numérique à certificat |
| Signature numérique (certificat) | Non | 1.x |
| Caviarder (marques + appliquer) | Oui | Pages rasterisées ; purge des métadonnées/signets/pièces jointes |
| Reconnaissance de texte (OCR) | Non | 1.x |
| Compresser | Non | 1.x |
| Comparer deux fichiers | Non | 1.x |
| Modifier le texte | Non | 1.x (limité) |
| Liens internes et signets cliquables | Oui | |
