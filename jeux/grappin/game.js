'use strict';
// ==================== Grappin ====================
// Maintenir pour lancer le grappin sur le point d'accroche le plus proche devant soi,
// relâcher pour s'envoler. Physique de pendule : la corde garde sa longueur, la vitesse se conserve.

const W = 900, H = 520, FLOOR = 500, RANGE = 400, GRAV = 1500;
let P = null;

Jeu.create({
    id: 'grappin',
    modes: {
        classic: { desc: 'Balance-toi d\'accroche en accroche. Toucher le sol, c\'est perdu.',
            rules: [['mouse-pointer-click', 'Maintiens (clic, Espace ou doigt) pour t\'accrocher, relâche pour lâcher.'], ['rotate-cw', 'La corde se rembobine toute seule : tu remontes même lentement. Lâche en montant pour décoller.'], ['triangle-alert', 'Le sol est mortel.']] },
        chrono: { desc: 'Le plus loin possible en 60 secondes. Une chute te ramène en arrière.', rules: [['timer', '60 secondes.'], ['undo-2', 'Chute : retour à la dernière accroche, sans perdre la distance.']] },
        duel: { duel: 'race', desc: 'Mêmes accroches pour les deux. Le plus loin gagne.' },
    },
    size: [W, H],
    controls: [['<kbd>Espace</kbd> / clic (maintenir)', 'S\'accrocher'], ['Relâcher', 'Lâcher la corde'], ['<kbd>↓</kbd> (accroché)', 'Rallonger la corde']],
    touch: [['Space', 'anchor', 'Grappin']],
    liveScore: () => Math.floor(P.best),
    duelFormat: r => `${r.score} m`,
    progLabel: 'Sa distance',
    start() {
        P = { x: 120, y: 260, vx: 260, vy: 0, rope: null, anchors: [], nextX: 260, cam: 0, best: 0, trail: [], dead: false, lastAnchor: null, left: 60 };
        while (P.nextX < W * 3) addAnchor();
        attach(P.anchors[0]);
    },
    keydown(code) { if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ') grab(); },
    keyup(code) { if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ') P.rope = null; },
    pointer(type) { if (type === 'down') grab(); if (type === 'up') P.rope = null; },
    update(dt) {
        if (P.dead) return;
        const steps = 4, h = dt / steps;
        for (let k = 0; k < steps; k++) {
            P.vy += GRAV * h;
            P.vx *= 1 - .02 * h; // très léger frottement de l'air
            P.x += P.vx * h; P.y += P.vy * h;
            if (P.rope) {
                const a = P.rope.a, dx = P.x - a.x, dy = P.y - a.y, d = Math.hypot(dx, dy);
                if (d > P.rope.len) {
                    const nx = dx / d, ny = dy / d;
                    P.x = a.x + nx * P.rope.len; P.y = a.y + ny * P.rope.len;
                    const vr = P.vx * nx + P.vy * ny;
                    if (vr > 0) { P.vx -= vr * nx; P.vy -= vr * ny; }
                }
                // Rembobinage automatique : la corde raccourcit, et comme un vrai pendule la vitesse
                // tangentielle augmente (conservation du moment cinétique). On peut donc toujours remonter.
                const lengthen = J.keys.has('ArrowDown') || J.keys.has('KeyS');
                const old = P.rope.len;
                P.rope.len = lengthen ? Math.min(RANGE, old + 160 * h) : Math.max(70, old - 170 * h);
                if (!lengthen && P.rope.len < old) {
                    const ddx = P.x - a.x, ddy = P.y - a.y, dd = Math.hypot(ddx, ddy) || 1, tx = -ddy / dd, ty = ddx / dd;
                    const vt = P.vx * tx + P.vy * ty, k = Math.min(1.04, old / P.rope.len);
                    P.vx += tx * vt * (k - 1); P.vy += ty * vt * (k - 1);
                }
                // Petit coup de pouce vers l'avant en bas du balancement
                if (P.y > a.y && Math.abs(P.x - a.x) < 50) P.vx += 220 * h;
            }
        }
        // Vitesse plafonnée (le rembobinage et le coup de pouce ne doivent pas s'emballer)
        const sp = Math.hypot(P.vx, P.vy); if (sp > 950) { P.vx *= 950 / sp; P.vy *= 950 / sp; }
        if (P.y < 20) { P.y = 20; P.vy = Math.max(0, P.vy); }
        P.cam += (P.x - 280 - P.cam) * Math.min(1, dt * 4);
        J.camX = P.cam;
        P.best = Math.max(P.best, (P.x - 120) / 40);
        while (P.nextX < P.cam + W * 3) addAnchor();
        P.anchors = P.anchors.filter(a => a.x > P.cam - 400);
        P.trail.push([P.x, P.y]); if (P.trail.length > 24) P.trail.shift();
        if (J.mode === 'chrono') {
            P.left -= dt;
            if (P.left <= 0) { finish('Temps écoulé'); return; }
        }
        if (P.y > FLOOR - 8) {
            if (J.mode === 'chrono') { // retour à la dernière accroche
                const a = P.lastAnchor || P.anchors[0];
                P.x = a.x - 60; P.y = a.y + 120; P.vx = 200; P.vy = 0; attach(a); J.sfx.bad(); P.left -= 3;
            } else { P.dead = true; J.sfx.boom(); J.shake(10, .35); J.burst(P.x, FLOOR - 8, 30, J.c.danger, 240, .8, 4, 500); finish('Chute !'); return; }
        }
        J.prog(Math.floor(P.best) + ' m'); J.checkLive();
    },
    stats() {
        const rows = [['Distance', Math.floor(P.best) + ' m'], ['Vitesse', Math.round(Math.hypot(P.vx, P.vy) / 10)]];
        if (J.mode === 'chrono') rows.push(['Reste', Math.ceil(Math.max(0, P.left)) + ' s']);
        return rows;
    },
    draw(ctx) {
        const c = J.c, cam = P.cam;
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, c.light ? '#cfe3f3' : '#141821'); sky.addColorStop(1, c.light ? '#f3efe6' : '#1f1b24');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        // Repères de distance
        ctx.fillStyle = J.alpha(c.muted, .5); ctx.font = J.font(11, 500, true); ctx.textAlign = 'center';
        for (let m = Math.ceil(cam / 400) * 400; m < cam + W; m += 400) { ctx.fillRect(m - cam, FLOOR - 30, 1, 30); ctx.fillText(`${Math.round((m - 120) / 40)} m`, m - cam, FLOOR - 38); }
        // Sol
        ctx.fillStyle = c.danger; ctx.globalAlpha = .8; ctx.fillRect(0, FLOOR, W, H - FLOOR); ctx.globalAlpha = 1;
        for (let x = -(cam % 24); x < W; x += 24) { ctx.fillStyle = J.alpha('#000000', .2); ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x + 12, FLOOR - 10); ctx.lineTo(x + 24, FLOOR); ctx.fill(); }
        // Accroches
        const target = bestAnchor();
        for (const a of P.anchors) {
            const x = a.x - cam; if (x < -20 || x > W + 20) continue;
            ctx.fillStyle = a === target && !P.rope ? c.accent : c.muted;
            ctx.beginPath(); ctx.arc(x, a.y, a === target && !P.rope ? 8 : 6, 0, 7); ctx.fill();
            if (a === target && !P.rope) { ctx.strokeStyle = J.alpha(c.accent, .4); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, a.y, 14, 0, 7); ctx.stroke(); }
        }
        // Corde et joueur
        if (P.rope) { ctx.strokeStyle = c.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.rope.a.x - cam, P.rope.a.y); ctx.lineTo(P.x - cam, P.y); ctx.stroke(); }
        P.trail.forEach(([x, y], i) => { ctx.fillStyle = J.alpha(c.accent, i / 60); ctx.beginPath(); ctx.arc(x - cam, y, 3 + i / 6, 0, 7); ctx.fill(); });
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(P.x - cam, P.y, 10, 0, 7); ctx.fill();
        J.speedLines((Math.hypot(P.vx, P.vy) - 700) / 300, 'h');
        J.text(`${Math.floor(P.best)} m`, W - 20, 24, 18, c.text, 'right', 700, true);
    },
});

function addAnchor() {
    const x = P.nextX, y = J.rand(70, 210);
    P.anchors.push({ x, y });
    P.nextX += J.rand(170, 300) + Math.min(120, P.nextX / 400);
}
function bestAnchor() {
    let best = null, bs = Infinity;
    for (const a of P.anchors) {
        const d = Math.hypot(a.x - P.x, a.y - P.y);
        if (d > RANGE || a.x < P.x - 60 || a.y > P.y - 20) continue;
        const s = Math.abs(a.x - P.x - 120) + d * .3;
        if (s < bs) { bs = s; best = a; }
    }
    return best;
}
function attach(a) { if (!a) return; P.rope = { a, len: Math.max(60, Math.hypot(P.x - a.x, P.y - a.y)) }; P.lastAnchor = a; }
function grab() { if (P.dead || P.rope) return; const a = bestAnchor(); if (a) { attach(a); J.tone(700, .05, 'square', .03, -200); J.burst(a.x, a.y, 8, J.c.accent, 90, .35, 3); } else J.tone(160, .05, 'square', .02); }
function finish(title) { J.end({ score: Math.floor(P.best), title, text: `${Math.floor(P.best)} m parcourus.` }); }
