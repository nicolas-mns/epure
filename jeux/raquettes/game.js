'use strict';
// ==================== Raquettes ====================
// La balle accélère à chaque renvoi ; l'angle dépend de l'endroit où elle touche la raquette.
// Duel : l'hôte calcule la partie et envoie l'état ; l'invité envoie seulement la position de sa raquette.

const W = 800, H = 500, PW = 12, PH = 86, BR = 8;
const POINTS = { id: 'to', label: 'Points pour gagner', def: 7, choices: [[5, '5'], [7, '7'], [11, '11']] };
let R = null;

Jeu.create({
    id: 'raquettes',
    modes: {
        bot: { bot: true, desc: 'Tu tiens la raquette de gauche.', options: [BOT_LEVELS, POINTS],
            rules: [['move-vertical', 'Souris, doigt ou flèches pour bouger la raquette.'], ['zap', 'La balle accélère à chaque renvoi.'], ['target', 'Touche-la avec le bord de la raquette pour un angle plus fort.']] },
        local: { desc: 'Gauche : Z / S (ou W / S). Droite : flèches haut / bas.', options: [POINTS] },
        duel: { duel: 'direct', desc: 'L\'hôte tient la raquette de gauche.', options: [POINTS] },
    },
    size: [W, H],
    controls: [['<kbd>↑</kbd> <kbd>↓</kbd> ou souris', 'Bouger la raquette'], ['<kbd>Z</kbd> <kbd>S</kbd>', 'Joueur de gauche (à deux)']],
    touch: [['ArrowUp', 'chevron-up'], ['ArrowDown', 'chevron-down']],
    sub() { return J.mode === 'bot' ? J.opts.level : null; },

    start() {
        R = { l: H / 2, r: H / 2, sl: 0, sr: 0, ball: null, serve: 1, wait: 1, ptr: null, bot: { target: H / 2, t: 0 }, net: 0, remote: null, trail: [] };
        newBall(1);
    },
    pointer(type, x, y) { if (type !== 'up') R.ptr = y; else R.ptr = null; },
    update(dt) {
        const guest = J.duel.on && !J.duel.host;
        // Raquette du joueur local
        const sp = 520 * dt;
        const mine = guest ? 'r' : 'l';
        if (J.mode === 'local') {
            if (J.keys.has('KeyW') || J.keys.has('KeyZ')) R.l -= sp;
            if (J.keys.has('KeyS')) R.l += sp;
            if (J.keys.has('ArrowUp')) R.r -= sp;
            if (J.keys.has('ArrowDown')) R.r += sp;
        } else {
            if (J.keys.has('ArrowUp') || J.keys.has('KeyW') || J.keys.has('KeyZ')) R[mine] -= sp;
            if (J.keys.has('ArrowDown') || J.keys.has('KeyS')) R[mine] += sp;
            if (R.ptr != null) R[mine] += J.clamp(R.ptr - R[mine], -sp * 1.6, sp * 1.6);
        }
        R.l = J.clamp(R.l, PH / 2, H - PH / 2); R.r = J.clamp(R.r, PH / 2, H - PH / 2);
        if (guest) {
            R.net -= dt; if (R.net <= 0) { R.net = .045; J.duel.send('pad', R.r); }
            if (R.remote) { // interpolation vers l'état reçu
                const s = R.remote;
                R.l += (s.l - R.l) * .5; R.ball = s.ball ? { x: s.ball[0], y: s.ball[1], vx: s.ball[2], vy: s.ball[3] } : null;
                R.sl = s.sl; R.sr = s.sr;
                if (R.ball) { R.ball.x += R.ball.vx * (performance.now() - s.at) / 1000; R.ball.y += R.ball.vy * (performance.now() - s.at) / 1000; }
            }
            return;
        }
        if (J.mode === 'bot') botPlay(dt);
        // Balle
        if (R.wait > 0) { R.wait -= dt; if (R.wait <= 0) launch(); }
        const b = R.ball;
        if (b && R.wait <= 0) {
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); J.tone(300, .03, 'square', .02); }
            if (b.y > H - BR) { b.y = H - BR; b.vy = -Math.abs(b.vy); J.tone(300, .03, 'square', .02); }
            const hitPad = (px, py, dir) => {
                if (Math.abs(b.x - px) < PW / 2 + BR && Math.abs(b.y - py) < PH / 2 + BR && Math.sign(b.vx) === -dir) {
                    const off = (b.y - py) / (PH / 2);
                    const speed = Math.min(1100, Math.hypot(b.vx, b.vy) * 1.06);
                    const ang = off * 1.0;
                    b.vx = Math.cos(ang) * speed * dir; b.vy = Math.sin(ang) * speed;
                    b.x = px + dir * (PW / 2 + BR);
                    J.tone(dir > 0 ? 520 : 620, .05, 'square', .035);
                    J.burst(b.x, b.y, 8, J.c.accent, 60 + speed * .25, .35, 3); if (speed > 700) J.shake(3, .08);
                }
            };
            hitPad(30, R.l, 1); hitPad(W - 30, R.r, -1);
            if (b.x < -20) point('r'); else if (b.x > W + 20) point('l');
            R.trail.push([b.x, b.y]); if (R.trail.length > 10) R.trail.shift();
        }
        if (J.duel.on) { R.net -= dt; if (R.net <= 0) { R.net = .05; J.duel.send('st', { l: R.l, sl: R.sl, sr: R.sr, ball: R.ball && R.wait <= 0 ? [R.ball.x, R.ball.y, R.ball.vx, R.ball.vy] : null }); } }
    },
    onDuel(e, p) {
        if (e === 'pad' && J.duel.host) R.r = p;
        if (e === 'st' && !J.duel.host) R.remote = Object.assign(p, { at: performance.now() });
        if (e === 'over' && !J.duel.host && !J.over) J.end({ won: p.winner === 'r', text: `${p.sl} – ${p.sr}` });
    },
    stats() {
        const names = J.mode === 'bot' ? ['Toi', 'Bot'] : J.mode === 'local' ? ['Gauche', 'Droite'] : J.duel.host ? ['Toi', J.duel.opp] : [J.duel.opp, 'Toi'];
        return [[names[0], R.sl], [names[1], R.sr], ['Objectif', J.opts.to]];
    },
    draw(ctx) {
        const c = J.c;
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = c.border; ctx.setLineDash([10, 14]); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
        J.text(R.sl, W / 2 - 70, 60, 54, c.surface3, 'center', 700, true);
        J.text(R.sr, W / 2 + 70, 60, 54, c.surface3, 'center', 700, true);
        ctx.fillStyle = c.text;
        J.rr(30 - PW / 2, R.l - PH / 2, PW, PH, 5); ctx.fill();
        ctx.fillStyle = J.mode === 'local' ? c.text : c.danger;
        J.rr(W - 30 - PW / 2, R.r - PH / 2, PW, PH, 5); ctx.fill();
        const b = R.ball;
        if (b) {
            R.trail.forEach(([x, y], i) => { ctx.fillStyle = J.alpha(c.accent, i / 30); ctx.beginPath(); ctx.arc(x, y, BR * i / 10, 0, 7); ctx.fill(); });
            ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, 7); ctx.fill();
        }
    },
});

function newBall(dir) { R.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 }; R.serve = dir; R.wait = .9; R.trail = []; }
function launch() { const a = (J.rng() - .5) * .8; R.ball.vx = Math.cos(a) * 380 * R.serve; R.ball.vy = Math.sin(a) * 380; }
function point(who) {
    R[who === 'l' ? 'sl' : 'sr']++;
    J.shake(8, .25); if (R.ball) J.burst(J.clamp(R.ball.x, 0, W), R.ball.y, 30, who === 'l' ? J.c.accent : J.c.danger, 260, .7, 4);
    J.tone(who === 'l' ? 780 : 200, .15, 'triangle', .05);
    const to = J.opts.to;
    if (R.sl >= to || R.sr >= to) {
        const winner = R.sl >= to ? 'l' : 'r';
        R.ball = null;
        if (J.duel.on) J.duel.send('over', { winner, sl: R.sl, sr: R.sr });
        if (J.mode === 'local') J.end({ won: true, title: winner === 'l' ? 'La gauche gagne' : 'La droite gagne', text: `${R.sl} – ${R.sr}` });
        else J.end({ won: winner === 'l', text: `${R.sl} – ${R.sr}` });
        return;
    }
    newBall(who === 'l' ? -1 : 1);
}
// Bot : vise l'endroit où la balle arrivera, avec un temps de réaction et une erreur selon le niveau
function botPlay(dt) {
    const lvl = J.opts.level, b = R.ball, bot = R.bot;
    const react = [0, .35, .2, .1, .04][lvl], err = [0, 70, 38, 18, 6][lvl], speed = [0, 230, 330, 430, 560][lvl];
    bot.t -= dt;
    if (bot.t <= 0 && b) {
        bot.t = react;
        if (b.vx > 0) {
            let x = b.x, y = b.y, vx = b.vx, vy = b.vy, guard = 0;
            while (x < W - 30 && guard++ < 400) { const step = Math.min(1 / 60, (W - 30 - x) / vx); x += vx * step; y += vy * step; if (y < BR || y > H - BR) vy = -vy; }
            bot.target = y + (Math.random() - .5) * err * 2;
        } else bot.target = H / 2 + (b.y - H / 2) * .3;
    }
    R.r += J.clamp(bot.target - R.r, -speed * dt, speed * dt);
}
