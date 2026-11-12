# Epure

Site de jeux classiques, sobres et sans pub : **Démineur**, **Blocs**, **Serpent**, **Fusion**.
Français / anglais, 16 thèmes, comptes, classements et duels en ligne.

Lancer en local (depuis ce dossier) :
```bash
python -m http.server 5173
```
puis ouvrir http://localhost:5173

## Architecture
```
epure/
├── index.html            Accueil (liste des jeux)
├── jeux/                 Un dossier par jeu, autonome
│   ├── demineur/         Démineur : solveur, 38 puzzles, MegaMines, Économie, Duel…
│   ├── blocs/            Blocs qui tombent : Marathon, Sprint, Ultra, Montée, Zen, Duel
│   ├── serpent/          Serpent : Classique, Sans murs, Labyrinthe, Chrono
│   └── fusion/           Fusion : 4×4, 5×5, 3×3, Chrono, Obstacles
├── pages/                Pages du site hors jeux
│   ├── account.html      Compte (inscription, connexion, suppression)
│   ├── admin.html        Administration (admins uniquement)
│   └── stats.html        Statistiques et classements
├── commun/               Code partagé par toutes les pages
│   ├── css/              base.css (couleurs, boutons…), shell.css (structure des jeux), themes.css (16 thèmes)
│   └── js/               ui.js (thèmes, icônes, langue, stats), i18n.js (anglais), online.js (Supabase), config.js
├── backend/              Documentation Supabase (+ backend/prive/, jamais envoyé sur GitHub)
└── outils/               Scripts de développement (ex. vérifier les puzzles)
```

## Ajouter un jeu
1. Créer `jeux/nom-du-jeu/index.html` en copiant l'en-tête d'un autre jeu (il charge `../../commun/css/*` et `../../commun/js/*`).
2. Enregistrer chaque partie avec `Stats.record({ game: 'nom', mode, won, time, score })` : stats locales et en ligne automatiques.
3. Ajouter une carte dans `index.html` et une entrée dans `GAMES` de `pages/stats.html`.
4. Ajouter les textes anglais dans `commun/js/i18n.js` (clé = texte français).

## Outils
- `node outils/verifier-puzzles.js` : vérifie que chaque puzzle du Démineur se résout sans deviner.

## Mise en ligne
Site statique : GitHub Pages, Cloudflare Pages ou Netlify, sans étape de build. Détails Supabase dans `backend/README.md`.
