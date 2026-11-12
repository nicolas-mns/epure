'use strict';
// ==================== Blocs : jeu de blocs qui tombent ====================
// Rotation SRS avec wall kicks, sac de 7, réserve, 5 pièces suivantes, fantôme,
// délai de verrouillage (15 resets), T-spins, combos, back-to-back.

const COLS = 10, ROWS = 22, HIDDEN = 2, VISIBLE = ROWS - HIDDEN;

// ----- Pièces : états de rotation (0, R, 2, L) en coordonnées [x, y] -----
function rotCW(cells, n) { return cells.map(([x, y]) => [n - 1 - y, x]); }
function buildStates(base, n) { const s = [base]; for (let i = 1; i < 4; i++) s.push(rotCW(s[i - 1], n)); return s; }
const PIECES = {
    I: buildStates([[0, 1], [1, 1], [2, 1], [3, 1]], 4),
    O: [0, 1, 2, 3].map(() => [[1, 0], [2, 0], [1, 1], [2, 1]]),
    T: buildStates([[1, 0], [0, 1], [1, 1], [2, 1]], 3),
    S: buildStates([[1, 0], [2, 0], [0, 1], [1, 1]], 3),
    Z: buildStates([[0, 0], [1, 0], [1, 1], [2, 1]], 3),
    J: buildStates([[0, 0], [0, 1], [1, 1], [2, 1]], 3),
    L: buildStates([[2, 0], [0, 1], [1, 1], [2, 1]], 3),
};
const TYPES = Object.keys(PIECES);

// Tables SRS (y vers le haut dans la norme, inversé à l'application)
const K = (a) => a.map(([x, y]) => [x, -y]);
const KICKS_JLSTZ = {
    '0>1': K([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]), '1>0': K([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
    '1>2': K([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]), '2>1': K([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
    '2>3': K([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]), '3>2': K([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
    '3>0': K([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]), '0>3': K([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
};
const KICKS_I = {
    '0>1': K([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]), '1>0': K([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
    '1>2': K([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]), '2>1': K([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
    '2>3': K([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]), '3>2': K([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
    '3>0': K([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]), '0>3': K([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
};
const KICKS_180 = [[0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1]];

// ----- Modes -----
const MODES = {
    marathon: { title: 'Marathon', icon: 'mountain', desc: 'Le mode classique : la vitesse augmente toutes les 10 lignes. Objectif : 150 lignes.',
        rules: [['trending-up', 'Niveau +1 toutes les 10 lignes, jusqu\'au niveau 15.'], ['star', 'Score : lignes, T-spins, combos et back-to-back.']], kind: 'score' },
    sprint: { title: 'Sprint 40 lignes', icon: 'flag', desc: 'Efface 40 lignes le plus vite possible.',
        rules: [['timer', 'Le chrono démarre après le décompte.'], ['gauge', 'Vitesse de chute constante : tout se joue sur ta technique.']], kind: 'time' },
    ultra: { title: 'Ultra 2 minutes', icon: 'timer', desc: 'Le plus gros score possible en 2 minutes.',
        rules: [['zap', 'Vise les T-spins et les quadruples, enchaîne les combos.']], kind: 'score' },
    rising: { title: 'Montée', icon: 'arrow-up-from-line', desc: 'Des lignes de déchets montent du fond, de plus en plus vite. Tiens le plus longtemps possible.',
        rules: [['arrow-up-from-line', 'Une ligne trouée apparaît régulièrement en bas.'], ['trophy', 'Score : nombre de lignes effacées.']], kind: 'score' },
    versus: { title: 'Duel 1v1', icon: 'swords', desc: 'Affronte un ami en ligne : mêmes pièces dans le même ordre. Toutes les 3 lignes et à chaque combo, une ligne de déchets monte chez l\'adversaire.',
        rules: [['arrow-up-from-line', 'Toutes les 3 lignes effacées : +1 ligne chez l\'adversaire.'], ['zap', 'Chaque combo envoie une ligne en plus.'], ['skull', 'Le premier qui déborde a perdu.']], kind: 'none' },
    zen: { title: 'Zen', icon: 'leaf', desc: 'Pas de vitesse qui monte, pas de défaite : le puits se vide si tu atteins le haut.',
        rules: [['leaf', 'Idéal pour s\'entraîner aux T-spins et à la réserve.']], kind: 'none' },
};

const cfg = Object.assign({ das: 133, arr: 10, sdf: 20, ghost: true, grid: true }, store.get('blocsCfg', {}));
const saveCfg = () => store.set('blocsCfg', cfg);
let currentMode = store.get('blocsMode', 'marathon');
if (!MODES[currentMode]) currentMode = 'marathon';

// ----- Son -----
const Sound = {
    ctx: null,
    ensure() {
        if (!settings.sound) return null;
        if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    tone(f, d = .06, type = 'triangle', v = .04, slide = 0, delay = 0) {
        const c = this.ensure(); if (!c) return;
        const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
        g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .02);
    },
    move() { this.tone(300, .03, 'square', .012); },
    rotate() { this.tone(420, .04, 'square', .015); },
    lock() { this.tone(160, .07, 'triangle', .05, -40); },
    hard() { this.tone(120, .09, 'triangle', .07, -50); },
    hold() { this.tone(520, .05, 'sine', .03, 120); },
    clear(n) { [523, 659, 784, 1046].slice(0, n).forEach((f, i) => this.tone(f, .12, 'triangle', .045, 0, i * .05)); },
    tspin() { this.tone(880, .1, 'sine', .04); this.tone(1175, .14, 'sine', .04, 0, .07); },
    over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, .22, 'triangle', .05, 0, i * .12)); },
    count() { this.tone(660, .08, 'sine', .04); },
    go() { this.tone(990, .15, 'sine', .05); },
};

// ==================== État ====================
let S = null;
const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t2 = Math.imul(a ^ a >>> 15, 1 | a); t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2; return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296; }; }
function newGame(mode, seed) {
    S = {
        rng: seed == null ? Math.random : mulberry32(seed), pendingGarbage: 0, sentTotal: 0,
        mode, board: emptyBoard(), bag: [], queue: [], hold: null, holdUsed: false, cur: null,
        score: 0, lines: 0, level: 1, combo: -1, b2b: false, time: 0, pieces: 0,
        over: false, paused: false, started: false, countdown: 3,
        gravAcc: 0, lockTimer: 0, lockResets: 0, lowestY: 0, lastRotate: false, lastKick: 0,
        garbageTimer: 0, flash: [], quads: 0, tspins: 0,
    };
    while (S.queue.length < 6) S.queue.push(nextFromBag());
}
function nextFromBag() {
    if (!S.bag.length) {
        S.bag = TYPES.slice();
        for (let i = S.bag.length - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [S.bag[i], S.bag[j]] = [S.bag[j], S.bag[i]]; }
    }
    return S.bag.pop();
}

const cellsOf = (p, x = p.x, y = p.y, r = p.r) => PIECES[p.type][r].map(([cx, cy]) => [x + cx, y + cy]);
function fits(p, x, y, r) {
    for (const [cx, cy] of cellsOf(p, x, y, r)) {
        if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
        if (cy >= 0 && S.board[cy][cx]) return false;
    }
    return true;
}
function spawn(type) {
    const p = { type, r: 0, x: 3, y: type === 'I' ? 0 : 1 };
    S.cur = p; S.lockTimer = 0; S.lockResets = 0; S.lowestY = p.y; S.lastRotate = false; S.gravAcc = 0;
    if (!fits(p, p.x, p.y, p.r)) { topOut(); return false; }
    // descend d'un cran immédiatement si possible (apparition dans la zone visible)
    if (fits(p, p.x, p.y + 1, p.r)) p.y++;
    return true;
}
function spawnNext() {
    const t = S.queue.shift();
    S.queue.push(nextFromBag());
    S.holdUsed = false;
    return spawn(t);
}

// ==================== Mouvements ====================
const grounded = () => !fits(S.cur, S.cur.x, S.cur.y + 1, S.cur.r);
function afterMove() {
    S.lastRotate = false;
    if (grounded() && S.lockResets < 15) { S.lockTimer = 0; S.lockResets++; }
}
function move(dx) {
    if (!S.cur || !fits(S.cur, S.cur.x + dx, S.cur.y, S.cur.r)) return false;
    S.cur.x += dx; afterMove(); Sound.move(); return true;
}
function rotate(dir) {
    const p = S.cur; if (!p || p.type === 'O') return false;
    const to = (p.r + (dir === 2 ? 2 : dir) + 4) % 4;
    const tests = dir === 2 ? KICKS_180 : (p.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${p.r}>${to}`];
    for (let k = 0; k < tests.length; k++) {
        const [dx, dy] = tests[k];
        if (fits(p, p.x + dx, p.y + dy, to)) {
            p.x += dx; p.y += dy; p.r = to;
            if (grounded() && S.lockResets < 15) { S.lockTimer = 0; S.lockResets++; }
            S.lastRotate = true; S.lastKick = k;
            Sound.rotate();
            return true;
        }
    }
    return false;
}
function softStep() {
    if (fits(S.cur, S.cur.x, S.cur.y + 1, S.cur.r)) {
        S.cur.y++; S.lastRotate = false;
        if (S.cur.y > S.lowestY) { S.lowestY = S.cur.y; S.lockResets = 0; }
        return true;
    }
    return false;
}
function hardDrop() {
    let n = 0;
    while (fits(S.cur, S.cur.x, S.cur.y + 1, S.cur.r)) { S.cur.y++; n++; }
    if (n) S.lastRotate = false;
    S.score += n * 2;
    Sound.hard();
    shake();
    lock();
}
function holdPiece() {
    if (S.holdUsed || !S.cur) return;
    const t = S.cur.type;
    Sound.hold();
    if (S.hold) { const h = S.hold; S.hold = t; spawn(h); }
    else { S.hold = t; spawnNext(); }
    S.holdUsed = true;
    drawSide();
}

// ==================== Verrouillage, lignes, score ====================
function tSpinType() {
    const p = S.cur;
    if (p.type !== 'T' || !S.lastRotate) return null;
    const occ = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!S.board[y][x]);
    const c = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([dx, dy]) => occ(p.x + dx, p.y + dy));
    if (c.filter(Boolean).length < 3) return null;
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.r];
    return (c[front[0]] && c[front[1]]) || S.lastKick === 4 ? 'full' : 'mini';
}
function lock() {
    const p = S.cur;
    const ts = tSpinType();
    let allHidden = true;
    for (const [x, y] of cellsOf(p)) {
        if (y >= 0) S.board[y][x] = p.type;
        if (y >= HIDDEN) allHidden = false;
    }
    S.pieces++;
    const full = [];
    for (let y = 0; y < ROWS; y++) if (S.board[y].every(Boolean)) full.push(y);
    full.forEach(y => { S.board.splice(y, 1); S.board.unshift(Array(COLS).fill(null)); });
    const n = full.length;
    if (n) S.flash = full.map(y => ({ y, t: .18 }));
    const linesBefore = S.lines;
    scoreClear(n, ts);
    if (S.mode === 'versus') {
        const send = Math.floor(S.lines / 3) - Math.floor(linesBefore / 3) + (n && S.combo >= 1 ? 1 : 0);
        // Les lignes envoyées annulent d'abord celles qu'on allait recevoir
        let out = send;
        if (out && S.pendingGarbage) { const c = Math.min(out, S.pendingGarbage); out -= c; S.pendingGarbage -= c; }
        if (out) { Versus.send('garbage', { n: out }); S.sentTotal += out; popup(`+${out} ${out > 1 ? 'LIGNES ENVOYÉES' : 'LIGNE ENVOYÉE'}`, ''); }
        if (!n && S.pendingGarbage) { const g = Math.min(S.pendingGarbage, 6); S.pendingGarbage -= g; for (let k = 0; k < g && !S.over; k++) addGarbage(); if (S.over) return; }
    }
    S.cur = null;
    if (allHidden && !n) { topOut(); return; }
    if (checkEnd()) return;
    if (n) Sound.clear(n); else if (!ts) Sound.lock();
    spawnNext();
    drawSide();
}
function scoreClear(n, ts) {
    const L = S.level;
    let pts = 0, label = '', difficult = false;
    if (ts === 'full') { pts = [400, 800, 1200, 1600][n]; label = ['T-SPIN', 'T-SPIN SIMPLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'][n]; difficult = n > 0; S.tspins++; Sound.tspin(); }
    else if (ts === 'mini') { pts = [100, 200, 400][n] || 400; label = n ? 'MINI T-SPIN' : 'MINI T-SPIN'; difficult = n > 0; }
    else if (n) { pts = [0, 100, 300, 500, 800][n]; label = ['', 'SIMPLE', 'DOUBLE', 'TRIPLE', 'QUADRUPLE'][n]; difficult = n === 4; if (n === 4) S.quads++; }
    if (n) {
        let b2b = false;
        if (difficult) { if (S.b2b) { pts *= 1.5; b2b = true; } S.b2b = true; } else S.b2b = false;
        S.combo++;
        if (S.combo > 0) pts += 50 * S.combo;
        S.lines += n;
        const pc = S.board.every(row => row.every(c => !c));
        if (pc) pts += [0, 800, 1200, 1800, 2000][n];
        const extra = [b2b && 'BACK-TO-BACK', S.combo > 0 && `COMBO ${S.combo}`, pc && 'PERFECT CLEAR'].filter(Boolean).join(' · ');
        if (n >= 2 || ts || S.combo > 0 || pc) popup(label, extra);
    } else {
        S.combo = -1;
        if (ts) popup(label, '');
    }
    S.score += Math.round(pts * L);
    if (S.mode === 'marathon' || S.mode === 'rising' || S.mode === 'versus') S.level = Math.min(S.mode === 'rising' ? 20 : 15, 1 + Math.floor(S.lines / 10));
}
function popup(text, sub) {
    const el = $('#popup');
    el.innerHTML = `<div>${text}${sub ? `<small>${sub}</small>` : ''}</div>`;
}
function shake() { if (!settings.anim) return; const w = $('.well'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }

function addGarbage() {
    const hole = Math.floor(Math.random() * COLS);
    const topRow = S.board.shift();
    if (topRow.some(Boolean)) { S.board.unshift(topRow); topOut(); return; }
    S.board.push(Array.from({ length: COLS }, (_, x) => x === hole ? null : 'G'));
    if (S.cur && !fits(S.cur, S.cur.x, S.cur.y, S.cur.r)) {
        if (fits(S.cur, S.cur.x, S.cur.y - 1, S.cur.r)) S.cur.y--; else topOut();
    }
}

// ==================== Fin de partie ====================
function checkEnd() {
    if (S.mode === 'sprint' && S.lines >= 40) { endGame(true); return true; }
    if (S.mode === 'marathon' && S.lines >= 150) { endGame(true); return true; }
    return false;
}
function topOut() {
    if (S.mode === 'zen') { S.board = emptyBoard(); popup('PUITS VIDÉ', ''); spawnNext(); return; }
    endGame(false);
}
function endGame(won, reason) {
    if (S.over) return;
    S.over = true; S.cur = null;
    if (S.mode === 'versus') {
        if (!won) Versus.send('lost', { lines: S.lines });
        Stats.record({ game: 'blocs', mode: 'versus', sub: null, won, time: Math.round(S.time * 10) / 10, score: S.lines });
        won ? Sound.clear(4) : Sound.over();
        setTimeout(() => showModal(won ? 'Victoire' : 'Défaite', won ? 'trophy' : 'swords',
            (reason || (won ? `${Versus.opp} a débordé.` : `Ton puits a débordé.`)) + `\n${S.lines} lignes · ${S.sentTotal} envoyées`), 400);
        return;
    }
    if (!won && S.mode !== 'ultra') Sound.over(); else Sound.clear(4);
    const M = MODES[S.mode];
    const time = Math.round(S.time * 100) / 100;
    const prev = history(S.mode);
    if (S.mode !== 'zen') {
        const score = S.mode === 'rising' ? S.lines : S.score;
        Stats.record({ game: 'blocs', mode: S.mode, sub: null, won: S.mode === 'ultra' ? true : won, time, score: S.mode === 'sprint' ? (won ? S.lines : S.lines) : score });
    }
    let title, text;
    if (S.mode === 'sprint') {
        const best = prev.filter(e => e.won).map(e => e.time);
        title = won ? fmtPrecise(time) : 'Raté';
        text = won ? (best.length && Math.min(...best) <= time ? `Record : ${fmtPrecise(Math.min(...best))}` : 'Nouveau record') : `${S.lines} lignes sur 40.`;
    } else if (S.mode === 'rising') {
        const best = Math.max(0, ...prev.map(e => e.score || 0));
        title = 'Submergé'; text = `${S.lines} lignes effacées.${S.lines > best ? '\nNouveau record' : `\nRecord : ${best}`}`;
    } else {
        const best = Math.max(0, ...prev.map(e => e.score || 0));
        title = S.mode === 'ultra' ? 'Temps écoulé' : won ? 'Marathon terminé' : 'Partie terminée';
        text = `Score : ${S.score.toLocaleString('fr-FR')}\n${S.lines} lignes · niveau ${S.level}${S.score > best ? '\nNouveau record' : `\nRecord : ${best.toLocaleString('fr-FR')}`}`;
    }
    setTimeout(() => showModal(title, won || S.mode === 'ultra' ? 'trophy' : 'square-x', text), 400);
}
const history = mode => Stats.all().filter(e => e.game === 'blocs' && e.mode === mode);
const fmtPrecise = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

function showModal(title, ic, text) {
    $('#modal-title').innerHTML = icon(ic) + `<span>${title}</span>`;
    $('#modal-text').textContent = text;
    const box = $('#modal-actions'); box.innerHTML = '';
    (S.mode === 'versus' ? [['Retour', null, true, quit]] : [['Rejouer', 'rotate-ccw', true, () => start(S.mode)], ['Retour', null, false, quit]]).forEach(([l, ic2, primary, fn]) => {
        const b = document.createElement('button');
        b.className = 'btn' + (primary ? ' primary' : '');
        b.innerHTML = (ic2 ? icon(ic2) : '') + l;
        b.onclick = () => { closeModals(); fn(); };
        box.appendChild(b);
    });
    $('#modal').classList.remove('hidden');
}

// ==================== Boucle ====================
const gravityFor = lvl => Math.pow(0.8 - (lvl - 1) * 0.007, lvl - 1);
let lastFrame = 0, rafId = 0;

function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    if (!S) return;
    if (!S.over && !S.paused) update(dt);
    S.flash = S.flash.filter(f => (f.t -= dt) > 0);
    draw();
}

function update(dt) {
    if (!S.started) {
        S.countdown -= dt;
        const n = Math.ceil(S.countdown);
        if (n !== S.lastCount) { S.lastCount = n; if (n > 0) { overlay(`<span class="count">${n}</span>`); Sound.count(); } }
        if (S.countdown <= 0) { S.started = true; overlay(null); Sound.go(); spawnNext(); drawSide(); }
        return;
    }
    S.time += dt;
    if (S.mode === 'ultra' && S.time >= 120) { S.time = 120; endGame(true); return; }
    if (S.mode === 'rising') {
        S.garbageTimer += dt;
        const every = Math.max(1.6, 7 - (S.level - 1) * .45);
        if (S.garbageTimer >= every) { S.garbageTimer = 0; addGarbage(); if (S.over) return; }
    }
    if (!S.cur) return;
    handleInput(dt);
    if (!S.cur) return;

    // Gravité
    const lvl = S.mode === 'sprint' || S.mode === 'zen' ? 1 : S.level;
    let g = gravityFor(lvl);
    const soft = keys.soft;
    if (soft) g = cfg.sdf >= 41 ? 0 : g / cfg.sdf;
    if (g === 0) { while (softStep()) S.score += 1; }
    else {
        S.gravAcc += dt;
        while (S.gravAcc >= g) {
            S.gravAcc -= g;
            if (softStep()) { if (soft) S.score += 1; } else { S.gravAcc = 0; break; }
        }
    }
    // Verrouillage
    if (grounded()) {
        S.lockTimer += dt;
        if (S.lockTimer >= .5 || S.lockResets >= 15 && S.lockTimer >= .1) lock();
    } else S.lockTimer = 0;
    updateStats();
    if (S.mode === 'versus') Versus.syncBoard();
}

// ==================== Entrées (DAS / ARR) ====================
const keys = { left: false, right: false, soft: false };
const das = { dir: 0, t: 0, arrT: 0 };
function press(action) {
    if (!S || S.over) return;
    if (action === 'pause') { togglePause(); return; }
    if (S.paused || !S.started || !S.cur) {
        if (action === 'left' || action === 'right') keys[action] = true;
        if (action === 'soft') keys.soft = true;
        return;
    }
    switch (action) {
        case 'left': case 'right': {
            keys[action] = true;
            const d = action === 'left' ? -1 : 1;
            das.dir = d; das.t = 0; das.arrT = 0;
            move(d); break;
        }
        case 'soft': keys.soft = true; break;
        case 'hard': hardDrop(); break;
        case 'cw': rotate(1); break;
        case 'ccw': rotate(-1); break;
        case '180': rotate(2); break;
        case 'hold': holdPiece(); break;
    }
}
function release(action) {
    if (action === 'left' || action === 'right') {
        keys[action] = false;
        const other = action === 'left' ? 'right' : 'left';
        if (keys[other]) { das.dir = other === 'left' ? -1 : 1; das.t = 0; das.arrT = 0; } else das.dir = 0;
    }
    if (action === 'soft') keys.soft = false;
}
function handleInput(dt) {
    if (!das.dir) return;
    das.t += dt * 1000;
    if (das.t < cfg.das) return;
    if (cfg.arr === 0) { while (move(das.dir)); return; }
    das.arrT += dt * 1000;
    while (das.arrT >= cfg.arr) { das.arrT -= cfg.arr; if (!move(das.dir)) break; }
}
const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', ' ': 'hard', ArrowUp: 'cw', x: 'cw', X: 'cw',
    z: 'ccw', Z: 'ccw', w: 'ccw', W: 'ccw', Control: 'ccw', a: '180', A: '180', c: 'hold', C: 'hold', Shift: 'hold',
    Escape: 'pause', p: 'pause', P: 'pause',
};

function togglePause() {
    if (!S || S.over || !S.started || S.mode === 'versus') return;
    S.paused = !S.paused;
    overlay(S.paused ? `Pause<br><small class="muted">Échap pour reprendre</small>` : null);
}
function overlay(html) {
    const o = $('#overlay');
    if (!html) { o.classList.add('hidden'); return; }
    o.innerHTML = `<div>${html}</div>`; o.classList.remove('hidden');
}

// ==================== Rendu ====================
let colors = {}, cell = 30;
function readColors() {
    const cs = getComputedStyle(document.body);
    const v = n => cs.getPropertyValue(n).trim();
    colors = { bg: v('--surface'), grid: v('--cell-line') || v('--border'), text: v('--text'), muted: v('--muted') };
    TYPES.concat('G').forEach(t => { colors[t] = v('--p-' + t); });
}
function fit() {
    const wrapH = innerHeight - 56 - (matchMedia('(max-width: 860px)').matches ? 210 : 70);
    const wrapW = Math.min(innerWidth - (matchMedia('(max-width: 860px)').matches ? 190 : 560), 400);
    cell = Math.max(14, Math.floor(Math.min(wrapH / VISIBLE, wrapW / COLS, 34)));
    const c = $('#board'), dpr = devicePixelRatio || 1;
    c.width = COLS * cell * dpr; c.height = VISIBLE * cell * dpr;
    c.style.width = COLS * cell + 'px'; c.style.height = VISIBLE * cell + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSide();
}
function block(ctx, x, y, s, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const r = Math.max(2, s * .12), p = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + p, y + p, s - 2 * p, s - 2 * p, r) : ctx.rect(x + p, y + p, s - 2 * p, s - 2 * p);
    ctx.fill();
    ctx.globalAlpha = alpha * .18;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + p + 2, y + p + 2, s - 2 * p - 4, Math.max(2, s * .12));
    ctx.globalAlpha = 1;
}
function draw() {
    const ctx = $('#board').getContext('2d');
    const W = COLS * cell, H = VISIBLE * cell;
    ctx.clearRect(0, 0, W, H);
    if (cfg.grid) {
        ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 1; x < COLS; x++) { ctx.moveTo(x * cell + .5, 0); ctx.lineTo(x * cell + .5, H); }
        for (let y = 1; y < VISIBLE; y++) { ctx.moveTo(0, y * cell + .5); ctx.lineTo(W, y * cell + .5); }
        ctx.stroke();
    }
    if (!S) return;
    for (let y = HIDDEN; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const t = S.board[y][x];
        if (t) block(ctx, x * cell, (y - HIDDEN) * cell, cell, colors[t], S.over ? .45 : 1);
    }
    S.flash.forEach(f => { ctx.globalAlpha = f.t / .18 * .5; ctx.fillStyle = colors.text; ctx.fillRect(0, (f.y - HIDDEN) * cell, W, cell); ctx.globalAlpha = 1; });
    const p = S.cur;
    if (p) {
        if (cfg.ghost) {
            let gy = p.y;
            while (fits(p, p.x, gy + 1, p.r)) gy++;
            ctx.strokeStyle = colors[p.type]; ctx.lineWidth = 2; ctx.globalAlpha = .55;
            for (const [x, y] of cellsOf(p, p.x, gy)) if (y >= HIDDEN) ctx.strokeRect(x * cell + 3, (y - HIDDEN) * cell + 3, cell - 6, cell - 6);
            ctx.globalAlpha = 1;
        }
        const fade = grounded() ? 1 - Math.min(S.lockTimer / .5, 1) * .35 : 1;
        for (const [x, y] of cellsOf(p)) if (y >= HIDDEN) block(ctx, x * cell, (y - HIDDEN) * cell, cell, colors[p.type], fade);
    }
}
function drawMini(ctx, type, cx, cy, s, alpha = 1) {
    const cells = PIECES[type][0];
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * s, h = (Math.max(...ys) - Math.min(...ys) + 1) * s;
    const ox = cx - w / 2 - Math.min(...xs) * s, oy = cy - h / 2 - Math.min(...ys) * s;
    cells.forEach(([x, y]) => block(ctx, ox + x * s, oy + y * s, s, colors[type], alpha));
}
function drawSide() {
    if (!S) return;
    const h = $('#hold').getContext('2d');
    h.clearRect(0, 0, 120, 80);
    if (S.hold) drawMini(h, S.hold, 60, 40, 20, S.holdUsed ? .35 : 1);
    const n = $('#next').getContext('2d');
    n.clearRect(0, 0, 120, 400);
    drawOpp();
    S.queue.slice(0, 5).forEach((t, i) => drawMini(n, t, 60, 40 + i * 80, i === 0 ? 22 : 18));
    updateStats();
}
function updateStats() {
    const pps = S.time > 0 ? (S.pieces / S.time).toFixed(2) : '0.00';
    const items = [];
    if (S.mode === 'sprint') items.push(['Restant', Math.max(0, 40 - S.lines)], ['Temps', fmtPrecise(S.time)]);
    else if (S.mode === 'ultra') items.push(['Score', S.score.toLocaleString('fr-FR')], ['Temps', fmtTime(Math.ceil(120 - S.time))]);
    else items.push(['Score', S.score.toLocaleString('fr-FR')], ['Temps', fmtTime(S.time)]);
    items.push(['Lignes', S.lines]);
    if (S.mode === 'marathon' || S.mode === 'rising' || S.mode === 'versus') items.push(['Niveau', S.level]);
    if (S.mode === 'versus') items.push(['À recevoir', S.pendingGarbage], ['Envoyées', S.sentTotal]);
    items.push(['Pièces/s', pps]);
    const html = items.map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');
    const el = $('#stats');
    if (el.innerHTML !== html) el.innerHTML = html;
}

// ==================== Navigation ====================
function selectMode(m) {
    currentMode = m; store.set('blocsMode', m);
    $$('.mode-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    const M = MODES[m];
    $('#setup-icon').innerHTML = icon(M.icon);
    $('#setup-title').textContent = M.title;
    $('#setup-desc').textContent = M.desc;
    $('#setup-rules').innerHTML = M.rules.map(([ic, t]) => `<li>${icon(ic)}${t}</li>`).join('');
    const h = history(m);
    let best = '';
    if (h.length && M.kind === 'time') { const w = h.filter(e => e.won).map(e => e.time); best = `${h.length} parties${w.length ? ` · record ${fmtPrecise(Math.min(...w))}` : ''}`; }
    else if (h.length && M.kind === 'score') best = `${h.length} parties · record ${Math.max(...h.map(e => e.score || 0)).toLocaleString('fr-FR')}${m === 'rising' ? ' lignes' : ''}`;
    $('#setup-best').textContent = best;
    renderVersusBox(m);
    show('setup');
    if (S) { S.over = true; }
}
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id)); }
function start(mode, seed) {
    if (mode === 'versus' && seed == null) { toast(t('Crée ou rejoins une partie'), 'swords'); return; }
    closeModals();
    readColors();
    newGame(mode, seed);
    $('#opp-panel').classList.toggle('hidden', mode !== 'versus');
    keys.left = keys.right = keys.soft = false; das.dir = 0;
    $('#popup').innerHTML = '';
    show('game');
    fit();
    drawSide();
}
function quit() { if (S) S.over = true; Versus.leave(); overlay(null); selectMode(currentMode); }

// ==================== Initialisation ====================
function bindSettings() {
    [['das', 'ms'], ['arr', 'ms'], ['sdf', '']].forEach(([k, unit]) => {
        const el = $('#' + k), out = $('#' + k + '-out');
        el.value = cfg[k];
        const upd = () => { cfg[k] = +el.value; out.textContent = k === 'sdf' && cfg[k] >= 41 ? 'instantané' : k === 'sdf' ? `×${cfg[k]}` : `${cfg[k]} ${unit}`; saveCfg(); };
        el.oninput = upd; upd();
    });
    $('#opt-ghost').checked = cfg.ghost; $('#opt-ghost').onchange = e => { cfg.ghost = e.target.checked; saveCfg(); };
    $('#opt-grid').checked = cfg.grid; $('#opt-grid').onchange = e => { cfg.grid = e.target.checked; saveCfg(); };
}
const updateSoundBtn = () => { $('#sound-btn').innerHTML = icon(settings.sound ? 'volume-2' : 'volume-x'); };
const ACTIONS = {
    'play': () => start(currentMode),
    'pause': togglePause,
    'restart': () => { if (S && S.mode === 'versus') return; start(S ? S.mode : currentMode); },
    'quit': quit,
    'open-help': () => { if (S && !S.paused && S.started && !S.over) togglePause(); $('#help').classList.remove('hidden'); },
    'open-settings': () => { if (S && !S.paused && S.started && !S.over) togglePause(); $('#settings').classList.remove('hidden'); },
    'close-modal': () => { closeModals(); readColors(); drawSide(); },
    'toggle-sound': () => { settings.sound = !settings.sound; saveSettings(); updateSoundBtn(); },
};

function init() {
    renderThemes($('#themes'));
    $$('#themes .theme-btn').forEach(b => b.addEventListener('click', () => { readColors(); drawSide(); }));
    hydrateIcons();
    updateSoundBtn();
    bindSettings();
    document.addEventListener('click', e => {
        const a = e.target.closest('[data-action]');
        if (a && ACTIONS[a.dataset.action]) ACTIONS[a.dataset.action]();
        if (e.target.classList.contains('modal') && e.target.id !== 'modal') ACTIONS['close-modal']();
    });
    $$('.mode-item').forEach(b => b.onclick = () => selectMode(b.dataset.mode));

    document.addEventListener('keydown', e => {
        if (!$('#screen-game').classList.contains('active')) return;
        if (modalOpen()) { if (e.key === 'Escape' && $('#modal').classList.contains('hidden')) ACTIONS['close-modal'](); return; }
        if ((e.key === 'r' || e.key === 'R') && S.mode !== 'versus') { start(S.mode); return; }
        const a = KEYMAP[e.key];
        if (!a) return;
        e.preventDefault();
        if (e.repeat) return;
        Sound.ensure();
        press(a);
    });
    document.addEventListener('keyup', e => { const a = KEYMAP[e.key]; if (a) release(a); });
    addEventListener('blur', () => { keys.left = keys.right = keys.soft = false; das.dir = 0; if (S && S.started && !S.over && !S.paused) togglePause(); });

    $$('#touch [data-t]').forEach(b => {
        const a = b.dataset.t;
        b.addEventListener('pointerdown', e => { e.preventDefault(); Sound.ensure(); press(a); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => release(a)));
    });
    addEventListener('resize', () => { if ($('#screen-game').classList.contains('active')) fit(); });
    readColors();
    selectMode(currentMode);
    rafId = requestAnimationFrame(loop);
}
// ==================== Duel 1v1 (Supabase Realtime) ====================
// L'hôte crée un code, l'invité le rejoint ; l'hôte envoie une graine commune
// pour que les deux joueurs aient exactement la même suite de pièces.
const Versus = {
    ch: null, code: null, host: false, opp: '', started: false, lastSync: 0,
    myKey() { return Online.username + '#' + Online.user.id.slice(0, 6); },
    create() {
        this.leave();
        this.code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
        this.host = true; this.connect();
        showModalMsg(`Code : ${this.code}`, 'swords', 'Donne ce code à ton adversaire.\nLa partie démarre dès qu\'il rejoint.');
    },
    join(code) {
        if (!/^[A-Z]{4}$/.test(code)) { toast(t('Le code fait 4 lettres'), 'info'); return; }
        this.leave();
        this.code = code; this.host = false; this.connect();
        showModalMsg(`Connexion à ${code}…`, 'loader', 'En attente de l\'hôte.');
        this.joinTimer = setTimeout(() => { if (!this.started) { this.leave(); closeModals(); toast(t('Aucune partie trouvée avec ce code'), 'circle-x', 3000); } }, 10000);
    },
    connect() {
        const ch = this.ch = Online.client.channel('blocs-' + this.code, { config: { broadcast: { self: false }, presence: { key: this.myKey() } } });
        ch.on('presence', { event: 'sync' }, () => {
            const players = Object.keys(ch.presenceState());
            if (players.length > 2 && !this.started) { toast(t('Partie déjà complète'), 'circle-x'); this.leave(); closeModals(); return; }
            if (this.host && players.length === 2 && !this.started) {
                this.opp = players.find(k => k !== this.myKey()).split('#')[0];
                const seed = Math.floor(Math.random() * 2 ** 31);
                setTimeout(() => { this.send('start', { seed, host: Online.username }); this.begin(seed); }, 400);
            }
        });
        ch.on('presence', { event: 'leave' }, () => { if (S && S.mode === 'versus' && !S.over && this.started) endGame(true, `${this.opp} a quitté la partie.`); });
        ch.on('broadcast', { event: 'start' }, ({ payload }) => { if (!this.host && !this.started) { clearTimeout(this.joinTimer); this.opp = payload.host; this.begin(payload.seed); } });
        ch.on('broadcast', { event: 'garbage' }, ({ payload }) => { if (S && S.mode === 'versus' && !S.over) { S.pendingGarbage += payload.n; updateStats(); } });
        ch.on('broadcast', { event: 'board' }, ({ payload }) => { this.oppBoard = payload.b; drawOpp(); });
        ch.on('broadcast', { event: 'lost' }, () => { if (S && S.mode === 'versus' && !S.over) endGame(true); });
        ch.subscribe(st => { if (st === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
    },
    begin(seed) {
        this.started = true; this.oppBoard = null;
        closeModals();
        start('versus', seed);
        $('#opp-name').textContent = this.opp;
    },
    send(event, payload) { if (this.ch) this.ch.send({ type: 'broadcast', event, payload }); },
    syncBoard() {
        const now = performance.now();
        if (now - this.lastSync < 350) return;
        this.lastSync = now;
        let b = '';
        for (let y = HIDDEN; y < ROWS; y++) for (let x = 0; x < COLS; x++) b += S.board[y][x] || '.';
        if (S.cur) for (const [x, y] of cellsOf(S.cur)) if (y >= HIDDEN) { const i = (y - HIDDEN) * COLS + x; b = b.slice(0, i) + S.cur.type + b.slice(i + 1); }
        this.send('board', { b });
    },
    leave() {
        clearTimeout(this.joinTimer);
        if (this.ch) { try { this.ch.untrack(); Online.client.removeChannel(this.ch); } catch { /* déjà fermé */ } }
        this.ch = null; this.started = false;
    },
};
function drawOpp() {
    const c = $('#opp'); if (!c || !S || S.mode !== 'versus') return;
    const ctx = c.getContext('2d'), s = 10;
    ctx.clearRect(0, 0, 100, 200);
    ctx.fillStyle = colors.grid; ctx.globalAlpha = .5; ctx.fillRect(0, 0, 100, 200); ctx.globalAlpha = 1;
    const b = Versus.oppBoard;
    if (!b) return;
    for (let i = 0; i < b.length; i++) if (b[i] !== '.') { ctx.fillStyle = colors[b[i]] || colors.G; ctx.fillRect((i % COLS) * s + .5, Math.floor(i / COLS) * s + .5, s - 1, s - 1); }
}
function showModalMsg(title, ic, text) {
    $('#modal-title').innerHTML = icon(ic) + `<span>${title}</span>`;
    $('#modal-text').textContent = text;
    const box = $('#modal-actions'); box.innerHTML = '';
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = 'Annuler';
    b.onclick = () => { closeModals(); Versus.leave(); };
    box.appendChild(b);
    $('#modal').classList.remove('hidden');
}
function renderVersusBox(m) {
    const box = $('#versus-box');
    $('#play-btn').classList.toggle('hidden', m === 'versus');
    box.classList.toggle('hidden', m !== 'versus');
    if (m !== 'versus') return;
    if (!Online.configured) { box.innerHTML = `<p class="muted">${icon('cloud-off')} Le mode en ligne n'est pas activé.</p>`; return; }
    if (!Online.user) { box.innerHTML = `<a class="btn primary block" href="../../pages/account.html">${icon('log-in')} Se connecter pour jouer en duel</a>`; return; }
    box.innerHTML = `<button class="btn primary block" id="vs-create">${icon('plus')} Créer une partie</button>
        <div style="display:flex;gap:8px;margin-top:10px"><input id="vs-code" maxlength="4" placeholder="CODE" style="flex:1;height:40px;padding:0 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface-2);text-transform:uppercase;font-family:var(--mono);letter-spacing:.2em">
        <button class="btn" id="vs-join">${icon('log-in')} Rejoindre</button></div>`;
    $('#vs-create').onclick = () => Versus.create();
    $('#vs-join').onclick = () => Versus.join($('#vs-code').value.trim().toUpperCase());
}
Online.onChange(() => { if (currentMode === 'versus' && $('#screen-setup').classList.contains('active')) renderVersusBox('versus'); });

init();
