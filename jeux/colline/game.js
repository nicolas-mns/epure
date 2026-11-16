'use strict';
// ==================== Colline ====================
// Tout-terrain en 2D sur des collines générées. Physique de Verlet : deux roues et une caisse
// reliées par des tiges (avec un peu de suspension). Accélérer, freiner, garder l'équilibre en l'air.
// Le réservoir se vide : les bidons le remplissent. La tête au sol, c'est fini.

const W = 900, H = 500, STEP = 24, WR = 15;
let K = null;

Jeu.create({
    id: 'colline',
    modes: {
        classic: { desc: 'Va le plus loin possible. Les collines deviennent de plus en plus raides.',
            rules: [['arrow-right', 'Droite / haut : accélérer. Gauche / bas : freiner, reculer.'], ['rotate-cw', 'En l\'air, accélérer ou freiner fait pencher la voiture.'], ['fuel', 'Ramasse les bidons pour ne pas tomber en panne.']] },
        lune: { desc: 'Gravité faible, grands sauts et cratères.', rules: [['moon', 'Gravité divisée par trois.']] },
        duel: { duel: 'race', desc: 'Même terrain pour les deux. Le plus loin gagne.', options: [{ id: 'moon', label: 'Terrain', def: 0, choices: [[0, 'Collines'], [1, 'Lune']] }] },
    },
    size: [W, H],
    controls: [['<kbd>→</kbd> <kbd>↑</kbd>', 'Accélérer / pencher en arrière'], ['<kbd>←</kbd> <kbd>↓</kbd>', 'Freiner / pencher en avant']],
    touch: [['ArrowLeft', 'chevrons-left', 'Frein'], ['ArrowRight', 'chevrons-right', 'Gaz']],
    liveScore: () => Math.floor(K.best),
    duelFormat: r => `${r.score} m`,
    progLabel: 'Sa distance',
    start() {
        const moon = J.mode === 'lune' || (J.mode === 'duel' && J.opts.moon === 1);
        K = { moon, g: moon ? 330 : 1100, ground: [], cans: [], fuel: 1, best: 0, cam: 0, dead: false, nextCan: 600, stuck: 0, parts: [] };
        genGround(W * 3);
        const x0 = 160, y0 = groundY(x0) - 60;
        const P = (x, y, r = 0) => ({ x, y, ox: x, oy: y, r });
        K.pts = [P(x0 - 40, y0 + 20, WR), P(x0 + 40, y0 + 20, WR), P(x0 - 44, y0 - 4), P(x0 + 46, y0 - 4), P(x0 + 2, y0 - 20)];
        // Tiges : [a, b, raideur]  (roues ↔ caisse un peu souples = suspension)
        const L = (a, b, k) => ({ a, b, k, len: Math.hypot(K.pts[a].x - K.pts[b].x, K.pts[a].y - K.pts[b].y) });
        K.sticks = [L(2, 3, 1), L(2, 4, 1), L(3, 4, 1), L(0, 2, .5), L(1, 3, .5), L(0, 3, .4), L(1, 2, .4), L(0, 1, 1)];
        K.spin = [0, 0];
    },
    update(dt) {
        if (K.dead) return;
        const gas = J.keys.has('ArrowRight') || J.keys.has('ArrowUp') || J.keys.has('KeyD') || J.keys.has('KeyW') || J.keys.has('KeyZ');
        const brake = J.keys.has('ArrowLeft') || J.keys.has('ArrowDown') || J.keys.has('KeyA') || J.keys.has('KeyQ') || J.keys.has('KeyS');
        const throttle = K.fuel > 0 ? (gas ? 1 : 0) - (brake ? .7 : 0) : 0;
        if (gas && K.fuel > 0) K.fuel -= dt * .035; else K.fuel -= dt * .008;
        K.fuel = Math.max(0, K.fuel);
        const sub = 6, h = dt / sub;
        let contact = [false, false];
        for (let s = 0; s < sub; s++) {
            for (const p of K.pts) {
                const vx = (p.x - p.ox) * .999, vy = (p.y - p.oy) * .999;
                p.ox = p.x; p.oy = p.y;
                p.x += vx; p.y += vy + K.g * h * h;
            }
            for (let it = 0; it < 3; it++) {
                for (const st of K.sticks) {
                    const a = K.pts[st.a], b = K.pts[st.b], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
                    const diff = (d - st.len) / d * .5 * st.k;
                    a.x += dx * diff; a.y += dy * diff; b.x -= dx * diff; b.y -= dy * diff;
                }
                contact = [false, false];
                K.pts.forEach((p, i) => {
                    const gy = groundY(p.x), r = p.r || 4;
                    if (p.y > gy - r) {
                        if (i < 2 && s === 0 && it === 0 && (p.y - p.oy) > 6) { J.shake(Math.min(9, (p.y - p.oy) * .8), .2); J.tone(90, .08, 'square', .03); }
                        p.y = gy - r;
                        if (i < 2) {
                            contact[i] = true;
                            // Moteur : pousse la roue le long du sol (tangente), sinon frottement
                            const [tx, ty] = tangent(p.x);
                            const vx = p.x - p.ox, vy = p.y - p.oy;
                            const vt = vx * tx + vy * ty;
                            const target = throttle * (K.moon ? 1.5 : 1.8) * (i === 0 ? 1 : .9); // pixels par sous-pas (≈ 650 px/s)
                            const nv = throttle ? vt + (target - vt) * .06 : vt * .995;
                            p.ox = p.x - (tx * nv + (vx - tx * vt) * .4);
                            p.oy = p.y - (ty * nv + (vy - ty * vt) * .4);
                        } else if (i === 4) { crash(); }
                    }
                });
            }
        }
        if (K.dead) return;
        // En l'air : accélérer / freiner fait tourner la caisse
        if (!contact[0] && !contact[1] && throttle) {
            const c = K.pts[2], d = K.pts[3], torque = throttle * (K.moon ? .9 : 1.2) * dt * 60 * .035;
            c.y += torque; d.y -= torque;
        }
        K.spin[0] += (K.pts[0].x - K.pts[0].ox) / WR; K.spin[1] += (K.pts[1].x - K.pts[1].ox) / WR;
        const cx = (K.pts[0].x + K.pts[1].x) / 2;
        K.best = Math.max(K.best, (cx - 160) / 30);
        K.cam += (cx - 280 - K.cam) * Math.min(1, dt * 5);
        genGround(K.cam + W * 2);
        // Bidons
        for (const can of K.cans) if (!can.taken && Math.abs(can.x - cx) < 40 && Math.abs(can.y - K.pts[4].y) < 90) { can.taken = true; K.fuel = 1; J.sfx.good(); }
        // Panne : plus d'essence et presque à l'arrêt
        const speed = Math.abs(K.pts[0].x - K.pts[0].ox) / (dt / sub);
        if (K.fuel <= 0 && speed < 8) { K.stuck += dt; if (K.stuck > 1.5) { K.dead = true; J.end({ score: Math.floor(K.best), title: 'Panne sèche', text: `${Math.floor(K.best)} m parcourus.` }); return; } } else K.stuck = 0;
        J.prog(Math.floor(K.best) + ' m'); J.checkLive();
        for (const q of K.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 400 * dt; q.t -= dt; }
        K.parts = K.parts.filter(q => q.t > 0);
        if ((contact[0] || contact[1]) && gas && K.fuel > 0 && Math.random() < .4) K.parts.push({ x: K.pts[0].x - 10, y: K.pts[0].y + 10, vx: -60 - Math.random() * 80, vy: -Math.random() * 80, t: .5 });
    },
    stats() { return [['Distance', Math.floor(K.best) + ' m'], ['Essence', Math.round(K.fuel * 100) + ' %']]; },
    draw(ctx) {
        const c = J.c, cam = K.cam;
        const camY = J.clamp(K.pts[4].y - H * .55, -2000, 4000);
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        if (K.moon) { sky.addColorStop(0, '#05060c'); sky.addColorStop(1, '#151827'); } else { sky.addColorStop(0, c.light ? '#a9d3f5' : '#1a2233'); sky.addColorStop(1, c.light ? '#e9f3fb' : '#2a3142'); }
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        if (K.moon) { ctx.fillStyle = '#5b8fd8'; ctx.beginPath(); ctx.arc(740, 90, 34, 0, 7); ctx.fill(); ctx.fillStyle = '#3f9a5a'; ctx.beginPath(); ctx.arc(730, 82, 14, 0, 7); ctx.fill(); }
        // Montagnes lointaines (deux plans de parallaxe)
        for (const [k, col, amp, base] of [[.15, K.moon ? '#1c1f2b' : c.light ? '#9fb8cc' : '#202a3a', 70, H * .55], [.35, K.moon ? '#2a2d3a' : c.light ? '#7f9e86' : '#243326', 50, H * .68]]) {
            ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
            for (let x = 0; x <= W; x += 16) { const wx = x + cam * k; ctx.lineTo(x, base - Math.sin(wx / 210) * amp - Math.sin(wx / 83) * amp * .3); }
            ctx.lineTo(W, H); ctx.fill();
        }
        // Arbres (ou rochers sur la Lune) plantés sur le terrain
        for (let tx = Math.floor(cam / 160) * 160; tx < cam + W + 160; tx += 160) {
            const h = ((tx * 9301 + 49297) % 233280) / 233280; if (h < .45) continue;
            const x = tx + h * 80 - cam, y = groundY(tx + h * 80) - camY;
            if (K.moon) { ctx.fillStyle = '#545661'; ctx.beginPath(); ctx.ellipse(x, y, 14 + h * 10, 8, 0, Math.PI, 0); ctx.fill(); }
            else { ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 3, y - 26, 6, 26); ctx.fillStyle = c.light ? '#3f7d3a' : '#21462a'; ctx.beginPath(); ctx.moveTo(x - 18, y - 18); ctx.lineTo(x, y - 62 - h * 20); ctx.lineTo(x + 18, y - 18); ctx.fill(); }
        }
        // Sol
        ctx.fillStyle = K.moon ? '#6d6f78' : c.light ? '#6a9a4b' : '#2f4a2c';
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W + STEP; x += STEP / 2) ctx.lineTo(x, groundY(x + cam) - camY);
        ctx.lineTo(W, H); ctx.fill();
        ctx.strokeStyle = K.moon ? '#9a9ca5' : c.light ? '#8ccf5f' : '#4f7d3f'; ctx.lineWidth = 5; ctx.beginPath();
        for (let x = 0; x <= W + STEP; x += STEP / 2) { const y = groundY(x + cam) - camY; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        // Repères et bidons
        ctx.fillStyle = J.alpha(c.text, .5); ctx.font = J.font(11, 500, true); ctx.textAlign = 'center';
        for (let m = Math.ceil((cam + 160) / 3000) * 3000 - 160; m < cam + W; m += 3000) { const y = groundY(m) - camY; ctx.fillRect(m - cam, y - 40, 2, 40); ctx.fillText(`${Math.round((m - 160) / 30)} m`, m - cam, y - 48); }
        for (const can of K.cans) if (!can.taken) { const x = can.x - cam, y = can.y - camY; ctx.fillStyle = '#d63031'; J.rr(x - 10, y - 26, 20, 26, 3); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, y - 18, 10, 3); }
        for (const q of K.parts) { ctx.fillStyle = J.alpha(K.moon ? '#bbbbbb' : '#8a6a4a', q.t * 2); ctx.fillRect(q.x - cam, q.y - camY, 3, 3); }
        // Voiture
        const [w1, w2, c1, c2, hd] = K.pts.map(p => ({ x: p.x - cam, y: p.y - camY }));
        ctx.strokeStyle = c.muted; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(w1.x, w1.y); ctx.lineTo(c1.x, c1.y); ctx.moveTo(w2.x, w2.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
        const ang = Math.atan2(c2.y - c1.y, c2.x - c1.x);
        ctx.save(); ctx.translate((c1.x + c2.x) / 2, (c1.y + c2.y) / 2); ctx.rotate(ang);
        // Arceau, pilote et caisse
        ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(-8, -30); ctx.lineTo(16, -30); ctx.lineTo(24, -8); ctx.stroke();
        ctx.fillStyle = '#f5b041'; ctx.beginPath(); ctx.arc(2, -22, 8, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(20,30,45,.85)'; ctx.fillRect(4, -25, 7, 5);
        const g = ctx.createLinearGradient(0, -12, 0, 12); g.addColorStop(0, '#e74c3c'); g.addColorStop(1, '#922b21');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-48, 10); ctx.lineTo(-50, -6); ctx.lineTo(-30, -12); ctx.lineTo(30, -12); ctx.lineTo(50, -2); ctx.lineTo(48, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-26, -4, 52, 3);
        ctx.fillStyle = '#ffd36b'; ctx.fillRect(44, -4, 6, 5);
        ctx.restore();
        [[w1, K.spin[0]], [w2, K.spin[1]]].forEach(([w, sp]) => {
            ctx.fillStyle = '#17181c'; ctx.beginPath(); ctx.arc(w.x, w.y, WR, 0, 7); ctx.fill();
            ctx.strokeStyle = '#8b8b93'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w.x, w.y, WR * .55, 0, 7);
            ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(sp) * WR * .55, w.y + Math.sin(sp) * WR * .55); ctx.stroke();
        });
        // Jauge d'essence
        J.rr(16, 16, 130, 12, 6); ctx.fillStyle = J.alpha(c.text, .2); ctx.fill();
        J.rr(16, 16, 130 * K.fuel, 12, 6); ctx.fillStyle = K.fuel < .2 ? c.danger : c.ok; ctx.fill();
        J.speedLines((Math.abs(K.pts[0].x - K.pts[0].ox) * 360 - 700) / 500, 'h');
        J.text(`${Math.floor(K.best)} m`, W - 20, 22, 18, c.text, 'right', 700, true);
    },
});

// Terrain : hauteurs tous les STEP pixels, pente en marche aléatoire de plus en plus libre
function genGround(until) {
    const g = K.ground;
    if (!g.length) { for (let i = 0; i < 20; i++) g.push(360); K.slope = 0; }
    while (g.length * STEP < until) {
        const x = g.length * STEP, diff = Math.min(1, x / 40000);
        const maxS = (K.moon ? 22 : 14) + diff * 18;
        K.slope = J.clamp(K.slope + J.rand(-1, 1) * (3 + diff * 5), -maxS, maxS);
        let y = g[g.length - 1] + K.slope;
        if (y > 460) { y = 460; K.slope = -Math.abs(K.slope) * .5; } if (y < -600) { y = -600; K.slope = Math.abs(K.slope) * .5; }
        if (K.moon && J.rng() < .01) { for (let k = 0; k < 6; k++) g.push(y + Math.sin(k / 5 * Math.PI) * 40); continue; }
        g.push(y);
        if (x > K.nextCan) { K.cans.push({ x, y }); K.nextCan = x + J.rand(2400, 4200) + diff * 2000; }
    }
}
function groundY(x) {
    const g = K.ground, i = Math.max(0, Math.floor(x / STEP)), t = x / STEP - i;
    const a = g[Math.min(i, g.length - 1)], b = g[Math.min(i + 1, g.length - 1)];
    return a + (b - a) * (t * t * (3 - 2 * t));
}
function tangent(x) { const dy = groundY(x + 2) - groundY(x - 2); const l = Math.hypot(4, dy); return [4 / l, dy / l]; }
function crash() {
    if (K.dead) return;
    K.dead = true; J.sfx.boom();
    J.end({ score: Math.floor(K.best), title: 'Sur la tête !', text: `${Math.floor(K.best)} m parcourus.` });
}
