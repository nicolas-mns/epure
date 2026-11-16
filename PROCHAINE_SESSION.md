# Epure : récap pour la prochaine session

_Dernière mise à jour : 12 novembre 2026_

## 1. Le projet en bref
**Epure** est un site de **22 jeux** (Esquive retiré le 12/11 : doublon avec Toits et Route Trafic), sobre et moderne (liste et catégories : `commun/js/catalogue.js`). Presque tous ont un mode **Duel 1v1** en ligne, et les jeux de plateau/réflexion un **bot à 4 niveaux**.
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
├── index.html          Accueil : cartes générées depuis le catalogue (doit rester à la racine)
├── jeux/
│   ├── demineur/ blocs/ serpent/ fusion/   Les 4 premiers jeux (code « maison », chacun sa page)
│   ├── serpent/duel/ fusion/duel/          Contre le bot + Duel de Serpent et Fusion (moteur commun)
│   └── elan/ toits/ gravite/ grappin/ route/ circuit/ colline/ mots/ echecs/ dames/
│       flotte/ morpion/ patience/ raquettes/ asteroides/ envahisseurs/ labyrinthe/ conquete/
│                       → chacun : index.html (généré) + game.js (la logique du jeu seulement)
├── pages/              account.html, admin.html, stats.html (tout lit le catalogue)
├── commun/
│   ├── css/            base.css, shell.css, jeu.css (moteur), themes.css
│   └── js/             ui.js, i18n.js, online.js, config.js,
│                       catalogue.js (LA liste des jeux/modes), jeu.js (moteur commun + duel en ligne),
│                       salles.js (niveaux en salles d'Élan et Gravité)
├── backend/            README.md + prive/ (ignoré par Git)
├── outils/             verifier-puzzles.js, generer-pages.js (régénère les index.html des jeux),
│                       verifier-salles.js (vérifie que chaque salle d'Élan/Gravité est praticable)
└── JEUX.md             Les 50 idées de départ (cochées = faites)
```

**Ajouter un jeu** : 1) une entrée dans `catalogue.js` ; 2) l'id dans `outils/generer-pages.js` puis `node outils/generer-pages.js` ;
3) `jeux/<id>/game.js` avec `Jeu.create({ id, modes, size, start, update, draw, keydown, pointer, onDuel, stats })`.
Le moteur gère : modes, réglages (`options`), compte à rebours, pause, fin de partie, stats, salon de duel (`duel: 'race'` = même graine, on compare les résultats ; `duel: 'direct'` = le jeu échange ses coups avec `J.duel.send`).

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
- État de la base au 12/11 : un seul compte, **admin** (administrateur, 0 partie). Vue `leaderboard_wins` ajoutée (victoires par jeu/mode).
- Comptes **sans e-mail** : adresse interne `pseudo@joueurs.epure.app`. « Confirm email » doit rester décoché.

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

### Fait le 12/11 (2e partie)
- Élan et Gravité : **100 niveaux chacun**, faits de salles reliées (clés, portes, interrupteurs rouge/bleu, mémoire des salles, mini-carte, grille des niveaux avec déblocage). Modèles de salles dans `jeux/<jeu>/game.js` ; **après toute modification : `node outils/verifier-salles.js`**.
- Toits : runner à 3 voies (trains avec rampes, portiques, pièces, aimant, super-saut).
- Grappin : la corde se rembobine (on remonte même sans élan). Route : direction corrigée, glissières en Trafic. Labyrinthe : Facile / Moyen / Difficile (caméra, boucles, brouillard).
- Partout : R ou Entrée sur l'écran de fin = Rejouer ; Maj = glisser ; vibrations, particules, traits de vitesse (`J.shake`, `J.burst`, `J.speedLines` dans `jeu.js`).

### Claude (prochaine session)
- [ ] **Tester les duels en vrai** avec deux comptes (deux navigateurs) : ils n'ont été testés qu'en solo/bot. Priorité : Échecs, Flotte, Raquettes, Conquête, Serpent (duels « direct »).
- [ ] Traduire en anglais les textes propres à chaque nouveau jeu (règles, descriptions des modes, messages dessinés sur le canevas). Le moteur, le menu et le catalogue sont traduits.
- [ ] Tester sur **mobile** (boutons tactiles des nouveaux jeux, tailles du canevas).
- [ ] Équilibrage à affiner en jouant : courbe de difficulté des 100 niveaux d'Élan/Gravité, vitesse de Toits, physique de Colline.
- [ ] Ajouter des modèles de salles (plus il y en a, plus les 100 niveaux sont variés) : 12 pour Élan, 9 pour Gravité aujourd'hui.
- [ ] Ajouter le duel à Blocs et Démineur dans le nouveau classement des victoires (déjà présents).

## 6. Préférences à respecter
- Design **sobre, moderne et simple** ; thèmes originaux possibles (Far West, Arcade…), mais jamais « enfantin ».
- Toutes les icônes viennent de **Lucide**, pas d'emoji.
- **L'utilisateur fait lui-même les commits et les envois Git** : Claude ne commite pas et ne pousse pas.
- Rien de sensible sur GitHub : les fichiers privés vont dans `backend/prive/`.
- Pas de recréation sous un nom déposé : les jeux ont des noms à nous (Blocs, Serpent, Fusion).
