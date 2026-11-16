'use strict';
// ==================== Envahisseurs ====================
// Une formation qui avance de côté, descend à chaque bord et accélère quand elle s'amenuise.
// Quatre abris destructibles bloc par bloc. Duel : chaque vague nettoyée fait descendre celle de l'adversaire.

const W = 720, H = 600, COLS = 11, ROWS = 5;
let V = null;

Jeu.create({
    id: 'envahisseurs',
    modes: {
        classic: { desc: 'Repousse les vagues. 3 vies. La formation accélère quand elle perd des membres.',
            rules: [['move-horizontal', 'Gauche / droite pour bouger, Espace pour tirer.'], ['shield', 'Les abris se détruisent petit à petit, pour toi comme pour eux.'], ['star', 'Une soucoupe passe parfois : jusqu\'à 300 points.']] },
        duel: { duel: 'race', desc: 'Mêmes vagues pour les deux. Chaque vague que tu nettoies fait descendre la formation de ton adversaire. Le meilleur score gagne.' },
    },
    size: [W, H],
    controls: [['<kbd>←</kbd> <kbd>→</kbd>', 'Se déplacer'], ['<kbd>Espace</kbd>', 'Tirer']],
    touch: [['ArrowLeft', 'chevron-left'], ['Space', 'crosshair'], ['ArrowRight', 'chevron-right']],
    liveScore: () => V.score,
    start() {
        V = { x: W / 2, lives: 3, score: 0, wave: 0, shot: null, bombs: [], parts: [], ufo: null, ufoT: J.rand(15, 25), dead: 0, flash: 0 };
        V.shields = [];
        for (let s = 0; s < 4; s++) {
            const bx = 90 + s * 165, by = H - 150;
            for (let y = 0; y < 6; y++) for (let x = 0; x < 11; x++) if (!(y > 3 && x > 2 && x < 8) && !(y === 0 && (x === 0 || x === 10))) V.shields.push({ x: bx + x * 6, y: by + y * 6 });
        }
        newWave();
    },
    update(dt) {
        if (V.dead > 0) { V.dead -= dt; if (V.dead <= 0) V.x = W / 2; }
        else {
            if (J.keys.has('ArrowLeft') || J.keys.has('KeyA') || J.keys.has('KeyQ')) V.x -= 300 * dt;
            if (J.keys.has('ArrowRight') || J.keys.has('KeyD')) V.x += 300 * dt;
            V.x = J.clamp(V.x, 24, W - 24);
            if (J.keys.has('Space') && !V.shot) { V.shot = { x: V.x, y: H - 60 }; J.sfx.shot(); }
        }
        // Tir du joueur
        if (V.shot) {
            V.shot.y -= 640 * dt;
            if (V.shot.y < 30) V.shot = null;
            else if (hitShield(V.shot.x, V.shot.y)) V.shot = null;
            else {
                for (const a of V.aliens) if (a.alive && Math.abs(V.shot.x - ax(a)) < 15 && Math.abs(V.shot.y - ay(a)) < 11) {
                    a.alive = false; V.shot = null; V.score += [30, 20, 20, 10, 10][a.r] * (1 + Math.floor(V.wave / 4));
                    boom(ax(a), ay(a), J.c.text); J.burst(ax(a), ay(a), 10, J.c.n[a.r % 8] || J.c.text, 140, .45, 3); J.shake(2, .08); J.tone(200 + a.r * 40, .08, 'square', .035, -80); break;
                }
                if (V.shot && V.ufo && Math.abs(V.shot.x - V.ufo.x) < 22 && Math.abs(V.shot.y - 50) < 10) {
                    const pts = J.pick([50, 100, 150, 300]); V.score += pts; boom(V.ufo.x, 50, J.c.danger); V.ufo = null; V.shot = null; J.sfx.good();
                }
            }
        }
        // Formation
        const alive = V.aliens.filter(a => a.alive);
        if (!alive.length) { if (J.duel.on) J.duel.send('push', {}); newWave(); return; }
        V.step -= dt;
        if (V.step <= 0) {
            V.step = Math.max(.04, .7 * alive.length / (COLS * ROWS)) / (1 + V.wave * .08);
            V.frame ^= 1;
            const minX = Math.min(...alive.map(ax)), maxX = Math.max(...alive.map(ax));
            if ((V.dir > 0 && maxX > W - 30) || (V.dir < 0 && minX < 30)) { V.dir = -V.dir; V.oy += 18; }
            else V.ox += V.dir * 10;
            J.tone([110, 98, 87, 82][V.beat = (V.beat + 1) % 4], .07, 'square', .025);
            // Les envahisseurs détruisent les abris qu'ils touchent
            for (const a of alive) V.shields = V.shields.filter(b => Math.abs(b.x - ax(a)) > 16 || Math.abs(b.y - ay(a)) > 12);
            if (Math.max(...alive.map(ay)) > H - 80) { V.lives = 0; J.end({ score: V.score, text: `Ils ont atterri. ${V.score.toLocaleString('fr-FR')} points, vague ${V.wave}.` }); return; }
        }
        // Bombes
        V.bombT -= dt;
        if (V.bombT <= 0) {
            V.bombT = Math.max(.25, 1.1 - V.wave * .08) * J.rand(.6, 1.4);
            const cols = {}; for (const a of alive) if (!cols[a.c] || a.r > cols[a.c].r) cols[a.c] = a;
            const shooters = Object.values(cols);
            const near = shooters.filter(a => Math.abs(ax(a) - V.x) < 80);
            const a = near.length && J.rng() < .6 ? J.pick(near) : J.pick(shooters);
            V.bombs.push({ x: ax(a), y: ay(a) + 12 });
        }
        for (const b of V.bombs) b.y += (200 + V.wave * 12) * dt;
        V.bombs = V.bombs.filter(b => {
            if (b.y > H - 20) return false;
            if (hitShield(b.x, b.y)) return false;
            if (V.dead <= 0 && Math.abs(b.x - V.x) < 18 && Math.abs(b.y - (H - 46)) < 10) { hitPlayer(); return false; }
            return true;
        });
        // Soucoupe
        V.ufoT -= dt;
        if (V.ufoT <= 0 && !V.ufo) { V.ufo = { x: J.rng() < .5 ? -30 : W + 30 }; V.ufo.v = V.ufo.x < 0 ? 140 : -140; V.ufoT = J.rand(18, 30); }
        if (V.ufo) { V.ufo.x += V.ufo.v * dt; if (V.ufo.x < -40 || V.ufo.x > W + 40) V.ufo = null; }
        for (const p of V.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
        V.parts = V.parts.filter(p => p.t > 0);
        J.prog(V.score); J.checkLive();
    },
    onDuel(e) { if (e === 'push' && V) { V.oy += 36; toast('Ton adversaire a nettoyé une vague : la formation descend !', 'arrow-down', 1800); } },
    stats() { return [['Score', V.score.toLocaleString('fr-FR')], ['Vies', V.lives], ['Vague', V.wave]]; },
    draw(ctx) {
        const c = J.c;
        ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = c.border; ctx.fillRect(0, H - 24, W, 2);
        // Envahisseurs (trois formes en pixels, deux images d'animation)
        for (const a of V.aliens) if (a.alive) alien(ctx, ax(a), ay(a), a.r, V.frame);
        // Abris
        ctx.fillStyle = c.ok; for (const b of V.shields) ctx.fillRect(b.x, b.y, 6, 6);
        // Joueur
        if (V.dead <= 0 || Math.floor(V.dead * 10) % 2) {
            ctx.fillStyle = c.accent;
            ctx.fillRect(V.x - 18, H - 44, 36, 12); ctx.fillRect(V.x - 4, H - 54, 8, 10);
        }
        ctx.fillStyle = c.accent; if (V.shot) ctx.fillRect(V.shot.x - 1.5, V.shot.y - 8, 3, 12);
        ctx.fillStyle = c.danger; for (const b of V.bombs) { ctx.fillRect(b.x - 2, b.y - 6, 4, 4); ctx.fillRect(b.x, b.y - 2, 4, 4); ctx.fillRect(b.x - 2, b.y + 2, 4, 4); }
        if (V.ufo) { ctx.fillStyle = c.danger; J.rr(V.ufo.x - 22, 44, 44, 12, 6); ctx.fill(); J.rr(V.ufo.x - 10, 36, 20, 10, 5); ctx.fill(); }
        for (const p of V.parts) { ctx.fillStyle = J.alpha(p.col, Math.min(1, p.t * 2)); ctx.fillRect(p.x, p.y, 3, 3); }
        J.text(V.score.toLocaleString('fr-FR'), 16, 16, 18, c.text, 'left', 700, true);
        for (let i = 0; i < V.lives; i++) { ctx.fillStyle = c.muted; ctx.fillRect(W - 40 - i * 34, 12, 26, 8); ctx.fillRect(W - 30 - i * 34, 6, 6, 6); }
    },
});

const ALIENS = [
    ['00011000', '00111100', '01111110', '11011011', '11111111', '00100100', '01011010', '10100101'],
    ['00100100', '00011000', '00111100', '01011010', '11111111', '10111101', '10100101', '00011000'],
    ['00111100', '01111110', '11111111', '11011011', '11111111', '00100100', '01011010', '11000011'],
];
function alien(ctx, x, y, r, f) {
    const shape = ALIENS[r === 0 ? 0 : r < 3 ? 1 : 2], px = 3;
    ctx.fillStyle = r === 0 ? J.c.n[3] || J.c.text : r < 3 ? J.c.n[0] || J.c.text : J.c.n[1] || J.c.text;
    shape.forEach((row, yy) => [...row].forEach((b, xx) => {
        if (b !== '1') return;
        const sx = f && yy > 5 ? 7 - xx : xx;
        ctx.fillRect(x - 12 + sx * px, y - 12 + yy * px, px, px);
    }));
}
const ax = a => V.ox + a.c * 44;
const ay = a => V.oy + a.r * 38;
function newWave() {
    V.wave++;
    V.aliens = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) V.aliens.push({ r, c, alive: true });
    V.ox = 80; V.oy = 90 + Math.min(5, V.wave - 1) * 14; V.dir = 1; V.step = .5; V.frame = 0; V.beat = 0; V.bombT = 1.5; V.bombs = [];
}
function hitShield(x, y) {
    const i = V.shields.findIndex(b => x >= b.x - 2 && x <= b.x + 8 && y >= b.y - 4 && y <= b.y + 8);
    if (i < 0) return false;
    const b = V.shields[i];
    V.shields = V.shields.filter(o => Math.hypot(o.x - b.x, o.y - b.y) > 7 || Math.random() < .35);
    return true;
}
function boom(x, y, col) { for (let i = 0; i < 14; i++) V.parts.push({ x, y, vx: (Math.random() - .5) * 200, vy: (Math.random() - .5) * 200, t: .5, col }); }
function hitPlayer() {
    boom(V.x, H - 44, J.c.accent); J.sfx.boom(); J.shake(12, .4);
    V.lives--; V.dead = 1.4; V.bombs = [];
    if (V.lives <= 0) J.end({ score: V.score, text: `${V.score.toLocaleString('fr-FR')} points, vague ${V.wave}.` });
}
