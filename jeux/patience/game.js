'use strict';
// ==================== Patience ====================
// Klondike (tirage 1 ou 3) et FreeCell. Glisser-déposer, double-clic pour envoyer aux fondations,
// annulation illimitée (U), fin automatique quand tout est découvert. Duel : même donne.

const W = 900, H = 660, CW = 82, CH = 116, GAP = 104, TOP = 24, TAB = 170;
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
let P = null;
const red = c => c.s === 1 || c.s === 2;

function deck() { const d = []; for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ s, r, up: false }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(J.rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
const isFree = () => P.kind === 'freecell';

Jeu.create({
    id: 'patience',
    modes: {
        klondike: { desc: 'Le solitaire classique : range les quatre couleurs de l\'As au Roi.', options: [{ id: 'draw', label: 'Tirage', def: 1, choices: [[1, '1 carte', 'plus facile'], [3, '3 cartes', 'le vrai défi']] }],
            rules: [['mouse-pointer-2', 'Glisse les cartes ; double-clic pour les envoyer aux fondations.'], ['layers', 'Colonnes : en descendant, en alternant rouge et noir. Seul un Roi va sur une colonne vide.'], ['undo-2', 'U pour annuler, autant que tu veux.']] },
        freecell: { desc: 'Toutes les cartes sont visibles, quatre cases libres pour manœuvrer. Presque toutes les donnes se résolvent.',
            rules: [['square-dashed', 'Quatre cases libres pour garer une carte.'], ['layers', 'On déplace plusieurs cartes à la fois s\'il y a assez de cases libres.']] },
        duel: { duel: 'race', desc: 'Même donne pour les deux joueurs. Le premier à tout ranger gagne.', options: [{ id: 'kind', label: 'Jeu', def: 'freecell', choices: [['freecell', 'FreeCell', 'conseillé : toujours jouable'], ['klondike', 'Klondike', 'tirage 1']] }] },
    },
    size: [W, H],
    maxScale: 1.25,
    countdown: false,
    showTime: true,
    controls: [['Glisser', 'Déplacer des cartes'], ['Double-clic', 'Vers les fondations'], ['<kbd>U</kbd>', 'Annuler'], ['<kbd>Espace</kbd>', 'Piocher (Klondike)']],
    sub() { return J.mode === 'klondike' ? J.opts.draw : null; },
    duelCompare: (a, b) => (a.won - b.won) || (a.won ? b.time - a.time : (a.score || 0) - (b.score || 0)),
    duelFormat: r => r.won ? fmtTime(r.time) : `${r.score || 0}/52`,
    progLabel: 'Ses cartes rangées',
    start() {
        const kind = J.mode === 'duel' ? J.opts.kind : J.mode;
        const d = deck();
        P = { kind, draw: J.mode === 'klondike' ? J.opts.draw : 1, stock: [], waste: [], f: [[], [], [], []], t: [], cells: [null, null, null, null], hist: [], drag: null, auto: 0, lastClick: 0, moves: 0, anim: [] };
        if (kind === 'freecell') {
            P.t = Array.from({ length: 8 }, () => []);
            d.forEach((c, i) => { c.up = true; P.t[i % 8].push(c); });
        } else {
            P.t = Array.from({ length: 7 }, () => []);
            let k = 0;
            for (let col = 0; col < 7; col++) for (let r = 0; r <= col; r++) { const c = d[k++]; c.up = r === col; P.t[col].push(c); }
            P.stock = d.slice(k);
        }
    },
    keydown(code) {
        if (code === 'KeyU') undo();
        if (code === 'Space' && !isFree()) drawStock();
    },
    update(dt) {
        // Fin automatique : une carte toutes les 70 ms
        if (P.auto) {
            P.autoT = (P.autoT || 0) - dt;
            if (P.autoT <= 0) { P.autoT = .07; if (!autoStep()) P.auto = 0; }
        }
    },
    pointer(type, x, y) {
        if (type === 'down') {
            const hit = hitTest(x, y);
            const now = performance.now(), dbl = now - P.lastClick < 320 && P.lastHit && hit && P.lastHit.pile === hit.pile && P.lastHit.i === hit.i;
            P.lastClick = now; P.lastHit = hit;
            if (!hit) return;
            if (hit.pile === 'stock') { drawStock(); return; }
            const cards = movable(hit);
            if (!cards) return;
            if (dbl && cards.length === 1 && toFoundation(hit.pile)) return;
            const [cx, cy] = cardPos(hit.pile, hit.i);
            P.drag = { from: hit.pile, i: hit.i, cards, ox: x - cx, oy: y - cy, x, y, moved: false };
        }
        if (type === 'move' && P.drag) { P.drag.x = x; P.drag.y = y; if (Math.abs(x - P.drag.ox) > 2) P.drag.moved = true; }
        if (type === 'up' && P.drag) {
            const d = P.drag; P.drag = null;
            let target = dropTarget(d.x - d.ox + CW / 2, d.y - d.oy + 20, d.from);
            if (target && target[0] === 'f') target = 'f' + d.cards[0].s; // chaque couleur a sa fondation
            if (target && canDrop(d.cards, target, d.from)) move(d.from, d.cards.length, target);
        }
    },
    stats() { return [['Rangées', `${P.f.reduce((a, f) => a + f.length, 0)}/52`], ['Coups', P.moves]]; },
    draw(ctx) {
        const c = J.c;
        ctx.fillStyle = c.light ? '#2f6b45' : '#173524'; ctx.fillRect(0, 0, W, H);
        const slot = (x, y, label) => { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; J.rr(x, y, CW, CH, 8); ctx.stroke(); if (label) J.text(label, x + CW / 2, y + CH / 2, 26, 'rgba(255,255,255,.25)', 'center', 700); };
        // Rangée du haut
        if (isFree()) {
            for (let k = 0; k < 4; k++) { const [x, y] = cardPos('c' + k, 0); slot(x, y); if (P.cells[k] && !(P.drag && P.drag.from === 'c' + k)) card(ctx, P.cells[k], x, y); }
        } else {
            const [sx, sy] = cardPos('stock', 0); slot(sx, sy, '↻');
            if (P.stock.length) card(ctx, { up: false }, sx, sy);
            const shown = P.waste.slice(-(P.draw === 3 ? 3 : 1));
            shown.forEach((cd, k) => { const [x, y] = cardPos('waste', P.waste.length - shown.length + k); if (!(P.drag && P.drag.from === 'waste' && k === shown.length - 1)) card(ctx, cd, x, y); });
        }
        for (let k = 0; k < 4; k++) { const [x, y] = cardPos('f' + k, 0); slot(x, y, SUITS[k]); const f = P.f[k]; if (f.length) card(ctx, f[f.length > 1 && P.drag && P.drag.from === 'f' + k ? f.length - 2 : f.length - 1], x, y); }
        // Colonnes
        P.t.forEach((col, ci) => {
            const [x, y] = cardPos('t' + ci, 0); slot(x, y);
            col.forEach((cd, i) => { if (P.drag && P.drag.from === 't' + ci && i >= P.drag.i) return; const [px, py] = cardPos('t' + ci, i); card(ctx, cd, px, py); });
        });
        // Cartes en cours de déplacement
        if (P.drag) P.drag.cards.forEach((cd, k) => card(ctx, cd, P.drag.x - P.drag.ox, P.drag.y - P.drag.oy + k * 28, true));
        if (!P.auto && canAutoFinish()) {
            J.rr(W - 190, H - 52, 170, 36, 8); ctx.fillStyle = c.accent; ctx.fill();
            J.text('Finir automatiquement', W - 105, H - 34, 13, c.accentInk);
            P.autoBtn = { x: W - 190, y: H - 52, w: 170, h: 36 };
        } else P.autoBtn = null;
    },
});

// ---------- Positions ----------
function cardPos(pile, i) {
    const x0 = (W - (isFree() ? 8 : 7) * GAP + (GAP - CW)) / 2;
    if (pile === 'stock') return [x0, TOP];
    if (pile === 'waste') { const shown = Math.min(P.draw === 3 ? 3 : 1, P.waste.length), k = i - (P.waste.length - shown); return [x0 + GAP + Math.max(0, k) * 22, TOP]; }
    if (pile[0] === 'c') return [x0 + +pile[1] * GAP, TOP];
    if (pile[0] === 'f') return [x0 + (isFree() ? 4 : 3) * GAP + +pile[1] * GAP, TOP];
    const ci = +pile.slice(1), col = P.t[ci];
    let y = TAB;
    const room = H - TAB - CH - 10;
    const ups = col.filter(c => c.up).length, downs = col.length - ups;
    const upGap = Math.min(28, ups > 1 ? (room - downs * 12) / (ups - 1) : 28);
    for (let k = 0; k < i; k++) y += col[k].up ? upGap : 12;
    return [x0 + ci * GAP, y];
}
function hitTest(x, y) {
    const inside = (px, py, h = CH) => x >= px && x <= px + CW && y >= py && y <= py + h;
    for (let ci = 0; ci < P.t.length; ci++) {
        const col = P.t[ci];
        for (let i = col.length - 1; i >= 0; i--) { const [px, py] = cardPos('t' + ci, i); if (inside(px, py)) return { pile: 't' + ci, i }; }
    }
    if (P.autoBtn && x >= P.autoBtn.x && x <= P.autoBtn.x + P.autoBtn.w && y >= P.autoBtn.y && y <= P.autoBtn.y + P.autoBtn.h) { P.auto = 1; return null; }
    if (!isFree()) {
        const [sx, sy] = cardPos('stock', 0); if (inside(sx, sy)) return { pile: 'stock', i: 0 };
        if (P.waste.length) { const [wx, wy] = cardPos('waste', P.waste.length - 1); if (inside(wx, wy)) return { pile: 'waste', i: P.waste.length - 1 }; }
    } else for (let k = 0; k < 4; k++) { const [px, py] = cardPos('c' + k, 0); if (P.cells[k] && inside(px, py)) return { pile: 'c' + k, i: 0 }; }
    for (let k = 0; k < 4; k++) { const [px, py] = cardPos('f' + k, 0); if (P.f[k].length && inside(px, py)) return { pile: 'f' + k, i: P.f[k].length - 1 }; }
    return null;
}
function pileCards(pile) { if (pile === 'waste') return P.waste; if (pile[0] === 'f') return P.f[+pile[1]]; if (pile[0] === 't') return P.t[+pile.slice(1)]; return null; }
function movable(hit) {
    if (hit.pile[0] === 'c') return P.cells[+hit.pile[1]] ? [P.cells[+hit.pile[1]]] : null;
    const arr = pileCards(hit.pile);
    if (!arr || !arr.length || hit.i < 0) return null;
    if (hit.pile === 'waste' || hit.pile[0] === 'f') return [arr[arr.length - 1]];
    const seq = arr.slice(hit.i);
    if (!seq.length || !seq[0].up) return null;
    for (let k = 1; k < seq.length; k++) if (red(seq[k]) === red(seq[k - 1]) || seq[k].r !== seq[k - 1].r - 1) return null;
    return seq;
}
function dropTarget(x, y, from) {
    const piles = [...P.t.map((_, i) => 't' + i), 'f0', 'f1', 'f2', 'f3', ...(isFree() ? ['c0', 'c1', 'c2', 'c3'] : [])];
    let best = null, bd = Infinity;
    for (const p of piles) {
        if (p === from) continue;
        const arr = p[0] === 't' ? P.t[+p.slice(1)] : null;
        const [px, py] = cardPos(p, arr && arr.length ? arr.length - 1 : 0);
        const d = Math.hypot(px + CW / 2 - x, py + CH / 2 - y);
        if (d < bd && d < 110) { bd = d; best = p; }
    }
    return best;
}
function canDrop(cards, target, from) {
    const c0 = cards[0];
    if (target[0] === 'f') {
        if (cards.length !== 1) return false;
        const f = P.f[+target[1]];
        return f.length ? f[f.length - 1].s === c0.s && c0.r === f[f.length - 1].r + 1 : c0.r === 1 && +target[1] === c0.s;
    }
    if (target[0] === 'c') return cards.length === 1 && !P.cells[+target[1]];
    const col = P.t[+target.slice(1)];
    if (isFree()) {
        const freeCells = P.cells.filter(x => !x).length, emptyCols = P.t.filter((cl, i) => !cl.length && 't' + i !== target && 't' + i !== from).length;
        if (cards.length > (freeCells + 1) * 2 ** emptyCols) return false;
    }
    if (!col.length) return isFree() || c0.r === 13;
    const top = col[col.length - 1];
    return top.up && red(top) !== red(c0) && c0.r === top.r - 1;
}
function snapshot() { P.hist.push(JSON.stringify({ stock: P.stock, waste: P.waste, f: P.f, t: P.t, cells: P.cells, moves: P.moves })); if (P.hist.length > 300) P.hist.shift(); }
function undo() { const s = P.hist.pop(); if (!s) return; Object.assign(P, JSON.parse(s)); J.sfx.click(); }
function take(pile, n) {
    if (pile[0] === 'c') { const c = P.cells[+pile[1]]; P.cells[+pile[1]] = null; return [c]; }
    return pileCards(pile).splice(-n, n);
}
function put(pile, cards) { if (pile[0] === 'c') P.cells[+pile[1]] = cards[0]; else pileCards(pile).push(...cards); }
function move(from, n, to) {
    snapshot();
    put(to, take(from, n));
    if (from[0] === 't') { const col = P.t[+from.slice(1)]; if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true; }
    P.moves++;
    J.tone(to[0] === 'f' ? 660 : 420, .04, 'triangle', .035);
    afterMove();
}
function toFoundation(pile) {
    const cards = movable({ pile, i: pile[0] === 't' ? P.t[+pile.slice(1)].length - 1 : 0 });
    if (!cards || cards.length !== 1) return false;
    const k = cards[0].s;
    if (!canDrop(cards, 'f' + k, pile)) return false;
    move(pile, 1, 'f' + k);
    return true;
}
function drawStock() {
    snapshot();
    if (!P.stock.length) { if (!P.waste.length) { P.hist.pop(); return; } P.stock = P.waste.reverse().map(c => ({ ...c, up: false })); P.waste = []; }
    else for (let k = 0; k < P.draw && P.stock.length; k++) { const c = P.stock.pop(); c.up = true; P.waste.push(c); }
    P.moves++;
    J.tone(300, .03, 'square', .02);
}
function canAutoFinish() {
    if (J.over) return false;
    if (isFree()) return P.t.every(col => col.every((c, i) => !i || c.r <= col[i - 1].r));
    return !P.stock.length && !P.waste.length && P.t.every(col => col.every(c => c.up));
}
function autoStep() {
    const sources = [...P.t.map((_, i) => 't' + i), 'waste', 'c0', 'c1', 'c2', 'c3'];
    let best = null, br = 99;
    for (const s of sources) {
        let card = null;
        if (s[0] === 'c') card = isFree() ? P.cells[+s[1]] : null;
        else { const arr = pileCards(s); card = arr && arr.length ? arr[arr.length - 1] : null; }
        if (card && card.up !== false && canDrop([card], 'f' + card.s, s) && card.r < br) { br = card.r; best = s; }
    }
    if (!best) return false;
    toFoundation(best);
    return true;
}
function afterMove() {
    const done = P.f.reduce((a, f) => a + f.length, 0);
    J.prog(done + '/52');
    if (done === 52) J.end({ won: true, score: 52, text: `Terminé en ${fmtTime(J.time)} et ${P.moves} coups.` });
}
function card(ctx, cd, x, y, lifted) {
    if (lifted) { ctx.fillStyle = 'rgba(0,0,0,.3)'; J.rr(x + 4, y + 6, CW, CH, 8); ctx.fill(); }
    J.rr(x, y, CW, CH, 8);
    if (!cd.up) {
        ctx.fillStyle = '#2c3e66'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; J.rr(x + 6, y + 6, CW - 12, CH - 12, 5); ctx.stroke();
        return;
    }
    ctx.fillStyle = '#fbfaf6'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    const col = red(cd) ? '#c0392b' : '#1d1d22';
    ctx.fillStyle = col; ctx.textBaseline = 'middle';
    ctx.font = `700 17px ${J.c.font}`; ctx.textAlign = 'left'; ctx.fillText(RANKS[cd.r], x + 7, y + 14);
    ctx.font = `16px ${J.c.font}`; ctx.fillText(SUITS[cd.s], x + 7, y + 32);
    ctx.font = `${cd.r > 10 ? 34 : 40}px ${J.c.font}`; ctx.textAlign = 'center';
    ctx.fillText(cd.r > 10 ? RANKS[cd.r] + SUITS[cd.s] : SUITS[cd.s], x + CW / 2, y + CH / 2 + 10);
}
