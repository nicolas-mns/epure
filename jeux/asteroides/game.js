'use strict';
// ==================== Astéroïdes ====================
// Vaisseau avec inertie, bords qui se rejoignent, rochers qui se brisent en deux.
// Duel : même graine pour les deux ; chaque gros rocher détruit en envoie un chez l'adversaire.

const W = 800, H = 560;
let A = null;

Jeu.create({
    id: 'asteroides',
    modes: {
        classic: { desc: 'Détruis les rochers, survis aux vagues. 3 vies, une vie bonus tous les 10 000 points.',
            rules: [['rotate-cw', 'Gauche / droite pour tourner, haut pour accélérer.'], ['crosshair', 'Espace pour tirer.'], ['orbit', 'Gros rocher : 20 pts, moyen : 50, petit : 100.']] },
        duel: { duel: 'race', desc: 'Mêmes vagues pour les deux. Chaque gros rocher que tu détruis apparaît chez ton adversaire. Le meilleur score gagne.' },
    },
    size: [W, H],
    controls: [['<kbd>←</kbd> <kbd>→</kbd>', 'Tourner'], ['<kbd>↑</kbd>', 'Accélérer'], ['<kbd>Espace</kbd>', 'Tirer'], ['<kbd>↓</kbd>', 'Hyperespace']],
    touch: [['ArrowLeft', 'rotate-ccw'], ['ArrowUp', 'chevrons-up'], ['Space', 'crosshair'], ['ArrowRight', 'rotate-cw']],
    liveScore: () => A.score,
    progLabel: 'Son score',

    start() {
        A = { ship: ship(), rocks: [], shots: [], parts: [], score: 0, lives: 3, wave: 0, cool: 0, inv: 2, bonus: 10000, respawn: 0, stars: Array.from({ length: 60 }, () => [Math.random() * W, Math.random() * H, Math.random()]) };
        nextWave();
    },
    keydown(code) { if (code === 'ArrowDown' && A.ship && !A.respawn) { A.ship.x = Math.random() * W; A.ship.y = Math.random() * H; A.ship.vx = A.ship.vy = 0; A.inv = .6; J.tone(1200, .15, 'sine', .03, -900); } },
    update(dt) {
        const s = A.ship;
        if (A.respawn > 0) { A.respawn -= dt; if (A.respawn <= 0) { A.ship = ship(); A.inv = 2.5; } }
        if (s && !A.respawn) {
            if (J.keys.has('ArrowLeft') || J.keys.has('KeyA') || J.keys.has('KeyQ')) s.a -= 4.6 * dt;
            if (J.keys.has('ArrowRight') || J.keys.has('KeyD')) s.a += 4.6 * dt;
            s.thrust = J.keys.has('ArrowUp') || J.keys.has('KeyW') || J.keys.has('KeyZ');
            if (s.thrust) { s.vx += Math.cos(s.a) * 340 * dt; s.vy += Math.sin(s.a) * 340 * dt; if (Math.random() < .5) A.parts.push(part(s.x - Math.cos(s.a) * 12, s.y - Math.sin(s.a) * 12, .3, J.c.warn)); }
            s.vx *= Math.pow(.55, dt); s.vy *= Math.pow(.55, dt);
            s.x = wrap(s.x + s.vx * dt, W); s.y = wrap(s.y + s.vy * dt, H);
            A.cool -= dt;
            if (J.keys.has('Space') && A.cool <= 0 && A.shots.length < 6) {
                A.cool = .17; J.sfx.shot();
                A.shots.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: Math.cos(s.a) * 620 + s.vx, vy: Math.sin(s.a) * 620 + s.vy, t: .9 });
            }
        }
        if (A.inv > 0) A.inv -= dt;
        for (const sh of A.shots) { sh.x = wrap(sh.x + sh.vx * dt, W); sh.y = wrap(sh.y + sh.vy * dt, H); sh.t -= dt; }
        A.shots = A.shots.filter(sh => sh.t > 0);
        for (const r of A.rocks) { r.x = wrap(r.x + r.vx * dt, W); r.y = wrap(r.y + r.vy * dt, H); r.rot += r.spin * dt; }
        for (const p of A.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
        A.parts = A.parts.filter(p => p.t > 0);
        // Collisions tirs / rochers
        for (const sh of A.shots) for (const r of A.rocks) {
            if (r.dead || sh.t <= 0) continue;
            if (dist(sh, r) < r.r) { sh.t = 0; breakRock(r); }
        }
        A.rocks = A.rocks.filter(r => !r.dead);
        // Collision vaisseau
        if (A.ship && !A.respawn && A.inv <= 0) for (const r of A.rocks) if (dist(A.ship, r) < r.r + 9) { crash(); break; }
        if (!A.rocks.length) nextWave();
        if (A.score >= A.bonus) { A.lives++; A.bonus += 10000; J.sfx.good(); }
        J.prog(A.score); J.checkLive();
    },
    onDuel(e) { if (e === 'rock') { const side = J.rng() < .5; A.rocks.push(rock(side ? 0 : J.rand(0, W), side ? J.rand(0, H) : 0, 3)); J.tone(180, .2, 'sawtooth', .03); } },
    stats() { return [['Score', A.score.toLocaleString('fr-FR')], ['Vies', A.lives], ['Vague', A.wave]]; },
    draw(ctx) {
        const c = J.c;
        ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
        for (const [x, y, b] of A.stars) { ctx.fillStyle = J.alpha(c.muted, .2 + b * .4); ctx.fillRect(x, y, 1.5, 1.5); }
        ctx.lineWidth = 2; ctx.lineJoin = 'round';
        for (const r of A.rocks) {
            ctx.strokeStyle = c.text; ctx.beginPath();
            r.shape.forEach((k, i) => { const a = r.rot + i / r.shape.length * Math.PI * 2, x = r.x + Math.cos(a) * r.r * k, y = r.y + Math.sin(a) * r.r * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
            ctx.closePath(); ctx.stroke();
        }
        ctx.fillStyle = c.accent; for (const sh of A.shots) { ctx.beginPath(); ctx.arc(sh.x, sh.y, 2.2, 0, 7); ctx.fill(); }
        for (const p of A.parts) { ctx.fillStyle = J.alpha(p.col, Math.min(1, p.t * 2)); ctx.fillRect(p.x, p.y, 2, 2); }
        const s = A.ship;
        if (s && !A.respawn && !(A.inv > 0 && Math.floor(A.inv * 10) % 2)) {
            ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
            ctx.strokeStyle = c.accent; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -9); ctx.lineTo(-6, 0); ctx.lineTo(-10, 9); ctx.closePath(); ctx.stroke();
            ctx.restore();
        }
        for (let i = 0; i < A.lives; i++) { ctx.save(); ctx.translate(24 + i * 22, 24); ctx.rotate(-Math.PI / 2); ctx.strokeStyle = c.muted; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.stroke(); ctx.restore(); }
        J.text(A.score.toLocaleString('fr-FR'), W - 20, 24, 20, c.text, 'right', 700, true);
    },
});

const wrap = (v, m) => (v + m) % m;
const dist = (a, b) => { let dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y); dx = Math.min(dx, W - dx); dy = Math.min(dy, H - dy); return Math.hypot(dx, dy); };
const ship = () => ({ x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, thrust: false });
const part = (x, y, t, col) => ({ x, y, vx: (Math.random() - .5) * 120, vy: (Math.random() - .5) * 120, t, col });
function rock(x, y, size) {
    const sp = [0, 120, 80, 50][size] * J.rand(.7, 1.3), a = J.rand(0, Math.PI * 2);
    return { x, y, size, r: [0, 14, 28, 46][size], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, spin: J.rand(-1, 1), shape: Array.from({ length: 11 }, () => J.rand(.72, 1.08)) };
}
function nextWave() {
    A.wave++;
    const n = Math.min(11, 3 + A.wave);
    for (let i = 0; i < n; i++) {
        let x, y; do { x = J.rand(0, W); y = J.rand(0, H); } while (Math.hypot(x - W / 2, y - H / 2) < 180);
        A.rocks.push(rock(x, y, 3));
    }
}
function breakRock(r) {
    r.dead = true;
    A.score += [0, 100, 50, 20][r.size];
    for (let i = 0; i < 10; i++) A.parts.push(part(r.x, r.y, .6, J.c.text));
    J.burst(r.x, r.y, 6 + r.size * 5, J.c.warn, 120 + r.size * 40, .5, 3); J.shake(r.size * 2, .12);
    J.tone([0, 520, 300, 160][r.size], .12, 'sawtooth', .04, -100);
    if (r.size > 1) for (let k = 0; k < 2; k++) A.rocks.push(rock(r.x, r.y, r.size - 1));
    if (r.size === 3 && J.duel.on) J.duel.send('rock', {});
}
function crash() {
    for (let i = 0; i < 30; i++) A.parts.push(part(A.ship.x, A.ship.y, 1, J.c.accent));
    J.sfx.boom(); J.shake(12, .4);
    A.lives--;
    A.ship = null;
    if (A.lives <= 0) { J.end({ score: A.score, text: `${A.score.toLocaleString('fr-FR')} points, vague ${A.wave}.` }); return; }
    A.respawn = 1.5;
}
