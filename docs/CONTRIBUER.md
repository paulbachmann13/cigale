# Travailler sur Cigale à plusieurs

Cigale est un éditeur PDF local et gratuit (PWA + applications Mac et Windows), interface en français. Dépôt : https://github.com/paulbachmann13/cigale
Lire d'abord `CLAUDE.md` (règles du projet) et `docs/ARCHITECTURE.md`.

## Qui peut faire quoi

- **Jérôme (`jeromebachmann-netizen`)** est collaborateur avec le droit d'écriture. Paul (`paulbachmann13`) est administrateur.
- **`main` est protégée** : on n'y pousse jamais directement. Tout passe par une **branche** puis une **pull request** (PR) que Paul relit et accepte.
- **Les étiquettes `v…` sont réservées à Paul** : elles publient les applications Mac et Windows, signées avec la clé de mises à jour. Ne jamais créer d'étiquette, ne jamais modifier `.github/workflows/`.
- Un push sur `main` met le site en ligne : c'est une des raisons de la protection.

## Première mise en route (le dépôt est peut-être déjà cloné)

```bash
git remote -v                      # doit pointer vers https://github.com/paulbachmann13/cigale.git
git checkout main && git pull      # se remettre à jour avant de commencer
npm install                        # Node 22 requis
```
Pour pousser, se connecter à GitHub avec le compte `jeromebachmann-netizen` (par exemple `gh auth login`, ou le gestionnaire d'identifiants de Git).

## Chaque modification

```bash
git checkout main && git pull
git checkout -b ma-modification          # un nom court, un sujet par branche
# … modifier le code …
npm run typecheck && npm test            # doivent passer ; npm run test:e2e avant une PR importante
git add -A
git commit -m "feat: ce que j'ai changé"  # Conventional Commits en français : feat:, fix:, test:, docs:
git push -u origin ma-modification
```
Puis sur GitHub : **Compare & pull request** → décrire en une ou deux phrases → demander la relecture de Paul. Ne pas fusionner soi-même.

Après la fusion : `git checkout main && git pull`, puis supprimer la branche.

## Règles du projet à respecter

- Textes de l'interface **uniquement** dans `src/i18n/fr.ts`, en français simple.
- **Ne jamais abîmer un document** : toute opération produit un nouveau document ; l'original n'est écrasé que par « Enregistrer ». Jamais `doc.save()` direct dans `src/pdf/` (utiliser `saveDoc`).
- **Licences** : Apache-2.0 / MIT / BSD / ISC seulement (pas de GPL/AGPL). Versions des dépendances **figées** (sans `^`). Vérifier avec `npm run check:licenses`.
- **Confidentialité** : aucune requête réseau avec des données, aucune télémétrie.
- Ajouter ou adapter les **tests** (`tests/unit`, `tests/e2e`). Ne jamais dire « terminé » sans avoir lancé les tests.
- Un changement visible par l'utilisateur : une ligne simple dans `CHANGELOG.md` (lue par Paul dans l'application), sous la version en cours.
- Aucun secret (clés, mots de passe, jetons) dans le code, les messages de commit ni les PR.

## En cas de doute

Ne pas pousser : demander à Paul. Une branche ne coûte rien et se supprime ; `main` et les étiquettes, non.
