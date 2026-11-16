'use strict';
// ==================== Dames (règles internationales 10×10) ====================
// Pions : avancent d'une case en diagonale, prennent en avant comme en arrière.
// Dames volantes : se déplacent et prennent à distance. Prise obligatoire et prise majoritaire
// (il faut choisir la rafle qui prend le plus de pièces). Promotion en fin de coup sur la dernière rangée.
// Codage : 1 = pion blanc, 2 = dame blanche, -1 = pion noir, -2 = dame noire.

const N = 10, DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
let D = null, botTimer = 0;

function initial() {
    const b = new Int8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2) { if (y < 4) b[y * N + x] = -1; if (y > 5) b[y * N + x] = 1; }
    return { b, turn: 1, quiet: 0 };
}
const inB = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
// Toutes les rafles possibles depuis une case (récursif) : { from, to, path, caps }
function captures(b, from, piece) {
    const out = [];
    const rec = (sq, caps, path) => {
        const x = sq % N, y = Math.floor(sq / N);
        let found = false;
        for (const [dx, dy] of DIRS) {
            if (Math.abs(piece) === 1) {
                const mx = x + dx, my = y + dy, tx = x + 2 * dx, ty = y + 2 * dy;
                if (!inB(tx, ty)) continue;
                const m = my * N + mx, t = ty * N + tx;
                if (b[m] * piece < 0 && !caps.includes(m) && (b[t] === 0 || t === from)) { found = true; rec(t, [...caps, m], [...path, t]); }
            } else {
                let k = 1;
                while (inB(x + dx * k, y + dy * k) && (b[(y + dy * k) * N + x + dx * k] === 0 || (y + dy * k) * N + x + dx * k === from)) k++;
                const mx = x + dx * k, my = y + dy * k;
                if (!inB(mx, my)) continue;
                const m = my * N + mx;
                if (b[m] * piece >= 0 || caps.includes(m)) continue;
                for (let j = k + 1; inB(x + dx * j, y + dy * j); j++) {
                    const t = (y + dy * j) * N + x + dx * j;
                    if (b[t] !== 0 && t !== from) break;
                    found = true; rec(t, [...caps, m], [...path, t]);
                }
            }
        }
        if (!found && caps.length) out.push({ from, to: sq, path, caps });
    };
    rec(from, [], []);
    return out;
}
function legal(s) {
    const b = s.b, me = s.turn;
    let caps = [];
    for (let i = 0; i < N * N; i++) if (b[i] * me > 0) caps.push(...captures(b, i, b[i]));
    if (caps.length) { const max = Math.max(...caps.map(c => c.caps.length)); return caps.filter(c => c.caps.length === max); }
    const out = [];
    for (let i = 0; i < N * N; i++) {
        const p = b[i]; if (p * me <= 0) continue;
        const x = i % N, y = Math.floor(i / N);
        for (const [dx, dy] of DIRS) {
            if (Math.abs(p) === 1) { if (dy !== -me) continue; const tx = x + dx, ty = y + dy; if (inB(tx, ty) && !b[ty * N + tx]) out.push({ from: i, to: ty * N + tx, path: [ty * N + tx], caps: [] }); }
            else for (let k = 1; inB(x + dx * k, y + dy * k) && !b[(y + dy * k) * N + x + dx * k]; k++) out.push({ from: i, to: (y + dy * k) * N + x + dx * k, path: [(y + dy * k) * N + x + dx * k], caps: [] });
        }
    }
    return out;
}
function play(s, m) {
    const b = s.b, p = b[m.from];
    b[m.from] = 0; m.caps.forEach(c => { b[c] = 0; });
    const row = Math.floor(m.to / N);
    b[m.to] = Math.abs(p) === 1 && ((p > 0 && row === 0) || (p < 0 && row === N - 1)) ? p * 2 : p;
    s.quiet = m.caps.length || Math.abs(p) === 1 ? 0 : s.quiet + 1;
    s.turn = -s.turn;
}
const clone = s => ({ b: s.b.slice(), turn: s.turn, quiet: s.quiet });

// ---------- Bot ----------
function evaluate(s) {
    let v = 0;
    for (let i = 0; i < N * N; i++) {
        const p = s.b[i]; if (!p) continue;
        const y = Math.floor(i / N), x = i % N;
        const val = Math.abs(p) === 2 ? 320 : 100 + (p > 0 ? (9 - y) : y) * 3 + (x > 2 && x < 7 ? 4 : 0);
        v += p > 0 ? val : -val;
    }
    return v * s.turn;
}
let deadline = 0, aborted = false, nodes = 0;
function negamax(s, depth, a, b) {
    if ((++nodes & 511) === 0 && performance.now() > deadline) aborted = true;
    if (aborted) return 0;
    const moves = legal(s);
    if (!moves.length) return -100000 - depth;
    if (depth <= 0 && !moves[0].caps.length) return evaluate(s);
    if (depth <= -6) return evaluate(s);
    let best = -1e9;
    for (const m of moves) {
        const t = clone(s); play(t, m);
        const v = -negamax(t, depth - 1, -b, -a);
        if (v > best) best = v;
        if (v > a) a = v;
        if (a >= b) break;
    }
    return best;
}
function botMove() {
    const lvl = J.opts.level, moves = legal(D.s);
    if (lvl === 1) return J.pick(moves);
    const maxD = { 2: 2, 3: 4, 4: 8 }[lvl];
    deadline = performance.now() + (lvl === 4 ? 1600 : 800); aborted = false;
    let best = moves[0];
    for (let d = 1; d <= maxD; d++) {
        let bd = null, bv = -1e9, a = -1e9;
        for (const m of moves) {
            const t = clone(D.s); play(t, m);
            const v = -negamax(t, d - 1, -1e9, -a) + (lvl === 2 ? Math.random() * 25 : 0);
            if (aborted) break;
            if (v > bv) { bv = v; bd = m; }
            if (v > a) a = v;
        }
        if (aborted) break;
        best = bd;
    }
    return best;
}

const myColor = () => J.mode === 'bot' ? 1 : J.mode === 'duel' ? (J.duel.host ? 1 : -1) : D.s.turn;
const myTurn = () => !J.over && !D.thinking && D.s.turn === myColor();
const CELL = 58, OX = 20, OY = 20;

Jeu.create({
    id: 'dames',
    modes: {
        bot: { bot: true, desc: 'Tu joues les blancs et tu commences.', options: [BOT_LEVELS],
            rules: [['circle-dot', 'Les pions avancent en diagonale et prennent dans les deux sens.'], ['crown', 'Une dame se déplace et prend à distance.'], ['triangle-alert', 'La prise est obligatoire, et il faut prendre le plus de pièces possible.']] },
        local: { desc: 'À deux sur le même écran.' },
        duel: { duel: 'direct', desc: 'L\'hôte joue les blancs et commence.' },
    },
    size: [N * CELL + 2 * OX, N * CELL + 2 * OY + 34],
    countdown: false,
    showTime: true,
    controls: [['Clic', 'Choisir un pion puis sa destination']],
    start() { clearTimeout(botTimer); D = { s: initial(), sel: -1, last: null, thinking: false }; D.moves = legal(D.s); },
    stop() { clearTimeout(botTimer); },
    pointer(type, x, y) {
        if (type !== 'down' || !myTurn()) return;
        const cx = Math.floor((x - OX) / CELL), cy = Math.floor((y - OY) / CELL);
        if (!inB(cx, cy)) return;
        let sq = cy * N + cx;
        if (myColor() === -1 && J.mode === 'duel') sq = N * N - 1 - sq;
        const m = D.moves.find(m => m.from === D.sel && m.to === sq);
        if (m) { if (J.duel.on) J.duel.send('move', { from: m.from, to: m.to, path: m.path }); apply(m); return; }
        if (D.moves.some(m => m.from === sq)) { D.sel = sq; J.sfx.click(); } else { if (D.s.b[sq] * D.s.turn > 0) { J.sfx.bad(); } D.sel = -1; }
    },
    onDuel(e, p) {
        if (e !== 'move' || J.over) return;
        const m = D.moves.find(m => m.from === p.from && m.to === p.to && m.path.join() === p.path.join()) || D.moves.find(m => m.from === p.from && m.to === p.to);
        if (m) apply(m);
    },
    stats() {
        const cnt = v => [...D.s.b].filter(p => p * v > 0).length;
        return [['Trait', D.s.turn === 1 ? 'Blancs' : 'Noirs'], ['Blancs', cnt(1)], ['Noirs', cnt(-1)]];
    },
    draw(ctx) {
        const c = J.c, flip = myColor() === -1 && J.mode === 'duel';
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, J.W, J.H);
        const light = c.light ? '#ece6d6' : '#3a3a40', dark = c.light ? '#a98f6b' : '#232327';
        const pos = i => { const j = flip ? N * N - 1 - i : i; return [OX + (j % N) * CELL, OY + Math.floor(j / N) * CELL]; };
        const dests = new Set(D.moves.filter(m => m.from === D.sel).map(m => m.to));
        const movable = new Set(myTurn() ? D.moves.map(m => m.from) : []);
        for (let i = 0; i < N * N; i++) {
            const [x, y] = pos(i), dk = (i % N + Math.floor(i / N)) % 2;
            ctx.fillStyle = dk ? dark : light; ctx.fillRect(x, y, CELL, CELL);
            if (D.last && (D.last.from === i || D.last.to === i)) { ctx.fillStyle = J.alpha(c.warn, .22); ctx.fillRect(x, y, CELL, CELL); }
            if (i === D.sel) { ctx.fillStyle = J.alpha(c.accent, .35); ctx.fillRect(x, y, CELL, CELL); }
            if (dests.has(i)) { ctx.fillStyle = J.alpha(c.ok, .5); ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 9, 0, 7); ctx.fill(); }
            const p = D.s.b[i];
            if (!p) continue;
            const cx = x + CELL / 2, cy = y + CELL / 2, r = CELL * .38;
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(cx, cy + 3, r, 0, 7); ctx.fill();
            ctx.fillStyle = p > 0 ? '#f1ede4' : '#1b1b1e'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
            ctx.strokeStyle = p > 0 ? '#bdb6a6' : '#4a4a52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * .68, 0, 7); ctx.stroke();
            if (Math.abs(p) === 2) { ctx.fillStyle = c.warn; ctx.font = `700 ${r}px ${c.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♛', cx, cy + 1); }
            if (movable.has(i) && D.sel < 0 && D.moves[0].caps.length) { ctx.strokeStyle = c.danger; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, 7); ctx.stroke(); }
        }
        const msg = J.over ? '' : D.thinking ? 'Le bot réfléchit…' : J.mode === 'local' ? `Trait aux ${D.s.turn === 1 ? 'blancs' : 'noirs'}` : myTurn() ? (D.moves[0] && D.moves[0].caps.length ? 'Prise obligatoire !' : 'À toi de jouer') : `Au tour de ${J.duel.opp || 'l\'adversaire'}`;
        J.text(msg, J.W / 2, J.H - 20, 15, c.muted, 'center', 500);
    },
});

function apply(m) {
    if (m.caps.length > 1) J.shake(2 + m.caps.length, .15);
    play(D.s, m);
    D.last = m; D.sel = -1;
    (m.caps.length ? () => J.tone(240, .08, 'square', .04) : () => J.tone(420, .05, 'triangle', .04))();
    D.moves = legal(D.s);
    if (!D.moves.length) {
        const winner = -D.s.turn;
        if (J.mode === 'local') J.end({ won: true, title: winner === 1 ? 'Les blancs gagnent' : 'Les noirs gagnent' });
        else J.end({ won: winner === myColor(), text: winner === myColor() ? 'L\'adversaire ne peut plus jouer.' : 'Tu ne peux plus jouer.' });
        return;
    }
    if (D.s.quiet >= 50) { J.end({ draw: true, won: false, title: 'Nulle', text: '25 coups de dames sans prise.' }); return; }
    if (J.mode === 'bot' && D.s.turn === -1) {
        D.thinking = true;
        botTimer = setTimeout(() => { const bm = botMove(); D.thinking = false; if (bm && !J.over) apply(bm); }, 300);
    }
}
