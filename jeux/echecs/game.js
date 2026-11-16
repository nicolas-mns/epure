'use strict';
// ==================== Échecs ====================
// Règles complètes : roque, prise en passant, promotion au choix, échec et mat, pat,
// règle des 50 coups, triple répétition, matériel insuffisant. Pendule optionnelle.
// Bot : recherche alpha-bêta à profondeur croissante, tables de position, quiescence.

const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
// Tables de position (point de vue des blancs, case 0 = a8)
const PST = {
    P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const isW = p => p && p === p.toUpperCase();
const side = p => p ? (isW(p) ? 'w' : 'b') : null;
const X = i => i % 8, Y = i => i >> 3;
let C = null, botTimer = 0;

function initial() {
    const b = Array(64).fill('');
    'rnbqkbnr'.split('').forEach((p, i) => { b[i] = p; b[56 + i] = p.toUpperCase(); b[8 + i] = 'p'; b[48 + i] = 'P'; });
    return { b, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, hist: [] };
}
function attacked(s, sq, by) {
    const b = s.b, x = X(sq), y = Y(sq);
    const at = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx >= 0 && nx < 8 && ny >= 0 && ny < 8 ? b[ny * 8 + nx] : null; };
    const P = by === 'w' ? 'P' : 'p', N2 = by === 'w' ? 'N' : 'n', K2 = by === 'w' ? 'K' : 'k';
    const pd = by === 'w' ? 1 : -1;
    if (at(-1, pd) === P || at(1, pd) === P) return true;
    for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) if (at(dx, dy) === N2) return true;
    for (const [dx, dy] of [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]]) if (at(dx, dy) === K2) return true;
    const slide = (dirs, pieces) => {
        for (const [dx, dy] of dirs) for (let k = 1; k < 8; k++) {
            const p = at(dx * k, dy * k); if (p === null) break;
            if (p) { if (side(p) === by && pieces.includes(p.toUpperCase())) return true; break; }
        }
        return false;
    };
    return slide([[1, 0], [-1, 0], [0, 1], [0, -1]], 'RQ') || slide([[1, 1], [1, -1], [-1, 1], [-1, -1]], 'BQ');
}
const kingSq = (s, c) => s.b.indexOf(c === 'w' ? 'K' : 'k');
const inCheck = (s, c) => attacked(s, kingSq(s, c), c === 'w' ? 'b' : 'w');
function pseudo(s) {
    const out = [], b = s.b, me = s.turn, opp = me === 'w' ? 'b' : 'w';
    for (let i = 0; i < 64; i++) {
        const p = b[i]; if (!p || side(p) !== me) continue;
        const t = p.toUpperCase(), x = X(i), y = Y(i);
        const add = (to, extra) => out.push(Object.assign({ from: i, to, p, cap: b[to] }, extra));
        const tgt = (nx, ny) => nx >= 0 && nx < 8 && ny >= 0 && ny < 8 ? ny * 8 + nx : -1;
        if (t === 'P') {
            const d = me === 'w' ? -1 : 1, start = me === 'w' ? 6 : 1, last = me === 'w' ? 0 : 7;
            const one = tgt(x, y + d);
            const pushP = (to, extra = {}) => { if (Y(to) === last) 'QRBN'.split('').forEach(q => add(to, Object.assign({ promo: q }, extra))); else add(to, extra); };
            if (one >= 0 && !b[one]) { pushP(one); const two = tgt(x, y + 2 * d); if (y === start && !b[two]) add(two, { double: true }); }
            for (const dx of [-1, 1]) {
                const to = tgt(x + dx, y + d); if (to < 0) continue;
                if (b[to] && side(b[to]) === opp) pushP(to);
                else if (to === s.ep) add(to, { epCap: tgt(x + dx, y) , cap: me === 'w' ? 'p' : 'P' });
            }
        } else if (t === 'N' || t === 'K') {
            const dirs = t === 'N' ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] : [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]];
            for (const [dx, dy] of dirs) { const to = tgt(x + dx, y + dy); if (to >= 0 && side(b[to]) !== me) add(to); }
            if (t === 'K') {
                const row = me === 'w' ? 56 : 0, kc = me === 'w' ? 'K' : 'k', qc = me === 'w' ? 'Q' : 'q';
                if (i === row + 4 && !inCheck(s, me)) {
                    if (s.castle[kc] && !b[row + 5] && !b[row + 6] && b[row + 7] === (me === 'w' ? 'R' : 'r') && !attacked(s, row + 5, opp)) add(row + 6, { castle: 'K' });
                    if (s.castle[qc] && !b[row + 3] && !b[row + 2] && !b[row + 1] && b[row] === (me === 'w' ? 'R' : 'r') && !attacked(s, row + 3, opp)) add(row + 2, { castle: 'Q' });
                }
            }
        } else {
            const dirs = t === 'R' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : t === 'B' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
            for (const [dx, dy] of dirs) for (let k = 1; k < 8; k++) {
                const to = tgt(x + dx * k, y + dy * k); if (to < 0) break;
                if (!b[to]) add(to); else { if (side(b[to]) === opp) add(to); break; }
            }
        }
    }
    return out;
}
function make(s, m) {
    const u = { m, castle: Object.assign({}, s.castle), ep: s.ep, half: s.half };
    const b = s.b;
    b[m.to] = m.promo ? (s.turn === 'w' ? m.promo : m.promo.toLowerCase()) : m.p;
    b[m.from] = '';
    if (m.epCap !== undefined) b[m.epCap] = '';
    if (m.castle) { const row = s.turn === 'w' ? 56 : 0; if (m.castle === 'K') { b[row + 5] = b[row + 7]; b[row + 7] = ''; } else { b[row + 3] = b[row]; b[row] = ''; } }
    const t = m.p.toUpperCase();
    if (t === 'K') { if (s.turn === 'w') s.castle.K = s.castle.Q = false; else s.castle.k = s.castle.q = false; }
    for (const [sq, k] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === sq || m.to === sq) s.castle[k] = false;
    s.ep = m.double ? (m.from + m.to) / 2 : -1;
    s.half = t === 'P' || m.cap ? 0 : s.half + 1;
    s.turn = s.turn === 'w' ? 'b' : 'w';
    return u;
}
function unmake(s, u) {
    const m = u.m, b = s.b;
    s.turn = s.turn === 'w' ? 'b' : 'w';
    b[m.from] = m.p;
    b[m.to] = m.epCap !== undefined ? '' : (m.cap || '');
    if (m.epCap !== undefined) b[m.epCap] = m.cap;
    if (m.castle) { const row = s.turn === 'w' ? 56 : 0; if (m.castle === 'K') { b[row + 7] = b[row + 5]; b[row + 5] = ''; } else { b[row] = b[row + 3]; b[row + 3] = ''; } }
    s.castle = u.castle; s.ep = u.ep; s.half = u.half;
}
function legalMoves(s) {
    const me = s.turn;
    return pseudo(s).filter(m => { const u = make(s, m); const ok = !inCheck(s, me); unmake(s, u); return ok; });
}
const posKey = s => s.b.map(p => p || '.').join('') + s.turn + Object.values(s.castle).map(Number).join('') + s.ep;
function insufficient(s) {
    const ps = s.b.filter(Boolean).map(p => p.toUpperCase()).filter(p => p !== 'K');
    return !ps.length || (ps.length === 1 && 'NB'.includes(ps[0]));
}

// ---------- Bot ----------
function evaluate(s) {
    let v = 0;
    for (let i = 0; i < 64; i++) {
        const p = s.b[i]; if (!p) continue;
        const t = p.toUpperCase();
        v += isW(p) ? VAL[t] + PST[t][i] : -(VAL[t] + PST[t][(7 - Y(i)) * 8 + X(i)]);
    }
    return s.turn === 'w' ? v : -v;
}
const order = ms => ms.sort((a, b) => ((b.cap ? VAL[b.cap.toUpperCase()] * 10 - VAL[b.p.toUpperCase()] : 0) + (b.promo ? 800 : 0)) - ((a.cap ? VAL[a.cap.toUpperCase()] * 10 - VAL[a.p.toUpperCase()] : 0) + (a.promo ? 800 : 0)));
let nodes = 0, deadline = 0, aborted = false;
function quiesce(s, a, b, depth) {
    const stand = evaluate(s);
    if (depth <= 0 || stand >= b) return stand;
    if (stand > a) a = stand;
    const me = s.turn;
    for (const m of order(pseudo(s).filter(m => m.cap))) {
        const u = make(s, m);
        if (inCheck(s, me)) { unmake(s, u); continue; }
        const v = -quiesce(s, -b, -a, depth - 1);
        unmake(s, u);
        if (v >= b) return v;
        if (v > a) a = v;
    }
    return a;
}
function negamax(s, depth, a, b, ply, qs) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) aborted = true;
    if (aborted) return 0;
    if (depth === 0) return qs ? quiesce(s, a, b, 4) : evaluate(s);
    const me = s.turn;
    let any = false, best = -1e9;
    for (const m of order(pseudo(s))) {
        const u = make(s, m);
        if (inCheck(s, me)) { unmake(s, u); continue; }
        any = true;
        const v = -negamax(s, depth - 1, -b, -a, ply + 1, qs);
        unmake(s, u);
        if (v > best) best = v;
        if (v > a) a = v;
        if (a >= b) break;
    }
    if (!any) return inCheck(s, me) ? -100000 + ply : 0;
    return best;
}
function botMove(s) {
    const lvl = J.opts.level, moves = legalMoves(s);
    if (lvl === 1) {
        // Facile : prend une pièce si elle est offerte, sinon joue au hasard
        const caps = moves.filter(m => m.cap);
        return Math.random() < .6 && caps.length ? J.pick(caps) : J.pick(moves);
    }
    const maxDepth = { 2: 2, 3: 3, 4: 5 }[lvl], qs = lvl >= 3;
    deadline = performance.now() + (lvl === 4 ? 1800 : 900); aborted = false;
    let best = moves[0];
    for (let d = 1; d <= maxDepth; d++) {
        let bestD = null, bv = -1e9, a = -1e9;
        const ms = order(moves.slice());
        if (best) ms.unshift(...ms.splice(ms.indexOf(best), 1));
        for (const m of ms) {
            const u = make(s, m);
            const v = -negamax(s, d - 1, -1e9, -a, 1, qs) + (lvl === 2 ? Math.random() * 30 : 0);
            unmake(s, u);
            if (aborted) break;
            if (v > bv) { bv = v; bestD = m; }
            if (v > a) a = v;
        }
        if (aborted) break;
        best = bestD;
        if (bv > 90000) break;
    }
    return best;
}

const myColor = () => J.mode === 'bot' ? 'w' : J.mode === 'duel' ? (J.duel.host ? 'w' : 'b') : C.s.turn;
const myTurn = () => !J.over && C.s.turn === myColor() && !C.thinking;
const fmtClock = t => t == null ? '—' : `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
const CLOCK = { id: 'clock', label: 'Pendule', def: 0, choices: [[0, 'Sans'], [180, '3 min'], [300, '5 min'], [600, '10 min']] };

Jeu.create({
    id: 'echecs',
    modes: {
        bot: { bot: true, desc: 'Tu joues les blancs.', options: [BOT_LEVELS, CLOCK],
            rules: [['mouse-pointer-click', 'Clique une pièce puis sa destination, ou fais-la glisser.'], ['crown', 'Roque, prise en passant et promotion au choix.']] },
        local: { desc: 'À deux sur le même écran.', options: [CLOCK] },
        duel: { duel: 'direct', desc: 'L\'hôte joue les blancs.', options: [CLOCK] },
    },
    size: [640, 700],
    maxScale: 1.25,
    countdown: false,
    showTime: false,
    controls: [['Clic / glisser', 'Déplacer une pièce']],
    start() {
        clearTimeout(botTimer);
        C = { s: initial(), sel: -1, moves: [], last: null, promo: null, drag: null, thinking: false, reps: {}, clock: J.opts.clock ? { w: J.opts.clock, b: J.opts.clock } : null, captured: { w: [], b: [] } };
        C.moves = legalMoves(C.s);
        C.reps[posKey(C.s)] = 1;
    },
    stop() { clearTimeout(botTimer); },
    update(dt) {
        if (!C.clock || J.over) return;
        C.clock[C.s.turn] -= dt;
        if (C.clock[C.s.turn] <= 0) {
            const loser = C.s.turn;
            C.clock[loser] = 0;
            if (J.mode === 'duel' && loser !== myColor()) return; // le perdant annonce lui-même sa défaite
            if (J.mode === 'duel') J.duel.send('flag', {});
            endFor(loser === 'w' ? 'b' : 'w', 'Temps écoulé');
        }
    },
    pointer(type, x, y) {
        if (J.over) return;
        if (C.promo) { if (type === 'down') pickPromo(x, y); return; }
        const sq = sqAt(x, y);
        if (type === 'down') {
            if (!myTurn() || sq < 0) return;
            if (C.sel >= 0 && C.moves.some(m => m.from === C.sel && m.to === sq)) { tryMove(C.sel, sq); return; }
            if (C.s.b[sq] && side(C.s.b[sq]) === C.s.turn) { C.sel = sq; C.drag = { x, y, moved: false }; J.sfx.click(); } else C.sel = -1;
        }
        if (type === 'move' && C.drag) { C.drag.x = x; C.drag.y = y; C.drag.moved = true; }
        if (type === 'up' && C.drag) { const moved = C.drag.moved; C.drag = null; if (moved && sq >= 0 && sq !== C.sel) tryMove(C.sel, sq); }
    },
    onDuel(e, p) {
        if (e === 'move' && !J.over) { const m = C.moves.find(m => m.from === p.from && m.to === p.to && (m.promo || null) === (p.promo || null)); if (m) apply(m); }
        if (e === 'flag' && !J.over) endFor(myColor(), 'Temps écoulé');
        if (e === 'resign' && !J.over) endFor(myColor(), 'Abandon');
    },
    stats() {
        const rows = [['Trait', C.s.turn === 'w' ? 'Blancs' : 'Noirs']];
        if (C.clock) rows.push(['Blancs', fmtClock(C.clock.w)], ['Noirs', fmtClock(C.clock.b)]);
        rows.push(['Coups', Math.ceil(C.s.hist.length / 2)]);
        return rows;
    },
    draw(ctx) {
        const c = J.c, S = 72, ox = 32, oy = 50, flip = myColor() === 'b' && J.mode !== 'local';
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, J.W, J.H);
        const light = J.c.light ? '#e9e4d8' : '#3a3a40', dark = J.c.light ? '#b9a98d' : '#26262b';
        const pos = sq => { const x = X(sq), y = Y(sq); return flip ? [ox + (7 - x) * S, oy + (7 - y) * S] : [ox + x * S, oy + y * S]; };
        const check = inCheck(C.s, C.s.turn) ? kingSq(C.s, C.s.turn) : -1;
        for (let i = 0; i < 64; i++) {
            const [px, py] = pos(i);
            ctx.fillStyle = (X(i) + Y(i)) % 2 ? dark : light; ctx.fillRect(px, py, S, S);
            if (C.last && (i === C.last.from || i === C.last.to)) { ctx.fillStyle = J.alpha(c.warn, .28); ctx.fillRect(px, py, S, S); }
            if (i === C.sel) { ctx.fillStyle = J.alpha(c.accent, .35); ctx.fillRect(px, py, S, S); }
            if (i === check) { ctx.fillStyle = J.alpha(c.danger, .55); ctx.fillRect(px, py, S, S); }
        }
        // Coordonnées
        for (let k = 0; k < 8; k++) {
            J.text('abcdefgh'[flip ? 7 - k : k], ox + k * S + S / 2, oy + 8 * S + 12, 11, c.muted, 'center', 500, true);
            J.text(String(flip ? k + 1 : 8 - k), ox - 12, oy + k * S + S / 2, 11, c.muted, 'center', 500, true);
        }
        // Destinations possibles
        if (C.sel >= 0) for (const m of C.moves) if (m.from === C.sel) {
            const [px, py] = pos(m.to);
            ctx.fillStyle = J.alpha('#000000', .25);
            ctx.beginPath(); m.cap ? ctx.arc(px + S / 2, py + S / 2, S * .44, 0, 7) : ctx.arc(px + S / 2, py + S / 2, S * .14, 0, 7);
            if (m.cap) { ctx.strokeStyle = J.alpha('#000000', .3); ctx.lineWidth = 5; ctx.stroke(); } else ctx.fill();
        }
        // Pièces
        for (let i = 0; i < 64; i++) {
            const p = C.s.b[i]; if (!p) continue;
            if (C.drag && C.drag.moved && i === C.sel) continue;
            const [px, py] = pos(i);
            piece(ctx, p, px + S / 2, py + S / 2, S);
        }
        if (C.drag && C.drag.moved && C.sel >= 0) piece(ctx, C.s.b[C.sel], C.drag.x, C.drag.y, S * 1.1);
        // Pièces prises et message
        const capStr = col => C.captured[col].map(p => GLYPH[p.toUpperCase()]).join('');
        J.text(capStr('b'), ox, 24, 20, c.muted, 'left', 400);
        J.text(capStr('w'), ox, oy + 8 * S + 38, 20, c.muted, 'left', 400);
        const msg = J.over ? '' : C.thinking ? 'Le bot réfléchit…' : J.mode === 'local' ? `Trait aux ${C.s.turn === 'w' ? 'blancs' : 'noirs'}` : myTurn() ? (check >= 0 ? 'Échec ! À toi' : 'À toi de jouer') : `Au tour de ${J.duel.opp || 'l\'adversaire'}`;
        J.text(msg, ox + 8 * S, oy + 8 * S + 38, 14, c.text, 'right', 600);
        // Choix de promotion
        if (C.promo) {
            ctx.fillStyle = J.alpha(c.bg, .7); ctx.fillRect(0, 0, J.W, J.H);
            J.text('Promotion', J.W / 2, 270, 20, c.text, 'center', 700);
            'QRBN'.split('').forEach((q, k) => {
                const x = J.W / 2 - 170 + k * 88, y = 300;
                J.rr(x, y, 76, 76, 10); ctx.fillStyle = c.surface3; ctx.fill();
                piece(ctx, C.s.turn === 'w' ? q : q.toLowerCase(), x + 38, y + 38, 72);
            });
        }
    },
});

function piece(ctx, p, x, y, S) {
    ctx.font = `${S * .78}px "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = isW(p);
    ctx.lineWidth = S * .045; ctx.strokeStyle = w ? '#1a1a1a' : '#f2f2f2';
    ctx.strokeText(GLYPH[p.toUpperCase()], x, y + S * .04);
    ctx.fillStyle = w ? '#fafafa' : '#141414';
    ctx.fillText(GLYPH[p.toUpperCase()], x, y + S * .04);
}
function sqAt(x, y) {
    const S = 72, ox = 32, oy = 50, flip = myColor() === 'b' && J.mode !== 'local';
    let cx = Math.floor((x - ox) / S), cy = Math.floor((y - oy) / S);
    if (cx < 0 || cy < 0 || cx > 7 || cy > 7) return -1;
    if (flip) { cx = 7 - cx; cy = 7 - cy; }
    return cy * 8 + cx;
}
function tryMove(from, to) {
    const cands = C.moves.filter(m => m.from === from && m.to === to);
    if (!cands.length) { C.sel = -1; return; }
    if (cands.length > 1) { C.promo = { from, to }; return; }
    send(cands[0]); apply(cands[0]);
}
function pickPromo(x, y) {
    const k = Math.floor((x - (J.W / 2 - 170)) / 88);
    if (y < 300 || y > 376 || k < 0 || k > 3) { C.promo = null; C.sel = -1; return; }
    const q = 'QRBN'[k], m = C.moves.find(m => m.from === C.promo.from && m.to === C.promo.to && m.promo === q);
    C.promo = null;
    if (m) { send(m); apply(m); }
}
function send(m) { if (J.duel.on) J.duel.send('move', { from: m.from, to: m.to, promo: m.promo || null }); }
function apply(m) {
    const s = C.s;
    if (m.cap) { C.captured[s.turn].push(m.cap); J.shake(2, .1); }
    make(s, m);
    s.hist.push(m);
    C.last = m; C.sel = -1;
    (m.cap ? () => J.tone(220, .09, 'square', .04) : () => J.tone(440, .05, 'triangle', .04))();
    const k = posKey(s); C.reps[k] = (C.reps[k] || 0) + 1;
    C.moves = legalMoves(s);
    if (!C.moves.length) { if (inCheck(s, s.turn)) endFor(s.turn === 'w' ? 'b' : 'w', 'Échec et mat'); else endFor(null, 'Pat'); return; }
    if (s.half >= 100) { endFor(null, 'Règle des 50 coups'); return; }
    if (C.reps[k] >= 3) { endFor(null, 'Triple répétition'); return; }
    if (insufficient(s)) { endFor(null, 'Matériel insuffisant'); return; }
    if (inCheck(s, s.turn)) J.tone(660, .1, 'square', .03, 0, .06);
    if (J.mode === 'bot' && s.turn === 'b') {
        C.thinking = true;
        botTimer = setTimeout(() => {
            const bm = botMove(s);
            C.thinking = false;
            if (bm && !J.over) apply(bm);
        }, 250);
    }
}
function endFor(winner, why) {
    if (J.over) return;
    if (!winner) { J.end({ draw: true, won: false, title: 'Nulle', text: why }); return; }
    if (J.mode === 'local') { J.end({ won: true, title: winner === 'w' ? 'Les blancs gagnent' : 'Les noirs gagnent', text: why }); return; }
    const won = winner === myColor();
    J.end({ won, text: why + (won ? '' : J.mode === 'bot' ? ' : le bot l\'emporte.' : '') });
}
