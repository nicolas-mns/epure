'use strict';
// ==================== Catalogue des jeux d'Epure ====================
// Source unique : accueil, menu des jeux, statistiques, classements et administration.
// kind : 'time' (meilleur temps, victoires seulement), 'score' (meilleur score), 'win' (victoires)
// unit : unité affichée pour les scores.

const CATEGORIES = [
    ['classiques', 'Classiques', 'sparkles'],
    ['parkour', 'Parkour', 'footprints'],
    ['course', 'Course', 'car'],
    ['plateau', 'Plateau & réflexion', 'brain'],
    ['arcade', 'Arcade & cartes', 'joystick'],
];

const CATALOGUE = {
    demineur: { name: 'Démineur', icon: 'bomb', cat: 'classiques', desc: 'Classique sans hasard, puzzles, MegaMines, Arc-en-ciel, Économie, Blitz, Survie et Duel.',
        modes: { classic: ['Classique', 'target', 'time'], puzzle: ['Puzzles', 'puzzle', 'time'], mega: ['MegaMines', 'shapes', 'time'], rainbow: ['Arc-en-ciel', 'rainbow', 'time'],
            economy: ['Économie', 'coins', 'score', 'grilles'], blitz: ['Blitz', 'zap', 'score', 'pts'], survival: ['Survie', 'shield', 'score', 'vagues'], duel: ['Duel', 'swords', 'win'] } },
    blocs: { name: 'Blocs', icon: 'blocks', cat: 'classiques', desc: 'Empile, complète des lignes. Marathon, Sprint 40, Ultra, Montée, Zen et Duel.',
        modes: { marathon: ['Marathon', 'mountain', 'score', 'pts'], sprint: ['Sprint 40', 'flag', 'time'], ultra: ['Ultra 2 min', 'timer', 'score', 'pts'], rising: ['Montée', 'arrow-up-from-line', 'score', 'lignes'], versus: ['Duel 1v1', 'swords', 'win'] } },
    serpent: { name: 'Serpent', icon: 'worm', cat: 'classiques', desc: 'Mange, grandis, ne te mords pas. Classique, Sans murs, Labyrinthe, Chrono et Duel.',
        modes: { classic: ['Classique', 'square', 'score', 'pts'], wrap: ['Sans murs', 'infinity', 'score', 'pts'], maze: ['Labyrinthe', 'brick-wall', 'score', 'pts'], timed: ['Chrono 90 s', 'timer', 'score', 'pts'], bot: ['Contre le bot', 'bot', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
    fusion: { name: 'Fusion', icon: 'grid-2x2', cat: 'classiques', desc: 'Fais glisser et fusionne les tuiles jusqu\'à 2048. 3×3, 4×4, 5×5, Chrono, Obstacles et Duel.',
        modes: { classic: ['Classique 4×4', 'grid-2x2', 'score', 'pts'], big: ['Grand 5×5', 'grid-3x3', 'score', 'pts'], mini: ['Mini 3×3', 'square', 'score', 'pts'], timed: ['Chrono 3 min', 'timer', 'score', 'pts'], blocks: ['Obstacles', 'square-x', 'score', 'pts'], bot: ['Contre le bot', 'bot', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },

    elan: { name: 'Élan', icon: 'footprints', cat: 'parkour', desc: '100 niveaux de parkour en salles : sauts muraux, lianes, ressorts, canons, chauves-souris, scies, clés et portes.',
        modes: { niveaux: ['Niveaux', 'layers', 'time'], duel: ['Duel 1v1', 'swords', 'win'] } },
    toits: { name: 'Toits', icon: 'train-front', cat: 'parkour', desc: 'Course sans fin sur 3 voies : change de voie, saute, glisse sous les portiques, grimpe sur les trains.',
        modes: { classic: ['Classique', 'train-front', 'score', 'm'], nuit: ['Nuit', 'moon', 'score', 'm'], duel: ['Duel 1v1', 'swords', 'win'] } },
    gravite: { name: 'Gravité', icon: 'arrow-down-up', cat: 'parkour', desc: '100 niveaux en salles : pas de saut, tu inverses la gravité. Pics, scies, lasers, clés, portes et interrupteurs.',
        modes: { niveaux: ['Niveaux', 'layers', 'time'], duel: ['Duel 1v1', 'swords', 'win'] } },
    grappin: { name: 'Grappin', icon: 'anchor', cat: 'parkour', desc: 'Accroche-toi, balance-toi, lâche au bon moment. Aussi loin que possible.',
        modes: { classic: ['Classique', 'anchor', 'score', 'm'], chrono: ['Chrono 60 s', 'timer', 'score', 'm'], duel: ['Duel 1v1', 'swords', 'win'] } },

    route: { name: 'Route', icon: 'car-front', cat: 'course', desc: 'Conduite tranquille sur une route sans fin. Le jour passe, le paysage change.',
        modes: { balade: ['Balade', 'sunset', 'score', 'm'], trafic: ['Trafic', 'car', 'score', 'm'], duel: ['Duel 1v1', 'swords', 'win'] } },
    circuit: { name: 'Circuit', icon: 'flag', cat: 'course', desc: 'Course vue de dessus avec dérapages. Contre la montre, contre des bots ou en duel.',
        modes: { chrono: ['Contre la montre', 'timer', 'time'], course: ['Course (bots)', 'trophy', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
    colline: { name: 'Colline', icon: 'mountain', cat: 'course', desc: 'Un tout-terrain, des collines sans fin et un réservoir qui se vide.',
        modes: { classic: ['Classique', 'mountain', 'score', 'm'], lune: ['Lune', 'moon', 'score', 'm'], duel: ['Duel 1v1', 'swords', 'win'] } },

    mots: { name: 'Mots', icon: 'whole-word', cat: 'plateau', desc: 'Trouve le mot de 5 lettres en 6 essais. Seul, contre un bot ou en duel.',
        modes: { jour: ['Mot du jour', 'calendar', 'score', 'pts'], libre: ['Libre', 'shuffle', 'score', 'pts'], bot: ['Contre le bot', 'bot', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
    echecs: { name: 'Échecs', icon: 'crown', cat: 'plateau', desc: 'Échecs complets avec pendule. Bot à 4 niveaux, deux joueurs ou duel en ligne.',
        modes: { bot: ['Contre le bot', 'bot', 'win'], local: ['À deux', 'users', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
    dames: { name: 'Dames', icon: 'circle-dot', cat: 'plateau', desc: 'Dames internationales 10×10, prise obligatoire et dames volantes.',
        modes: { bot: ['Contre le bot', 'bot', 'win'], local: ['À deux', 'users', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
    flotte: { name: 'Flotte', icon: 'ship', cat: 'plateau', desc: 'Place ta flotte, trouve celle de l\'adversaire. Le plus grand classique du duel.',
        modes: { bot: ['Contre le bot', 'bot', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
    morpion: { name: 'Morpion+', icon: 'hash', cat: 'plateau', desc: 'Neuf morpions dans un morpion : chaque coup choisit où joue l\'adversaire.',
        modes: { bot: ['Contre le bot', 'bot', 'win'], local: ['À deux', 'users', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },

    patience: { name: 'Patience', icon: 'spade', cat: 'arcade', desc: 'Solitaire classique en tirage 1 ou 3, et FreeCell. Duel sur la même donne.',
        modes: { klondike: ['Klondike', 'spade', 'time'], freecell: ['FreeCell', 'club', 'time'], duel: ['Duel 1v1', 'swords', 'win'] } },
    raquettes: { name: 'Raquettes', icon: 'columns-2', cat: 'arcade', desc: 'Deux raquettes, une balle qui accélère. Contre un bot, à deux ou en ligne.',
        modes: { bot: ['Contre le bot', 'bot', 'win'], local: ['À deux', 'users', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
    asteroides: { name: 'Astéroïdes', icon: 'orbit', cat: 'arcade', desc: 'Un vaisseau, de l\'inertie et des rochers qui se brisent en morceaux.',
        modes: { classic: ['Classique', 'orbit', 'score', 'pts'], duel: ['Duel 1v1', 'swords', 'win'] } },
    envahisseurs: { name: 'Envahisseurs', icon: 'rocket', cat: 'arcade', desc: 'Des vagues qui descendent, des abris qui s\'effritent. Tiens la ligne.',
        modes: { classic: ['Classique', 'rocket', 'score', 'pts'], duel: ['Duel 1v1', 'swords', 'win'] } },
    labyrinthe: { name: 'Labyrinthe', icon: 'route', cat: 'arcade', desc: 'Des labyrinthes générés, avec ou sans brouillard. Le premier sorti gagne.',
        modes: { classic: ['Classique', 'route', 'time'], brouillard: ['Brouillard', 'cloud-fog', 'time'], duel: ['Duel 1v1', 'swords', 'win'] } },
    conquete: { name: 'Conquête', icon: 'globe', cat: 'arcade', desc: 'Envoie tes flottes de planète en planète. Stratégie en temps réel, parties de 3 minutes.',
        modes: { bot: ['Contre le bot', 'bot', 'win'], duel: ['Duel 1v1', 'swords', 'win'] } },
};
