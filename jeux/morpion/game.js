'use strict';
// ==================== Morpion+ (morpion ultime) ====================
// 9 petits morpions dans un grand. La case jouée dans un petit morpion indique dans quel
// petit morpion l'adversaire doit jouer. Gagner 3 petits morpions alignés gagne la partie.
// Bot : Monte-Carlo (MCTS), plus ou moins de simulations selon le niveau.

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
let G = null, botTimer = 0;

function lineWin(get) { for (const [a, b, c] of LINES) { const v = get(a); if (v && v < 3 && v === get(b) && v === get(c)) return v; } return 0; }
function newState() { return { cells: new Uint8Array(81), big: new Uint8Array(9), next: -1, turn: 1, winner: 0, last: -1 }; }
function clone(s) { return { cells: s.cells.slice(), big: s.big.slice(), next: s.next, turn: s.turn, winner: s.winner, last: s.last }; }
function legal(s) {
    if (s.winner) return [];
    const out = [];
    const boards = s.next >= 0 && !s.big[s.next] ? [s.next] : [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(b => !s.big[b]);
    for (const b of boards) for (let k = 0; k < 9; k++) if (!s.cells[b * 9 + k]) out.push(b * 9 + k);
    return out;
}
function play(s, i) {
    const b = Math.floor(i / 9), k = i % 9;
    s.cells[i] = s.turn; s.last = i;
    if (!s.big[b]) {
        const w = lineWin(x => s.cells[b * 9 + x]);
        if (w) s.big[b] = w;
        else if ([0, 1, 2, 3, 4, 5, 6, 7, 8].every(x => s.cells[b * 9 + x])) s.big[b] = 3;
    }
    s.winner = lineWin(x => s.big[x]) || ([...s.big].every(Boolean) ? 3 : 0);
    s.next = s.big[k] ? -1 : k;
    s.turn = 3 - s.turn;
}

// ---------- Bot ----------
function greedy(s) {
    const moves = legal(s), me = s.turn;
    for (const i of moves) { const t = clone(s); play(t, i); if (t.winner === me) return i; }
    for (const i of moves) { const t = clone(s); const b = Math.floor(i / 9); play(t, i); if (t.big[b] === me && !s.big[b]) return i; }
    const safe = moves.filter(i => { const t = clone(s); play(t, i); return !legal(t).some(j => { const u = clone(t); play(u, j); return u.winner; }); });
    return J.pick(safe.length ? safe : moves);
}
function mcts(root, iters) {
    const me = root.turn;
    const node = (s, move, parent) => ({ s, move, parent, kids: null, w: 0, n: 0 });
    const R = node(root, -1, null);
    const t0 = performance.now();
    for (let it = 0; it < iters && performance.now() - t0 < 900; it++) {
        let n = R;
        while (n.kids && n.kids.length && n.kids.every(k => k.n)) {
            let best = null, bv = -1;
            for (const k of n.kids) { const v = k.w / k.n + 1.3 * Math.sqrt(Math.log(n.n) / k.n); if (v > bv) { bv = v; best = k; } }
            n = best;
        }
        if (!n.kids) n.kids = legal(n.s).map(m => { const t = clone(n.s); play(t, m); return node(t, m, n); });
        const fresh = n.kids.filter(k => !k.n);
        if (fresh.length) n = fresh[Math.floor(Math.random() * fresh.length)];
        // Simulation aléatoire (avec un peu de bon sens : on prend une victoire immédiate)
        const sim = clone(n.s);
        let guard = 0;
        while (!sim.winner && guard++ < 81) { const ms = legal(sim); if (!ms.length) break; play(sim, ms[Math.floor(Math.random() * ms.length)]); }
        // Chaque nœud compte du point de vue du joueur qui a joué pour y arriver
        for (let p = n; p; p = p.parent) {
            p.n++;
            const mover = 3 - p.s.turn;
            p.w += sim.winner === mover ? 1 : sim.winner === 3 || !sim.winner ? .5 : 0;
        }
    }
    let best = R.kids[0];
    for (const k of R.kids) if (k.n > best.n) best = k;
    return best.move;
}
function botMove() {
    const lvl = J.opts.level, moves = legal(G);
    if (!moves.length) return;
    const i = lvl === 1 ? (Math.random() < .5 ? greedy(G) : J.pick(moves)) : lvl === 2 ? greedy(G) : mcts(G, lvl === 3 ? 600 : 4000);
    doMove(i);
}

const myTurn = () => J.mode === 'local' || (J.mode === 'bot' ? G.turn === 1 : G.turn === (J.duel.host ? 1 : 2));

Jeu.create({
    id: 'morpion',
    modes: {
        bot: { bot: true, desc: 'Tu joues les croix et tu commences.', options: [BOT_LEVELS],
            rules: [['hash', 'Ta case dans un petit morpion envoie l\'adversaire dans le petit morpion correspondant.'], ['move', 'Si ce petit morpion est fini, il peut jouer où il veut.'], ['trophy', 'Aligne 3 petits morpions gagnés.']] },
        local: { desc: 'À deux sur le même écran, chacun son tour.' },
        duel: { duel: 'direct', desc: 'L\'hôte joue les croix et commence.' },
    },
    size: [600, 640],
    showTime: true,
    countdown: false,
    controls: [['Clic', 'Jouer une case']],
    start() { G = newState(); G.hover = -1; clearTimeout(botTimer); },
    stop() { clearTimeout(botTimer); },
    pointer(type, x, y) {
        const i = cellAt(x, y);
        if (type === 'move') { G.hover = i; return; }
        if (type !== 'down' || J.over || i < 0 || !myTurn() || !legal(G).includes(i)) return;
        doMove(i);
        if (J.duel.on) J.duel.send('move', i);
    },
    onDuel(e, p) { if (e === 'move' && !J.over && !myTurn() && legal(G).includes(p)) doMove(p); },
    stats() {
        const who = G.turn === 1 ? 'Croix' : 'Ronds';
        return [['Au tour de', J.mode === 'local' ? who : myTurn() ? 'Toi' : J.mode === 'bot' ? 'Bot' : J.duel.opp || 'Adversaire'], ['Tu joues', J.mode === 'local' ? '—' : (J.mode === 'bot' || J.duel.host) ? 'Croix' : 'Ronds']];
    },
    draw(ctx) {
        const c = J.c, S = 600, B = S / 3, cs = B / 3, pad = 0;
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, J.W, J.H);
        const allowed = new Set(legal(G).map(i => Math.floor(i / 9)));
        for (let b = 0; b < 9; b++) {
            const bx = (b % 3) * B, by = Math.floor(b / 3) * B;
            if (allowed.has(b) && !J.over) { ctx.fillStyle = J.alpha(c.accent, myTurn() ? .1 : .05); ctx.fillRect(bx + 4, by + 4, B - 8, B - 8); }
            for (let k = 0; k < 9; k++) {
                const i = b * 9 + k, x = bx + (k % 3) * cs, y = by + Math.floor(k / 3) * cs, v = G.cells[i];
                if (i === G.hover && !v && allowed.has(b) && myTurn() && !J.over) { ctx.fillStyle = J.alpha(c.text, .08); ctx.fillRect(x + 6, y + 6, cs - 12, cs - 12); }
                if (i === G.last) { ctx.fillStyle = J.alpha(c.warn, .18); ctx.fillRect(x + 6, y + 6, cs - 12, cs - 12); }
                if (v) mark(ctx, v, x + cs / 2, y + cs / 2, cs * .28, 3.5, G.big[b] ? .35 : 1);
            }
            // Petite grille
            ctx.strokeStyle = c.border; ctx.lineWidth = 1.5; ctx.beginPath();
            for (let k = 1; k < 3; k++) { ctx.moveTo(bx + k * cs, by + 12); ctx.lineTo(bx + k * cs, by + B - 12); ctx.moveTo(bx + 12, by + k * cs); ctx.lineTo(bx + B - 12, by + k * cs); }
            ctx.stroke();
            if (G.big[b] === 1 || G.big[b] === 2) mark(ctx, G.big[b], bx + B / 2, by + B / 2, B * .32, 9, 1);
        }
        ctx.strokeStyle = c.text; ctx.lineWidth = 3; ctx.beginPath();
        for (let k = 1; k < 3; k++) { ctx.moveTo(k * B, 6); ctx.lineTo(k * B, S - 6); ctx.moveTo(6, k * B); ctx.lineTo(S - 6, k * B); }
        ctx.stroke();
        const msg = J.over ? '' : myTurn() ? (J.mode === 'local' ? `Au tour des ${G.turn === 1 ? 'croix' : 'ronds'}` : 'À toi de jouer') : J.mode === 'bot' ? 'Le bot réfléchit…' : `Au tour de ${J.duel.opp}`;
        J.text(msg, S / 2, 620, 15, c.muted, 'center', 500);
    },
});

function mark(ctx, v, x, y, r, lw, a) {
    ctx.globalAlpha = a; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.strokeStyle = v === 1 ? J.c.text : J.c.danger;
    ctx.beginPath();
    if (v === 1) { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke(); ctx.globalAlpha = 1;
}
function cellAt(x, y) {
    if (x < 0 || y < 0 || x >= 600 || y >= 600) return -1;
    const B = 200, cs = B / 3, b = Math.floor(y / B) * 3 + Math.floor(x / B), k = Math.floor((y % B) / cs) * 3 + Math.floor((x % B) / cs);
    return b * 9 + k;
}
function doMove(i) {
    play(G, i);
    J.tone(G.turn === 2 ? 520 : 390, .05, 'triangle', .04);
    J.redraw();
    if (G.winner) {
        const meX = J.mode === 'bot' || (J.duel.on && J.duel.host);
        if (G.winner === 3) J.end({ draw: true, won: false, text: 'Plus aucun coup possible.' });
        else if (J.mode === 'local') J.end({ won: true, title: G.winner === 1 ? 'Les croix gagnent' : 'Les ronds gagnent', noRecord: false });
        else { const won = (G.winner === 1) === meX; J.end({ won, text: won ? 'Trois morpions alignés !' : 'L\'adversaire a aligné trois morpions.' }); }
        return;
    }
    if (J.mode === 'bot' && G.turn === 2) botTimer = setTimeout(botMove, 350);
}
