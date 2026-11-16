'use strict';
// ==================== Fusion : contre le bot et duel ====================
// Course : mêmes tuiles pour les deux (même graine), le premier qui atteint l'objectif gagne.
// Chaque fusion de 128 ou plus pose un rocher chez l'adversaire (il disparaît après 10 coups).
// Bloqué = perdu. Contre le bot : il joue sur son propre plateau, affiché à droite.

const N = 4;
const GOAL = { id: 'goal', label: 'Objectif', def: 1024, choices: [[512, '512', '≈ 3 min'], [1024, '1024', '≈ 6 min'], [2048, '2048', 'la vraie']] };
let F = null, botT = 0;

function newBoard(seed) { const b = { g: Array(N * N).fill(0), rocks: {}, rng: mulberry32(seed), score: 0, moves: 0, best: 0 }; spawn(b); spawn(b); return b; }
function spawn(b) {
    const free = b.g.map((v, i) => v || b.rocks[i] ? -1 : i).filter(i => i >= 0);
    if (!free.length) return;
    const i = free[Math.floor(b.rng() * free.length)];
    b.g[i] = b.rng() < .9 ? 2 : 4;
}
// Glisse le plateau ; renvoie { moved, merges: [valeurs créées] }
function slide(b, dir, dry) {
    const g = dry ? b.g.slice() : b.g, merges = [];
    let moved = false, gained = 0;
    for (let l = 0; l < N; l++) {
        // Indices de la ligne, dans le sens du mouvement ; les rochers coupent la ligne en morceaux
        const idx = Array.from({ length: N }, (_, k) => dir === 0 ? k * N + l : dir === 2 ? (N - 1 - k) * N + l : dir === 3 ? l * N + k : l * N + (N - 1 - k));
        let seg = [];
        const flush = () => {
            const vals = seg.map(i => g[i]).filter(Boolean), out = [];
            for (let k = 0; k < vals.length; k++) { if (vals[k] === vals[k + 1]) { out.push(vals[k] * 2); merges.push(vals[k] * 2); gained += vals[k] * 2; k++; } else out.push(vals[k]); }
            seg.forEach((i, k) => { const v = out[k] || 0; if (g[i] !== v) moved = true; g[i] = v; });
            seg = [];
        };
        for (const i of idx) { if (b.rocks[i]) flush(); else seg.push(i); }
        flush();
    }
    if (!dry && moved) {
        b.score += gained; b.moves++;
        for (const k in b.rocks) { b.rocks[k]--; if (b.rocks[k] <= 0) delete b.rocks[k]; }
        spawn(b);
        b.best = Math.max(b.best, ...b.g);
    }
    return { moved, merges, gained, g };
}
const canMove = b => [0, 1, 2, 3].some(d => slide(b, d, true).moved);
function addRock(b) {
    const free = b.g.map((v, i) => v || b.rocks[i] ? -1 : i).filter(i => i >= 0);
    if (free.length > 1) b.rocks[free[Math.floor(Math.random() * free.length)]] = 10;
}

// ---------- Bot ----------
function heur(g) {
    let empty = 0, mono = 0, merges = 0;
    for (let i = 0; i < N * N; i++) {
        if (!g[i]) empty++;
        const x = i % N, y = Math.floor(i / N);
        if (x < N - 1) { const a = g[i], c = g[i + 1]; if (a && a === c) merges++; mono -= Math.abs(Math.log2(a || 1) - Math.log2(c || 1)); }
        if (y < N - 1) { const a = g[i], c = g[i + N]; if (a && a === c) merges++; mono -= Math.abs(Math.log2(a || 1) - Math.log2(c || 1)); }
    }
    const max = Math.max(...g), corner = [0, 3, 12, 15].some(i => g[i] === max) ? 2 : 0;
    return empty * 2.7 + merges + mono * .3 + corner * Math.log2(max);
}
function search(g, rocks, depth) {
    if (!depth) return heur(g);
    let best = -Infinity;
    for (let d = 0; d < 4; d++) {
        const r = slide({ g, rocks }, d, true);
        if (!r.moved) continue;
        // Moyenne grossière sur quelques apparitions possibles
        const free = r.g.map((v, i) => v || rocks[i] ? -1 : i).filter(i => i >= 0);
        let sum = 0, n = 0;
        for (const i of free.slice(0, 4)) { const t = r.g.slice(); t[i] = 2; sum += search(t, rocks, depth - 1); n++; }
        const v = (n ? sum / n : heur(r.g)) + Math.log2(r.gained + 1) * .4;
        if (v > best) best = v;
    }
    return best === -Infinity ? -1000 : best;
}
function botMove(b) {
    const lvl = J.opts.level, ok = [0, 1, 2, 3].filter(d => slide(b, d, true).moved);
    if (!ok.length) return -1;
    if (lvl === 1) return J.pick(ok);
    let best = ok[0], bv = -Infinity;
    for (const d of ok) {
        const r = slide(b, d, true);
        const v = lvl === 2 ? r.gained + heur(r.g) * 3 : search(r.g, b.rocks, lvl === 3 ? 1 : 2) + Math.log2(r.gained + 1) * .4;
        if (v > bv) { bv = v; best = d; }
    }
    return best;
}

Jeu.create({
    id: 'fusion',
    root: '../../../',
    links: [['../', 'arrow-left', 'Modes solo']],
    modes: {
        bot: { bot: true, desc: 'Toi et le bot, mêmes tuiles. Le premier qui atteint l\'objectif gagne.', options: [GOAL, BOT_LEVELS],
            rules: [['zap', 'Chaque fusion de 128 ou plus pose un rocher chez l\'autre pendant 10 coups.'], ['ban', 'Plus aucun coup possible : perdu.']] },
        duel: { duel: 'race', desc: 'Mêmes tuiles pour les deux. Le premier à l\'objectif gagne ; tes grosses fusions envoient des rochers chez ton adversaire.', options: [GOAL] },
    },
    size: [760, 480],
    countdown: true,
    controls: [['<kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> / <kbd>ZQSD</kbd>', 'Faire glisser'], ['Glisser le doigt', 'Faire glisser (mobile)']],
    touch: [['ArrowLeft', 'chevron-left'], ['ArrowUp', 'chevron-up'], ['ArrowDown', 'chevron-down'], ['ArrowRight', 'chevron-right']],
    sub() { return J.opts.goal; },
    duelCompare: (a, b) => (a.won - b.won) || (a.won ? b.time - a.time : (a.score || 0) - (b.score || 0)),
    duelFormat: r => r.won ? fmtTime(r.time) : `${r.score} pts (bloqué)`,
    progLabel: 'Sa meilleure tuile',
    start() {
        F = { me: newBoard(J.seed), opp: J.mode === 'bot' ? newBoard(J.seed) : null, oppBest: 2 };
        botT = 1.5;
    },
    keydown(code) {
        const d = { ArrowUp: 0, KeyW: 0, KeyZ: 0, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3, KeyQ: 3, ArrowRight: 1, KeyD: 1 }[code];
        if (d !== undefined) play(d);
    },
    pointer(type, x, y) {
        if (type === 'down') F.sw = [x, y];
        if (type === 'up' && F.sw) { const dx = x - F.sw[0], dy = y - F.sw[1]; F.sw = null; if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0)); }
    },
    update(dt) {
        if (J.mode !== 'bot' || J.over) return;
        botT -= dt;
        if (botT > 0) return;
        botT = [0, 1.1, .8, .55, .4][J.opts.level];
        const d = botMove(F.opp);
        if (d < 0) { J.end({ won: true, text: 'Le bot est bloqué !' }); return; }
        const r = slide(F.opp, d);
        if (r.merges.some(v => v >= 128)) addRock(F.me);
        if (F.opp.best >= J.opts.goal) J.end({ won: false, text: `Le bot a atteint ${J.opts.goal} en premier.` });
    },
    onDuel(e, p) {
        if (e === 'rock') { addRock(F.me); J.tone(160, .15, 'sawtooth', .03); }
        if (e === 'board') { F.oppG = p.g; F.oppRocks = p.r; F.oppBest = Math.max(...p.g); }
    },
    stats() { return [['Score', F.me.score], ['Meilleure tuile', F.me.best || Math.max(...F.me.g)], ['Objectif', J.opts.goal], ['Coups', F.me.moves]]; },
    draw(ctx) {
        const c = J.c;
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, J.W, J.H);
        board(ctx, F.me.g, F.me.rocks, 20, 20, 440, 'Toi');
        const og = F.opp ? F.opp.g : F.oppG, orocks = F.opp ? F.opp.rocks : F.oppRocks || {};
        if (og) board(ctx, og, orocks, 500, 110, 240, J.mode === 'bot' ? `Bot · ${BOT_LEVELS.choices[J.opts.level - 1][1]}` : J.duel.opp);
        else J.text('En attente du plateau adverse…', 620, 230, 13, c.muted, 'center', 500);
    },
});

const TILE = { 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' };
function board(ctx, g, rocks, x, y, size, label) {
    const c = J.c, gap = size / 40, cs = (size - gap * (N + 1)) / N;
    J.text(label, x + size / 2, y - 6 + (y > 40 ? -10 : 0), 13, c.muted, 'center', 600);
    J.rr(x, y + (y > 40 ? 0 : 6), size, size, 10); ctx.fillStyle = c.surface3; ctx.fill();
    const oy = y + (y > 40 ? 0 : 6);
    for (let i = 0; i < N * N; i++) {
        const px = x + gap + (i % N) * (cs + gap), py = oy + gap + Math.floor(i / N) * (cs + gap), v = g[i];
        J.rr(px, py, cs, cs, 6);
        if (rocks[i]) { ctx.fillStyle = '#5a5a62'; ctx.fill(); J.text(rocks[i], px + cs / 2, py + cs / 2, cs * .3, '#c9c9cf', 'center', 700, true); continue; }
        ctx.fillStyle = v ? TILE[v] || '#3c3a32' : J.alpha(c.surface2, 1); ctx.fill();
        if (v) J.text(v, px + cs / 2, py + cs / 2 + 1, cs * (v >= 1024 ? .3 : v >= 128 ? .36 : .42), v <= 4 ? '#776e65' : '#ffffff', 'center', 700);
    }
}
function play(d) {
    if (J.over) return;
    const r = slide(F.me, d);
    if (!r.moved) return;
    J.tone(r.merges.length ? 520 + Math.log2(Math.max(...r.merges)) * 30 : 300, .04, 'triangle', .03);
    const big = r.merges.filter(v => v >= 128).length;
    if (big) { if (F.opp) for (let k = 0; k < big; k++) addRock(F.opp); else if (J.duel.on) for (let k = 0; k < big; k++) J.duel.send('rock', {}); }
    if (J.duel.on) { J.duel.send('board', { g: F.me.g, r: F.me.rocks }); J.prog(Math.max(...F.me.g)); }
    if (F.me.best >= J.opts.goal) { J.end({ won: true, score: F.me.score, text: `${J.opts.goal} atteint en ${F.me.moves} coups.` }); return; }
    if (!canMove(F.me)) J.end({ won: false, score: F.me.score, title: 'Bloqué', text: 'Plus aucun coup possible.' });
}
