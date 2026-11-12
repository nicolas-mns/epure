# Backend : Supabase

Epure n'a pas de serveur à lui : le site est statique (HTML, CSS, JS) et parle directement à **Supabase** depuis le navigateur.

## Ce que fait Supabase
- **Comptes** : inscription et connexion par e-mail (Supabase Auth).
- **Base de données** (Postgres) :
  - `profiles` : pseudo et rôle admin de chaque compte ;
  - `games` : chaque partie terminée (jeu, mode, victoire, temps, score) ;
  - vues `leaderboard_time` et `leaderboard_score` : les classements.
- **Fonctions** : `delete_my_account`, et pour les admins `admin_list_users`, `admin_delete_user`, `admin_set_admin`, `admin_reset_games`.
- **Temps réel** : les duels 1v1 (Démineur, Blocs) passent par les canaux Realtime, sans rien stocker.

## Sécurité
- La clé utilisée par le site (`commun/js/config.js`) est la clé **publishable** : elle est faite pour être visible.
- Ce qui protège les données, ce sont les règles RLS : chacun ne peut écrire que ses propres parties, personne ne peut se donner le rôle admin, et les fonctions admin vérifient le rôle.
- La clé `service_role` / `sb_secret_…` ne doit **jamais** apparaître dans ce dépôt.

## Fichiers privés
`backend/prive/` (ignoré par git) contient :
- `schema.sql` : le script complet de la base, à coller dans Supabase > SQL Editor pour recréer le projet ;
- `config.js` : une copie de la configuration.

## Nommer un admin
Dans Supabase > SQL Editor :
```sql
update public.profiles set is_admin = true where username = 'admin';
```
