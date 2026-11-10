# Cigale face à Adobe Acrobat

Inventaire des commandes d'Acrobat (Pro, version française) et de leur état dans Cigale. C'est la feuille de route.

Légende : **Oui** = disponible · **Partiel** = avec des limites (voir la note) · **Non** = absent.

## Fichier

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Ouvrir (⌘O), glisser-déposer, Ouvrir avec | Oui | Plusieurs onglets |
| Fichiers récents | Oui | Noms seulement, sur l'appareil |
| Enregistrer (⌘S), Enregistrer sous (⇧⌘S) | Oui | Écriture vérifiée ; version précédente gardée ; Safari/Firefox : copie téléchargée |
| Annuler / Rétablir (⌘Z, ⇧⌘Z) | Oui | Pages, commentaires, formulaires et écriture (trait par trait) |
| Imprimer (⌘P) | Partiel | Pages, plages, commentaires ; pages rasterisées à 200 dpi ; pas de mise à l'échelle ni de réglages avancés |
| Propriétés du document | Oui (1.7) | Taille, pages, format, version, dates ; titre, auteur, sujet, mots-clés modifiables ; XMP non touché |
| Protéger par mot de passe / retirer la protection | Oui | AES-256 ; restrictions + mot de passe propriétaire |
| Ouvrir un PDF protégé par mot de passe | Oui | Reste protégé après modification |
| Combiner des fichiers | Oui | PDF et images, plages par fichier, signets conservés |
| Créer un PDF depuis une image | Oui | Via « Combiner » (JPEG, PNG, WebP…) |
| Exporter vers images | Oui | PNG / JPEG en .zip |
| Exporter vers Word, texte | Partiel (1.7) | .docx et .txt : paragraphes de texte, sans mise en page ni images ; pas d'Excel |

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
| Extraire une zone en nouveau PDF (rogner une partie de page) | Oui (1.3) | Vectoriel (texte gardé) ou image ; équivalent de « Capture » + « Créer un PDF » |
| Écran d'accueil « Tous les outils » | Oui (1.3) | Tuiles : diviser, recadrer, filigrane, en-têtes, protéger, caviarder, OCR, images, zone |
| Remplacer des pages | Oui (1.7) | Par les pages d'un autre PDF, avec confirmation ; annulable |
| Diviser un document | Oui | Plages, tous les N pages, signets ; .zip ou onglets |
| Numéros de page, en-têtes, pieds, filigrane | Oui | Texte par-dessus ; Helvetica |

## Commenter

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Surligner, souligner, barrer, zone de texte, note, dessin, formes (rectangle, ellipse, ligne, flèche), tampons | Oui | Gomme précise (1.7) ; polygone, nuage : non |
| Afficher les annotations existantes | Oui | Modifiables dans Commenter |
| Liste des commentaires, réponses | Oui | |

## Autres outils

| Commande Acrobat | Cigale | Note |
|---|---|---|
| Remplir un formulaire (texte, cases, radios, listes) | Oui | Sans calculs JavaScript |
| Signer (image de signature : dessin, texte, image) | Oui | Pas de signature numérique à certificat |
| Signature numérique (certificat) | Non | 1.x |
| Caviarder (marques + appliquer) | Oui | Pages rasterisées ; purge des métadonnées/signets/pièces jointes |
| Reconnaissance de texte (OCR) | Oui (1.2) | Français et anglais ; pas de redressement des pages de travers |
| Compresser | Non | 1.x |
| Comparer deux fichiers | Oui (1.7) | Texte mot à mot, page par page (pages en plus ou en moins signalées) ; pas de comparaison visuelle |
| Modifier le texte | Non | 1.x (limité) |
| Liens internes et signets cliquables | Oui | |

## Ce que fait Acrobat Pro de plus (enquête du 10/11/2026)

Sources : page de comparaison d'Adobe (Reader gratuit ; Standard 7,19 $/mois ; Pro 9,60 $/mois, abonnement annuel) et comparatifs tiers. Les fonctions d'IA d'« Acrobat Studio » (résumés, PDF Spaces…) ne sont dans aucune des trois éditions : hors périmètre.

| Fonction payante d'Acrobat | Édition | Cigale | Note / décision |
|---|---|---|---|
| Modifier le texte et les images d'un PDF | Standard, Pro | Non | Très lourd (polices, mise en page) ; l'écriture, les zones de texte et les images ajoutées couvrent l'usage courant |
| Convertir vers/depuis Word, Excel, PowerPoint | Standard, Pro | Partiel | PDF → Word/texte fait (1.7). Word → PDF : l'impression du système suffit ; Excel/PowerPoint : non |
| Organiser les pages (réordonner, extraire, fractionner, remplacer) | Standard, Pro | Oui | Remplacer ajouté en 1.7 |
| Créer, remplir et signer des formulaires | Standard, Pro | Oui | Pas de création de champs ni de calculs JavaScript |
| Collecter des signatures (demandes à des tiers) | Standard (limité), Pro | Non | Service en ligne : contraire à la confidentialité locale |
| Demandes de signature en masse, modèles de signature, marque personnalisée | Pro | Non | Idem (service en ligne) |
| Signature numérique à certificat | Pro | Non | À étudier : bibliothèque PKCS#7 permissive ; certificat du Mac/Windows |
| Protéger par mot de passe | Standard, Pro | Oui | AES-256, restrictions |
| OCR : scans en PDF modifiables et cherchables | Pro | Oui (1.2) | tesseract.js local, français et anglais |
| Caviarder (expurger) | Pro | Oui (1.1) | Réel : pages rasterisées, métadonnées purgées |
| Comparer deux PDF | Pro | Oui (1.7) | Texte mot à mot, page par page, avec contexte ; pas de comparaison des images/mise en page |
| Numérotation Bates | Pro | Oui (1.7) | Jeton {bates} : préfixe + numéro complété de zéros, de page en page, dans les en-têtes et pieds de page |
| Action Wizard, traitement par lots | Pro | Non | Prochaine étape : appliquer une suite d'outils à plusieurs fichiers |
| Compresser / optimiser | Standard, Pro | Non | Prochaine étape : recompression des images (JPEG) et flux |
| PDF/A, accessibilité, vérification préalable | Pro | Non | Hors périmètre |
| Objets multimédias, JavaScript, formulaires web | Pro | Non | Hors périmètre |
| Écrire au stylet, gomme, règle, lasso, carnets | (non, Acrobat est limité) | Oui | Au-delà d'Acrobat : univers « GoodNotes » |
