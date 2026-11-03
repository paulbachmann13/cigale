# Performances

Mesures automatiques (test `tests/e2e/performance.spec.ts`, Chromium, build de production, Mac Apple Silicon) et cibles.

| Mesure | Cible | Résultat (2026-11-03) |
|---|---|---|
| Première page d'un PDF de 500 pages (fichier de 0,8 Mo) | < 2 s | **≈ 160 ms** (du clic à la première page dessinée) |
| Canevas simultanés après un saut à la page 400 | maîtrisé | < 30 (pdf.js ne garde que les pages proches) |
| Fusion de 10 fichiers de 100 pages | < 10 s | étape 3 |
| Scan de 200 pages et plus | fluide | étape 5 (corpus de scans lourds) |

Les miniatures sont dessinées à la demande et libérées hors écran. Les chiffres sont mesurés sur des PDF synthétiques :
à refaire avec de vrais scans (200–300 dpi) à l'étape 5.


## Étape 5 (version 1.0) — mesures

Mesurées sur un MacBook Apple Silicon, document synthétique de 500 pages (≈ 1 Mo, 30 lignes de texte par page).

| Opération | Mesure | Cible |
|---|---|---|
| Première page d'un PDF de 500 pages (navigateur) | ≈ 130 ms | < 2 s |
| Pivoter une page, 500 pages (worker + rechargement + miniatures, navigateur) | ≈ 1,0 s | < 3 s |
| Supprimer une page, 500 pages (navigateur) | ≈ 0,9 s | < 3 s |
| Annuler, 500 pages (navigateur) | ≈ 0,1 s | < 3 s |
| Pivoter 50 pages sur 500 (moteur seul) | ≈ 0,1 s | < 8 s |
| Supprimer 100 pages sur 500 (moteur seul) | ≈ 0,1 s | < 10 s |
| Déplacer 20 pages sur 500 (moteur seul) | ≈ 0,1 s | < 10 s |
| Commenter une page de 500 / lister les commentaires | ≈ 0,1 s / 0,03 s | < 8 s / 5 s |
| Découper 500 pages en 10 parties | ≈ 0,1 s | < 15 s |
| Fusionner 10 fichiers de 100 pages, avec signets | ≈ 0,2 s | < 10 s |
| 40 scans A4 (200 dpi) assemblés | ≈ 3 s | — |

Remarques : les scans de test sont synthétiques (très compressibles) ; avec de vrais scans de plusieurs Mo par page, la durée est dominée par la lecture et l'écriture des images (Cigale ne les recompresse jamais). Mémoire : l'historique annuler/rétablir garde les octets complets de chaque étape (plafond 400 Mo, les plus anciennes sont oubliées) ; la sauvegarde automatique ignore les documents de plus de 150 Mo. Impression : chaque page est dessinée à 200 dpi (33 Mpx au plus) et libérée aussitôt ; 300 pages au plus par impression.
