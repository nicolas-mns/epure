# Epure : banque de 50 idées de jeux

**État au 12/11 : les 19 jeux cochés sont codés**, plus les duels de Serpent et Fusion. Coche les jeux à faire (`[x]`). Objectif : **16 jeux minimum** au total. Il y en a déjà 4 (Démineur, Blocs, Serpent, Fusion), il en faut donc **12 de plus**, dont au moins 1 de parkour et 1 de course.

Tous les jeux restent dans l'esprit Epure : HTML/CSS/JS sans framework, sobres, jouables à la souris, au clavier et au tactile, avec des noms à nous.

**Difficulté de dev** : ★ = rapide · ★★ = moyen · ★★★ = gros morceau (physique, 3D simple, IA…)

**1v1** : chaque jeu a un mode duel en ligne (Supabase Realtime, comme Démineur et Blocs). Il y a trois types de duel :
- **Course** : même graine (seed), même partie pour les deux joueurs ; le premier qui finit ou le meilleur score gagne. C'est le plus simple, et ça marche pour presque tout.
- **Attaque** : on joue chacun de son côté, mais ses actions envoient des malus à l'autre (comme les lignes en Blocs).
- **Direct** : les deux joueurs sont sur le même plateau, tour par tour ou en temps réel.

---

## 0. Les 1v1 à ajouter aux jeux existants

| Jeu | Duel proposé |
| --- | --- |
| Démineur | ✅ existe déjà (course sur la même grille) |
| Blocs | ✅ existe déjà (attaque par lignes) |
| Serpent | **Direct** : deux serpents sur le même terrain, le premier qui se cogne perd ; les fruits sont partagés. |
| Fusion | **Course + attaque** : même seed, le premier à 2048 gagne ; chaque fusion de 128 ou plus pose un rocher chez l'adversaire. |

---

## 1. Parkour / plateforme (au moins 1 obligatoire)

| # | Nom | Idée | 1v1 | Dev |
|---|---|---|---|---|
| [X] 1 | **Élan** | Parkour 2D de côté : sauts, wall-jump, glissades, niveaux courts au chrono, style minimaliste. | Course sur le même niveau, avec le « fantôme » de l'adversaire visible. | ★★ |
| [X] 2 | **Toits** | Runner infini sur des toits d'immeubles : on saute de toit en toit, la vitesse augmente. | Même seed, celui qui va le plus loin gagne. | ★ |
| [ ] 3 | **Ascension** | On grimpe verticalement sur des plateformes qui défilent ; certaines cassent, d'autres rebondissent. | Écran partagé, le premier qui tombe perd. | ★ |
| [X] 4 | **Gravité** | Plateforme où l'on inverse la gravité au lieu de sauter. | Course sur le même niveau. | ★★ |
| [X] 5 | **Grappin** | On se balance avec un grappin d'un point d'accroche à l'autre (physique de pendule). | Course + fantôme. | ★★★ |

## 2. Course / voiture (au moins 1 obligatoire)

| # | Nom | Idée | 1v1 | Dev |
|---|---|---|---|---|
| [X] 6 | **Route** | Conduite chill sur une route infinie en pseudo-3D (style années 80), paysages et heures de la journée qui changent, musique douce. Mode « balade » sans score. | Même route : la plus longue distance sans accident gagne. | ★★ |
| [X] 7 | **Circuit** | Course vue de dessus sur des circuits, avec drift, tours chronométrés et éditeur de pistes simple. | Course directe sur le même circuit en temps réel. | ★★★ |
| [X] 8 | **Esquive** | Vue de dessus sur autoroute : on zigzague entre les voitures, de plus en plus vite. | Même trafic (seed), le dernier en vie gagne. | ★ |
| [ ] 9 | **Drift** | Parking ou circuit fermé : enchaîner les dérapages pour faire des points. | Score sur 60 s. | ★★ |
| [X] 10 | **Colline** | Voiture physique 2D sur des collines générées, avec gestion de l'essence et de l'équilibre. | Même terrain, distance max. | ★★★ |

## 3. Réflexion / puzzle

| # | Nom | Idée | 1v1 | Dev |
|---|---|---|---|---|
| [ ] 11 | **Grille** (sudoku) | Sudoku avec 4 difficultés, notes au crayon, vérification. | Même grille, le premier qui finit gagne. | ★ |
| [ ] 12 | **Pixels** (nonogramme) | Révéler un dessin grâce aux indices des lignes et des colonnes. | Course sur la même image. | ★★ |
| [ ] 13 | **Caisses** | Pousser des caisses sur des cibles (puzzles en niveaux). | Course sur le même niveau. | ★★ |
| [ ] 14 | **Flux** | Relier les points de même couleur sans croiser les tuyaux. | Course sur la même grille. | ★★ |
| [ ] 15 | **Lumières** | Chaque clic inverse une case et ses voisines : tout éteindre. | Course. | ★ |
| [ ] 16 | **Ponts** (Hashi) | Relier des îles avec des ponts selon les nombres indiqués. | Course. | ★★ |
| [X] 17 | **Mots** | Deviner un mot de 5 lettres en 6 essais (FR et EN). | Même mot, le moins d'essais gagne, puis le plus rapide. | ★ |
| [ ] 18 | **Taquin** | Remettre dans l'ordre les tuiles coulissantes (3×3 à 6×6). | Même mélange. | ★ |
| [ ] 19 | **Paires** | Memory : retrouver les paires. | **Direct** tour par tour sur le même plateau. | ★ |
| [ ] 20 | **Chaîne** | Mots croisés express générés aléatoirement. | Course. | ★★★ |

## 4. Plateau / stratégie (vrais duels)

| # | Nom | Idée | 1v1 | Dev |
|---|---|---|---|---|
| [X] 21 | **Échecs** | Échecs complets (roque, prise en passant, pendule), avec une IA simple en solo. | Direct en ligne avec pendule. | ★★★ |
| [X] 22 | **Dames** | Dames internationales 10×10 ou anglaises 8×8. | Direct. | ★★ |
| [ ] 23 | **Quatre** | Aligner 4 jetons en les faisant tomber dans une grille. IA en solo. | Direct. | ★ |
| [ ] 24 | **Retournement** | Encadrer les pions adverses pour les retourner (8×8). | Direct. | ★★ |
| [ ] 25 | **Cinq** | Aligner 5 pierres sur un grand plateau. | Direct. | ★ |
| [X] 26 | **Flotte** | Bataille navale : placer ses bateaux, tirer à l'aveugle. | Direct (c'est le jeu idéal pour du 1v1). | ★★ |
| [X] 27 | **Morpion+** | Morpion « ultime » : 9 morpions dans un morpion. | Direct. | ★ |
| [ ] 28 | **Hexa** | Relier ses deux bords d'un plateau hexagonal. | Direct. | ★★ |
| [ ] 29 | **Graines** | Jeu de semailles africain (type awalé). | Direct. | ★★ |
| [ ] 30 | **Territoire** | Encercler des zones sur une grille de points (pipopipette). | Direct. | ★ |

## 5. Cartes

| # | Nom | Idée | 1v1 | Dev |
|---|---|---|---|---|
| [x] 31 | **Patience** | Solitaire classique (Klondike) et variantes (Araignée, FreeCell). | Même donne, le premier qui finit gagne. | ★★ |
| [ ] 32 | **Vingt-et-un** | Blackjack contre la banque, avec des jetons fictifs. | Les deux contre la même banque, le meilleur stack gagne. | ★ |
| [ ] 33 | **Bataille express** | Jeu de cartes rapide à combos (type « Speed »). | Direct en temps réel. | ★★ |
| [ ] 34 | **Rami** | Former des suites et des brelans. | Direct. | ★★★ |

## 6. Arcade / réflexes

| # | Nom | Idée | 1v1 | Dev |
|---|---|---|---|---|
| [x] 35 | **Raquettes** | Pong moderne : effets de balle, accélération. | Direct en temps réel. | ★ |
| [ ] 36 | **Briques** | Casse-briques avec bonus, niveaux. | Même niveau, le meilleur score gagne ; bonus « malus adverse ». | ★★ |
| [x] 37 | **Astéroïdes** | Petit vaisseau, inertie, astéroïdes qui se fragmentent. | Les deux vaisseaux dans la même arène. | ★★ |
| [x] 38 | **Envahisseurs** | Vagues d'ennemis qui descendent, abris destructibles. | Vagues envoyées à l'adversaire. | ★★ |
| [ ] 39 | **Battement** | Oiseau/drone qui passe entre des obstacles en tapotant. | Même seed, distance. | ★ |
| [ ] 40 | **Réflexe** | Mini-jeux de réaction : temps de réaction, viser des cibles, mémoire de séquence. | Même série, le meilleur total gagne. | ★ |
| [ ] 41 | **Frappe** | Dactylo : taper des textes le plus vite possible (mots/min). | Course sur le même texte, avec la barre de l'adversaire en direct. | ★ |
| [x] 42 | **Labyrinthe** | Labyrinthes générés, vue de dessus, avec brouillard optionnel. | Même labyrinthe, le premier sorti gagne. | ★ |
| [ ] 43 | **Bulles** | Tirer des bulles pour faire des groupes de 3 de même couleur. | Les bulles éclatées tombent chez l'adversaire. | ★★ |
| [ ] 44 | **Trois** | Échanger des gemmes pour en aligner 3 (match-3). | Score sur 2 min, même plateau de départ. | ★★ |
| [ ] 45 | **Pile** | Empiler des blocs qui oscillent ; ce qui dépasse tombe. | Même rythme, la tour la plus haute gagne. | ★ |

## 7. Divers / originaux

| # | Nom | Idée | 1v1 | Dev |
|---|---|---|---|---|
| [ ] 46 | **Golf** | Mini-golf 2D vu de dessus, 18 trous, physique des rebonds. | Mêmes trous, le moins de coups gagne. | ★★ |
| [ ] 47 | **Billard** | Billard 8 balles vu de dessus. | Direct tour par tour. | ★★★ |
| [ ] 48 | **Tours** | Tower defense simple : poser des tourelles sur un chemin. | Les ennemis tués sont envoyés chez l'adversaire. | ★★★ |
| [X] 49 | **Conquête** | Petites armées qui se déplacent de planète en planète (stratégie temps réel légère). | Direct. | ★★★ |
| [ ] 50 | **Quiz** | Questions de culture générale à choix multiples, par thème. | Mêmes questions, réponse la plus rapide. | ★★ |

---

## Ma sélection conseillée (12 jeux → total 16)

Une base variée, avec beaucoup de jeux rapides à faire et quelques gros morceaux :

1. **Élan** (parkour) ★★
2. **Route** (course chill infinie) ★★
3. **Circuit** (course sur pistes) ★★★
4. **Grille** (sudoku) ★
5. **Mots** ★
6. **Quatre** ★
7. **Flotte** (bataille navale) ★★
8. **Échecs** ★★★
9. **Patience** (solitaire) ★★
10. **Raquettes** ★
11. **Briques** ★★
12. **Frappe** (dactylo) ★

Plus les 1v1 de **Serpent** et **Fusion**.

**Ordre de dev conseillé** : d'abord un module commun `commun/js/duel.js` (salons à code, Realtime, seed partagée, écran « en attente / gagné / perdu »), réutilisé par tous les jeux. Ensuite, les jeux par lots de 3 ou 4.
