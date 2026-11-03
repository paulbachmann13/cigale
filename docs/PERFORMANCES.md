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
