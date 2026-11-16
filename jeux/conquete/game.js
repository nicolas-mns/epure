'use strict';
// ==================== Conquête ====================
// Stratégie en temps réel légère. Chaque planète possédée produit des vaisseaux selon sa taille.
// Glisser d'une de tes planètes vers une autre y envoie la moitié de ses vaisseaux.
// Carte symétrique (équitable). Victoire : plus aucune planète ni flotte adverse, ou le plus de
// vaisseaux au bout de 3 minutes. En duel, l'hôte calcule la partie et envoie l'état.

const W = 900, H = 560, SPEED = 90, LIMIT = 180;
let Q = null, botT = 0;

function genMap() {
    const pl = [];
    const add = (x, y, r, owner, ships) => pl.push({ id: pl.length, x, y, r, owner, ships, prod: r / 14 });
    add(90, H / 2, 26, 1, 40); add(W - 90, H / 2, 26, 2, 40);
    let tries = 0;
    while (pl.length < 16 && tries++ < 500) {
        const r = J.int(12, 24), x = J.rand(60, W / 2 - 20), y = J.rand(50, H - 50);
        const mx = W - x, my = H - y;
        const ok = [...pl, { x: mx, y: my, r }].every(p => Math.hypot(p.x - x, p.y - y) > p.r + r + 34) && Math.hypot(mx - x, my - y) > r * 2 + 34;
        if (!ok) continue;
        const ships = J.int(4, 10 + r);
        add(x, y, r, 0, ships); add(mx, my, r, 0, ships);
    }
    if (J.mode === 'duel') { /* identique des deux côtés grâce à la graine */ }
    return pl;
}

const me = () => J.mode === 'duel' && !J.duel.host ? 2 : 1;
const host = () => J.mode !== 'duel' || J.duel.host;

Jeu.create({
    id: 'conquete',
    modes: {
        bot: { bot: true, desc: 'Toi à gauche, le bot à droite. Prends les planètes neutres, puis les siennes.', options: [BOT_LEVELS],
            rules: [['mouse-pointer-2', 'Glisse d\'une de tes planètes vers une cible : la moitié de ses vaisseaux part.'], ['circle-plus', 'Une grande planète produit plus vite.'], ['timer', 'Au bout de 3 minutes, celui qui a le plus de vaisseaux gagne.'], ['keyboard', 'Touche A : sélectionner toutes tes planètes.']] },
        duel: { duel: 'direct', desc: 'L\'hôte joue à gauche. Même carte symétrique pour les deux.' },
    },
    size: [W, H],
    countdown: true,
    controls: [['Glisser', 'Envoyer la moitié des vaisseaux'], ['Clic, puis clic', 'Pareil, en deux temps'], ['<kbd>A</kbd>', 'Sélectionner toutes tes planètes']],
    start() {
        Q = { pl: genMap(), fleets: [], sel: [], drag: null, net: 0, over: false };
        botT = 2;
    },
    keydown(code) { if (code === 'KeyA') Q.sel = Q.pl.filter(p => p.owner === me()).map(p => p.id); },
    pointer(type, x, y) {
        const p = planetAt(x, y);
        if (type === 'down') {
            if (p && p.owner === me() && !Q.sel.includes(p.id)) { Q.sel = [p.id]; Q.drag = { x, y }; return; }
            if (p && p.owner === me()) { Q.drag = { x, y }; return; }
            if (p && Q.sel.length) { order(Q.sel, p.id); Q.sel = []; return; }
            Q.sel = [];
        }
        if (type === 'move' && Q.drag) { Q.drag.x = x; Q.drag.y = y; if (p && p.owner === me() && !Q.sel.includes(p.id)) Q.sel.push(p.id); }
        if (type === 'up' && Q.drag) {
            Q.drag = null;
            if (p && !(Q.sel.length === 1 && Q.sel[0] === p.id)) { order(Q.sel.filter(id => id !== p.id), p.id); Q.sel = []; }
        }
    },
    update(dt) {
        if (!host()) { Q.left = LIMIT - J.time; return; }
        for (const p of Q.pl) if (p.owner) p.ships = Math.min(300, p.ships + p.prod * dt);
        for (const f of Q.fleets) {
            const t = Q.pl[f.to], dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy);
            if (d < t.r) { arrive(f, t); f.done = true; continue; }
            f.x += dx / d * SPEED * dt; f.y += dy / d * SPEED * dt;
        }
        Q.fleets = Q.fleets.filter(f => !f.done);
        if (J.mode === 'bot') { botT -= dt; if (botT <= 0) { botT = [0, 3.5, 2, 1.2, .7][J.opts.level] * J.rand(.7, 1.3); botPlay(); } }
        // Fin de partie
        const alive = o => Q.pl.some(p => p.owner === o) || Q.fleets.some(f => f.owner === o);
        const total = o => Q.pl.filter(p => p.owner === o).reduce((a, p) => a + p.ships, 0) + Q.fleets.filter(f => f.owner === o).reduce((a, f) => a + f.ships, 0);
        let winner = 0;
        if (!alive(2)) winner = 1; else if (!alive(1)) winner = 2;
        else if (J.time >= LIMIT) winner = total(1) >= total(2) ? 1 : 2;
        if (J.duel.on) { Q.net -= dt; if (Q.net <= 0 || winner) { Q.net = .1; J.duel.send('st', { pl: Q.pl.map(p => [p.owner, Math.floor(p.ships)]), fl: Q.fleets.map(f => [f.owner, Math.round(f.ships), Math.round(f.x), Math.round(f.y), f.to]), t: J.time, w: winner }); } }
        if (winner) finish(winner, total(1), total(2));
    },
    onDuel(e, p) {
        if (e === 'order' && J.duel.host) send(2, p.from, p.to);
        if (e === 'st' && !J.duel.host) {
            p.pl.forEach(([o, s], i) => { Q.pl[i].owner = o; Q.pl[i].ships = s; });
            Q.fleets = p.fl.map(([owner, ships, x, y, to]) => ({ owner, ships, x, y, to }));
            J.time = p.t;
            if (p.w) { const t = o => Q.pl.filter(x => x.owner === o).reduce((a, x) => a + x.ships, 0); finish(p.w, t(1), t(2)); }
        }
    },
    stats() {
        const count = o => Q.pl.filter(p => p.owner === o).length;
        const ships = o => Math.floor(Q.pl.filter(p => p.owner === o).reduce((a, p) => a + p.ships, 0) + Q.fleets.filter(f => f.owner === o).reduce((a, f) => a + f.ships, 0));
        const m = me(), o = 3 - m;
        return [['Tes planètes', count(m)], ['Tes vaisseaux', ships(m)], [J.mode === 'bot' ? 'Bot' : 'Adversaire', `${count(o)} / ${ships(o)}`], ['Reste', fmtTime(Math.max(0, LIMIT - J.time))]];
    },
    draw(ctx) {
        const c = J.c, col = o => o === 0 ? c.muted : o === me() ? c.accent : c.danger;
        ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 70; i++) { ctx.fillStyle = J.alpha(c.muted, .25); ctx.fillRect((i * 137) % W, (i * 271) % H, 1.5, 1.5); }
        // Flèche de sélection
        if (Q.drag && Q.sel.length) {
            ctx.strokeStyle = J.alpha(c.accent, .6); ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
            for (const id of Q.sel) { const p = Q.pl[id]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(Q.drag.x, Q.drag.y); ctx.stroke(); }
            ctx.setLineDash([]);
        }
        for (const f of Q.fleets) {
            const t = Q.pl[f.to], a = Math.atan2(t.y - f.y, t.x - f.x);
            ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a);
            ctx.fillStyle = col(f.owner); ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 5); ctx.fill();
            ctx.restore();
            J.text(Math.round(f.ships), f.x, f.y - 12, 11, col(f.owner), 'center', 700, true);
        }
        for (const p of Q.pl) {
            const sel = Q.sel.includes(p.id);
            ctx.fillStyle = J.alpha(col(p.owner), p.owner ? .22 : .12); ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, 7); ctx.fill();
            ctx.fillStyle = J.alpha(col(p.owner), p.owner ? .85 : .45); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
            if (sel) { ctx.strokeStyle = c.text; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9, 0, 7); ctx.stroke(); }
            J.text(Math.floor(p.ships), p.x, p.y + 1, Math.max(12, p.r * .7), p.owner === me() ? c.accentInk : '#ffffff', 'center', 700, true);
        }
        J.text(fmtTime(Math.max(0, LIMIT - J.time)), W / 2, 18, 14, c.muted, 'center', 600, true);
    },
});

function planetAt(x, y) { return Q.pl.find(p => Math.hypot(p.x - x, p.y - y) < p.r + 10); }
function order(from, to) {
    from = from.filter(id => Q.pl[id].owner === me() && id !== to);
    if (!from.length) return;
    J.tone(520, .05, 'triangle', .035);
    if (host()) send(me(), from, to); else J.duel.send('order', { from, to });
}
function send(owner, from, to) {
    for (const id of from) {
        const p = Q.pl[id];
        if (p.owner !== owner || p.ships < 2 || id === to) continue;
        const n = Math.floor(p.ships / 2);
        p.ships -= n;
        const t = Q.pl[to], a = Math.atan2(t.y - p.y, t.x - p.x);
        Q.fleets.push({ owner, ships: n, x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, to });
    }
}
function arrive(f, t) {
    if (t.owner === f.owner) { t.ships += f.ships; return; }
    t.ships -= f.ships;
    if (t.ships < 0) { t.ships = -t.ships; t.owner = f.owner; J.burst(t.x, t.y, 24, f.owner === me() ? J.c.accent : J.c.danger, 160, .6, 3); J.shake(3, .12); if (f.owner === me()) J.sfx.good(); else J.tone(200, .15, 'triangle', .04); }
}
// Bot : envoie depuis ses planètes bien garnies vers la cible la plus rentable
function botPlay() {
    const lvl = J.opts.level, mine = Q.pl.filter(p => p.owner === 2);
    if (!mine.length) return;
    const incoming = id => Q.fleets.filter(f => f.to === id).reduce((a, f) => a + (f.owner === 2 ? -f.ships : f.ships), 0);
    // Défense (niveaux 3 et 4) : renforcer une planète menacée
    if (lvl >= 3) for (const p of mine) {
        const threat = incoming(p.id);
        if (threat > p.ships) { const helper = mine.filter(q => q !== p && q.ships > 20).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; if (helper) { send(2, [helper.id], p.id); return; } }
    }
    const sources = mine.filter(p => p.ships > [0, 25, 18, 14, 10][lvl]);
    if (!sources.length) return;
    let best = null, bs = -Infinity;
    for (const t of Q.pl) {
        if (t.owner === 2) continue;
        const src = sources.reduce((a, s) => Math.hypot(s.x - t.x, s.y - t.y) < Math.hypot(a.x - t.x, a.y - t.y) ? s : a);
        const d = Math.hypot(src.x - t.x, src.y - t.y);
        const need = t.ships + incoming(t.id) + (t.owner ? t.prod * d / SPEED : 0) + 2;
        const power = sources.reduce((a, s) => a + Math.floor(s.ships / 2), 0);
        if (lvl >= 2 && power < need) continue;
        const score = lvl === 1 ? Math.random() : t.prod * 30 / (need + d / 8) + (t.owner === 1 ? (lvl >= 3 ? 1.5 : .5) : 0);
        if (score > bs) { bs = score; best = { t, need }; }
    }
    if (!best) return;
    // Envoie depuis les planètes les plus proches jusqu'à avoir assez
    let sent = 0;
    for (const s of sources.sort((a, b) => Math.hypot(a.x - best.t.x, a.y - best.t.y) - Math.hypot(b.x - best.t.x, b.y - best.t.y))) {
        if (lvl >= 2 && sent >= best.need) break;
        sent += Math.floor(s.ships / 2); send(2, [s.id], best.t.id);
        if (lvl === 1) break;
    }
}
function finish(winner, t1, t2) {
    if (J.over) return;
    const won = winner === me(), mine = Math.floor(me() === 1 ? t1 : t2), theirs = Math.floor(me() === 1 ? t2 : t1);
    J.end({ won, text: J.time >= LIMIT ? `Temps écoulé : ${mine} vaisseaux contre ${theirs}.` : won ? 'Toutes les planètes adverses sont tombées.' : 'Tu as perdu ta dernière planète.' });
}
