// Génère jeux/<id>/index.html pour chaque jeu utilisant le moteur commun (commun/js/jeu.js).
// Usage : node outils/generer-pages.js
const fs = require('fs'), path = require('path');
const V = 8;
// Les sous-pages « duel » de Serpent et Fusion (jeux écrits avant le moteur commun) sont à un niveau de plus
const JEUX = ['serpent/duel', 'fusion/duel', 'elan', 'toits', 'gravite', 'grappin', 'route', 'circuit', 'colline', 'mots', 'echecs', 'dames', 'flotte', 'morpion', 'patience', 'raquettes', 'asteroides', 'envahisseurs', 'labyrinthe', 'conquete'];
// Scripts supplémentaires : fichiers du jeu, ou du dossier commun (préfixe « commun: »)
const EXTRA = { mots: ['mots-liste.js'], elan: ['commun:salles.js'], gravite: ['commun:salles.js'] };
for (const id of JEUX) {
    const dir = path.join(__dirname, '..', 'jeux', ...id.split('/'));
    const R = '../'.repeat(id.split('/').length + 1);
    fs.mkdirSync(dir, { recursive: true });
    const extra = (EXTRA[id] || []).map(f => `    <script src="${f.startsWith('commun:') ? R + 'commun/js/' + f.slice(7) : f}?v=${V}"></script>\n`).join('');
    fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Epure</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${R}commun/css/base.css?v=${V}">
    <link rel="stylesheet" href="${R}commun/css/shell.css?v=${V}">
    <link rel="stylesheet" href="${R}commun/css/jeu.css?v=${V}">
    <link rel="stylesheet" href="${R}commun/css/themes.css?v=${V}">
</head>
<body>
    <!-- Page construite par commun/js/jeu.js ; logique du jeu dans game.js -->
    <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
    <script src="${R}commun/js/config.js?v=${V}"></script>
    <script src="${R}commun/js/i18n.js?v=${V}"></script>
    <script src="${R}commun/js/ui.js?v=${V}"></script>
    <script src="${R}commun/js/online.js?v=${V}"></script>
    <script src="${R}commun/js/catalogue.js?v=${V}"></script>
    <script src="${R}commun/js/jeu.js?v=${V}"></script>
${extra}    <script src="game.js?v=${V}"></script>
</body>
</html>
`);
}
console.log(JEUX.length + ' pages générées');
