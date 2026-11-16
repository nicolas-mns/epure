'use strict';
// ==================== Serpent : contre le bot et duel ====================
// Deux serpents sur le même terrain, trois fruits. Se cogner (mur, soi, l'autre) fait perdre.
// Tête contre tête : le plus long gagne. Au bout de 2 minutes, le plus long gagne.
// Duel : l'hôte calcule la partie, l'invité envoie seulement sa direction.

const GW = 26, GH = 18, CELL = 30, LIMIT = 120;
const SPEED_OPT = { id: 'speed', label: 'Vitesse', def: 8, choices: [[6, 'Lente'], [8, 'Normale'], [11, 'Rapide']] };
let S = null;

Jeu.create({
    id: 'serpent',
    root: '../../../',
    links: [['../', 'arrow-left', 'Modes solo']],
    modes: {
        bot: { bot: true, desc: 'Toi (en clair) contre un serpent bot (en rouge), sur le même terrain.', options: [BOT_LEVELS, SPEED_OPT],
            rules: [['apple', 'Trois fruits en jeu : chacun allonge de 1.'], ['skull', 'Mur, ta queue ou le corps de l\'autre : perdu.'], ['timer', 'Après 2 minutes, le plus long gagne.']] },
        duel: { duel: 'direct', desc: 'Deux serpents, un terrain. L\'hôte part de la gauche.', options: [SPEED_OPT] },
    },
    size: [GW * CELL, GH * CELL],
    controls: [['<kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> / <kbd>ZQSD</kbd>', 'Diriger']],
    touch: [['ArrowLeft', 'chevron-left'], ['ArrowUp', 'chevron-up'], ['ArrowDown', 'chevron-down'], ['ArrowRight', 'chevron-right']],
    sub() { return J.opts.speed; },
    start() {
        const mk = (x, dir) => ({ body: [[x, 9], [x - dir, 9], [x - 2 * dir, 9]], dir: [dir, 0], queue: [], grow: 0, dead: false });
        S = { a: mk(4, 1), b: mk(GW - 5, -1), fruits: [], acc: 0, net: 0 };
        for (let k = 0; k < 3; k++) addFruit();
    },
    keydown(code) {
        const d = { ArrowUp: [0, -1], KeyW: [0, -1], KeyZ: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyQ: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[code];
        if (!d) return;
        const mine = J.mode === 'duel' && !J.duel.host ? S.b : S.a;
        if (J.mode === 'duel' && !J.duel.host) J.duel.send('dir', d);
        queueDir(mine, d);
    },
    update(dt) {
        if (J.mode === 'duel' && !J.duel.host) return; // l'invité affiche seulement l'état reçu
        S.acc += dt;
        const step = 1 / J.opts.speed;
        while (S.acc >= step && !J.over) { S.acc -= step; tick(); }
        if (!J.over && J.time >= LIMIT) decide('Temps écoulé');
    },
    onDuel(e, p) {
        if (e === 'dir' && J.duel.host) queueDir(S.b, p);
        if (e === 'st' && !J.duel.host) { S.a.body = p.a; S.b.body = p.b; S.fruits = p.f; S.a.dir = p.da; S.b.dir = p.db; J.time = p.t; if (p.end) endFor(p.end.w, p.end.why); }
    },
    stats() {
        const mine = J.mode === 'duel' && !J.duel.host ? S.b : S.a, other = mine === S.a ? S.b : S.a;
        return [['Ta longueur', mine.body.length], [J.mode === 'bot' ? 'Bot' : 'Adversaire', other.body.length], ['Reste', fmtTime(Math.max(0, LIMIT - J.time))]];
    },
    draw(ctx) {
        const c = J.c, me = J.mode === 'duel' && !J.duel.host ? 'b' : 'a';
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, J.W, J.H);
        ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 1; x < GW; x++) { ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, J.H); }
        for (let y = 1; y < GH; y++) { ctx.moveTo(0, y * CELL + .5); ctx.lineTo(J.W, y * CELL + .5); }
        ctx.stroke();
        ctx.fillStyle = c.warn; for (const [x, y] of S.fruits) { ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL * .32, 0, 7); ctx.fill(); }
        for (const k of ['a', 'b']) {
            const sn = S[k], col = k === me ? c.accent : c.danger, n = sn.body.length;
            sn.body.forEach(([x, y], i) => { ctx.globalAlpha = sn.dead ? .35 : 1 - i / n * .45; ctx.fillStyle = i === 0 ? (k === me ? c.text : '#ff8a8a') : col; J.rr(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, CELL * .3); ctx.fill(); });
            ctx.globalAlpha = 1;
        }
    },
});

function queueDir(sn, d) {
    const last = sn.queue.length ? sn.queue[sn.queue.length - 1] : sn.dir;
    if ((d[0] === -last[0] && d[1] === -last[1]) || (d[0] === last[0] && d[1] === last[1])) return;
    if (sn.queue.length < 3) sn.queue.push(d);
}
const occupied = (x, y) => S.a.body.some(([a, b]) => a === x && b === y) || S.b.body.some(([a, b]) => a === x && b === y);
function addFruit() {
    for (let k = 0; k < 200; k++) {
        const x = J.int(0, GW - 1), y = J.int(0, GH - 1);
        if (!occupied(x, y) && !S.fruits.some(f => f[0] === x && f[1] === y)) { S.fruits.push([x, y]); return; }
    }
}
// Bot : va vers le fruit le plus proche par un chemin sûr (largeur d'abord), avec des erreurs selon le niveau
function botDir(sn, other) {
    const lvl = J.opts.level;
    const blocked = new Set([...sn.body.slice(0, -1), ...other.body].map(([x, y]) => y * GW + x));
    const [hx, hy] = sn.body[0];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => !(d[0] === -sn.dir[0] && d[1] === -sn.dir[1]));
    const safe = dirs.filter(([dx, dy]) => { const x = hx + dx, y = hy + dy; return x >= 0 && y >= 0 && x < GW && y < GH && !blocked.has(y * GW + x); });
    if (!safe.length) return sn.dir;
    if (Math.random() < [0, .25, .1, .03, 0][lvl]) return J.pick(safe);
    // Place libre accessible après un coup (évite les culs-de-sac aux niveaux élevés)
    const room = (sx, sy) => { const seen = new Set([sy * GW + sx]), q = [[sx, sy]]; while (q.length && seen.size < 120) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = ny * GW + nx; if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && !blocked.has(k) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } } } return seen.size; };
    let best = safe[0], bs = -Infinity;
    for (const [dx, dy] of safe) {
        const x = hx + dx, y = hy + dy;
        const fd = Math.min(...S.fruits.map(([fx, fy]) => Math.abs(fx - x) + Math.abs(fy - y)));
        let score = -fd;
        if (lvl >= 3) { const r = room(x, y); if (r < sn.body.length + 4) score -= 1000 - r; }
        if (lvl >= 4) { const [ox, oy] = other.body[0]; if (Math.abs(ox - x) + Math.abs(oy - y) === 1 && other.body.length >= sn.body.length) score -= 50; }
        if (score > bs) { bs = score; best = [dx, dy]; }
    }
    return best;
}
function tick() {
    if (J.mode === 'bot') { const d = botDir(S.b, S.a); queueDir(S.b, d); }
    for (const sn of [S.a, S.b]) if (sn.queue.length) sn.dir = sn.queue.shift();
    const next = sn => [sn.body[0][0] + sn.dir[0], sn.body[0][1] + sn.dir[1]];
    const na = next(S.a), nb = next(S.b);
    const eats = (n) => S.fruits.findIndex(f => f[0] === n[0] && f[1] === n[1]);
    const ea = eats(na), eb = eats(nb);
    const hits = (n, sn, other, eat) => {
        if (n[0] < 0 || n[1] < 0 || n[0] >= GW || n[1] >= GH) return true;
        const own = sn.body.slice(0, eat >= 0 || sn.grow ? undefined : -1);
        return own.some(([x, y]) => x === n[0] && y === n[1]) || other.body.some(([x, y]) => x === n[0] && y === n[1]);
    };
    let deadA = hits(na, S.a, S.b, ea), deadB = hits(nb, S.b, S.a, eb);
    if (na[0] === nb[0] && na[1] === nb[1]) { deadA = S.a.body.length <= S.b.body.length; deadB = S.b.body.length <= S.a.body.length; }
    if (deadA || deadB) {
        S.a.dead = deadA; S.b.dead = deadB; J.sfx.boom(); J.shake(10, .35);
        endFor(deadA && deadB ? 0 : deadA ? 2 : 1, 'Collision');
        return;
    }
    for (const [sn, n, e] of [[S.a, na, ea], [S.b, nb, eb]]) {
        sn.body.unshift(n);
        if (e >= 0) { J.burst(n[0] * CELL + CELL / 2, n[1] * CELL + CELL / 2, 10, J.c.warn, 120, .4, 3); S.fruits.splice(e, 1); sn.grow += 1; addFruit(); if (sn === S.a || J.mode === 'duel') J.tone(660, .05, 'square', .03, 220); }
        if (sn.grow > 0) sn.grow--; else sn.body.pop();
    }
    if (J.duel.on) J.duel.send('st', { a: S.a.body, b: S.b.body, f: S.fruits, da: S.a.dir, db: S.b.dir, t: J.time });
}
function decide(why) {
    const la = S.a.body.length, lb = S.b.body.length;
    endFor(la === lb ? 0 : la > lb ? 1 : 2, why);
}
function endFor(w, why) {
    if (J.over) return;
    if (J.duel.on && J.duel.host) J.duel.send('st', { a: S.a.body, b: S.b.body, f: S.fruits, da: S.a.dir, db: S.b.dir, t: J.time, end: { w, why } });
    const meNum = J.mode === 'duel' && !J.duel.host ? 2 : 1;
    if (w === 0) J.end({ draw: true, won: false, title: 'Égalité', text: `${why}. Même longueur.` });
    else J.end({ won: w === meNum, text: `${why}. Longueurs : ${S.a.body.length} contre ${S.b.body.length}.` });
}
