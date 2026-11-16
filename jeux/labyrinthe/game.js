'use strict';
// ==================== Labyrinthe ====================
// Trois difficultés :
//  - Facile : petit labyrinthe parfait, vu en entier.
//  - Moyen : grand labyrinthe avec quelques boucles, caméra qui suit le joueur (on ne voit qu'une partie).
//  - Difficile : très grand, beaucoup de bifurcations et de boucles (suivre un mur ne suffit plus),
//    brouillard, sortie placée au point le plus éloigné du départ.
// Généré à partir de la graine : en duel, les deux joueurs ont le même.

const VIEW_W = 840, VIEW_H = 560;
const LEVELS = {
    facile: { cols: 14, rows: 10, braid: 0, newest: 1, fog: 0, cam: false },
    moyen: { cols: 34, rows: 24, braid: .12, newest: .75, fog: 0, cam: true },
    difficile: { cols: 56, rows: 40, braid: .22, newest: .45, fog: 4, cam: true },
};
const DIFF = { id: 'diff', label: 'Difficulté', def: 'moyen', choices: [['facile', 'Facile', 'petit, vu en entier'], ['moyen', 'Moyen', 'grand, caméra qui suit'], ['difficile', 'Difficile', 'immense, boucles, brouillard']] };
let L = null;
const D4 = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]]; // dx, dy, mur de la case, mur de la voisine

// « Growing tree » : mélange de la dernière case (couloirs longs) et d'une case au hasard (bifurcations)
function genMaze(cols, rows, newest, braid) {
    const walls = new Uint8Array(cols * rows).fill(15), seen = new Uint8Array(cols * rows);
    const list = [0]; seen[0] = 1;
    while (list.length) {
        const k = J.rng() < newest ? list.length - 1 : Math.floor(J.rng() * list.length);
        const i = list[k], x = i % cols, y = Math.floor(i / cols);
        const opts = D4.filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx]; });
        if (!opts.length) { list.splice(k, 1); continue; }
        const [dx, dy, a, b] = opts[Math.floor(J.rng() * opts.length)];
        const j = (y + dy) * cols + x + dx;
        walls[i] &= ~a; walls[j] &= ~b; seen[j] = 1; list.push(j);
    }
    // Boucles : on ouvre une partie des culs-de-sac
    for (let i = 0; i < cols * rows; i++) {
        const w = walls[i], open = 4 - [1, 2, 4, 8].filter(b => w & b).length;
        if (open !== 1 || J.rng() >= braid) continue;
        const x = i % cols, y = Math.floor(i / cols);
        const opts = D4.filter(([dx, dy, a]) => { const nx = x + dx, ny = y + dy; return w & a && nx >= 0 && ny >= 0 && nx < cols && ny < rows; });
        if (!opts.length) continue;
        const [dx, dy, a, b] = opts[Math.floor(J.rng() * opts.length)];
        walls[i] &= ~a; walls[(y + dy) * cols + x + dx] &= ~b;
    }
    return walls;
}
function farthest(walls, cols, rows) {
    const dist = new Int32Array(cols * rows).fill(-1), q = [0]; dist[0] = 0;
    let far = 0;
    while (q.length) {
        const i = q.shift(), x = i % cols, y = Math.floor(i / cols);
        if (dist[i] > dist[far]) far = i;
        for (const [dx, dy, a] of D4) { if (walls[i] & a) continue; const j = (y + dy) * cols + x + dx; if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } }
    }
    return { exit: far, len: dist[far] };
}

Jeu.create({
    id: 'labyrinthe',
    modes: {
        classic: { desc: 'Trouve la sortie. Plus c\'est difficile, moins tu vois loin.', options: [DIFF],
            rules: [['flag', 'La sortie est la case verte (au Moyen et au Difficile, elle n\'est pas forcément dans un coin).'], ['keyboard', 'Garde une flèche enfoncée pour filer dans un couloir.'], ['map', 'La mini-carte garde en mémoire ce que tu as exploré.']] },
        brouillard: { desc: 'Tu ne vois que les cases autour de toi, à toutes les difficultés.', options: [DIFF], rules: [['cloud-fog', 'Vision de 3 cases ; le chemin parcouru reste tracé.']] },
        duel: { duel: 'race', desc: 'Même labyrinthe pour les deux. Le premier sorti gagne. Le point rouge sur la mini-carte, c\'est ton adversaire.', options: [DIFF] },
    },
    size: [VIEW_W, VIEW_H],
    controls: [['<kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd>', 'Se déplacer'], ['<kbd>Z</kbd> <kbd>Q</kbd> <kbd>S</kbd> <kbd>D</kbd>', 'Se déplacer (AZERTY)']],
    help: 'Sur mobile : glisse le doigt ou utilise les flèches.',
    touch: [['ArrowLeft', 'chevron-left'], ['ArrowUp', 'chevron-up'], ['ArrowDown', 'chevron-down'], ['ArrowRight', 'chevron-right']],
    sub() { return J.opts.diff; },
    duelCompare: (a, b) => (a.won - b.won) || (b.time - a.time),
    duelFormat: r => r.won ? fmtTime(r.time) : 'abandon',
    progLabel: 'Sa position',
    start() {
        const lv = LEVELS[J.opts.diff];
        const walls = genMaze(lv.cols, lv.rows, lv.newest, lv.braid);
        const ex = lv.cam ? farthest(walls, lv.cols, lv.rows) : { exit: lv.cols * lv.rows - 1 };
        const fog = J.mode === 'brouillard' ? 3 : lv.fog;
        const cell = lv.cam ? 44 : Math.floor(Math.min((VIEW_W - 4) / lv.cols, (VIEW_H - 4) / lv.rows));
        L = { ...lv, walls, exit: ex.exit, cell, fog, x: 0, y: 0, px: 0, py: 0, visited: new Set([0]), rep: 0, moves: 0, opp: null, camX: 0, camY: 0 };
    },
    keydown(code) { const d = dirOf(code); if (d) { step(d); L.rep = .18; } },
    update(dt) {
        const held = [...J.keys].map(dirOf).find(Boolean);
        if (held) { L.rep -= dt; if (L.rep <= 0) { step(held); L.rep = .065; } }
        // Déplacement visuel adouci et caméra
        L.px += (L.x - L.px) * Math.min(1, dt * 18); L.py += (L.y - L.py) * Math.min(1, dt * 18);
        if (L.cam) {
            const tx = J.clamp(L.px * L.cell + L.cell / 2 - VIEW_W / 2, 0, L.cols * L.cell - VIEW_W), ty = J.clamp(L.py * L.cell + L.cell / 2 - VIEW_H / 2, 0, L.rows * L.cell - VIEW_H);
            L.camX += (tx - L.camX) * Math.min(1, dt * 8); L.camY += (ty - L.camY) * Math.min(1, dt * 8);
        }
    },
    pointer(type, x, y) {
        if (type === 'down') L.swipe = [x, y];
        if (type === 'move' && L.swipe) {
            const dx = x - L.swipe[0], dy = y - L.swipe[1];
            if (Math.hypot(dx, dy) > 30) { step(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); L.swipe = [x, y]; }
        }
        if (type === 'up') L.swipe = null;
    },
    onDuel(e, p) { if (e === 'pos') L.opp = p; },
    stats() { return [['Déplacements', L.moves], ['Exploré', Math.round(L.visited.size / (L.cols * L.rows) * 100) + ' %']]; },
    draw(ctx) {
        const { cols, rows, cell, walls } = L, c = J.c;
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        const ox = L.cam ? -L.camX : (VIEW_W - cols * cell) / 2, oy = L.cam ? -L.camY : (VIEW_H - rows * cell) / 2;
        ctx.save(); ctx.translate(ox, oy);
        const x0 = Math.max(0, Math.floor(-ox / cell)), x1 = Math.min(cols - 1, Math.ceil((VIEW_W - ox) / cell));
        const y0 = Math.max(0, Math.floor(-oy / cell)), y1 = Math.min(rows - 1, Math.ceil((VIEW_H - oy) / cell));
        const vis = (x, y) => !L.fog || Math.hypot(x - L.x, y - L.y) <= L.fog || L.visited.has(y * cols + x);
        ctx.fillStyle = J.alpha(c.accent, .12);
        L.visited.forEach(i => { const x = i % cols, y = Math.floor(i / cols); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) ctx.fillRect(x * cell, y * cell, cell, cell); });
        const ex = L.exit % cols, ey = Math.floor(L.exit / cols);
        if (vis(ex, ey)) { ctx.fillStyle = J.alpha(c.ok, .45 + Math.sin(J.time * 4) * .15); ctx.fillRect(ex * cell + 2, ey * cell + 2, cell - 4, cell - 4); }
        ctx.strokeStyle = c.text; ctx.lineWidth = Math.max(2, cell / 9); ctx.lineCap = 'round';
        ctx.beginPath();
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (!vis(x, y)) continue;
            const w = walls[y * cols + x], px = x * cell, py = y * cell;
            if (w & 1) { ctx.moveTo(px, py); ctx.lineTo(px + cell, py); }
            if (w & 8) { ctx.moveTo(px, py); ctx.lineTo(px, py + cell); }
            if (x === cols - 1 && w & 2) { ctx.moveTo(px + cell, py); ctx.lineTo(px + cell, py + cell); }
            if (y === rows - 1 && w & 4) { ctx.moveTo(px, py + cell); ctx.lineTo(px + cell, py + cell); }
        }
        ctx.stroke();
        if (L.fog) {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!vis(x, y)) { ctx.fillStyle = c.surface2; ctx.fillRect(x * cell - .5, y * cell - .5, cell + 1, cell + 1); }
        }
        if (L.opp && vis(L.opp[0], L.opp[1])) { ctx.fillStyle = J.alpha(c.danger, .75); ctx.beginPath(); ctx.arc(L.opp[0] * cell + cell / 2, L.opp[1] * cell + cell / 2, cell * .26, 0, 7); ctx.fill(); }
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(L.px * cell + cell / 2, L.py * cell + cell / 2, cell * .3, 0, 7); ctx.fill();
        ctx.restore();
        // Mini-carte : seulement ce qui a été exploré
        if (L.cam) {
            const ms = Math.min(170 / cols, 120 / rows), mw = cols * ms, mh = rows * ms, mx = VIEW_W - mw - 12, my = 12;
            ctx.fillStyle = J.alpha(c.bg, .8); J.rr(mx - 6, my - 6, mw + 12, mh + 12, 6); ctx.fill();
            ctx.fillStyle = J.alpha(c.accent, .5);
            L.visited.forEach(i => ctx.fillRect(mx + (i % cols) * ms, my + Math.floor(i / cols) * ms, Math.max(1, ms), Math.max(1, ms)));
            if (L.visited.has(L.exit)) { ctx.fillStyle = c.ok; ctx.fillRect(mx + ex * ms - 1, my + ey * ms - 1, ms + 2, ms + 2); }
            if (L.opp) { ctx.fillStyle = c.danger; ctx.fillRect(mx + L.opp[0] * ms - 1, my + L.opp[1] * ms - 1, ms + 2, ms + 2); }
            ctx.fillStyle = c.text; ctx.fillRect(mx + L.x * ms - 1, my + L.y * ms - 1, ms + 2, ms + 2);
        }
    },
});

function dirOf(code) { return { ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyQ: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], KeyZ: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[code]; }
function step([dx, dy]) {
    if (J.over) return;
    const w = L.walls[L.y * L.cols + L.x];
    if (dx === 1 && w & 2 || dx === -1 && w & 8 || dy === -1 && w & 1 || dy === 1 && w & 4) return;
    L.x += dx; L.y += dy; L.moves++;
    L.visited.add(L.y * L.cols + L.x);
    J.tone(300 + ((L.x + L.y) % 12) * 12, .02, 'square', .01);
    if (J.duel.on) { J.duel.send('pos', [L.x, L.y]); J.prog(`${L.visited.size} cases`); }
    if (L.y * L.cols + L.x === L.exit) {
        J.burst(L.x * L.cell + L.cell / 2 - (L.cam ? L.camX : 0), L.y * L.cell + L.cell / 2 - (L.cam ? L.camY : 0), 40, J.c.ok, 220, .9, 4);
        J.end({ won: true, text: `Sorti en ${fmtTime(J.time)} et ${L.moves} déplacements (${Math.round(L.visited.size / (L.cols * L.rows) * 100)} % exploré).` });
    }
}
