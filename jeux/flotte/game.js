'use strict';
// ==================== Flotte (bataille navale) ====================
// Grille 10×10, 5 navires (5, 4, 3, 3, 2). On tire chacun son tour.
// Bot : hasard (facile), chasse puis cible (moyen), + damier (difficile), carte de probabilités (expert).

const N = 10, SHIPS = [5, 4, 3, 3, 2];
let F = null, botTimer = 0;

function randomFleet(rng) {
    for (;;) {
        const grid = new Int8Array(N * N).fill(-1), ships = [];
        let ok = true;
        for (let s = 0; s < SHIPS.length && ok; s++) {
            let placed = false;
            for (let tries = 0; tries < 200 && !placed; tries++) {
                const h = rng() < .5, len = SHIPS[s];
                const x = Math.floor(rng() * (h ? N - len + 1 : N)), y = Math.floor(rng() * (h ? N : N - len + 1));
                const cells = Array.from({ length: len }, (_, k) => (y + (h ? 0 : k)) * N + x + (h ? k : 0));
                if (cells.every(i => grid[i] < 0)) { cells.forEach(i => { grid[i] = s; }); ships.push({ cells, h, hits: 0 }); placed = true; }
            }
            ok = placed;
        }
        if (ok) return { grid, ships };
    }
}
function canPlace(fleet, s, cells) { return cells.every(i => i >= 0 && i < N * N && (fleet.grid[i] < 0 || fleet.grid[i] === s)); }

// ---------- Bot ----------
function botShot() {
    const lvl = J.opts.level, shots = F.botShots; // shots[i] : 0 inconnu, 1 manqué, 2 touché, 3 coulé
    const free = []; for (let i = 0; i < N * N; i++) if (!shots[i]) free.push(i);
    if (lvl === 1) return J.pick(free);
    const nb = i => { const x = i % N, y = Math.floor(i / N), o = []; if (x > 0) o.push(i - 1); if (x < N - 1) o.push(i + 1); if (y > 0) o.push(i - N); if (y < N - 1) o.push(i + N); return o; };
    if (lvl <= 3) {
        const hits = []; for (let i = 0; i < N * N; i++) if (shots[i] === 2) hits.push(i);
        if (hits.length) {
            // Prolonger une ligne de touches si possible
            for (const h of hits) for (const d of [1, N]) {
                if (hits.includes(h + d) && (d === 1 ? Math.floor(h / N) === Math.floor((h + d) / N) : true)) {
                    let a = h; while (shots[a] === 2 && (d === 1 ? a % N > 0 : a >= N)) a -= d;
                    let b = h; while (shots[b] === 2 && (d === 1 ? b % N < N - 1 : b < N * N - N)) b += d;
                    for (const t of [a, b]) if (!shots[t] && (d === N || Math.floor(t / N) === Math.floor(h / N))) return t;
                }
            }
            const around = [...new Set(hits.flatMap(nb))].filter(i => !shots[i]);
            if (around.length) return J.pick(around);
        }
        const parity = lvl === 3 ? free.filter(i => (i % N + Math.floor(i / N)) % 2 === 0) : free;
        return J.pick(parity.length ? parity : free);
    }
    // Expert : compte, pour chaque case, combien de positions de navires restants la couvrent
    const left = F.me.ships.filter(s => s.hits < s.cells.length).map(s => s.cells.length);
    const heat = new Float32Array(N * N);
    const hitOpen = []; for (let i = 0; i < N * N; i++) if (shots[i] === 2) hitOpen.push(i);
    for (const len of left) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const h of [true, false]) {
        if (h ? x + len > N : y + len > N) continue;
        const cells = Array.from({ length: len }, (_, k) => (y + (h ? 0 : k)) * N + x + (h ? k : 0));
        if (cells.some(i => shots[i] === 1 || shots[i] === 3)) continue;
        const covers = cells.filter(i => shots[i] === 2).length;
        const w = hitOpen.length ? (covers ? 1 + covers * 20 : .05) : 1;
        cells.forEach(i => { if (!shots[i]) heat[i] += w; });
    }
    let best = free[0]; for (const i of free) if (heat[i] > heat[best]) best = i;
    return best;
}

const myTurn = () => F.phase === 'play' && F.turn === 'me';

Jeu.create({
    id: 'flotte',
    modes: {
        bot: { bot: true, desc: 'Place ta flotte, puis tirez chacun votre tour. Le premier qui coule toute la flotte adverse gagne.', options: [BOT_LEVELS],
            rules: [['ship', 'Navires : 5, 4, 3, 3 et 2 cases.'], ['mouse-pointer-click', 'Placement : clique un navire pour le tourner, ou mélange.'], ['crosshair', 'Tire sur la grille de droite.']] },
        duel: { duel: 'direct', desc: 'Chacun place sa flotte en secret. L\'hôte tire en premier.' },
    },
    size: [880, 520],
    countdown: false,
    showTime: true,
    controls: [['Clic', 'Tourner un navire / tirer'], ['<kbd>M</kbd>', 'Mélanger la flotte'], ['<kbd>Entrée</kbd>', 'Prêt']],
    start() {
        clearTimeout(botTimer);
        F = { me: randomFleet(Math.random), them: null, myShots: new Int8Array(N * N), botShots: new Int8Array(N * N), phase: 'place', turn: 'me',
            ready: false, oppReady: false, hover: -1, btns: [], log: '', pending: false, sunkThem: 0 };
        if (J.mode === 'bot') F.them = randomFleet(Math.random);
    },
    stop() { clearTimeout(botTimer); },
    keydown(code) {
        if (F.phase !== 'place' || F.ready) return;
        if (code === 'KeyM') { F.me = randomFleet(Math.random); J.sfx.click(); }
        if (code === 'Enter') ready();
    },
    pointer(type, x, y) {
        const L = layout();
        if (type === 'move') { F.hover = hit(L.target, x, y); return; }
        if (type !== 'down' || J.over) return;
        const b = F.btns.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        if (b) { b.fn(); return; }
        if (F.phase === 'place' && !F.ready) {
            const i = hit(L.mine, x, y); if (i < 0) return;
            const s = F.me.grid[i]; if (s < 0) return;
            const ship = F.me.ships[s], o = ship.cells[0], len = ship.cells.length;
            const cells = Array.from({ length: len }, (_, k) => ship.h ? o + k * N : o + k);
            const fits = ship.h ? Math.floor(o / N) + len <= N : o % N + len <= N;
            if (fits && canPlace(F.me, s, cells)) { ship.cells.forEach(c => { F.me.grid[c] = -1; }); cells.forEach(c => { F.me.grid[c] = s; }); ship.cells = cells; ship.h = !ship.h; J.sfx.click(); }
            else J.sfx.bad();
            return;
        }
        if (myTurn() && !F.pending) {
            const i = hit(L.target, x, y);
            if (i < 0 || F.myShots[i]) return;
            fire(i);
        }
    },
    onDuel(e, p) {
        if (e === 'ready') { F.oppReady = true; if (F.ready) begin(); }
        if (e === 'shot') {
            const res = receive(p);
            J.duel.send('res', Object.assign({ i: p }, res));
            if (res.lost) J.end({ won: false, text: `${J.duel.opp} a coulé toute ta flotte.` });
            else F.turn = 'me';
        }
        if (e === 'res') {
            F.pending = false;
            F.myShots[p.i] = p.hit ? 2 : 1;
            if (p.sunk) { p.sunk.forEach(c => { F.myShots[c] = 3; }); F.sunkThem++; }
            F.log = p.sunk ? 'Coulé !' : p.hit ? 'Touché !' : 'Dans l\'eau.';
            (p.hit ? J.sfx.boom : () => J.tone(260, .1, 'sine', .03))();
            if (p.lost) J.end({ won: true, text: 'Tu as coulé toute la flotte adverse.' });
            else F.turn = 'them';
        }
    },
    stats() {
        const myLeft = F.me.ships.filter(s => s.hits < s.cells.length).length;
        return [['Phase', F.phase === 'place' ? 'Placement' : myTurn() ? 'À toi' : 'Adversaire'], ['Tes navires', `${myLeft}/5`], ['Coulés', `${F.sunkThem}/5`]];
    },
    draw(ctx) {
        const c = J.c, L = layout();
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, J.W, J.H);
        F.btns = [];
        drawGrid(ctx, L.mine, 'Ta flotte', (i, x, y, s) => {
            const sh = F.me.grid[i], shot = J.mode === 'bot' ? F.botShots[i] : F.myIncoming ? F.myIncoming[i] : 0;
            if (sh >= 0) { J.rr(x + 2, y + 2, s - 4, s - 4, 4); ctx.fillStyle = F.me.ships[sh].hits >= F.me.ships[sh].cells.length ? J.alpha(c.danger, .45) : c.muted; ctx.fill(); }
            if (shot === 1) dot(ctx, x + s / 2, y + s / 2, s * .12, c.muted);
            if (shot >= 2) cross(ctx, x + s / 2, y + s / 2, s * .28, c.danger);
        });
        drawGrid(ctx, L.target, F.phase === 'place' ? 'Flotte adverse (cachée)' : 'Flotte adverse', (i, x, y, s) => {
            const v = F.myShots[i];
            if (v === 3) { J.rr(x + 2, y + 2, s - 4, s - 4, 4); ctx.fillStyle = J.alpha(c.danger, .35); ctx.fill(); }
            if (v === 1) dot(ctx, x + s / 2, y + s / 2, s * .1, c.muted);
            if (v >= 2) cross(ctx, x + s / 2, y + s / 2, s * .28, c.danger);
            if (!v && i === F.hover && myTurn() && !J.over) { ctx.fillStyle = J.alpha(c.accent, .25); ctx.fillRect(x + 2, y + 2, s - 4, s - 4); }
            if (J.over && J.mode === 'bot' && F.them.grid[i] >= 0 && !v) { ctx.strokeStyle = c.muted; ctx.lineWidth = 1.5; ctx.strokeRect(x + 4, y + 4, s - 8, s - 8); }
        });
        // Bas : boutons ou message
        const by = 482;
        if (F.phase === 'place') {
            if (!F.ready) {
                button(ctx, L.mine.x, by - 6, 150, 38, 'Mélanger (M)', () => { F.me = randomFleet(Math.random); J.sfx.click(); });
                button(ctx, L.mine.x + 160, by - 6, 150, 38, 'Prêt', ready, true);
            } else J.text(`En attente de ${J.duel.opp}…`, L.mine.x, by + 13, 15, c.muted, 'left', 500);
        } else {
            const msg = J.over ? '' : myTurn() ? (F.pending ? 'Tir en cours…' : 'À toi de tirer') : J.mode === 'bot' ? 'Le bot vise…' : `${J.duel.opp} vise…`;
            J.text(msg, L.mine.x, by + 13, 15, c.muted, 'left', 500);
            J.text(F.log, L.target.x + L.target.s * N, by + 13, 15, c.text, 'right', 700);
        }
    },
});

function layout() { return { mine: { x: 30, y: 50, s: 36 }, target: { x: 470, y: 50, s: 38 } }; }
function hit(g, x, y) { const cx = Math.floor((x - g.x) / g.s), cy = Math.floor((y - g.y) / g.s); return cx >= 0 && cy >= 0 && cx < N && cy < N ? cy * N + cx : -1; }
function drawGrid(ctx, g, title, cell) {
    const c = J.c;
    J.text(title, g.x, g.y - 22, 14, c.muted, 'left', 600);
    for (let k = 0; k < N; k++) { J.text('ABCDEFGHIJ'[k], g.x + k * g.s + g.s / 2, g.y - 8, 10, c.muted, 'center', 500, true); }
    ctx.fillStyle = c.surface2; ctx.fillRect(g.x, g.y, g.s * N, g.s * N);
    for (let i = 0; i < N * N; i++) cell(i, g.x + (i % N) * g.s, g.y + Math.floor(i / N) * g.s, g.s);
    ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 0; k <= N; k++) { ctx.moveTo(g.x + k * g.s, g.y); ctx.lineTo(g.x + k * g.s, g.y + N * g.s); ctx.moveTo(g.x, g.y + k * g.s); ctx.lineTo(g.x + N * g.s, g.y + k * g.s); }
    ctx.stroke();
}
function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function cross(ctx, x, y, r, col) { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); }
function button(ctx, x, y, w, h, label, fn, primary) {
    J.rr(x, y, w, h, 8); ctx.fillStyle = primary ? J.c.accent : J.c.surface3; ctx.fill();
    J.text(label, x + w / 2, y + h / 2 + 1, 14, primary ? J.c.accentInk : J.c.text);
    F.btns.push({ x, y, w, h, fn });
}
function ready() {
    if (F.ready) return;
    F.ready = true; J.sfx.good();
    if (J.mode === 'bot') { begin(); return; }
    F.myIncoming = new Int8Array(N * N);
    J.duel.send('ready', {});
    if (F.oppReady) begin();
}
function begin() { F.phase = 'play'; F.turn = J.mode === 'bot' || J.duel.host ? 'me' : 'them'; F.log = ''; }
// Un tir reçu sur ma flotte
function receive(i) {
    const s = F.me.grid[i];
    const shots = J.mode === 'bot' ? F.botShots : F.myIncoming;
    if (s < 0) { shots[i] = 1; return { hit: false }; }
    const ship = F.me.ships[s]; ship.hits++; shots[i] = 2;
    J.sfx.boom();
    const sunk = ship.hits >= ship.cells.length ? ship.cells : null;
    if (sunk) sunk.forEach(c => { shots[c] = 3; });
    return { hit: true, sunk, lost: F.me.ships.every(sh => sh.hits >= sh.cells.length) };
}
function fire(i) {
    if (J.mode === 'duel') { F.pending = true; J.duel.send('shot', i); return; }
    // Contre le bot : résolution locale
    const s = F.them.grid[i];
    if (s < 0) { F.myShots[i] = 1; F.log = 'Dans l\'eau.'; J.tone(260, .1, 'sine', .03); }
    else {
        const ship = F.them.ships[s]; ship.hits++; F.myShots[i] = 2; J.sfx.boom();
        if (ship.hits >= ship.cells.length) { ship.cells.forEach(c => { F.myShots[c] = 3; }); F.sunkThem++; F.log = 'Coulé !'; } else F.log = 'Touché !';
        if (F.them.ships.every(sh => sh.hits >= sh.cells.length)) { J.end({ won: true, text: `Flotte adverse coulée en ${fmtTime(J.time)}.` }); return; }
    }
    F.turn = 'them';
    botTimer = setTimeout(() => {
        if (J.over) return;
        const t = botShot(), r = receive(t);
        if (r.lost) { J.end({ won: false, text: 'Le bot a coulé toute ta flotte.' }); return; }
        F.turn = 'me';
    }, 550);
}
