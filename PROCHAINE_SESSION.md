# Epure : récap pour la prochaine session

_Dernière mise à jour : 12 novembre 2026_

## 1. Le projet en bref
**Epure** est un site de jeux classiques, sobre et moderne : Démineur, Blocs (blocs qui tombent), Serpent et Fusion (tuiles à fusionner).
Il propose 16 thèmes, le français et l'anglais, des comptes, des statistiques, des classements et des duels 1v1 en ligne.

- Dossier local : `Documents\DEMINEUR_JS`, **à renommer en `Documents\epure`** (voir section 5).
- Lancer en local : `python -m http.server 5173` dans le dossier, puis http://localhost:5173

## 2. Technologies
| Élément | Choix | Détails |
| --- | --- | --- |
| Front | HTML / CSS / JavaScript « vanilla » | Pas de framework, pas d'étape de build : le site est statique. |
| Icônes | **Lucide** 0.469.0 (CDN unpkg) | Aucun emoji dans l'interface. Fonction `icon('nom')` et balises `<i data-icon="nom">`. |
| Polices | Google Fonts | Inter + JetBrains Mono par défaut ; chaque thème charge les siennes à la demande. |
| Backend | **Supabase** (offre gratuite) | Comptes, base Postgres, classements, Realtime pour les duels. Doc : `backend/README.md`. |
| Client Supabase | supabase-js 2.45.4 (CDN jsdelivr) | Initialisé dans `commun/js/online.js`. |
| Hébergement prévu | **GitHub Pages** (gratuit) | Cloudflare Pages ou Netlify marchent aussi. |
| Dépôt | **GitHub** : `nicolas-mns/epure` | Actuellement vidé (un seul commit vide). |
| Mots de passe | **Bitwarden** (offre gratuite) | Recommandé à la place de Vaultwarden, qui demande un serveur à soi. |

## 3. Architecture
```
epure/
├── index.html          Accueil (liste des jeux) : doit rester à la racine pour GitHub Pages
├── jeux/
│   ├── demineur/       solver.js (solveur logique), puzzles.js (38 puzzles), game.js, style.css
│   ├── blocs/          game.js (rotations SRS, T-spins, Duel 1v1), style.css
│   ├── serpent/        game.js
│   └── fusion/         game.js, style.css
├── pages/              account.html, admin.html, stats.html
├── commun/
│   ├── css/            base.css (couleurs, boutons), shell.css (structure des jeux), themes.css (16 thèmes)
│   └── js/             ui.js (thèmes, icônes, langue, Stats), i18n.js (anglais), online.js (Supabase), config.js
├── backend/            README.md + prive/ (schema.sql, config.js) : prive/ est ignoré par Git
├── outils/             verifier-puzzles.js  →  node outils/verifier-puzzles.js
├── PROCHAINE_SESSION.md
└── .claude/launch.json Serveur local (pointe déjà vers ...\Documents\epure)
```

**Conventions**
- Chaque partie terminée appelle `Stats.record({ game, mode, sub, won, time, score })`. La partie est enregistrée en local (localStorage, préfixe `arc_`), et aussi sur Supabase si le joueur est connecté.
- **Langue** : le site est écrit en français. En anglais, `ui.js` traduit chaque texte affiché grâce à `I18N_EN` (`commun/js/i18n.js`), dont la clé est le texte français exact. Un texte variable s'écrit avec un modèle `{n}`. **Tout nouveau texte doit y être ajouté.**
- **Thèmes** : variables CSS par `[data-theme="..."]` dans `base.css` et `themes.css`, et liste `THEMES` dans `ui.js`, avec les polices à charger.
- Code et commentaires en français.

## 4. Supabase
- Projet : **epure**, réf `rnfussngagnjdbzevxin`, région eu-central-1.
- URL : `https://rnfussngagnjdbzevxin.supabase.co`
- Clé utilisée par le site : la clé **publishable** (`sb_publishable_…`), dans `commun/js/config.js`. Elle est publique par conception.
- **Ne jamais** mettre la clé `service_role` / `sb_secret_…` dans le code ni dans une conversation.
- Connecteur MCP Supabase : branché dans Claude. Il permet d'exécuter du SQL et des migrations, et de lire les alertes de sécurité. Il ne permet **pas** de modifier les réglages de connexion.
- **Tables** : `profiles` (pseudo, `is_admin`) et `games`. **Vues** : `leaderboard_time`, `leaderboard_score`.
- **Fonctions** : `is_admin`, `delete_my_account`, `admin_list_users`, `admin_delete_user`, `admin_set_admin`, `admin_reset_games`.
- **Sécurité (RLS)** : chacun écrit uniquement ses propres parties ; un utilisateur ne peut modifier que son pseudo. Les alertes « SECURITY DEFINER exécutable » sur les fonctions admin sont **voulues** : chaque fonction vérifie elle-même `is_admin()`.
- **Duels** : canaux Realtime `duel-CODE` (Démineur) et `blocs-CODE` (Blocs), rien n'est stocké.
- État de la base au 12/11 : **0 compte, 0 partie** (le compte de test a été supprimé).

## 5. À faire (par ordre)
### Toi
1. **Renommer** `Documents\DEMINEUR_JS` en `Documents\epure`, toutes les sessions et éditeurs fermés, puis rouvrir le projet depuis `epure`.
2. **Supabase → Authentication → Sign In / Providers → Email** : décocher **Confirm email**.
3. **Créer les comptes** `admin`, `test1`, `test2` sur `pages/account.html` : pseudo + mot de passe, plus d'e-mail. Mots de passe dans Bitwarden. (Claude ne crée pas de comptes avec mot de passe.)
4. Ensuite, demander à Claude de **passer `admin` en administrateur** :
   `update public.profiles set is_admin = true where username = 'admin';`
5. **GitHub** (c'est toi qui fais les commits et les envois) :
   - `git add -A`, `git commit`, `git push` : la branche `main` locale suit déjà `origin/main`, qui contient le commit vide ;
   - ton e-mail universitaire est dans la config Git et sera visible dans l'historique public. Pour le cacher : `git config user.email "<id>+nicolas-mns@users.noreply.github.com"` (adresse anonyme visible dans GitHub → Settings → Emails) ;
   - **Settings → Pages** : Deploy from a branch, `main`, `/ (root)` ;
   - le site sera sur `https://nicolas-mns.github.io/epure/`.
6. **Supabase → Authentication → URL Configuration** :
   - Site URL : `https://nicolas-mns.github.io/epure/`
   - Redirect URLs : ajouter `http://localhost:5173/**`

### Claude (prochaine session)
- [ ] Tester l'inscription et la connexion avec les vrais comptes, la page admin avec `admin`, et un duel entre `test1` et `test2` (Démineur et Blocs).
- [ ] Tester le site publié sur GitHub Pages.
- [ ] Tester sur **mobile** : contrôles tactiles des 4 jeux, mise en page, appui long au Démineur. Jamais testé jusqu'ici.
- [ ] Compléter les traductions anglaises manquantes (quelques textes du Démineur restent en français).
- [ ] Ajouter les modes Serpent, Fusion et Blocs dans la page d'administration (« Parties par mode » ne liste que le Démineur).
- [ ] Petites optimisations : les panneaux de stats de Blocs et Serpent réécrivent leur HTML à chaque image en anglais ; ajouter un numéro de version aux fichiers CSS/JS (`?v=`) pour éviter l'ancien cache après une mise à jour.
- [ ] Idées en attente : bonus et malus en plus pour l'Économie (Rembobiner, Aimant, Mines mobiles, Taxe, Amnésie), d'autres jeux iconiques, et des classements par jeu sur l'accueil.

## 6. Préférences à respecter
- Design **sobre, moderne et simple** ; thèmes originaux possibles (Far West, Arcade…), mais jamais « enfantin ».
- Toutes les icônes viennent de **Lucide**, pas d'emoji.
- **L'utilisateur fait lui-même les commits et les envois Git** : Claude ne commite pas et ne pousse pas.
- Rien de sensible sur GitHub : les fichiers privés vont dans `backend/prive/`.
- Pas de recréation sous un nom déposé : les jeux ont des noms à nous (Blocs, Serpent, Fusion).
