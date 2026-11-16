'use strict';
// ==================== Circuit ====================
// Course vue de dessus. Pistes définies par des points de contrôle lissés (Catmull-Rom).
// Voiture arcade : adhérence latérale, frein à main pour déraper, herbe qui ralentit.
// Bots : suivent la trajectoire avec anticipation des virages, vitesse selon le niveau.

const W = 900, H = 560, TW = 110, LAPS = 3;
const TRACKS = {
    anneau: { name: 'Anneau', pts: [[300, 300], [900, 260], [1400, 320], [1600, 600], [1400, 900], [900, 940], [400, 900], [200, 620]] },
    epingle: { name: 'Épingle', pts: [[250, 250], [1300, 220], [1650, 420], [1300, 560], [700, 540], [600, 720], [1200, 820], [1500, 1000], [900, 1150], [300, 1050], [180, 650]] },
    serpentin: { name: 'Serpentin', pts: [[300, 200], [800, 160], [1000, 400], [1300, 200], [1750, 350], [1650, 750], [1250, 700], [1150, 1000], [700, 1100], [500, 800], [250, 900], [150, 500]] },
};
const TRACK_OPT = { id: 'track', label: 'Piste', def: 'anneau', choices: Object.entries(TRACKS).map(([k, t]) => [k, t.name]) };
const COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6'];
let C = null;

function buildTrack(def) {
    const P = def.pts, n = P.length, out = [];
    for (let i = 0; i < n; i++) {
        const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
        for (let k = 0; k < 40; k++) {
            const t = k / 40, t2 = t * t, t3 = t2 * t;
            const f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
        }
    }
    // Longueur cumulée, direction et courbure à chaque point
    let len = 0;
    out.forEach((p, i) => {
        const q = out[(i + 1) % out.length];
        p.dir = Math.atan2(q.y - p.y, q.x - p.x); p.s = len; len += Math.hypot(q.x - p.x, q.y - p.y);
    });
    out.forEach((p, i) => { let d = out[(i + 6) % out.length].dir - p.dir; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.curv = Math.abs(d); });
    return { pts: out, len };
}
function nearest(tr, x, y, hint) {
    const n = tr.pts.length;
    let best = hint, bd = Infinity;
    const scan = hint == null ? n : 60;
    for (let k = -scan; k <= scan; k++) {
        const i = hint == null ? (k + n) % n : (hint + k + n) % n;
        const p = tr.pts[i], d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = i; }
    }
    return { i: best, d: Math.sqrt(bd) };
}

Jeu.create({
    id: 'circuit',
    modes: {
        chrono: { desc: '3 tours, le plus vite possible. Ton meilleur temps par piste est gardé.', options: [TRACK_OPT],
            rules: [['gauge', 'Haut : accélérer. Bas : freiner / reculer.'], ['rotate-cw', 'Gauche / droite : tourner. Espace : frein à main pour déraper.'], ['trees', 'L\'herbe ralentit beaucoup.']] },
        course: { bot: true, desc: 'Toi contre 3 bots sur 3 tours. Il faut finir premier.', options: [TRACK_OPT, BOT_LEVELS] },
        duel: { duel: 'race', desc: 'Même piste, 3 tours. Tu vois la voiture de ton adversaire. Le premier arrivé gagne.', options: [TRACK_OPT] },
    },
    size: [W, H],
    controls: [['<kbd>↑</kbd> <kbd>↓</kbd>', 'Accélérer / freiner'], ['<kbd>←</kbd> <kbd>→</kbd>', 'Tourner'], ['<kbd>Espace</kbd>', 'Frein à main (dérapage)']],
    touch: [['ArrowLeft', 'chevron-left'], ['ArrowRight', 'chevron-right'], ['Space', 'hand', 'Frein'], ['ArrowDown', 'chevron-down'], ['ArrowUp', 'chevron-up']],
    sub() { return J.opts.track; },
    duelCompare: (a, b) => (a.won - b.won) || (b.time - a.time),
    duelFormat: r => r.won ? fmtTime(r.time) : 'abandon',
    progLabel: 'Son tour',
    start() {
        const tr = buildTrack(TRACKS[J.opts.track]);
        const p0 = tr.pts[0];
        const car = (k, bot) => {
            const back = -40 - Math.floor(k / 2) * 60, side = (k % 2 ? 1 : -1) * 26;
            return { x: p0.x + Math.cos(p0.dir) * back - Math.sin(p0.dir) * side, y: p0.y + Math.sin(p0.dir) * back + Math.cos(p0.dir) * side,
                a: p0.dir, vx: 0, vy: 0, lap: 0, idx: 0, prog: 0, col: COLORS[k], bot, done: false, finish: 0, skid: 0, lapStart: 0, best: null, cp: 0 };
        };
        C = { tr, cars: [car(0, false)], marks: [], smoke: [], opp: null, cam: { x: p0.x, y: p0.y }, laps: [], deco: [] };
        // Décor : arbres et tribunes à côté de la piste (jamais dessus)
        const rnd = mulberry32(7 + J.opts.track.length);
        for (let i = 0; i < tr.pts.length; i += 6) {
            const p = tr.pts[i], side = rnd() < .5 ? 1 : -1, d = TW / 2 + 40 + rnd() * 160;
            const x = p.x - Math.sin(p.dir) * d * side, y = p.y + Math.cos(p.dir) * d * side;
            if (nearest(tr, x, y).d < TW / 2 + 30) continue;
            C.deco.push(i % 60 === 0 && d < TW / 2 + 90 ? { kind: 'stand', x, y, a: p.dir } : { kind: 'tree', x, y, r: 14 + rnd() * 12 });
        }
        if (J.mode === 'course') for (let k = 1; k < 4; k++) { const b = car(k, true); b.skill = [0, .7, .8, .9, .98][J.opts.level] * (1 - (k - 1) * .02); b.err = J.rand(-.3, .3); C.cars.push(b); }
        C.me = C.cars[0];
    },
    update(dt) {
        for (const car of C.cars) {
            if (car.done && !car.bot) { car.vx *= .96; car.vy *= .96; }
            const ctl = car.bot ? botCtl(car) : car.done ? { th: 0, st: 0, hb: false } : {
                th: (J.keys.has('ArrowUp') || J.keys.has('KeyW') || J.keys.has('KeyZ') ? 1 : 0) - (J.keys.has('ArrowDown') || J.keys.has('KeyS') ? 1 : 0),
                st: (J.keys.has('ArrowRight') || J.keys.has('KeyD') ? 1 : 0) - (J.keys.has('ArrowLeft') || J.keys.has('KeyA') || J.keys.has('KeyQ') ? 1 : 0),
                hb: J.keys.has('Space'),
            };
            physics(car, ctl, dt);
        }
        // Collisions simples entre voitures
        for (let i = 0; i < C.cars.length; i++) for (let j = i + 1; j < C.cars.length; j++) {
            const a = C.cars[i], b = C.cars[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d < 26 && d > 0) { const push = (26 - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; const t = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; if (t > 0) { if ((a === C.me || b === C.me) && t > 80) { J.shake(Math.min(10, t / 30), .2); J.tone(120, .08, 'square', .03); } a.vx -= t * nx * .6; a.vy -= t * ny * .6; b.vx += t * nx * .6; b.vy += t * ny * .6; } }
        }
        const me = C.me;
        C.cam.x += (me.x + me.vx * .35 - C.cam.x) * Math.min(1, dt * 5);
        C.cam.y += (me.y + me.vy * .35 - C.cam.y) * Math.min(1, dt * 5);
        if (J.duel.on) { C.net = (C.net || 0) - dt; if (C.net <= 0) { C.net = .066; J.duel.send('car', [Math.round(me.x), Math.round(me.y), +me.a.toFixed(2)]); J.prog(`${Math.min(LAPS, me.lap + 1)}/${LAPS}`); } }
        if (C.opp) { C.opp.x += (C.opp.tx - C.opp.x) * .3; C.opp.y += (C.opp.ty - C.opp.y) * .3; C.opp.a = C.opp.ta; }
        for (const m of C.marks) m.t -= dt;
        for (const q of C.smoke) { q.x += q.vx * dt; q.y += q.vy * dt; q.r += 18 * dt; q.t -= dt; }
        C.smoke = C.smoke.filter(q => q.t > 0);
        C.marks = C.marks.filter(m => m.t > 0);
        // Fin de course
        if (me.done && !C.ended) {
            C.ended = true;
            const place = 1 + C.cars.filter(c => c !== me && c.done && c.finish < me.finish).length;
            if (J.mode === 'course') J.end({ won: place === 1, title: place === 1 ? 'Victoire !' : `${place}e place`, time: me.finish, text: `Temps : ${fmtLap(me.finish)}. Meilleur tour : ${fmtLap(me.best)}.` });
            else J.end({ won: true, time: me.finish, text: `3 tours en ${fmtLap(me.finish)}. Meilleur tour : ${fmtLap(me.best)}.` });
        }
        if (J.mode === 'course' && !C.ended && C.cars.filter(c => c.bot && c.done).length === 3) { C.ended = true; J.end({ won: false, title: '4e place', text: 'Les trois bots ont fini avant toi.' }); }
    },
    onDuel(e, p) { if (e === 'car') { if (!C.opp) C.opp = { x: p[0], y: p[1], a: p[2] }; C.opp.tx = p[0]; C.opp.ty = p[1]; C.opp.ta = p[2]; } },
    stats() {
        const me = C.me;
        const rows = [['Tour', `${Math.min(LAPS, me.lap + 1)}/${LAPS}`], ['Tour actuel', fmtLap(J.time - me.lapStart)], ['Meilleur', fmtLap(me.best)]];
        if (J.mode === 'course') { const order = [...C.cars].sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.finish - b.finish : b.prog - a.prog)); rows.unshift(['Position', `${order.indexOf(me) + 1}/4`]); }
        return rows;
    },
    draw(ctx) {
        const c = J.c, tr = C.tr, cam = C.cam, zoom = .85;
        ctx.fillStyle = c.light ? '#7fb069' : '#1f3320'; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y);
        // Herbe texturée
        ctx.fillStyle = c.light ? '#76a560' : '#1b2e1c';
        for (let gx = Math.floor((cam.x - 700) / 80) * 80; gx < cam.x + 700; gx += 80) for (let gy = Math.floor((cam.y - 450) / 80) * 80; gy < cam.y + 450; gy += 80) if ((gx / 80 + gy / 80) % 2 === 0) ctx.fillRect(gx, gy, 80, 80);
        const path = () => { ctx.beginPath(); tr.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
        ctx.lineJoin = 'round';
        path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = TW + 14; ctx.stroke();
        path(); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = TW + 14; ctx.setLineDash([24, 24]); ctx.stroke(); ctx.setLineDash([]);
        path(); ctx.strokeStyle = c.light ? '#5d6066' : '#2d2e33'; ctx.lineWidth = TW; ctx.stroke();
        path(); ctx.strokeStyle = J.alpha('#ffffff', .25); ctx.lineWidth = 2; ctx.setLineDash([20, 30]); ctx.stroke(); ctx.setLineDash([]);
        // Ligne d'arrivée (damier)
        const p0 = tr.pts[0];
        ctx.save(); ctx.translate(p0.x, p0.y); ctx.rotate(p0.dir + Math.PI / 2);
        for (let k = 0; k < 11; k++) for (let r = 0; r < 2; r++) { ctx.fillStyle = (k + r) % 2 ? '#111' : '#fff'; ctx.fillRect(-TW / 2 + k * TW / 11, -6 + r * 6, TW / 11, 6); }
        ctx.restore();
        for (const m of C.marks) { ctx.fillStyle = `rgba(0,0,0,${m.t * .25})`; ctx.fillRect(m.x - 2, m.y - 2, 4, 4); }
        for (const q of C.smoke) { ctx.fillStyle = q.dirt ? `rgba(120,90,60,${q.t * .5})` : `rgba(230,230,230,${q.t * .35})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); }
        for (const d of C.deco) {
            if (Math.abs(d.x - cam.x) > 700 || Math.abs(d.y - cam.y) > 480) continue;
            if (d.kind === 'tree') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(d.x + 5, d.y + 6, d.r, 0, 7); ctx.fill(); ctx.fillStyle = c.light ? '#3f7d3a' : '#21462a'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill(); ctx.fillStyle = c.light ? '#56a04d' : '#2c5c36'; ctx.beginPath(); ctx.arc(d.x - d.r * .3, d.y - d.r * .3, d.r * .55, 0, 7); ctx.fill(); }
            else { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a); ctx.fillStyle = '#4b5563'; ctx.fillRect(-60, -14, 120, 28); for (let k = 0; k < 12; k++) { ctx.fillStyle = COLORS[k % 4]; ctx.fillRect(-56 + k * 9.5, -10, 6, 6); ctx.fillStyle = '#d1d5db'; ctx.fillRect(-56 + k * 9.5, 2, 6, 6); } ctx.restore(); }
        }
        if (C.opp) drawCar(ctx, C.opp.x, C.opp.y, C.opp.a, c.danger, .6);
        for (const car of [...C.cars].reverse()) drawCar(ctx, car.x, car.y, car.a, car.bot ? car.col : c.accent, 1);
        ctx.restore();
        J.speedLines((Math.hypot(C.me.vx, C.me.vy) - 420) / 200, 'radial');
        // Mini-carte
        const mm = { x: W - 170, y: 12, w: 158, h: 110 };
        ctx.fillStyle = J.alpha(c.bg, .75); J.rr(mm.x, mm.y, mm.w, mm.h, 8); ctx.fill();
        const xs = tr.pts.map(p => p.x), ys = tr.pts.map(p => p.y), minX = Math.min(...xs), minY = Math.min(...ys);
        const sc = Math.min((mm.w - 20) / (Math.max(...xs) - minX), (mm.h - 20) / (Math.max(...ys) - minY));
        const M = (x, y) => [mm.x + 10 + (x - minX) * sc, mm.y + 10 + (y - minY) * sc];
        ctx.strokeStyle = c.muted; ctx.lineWidth = 3; ctx.beginPath(); tr.pts.forEach((p, i) => { const [x, y] = M(p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
        const dot = (x, y, col) => { const [a, b] = M(x, y); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a, b, 4, 0, 7); ctx.fill(); };
        C.cars.forEach(car => dot(car.x, car.y, car.bot ? car.col : c.accent));
        if (C.opp) dot(C.opp.x, C.opp.y, c.danger);
        J.text(`Tour ${Math.min(LAPS, C.me.lap + 1)}/${LAPS}`, 16, 22, 16, '#ffffff', 'left', 700);
        J.text(fmtLap(J.time - C.me.lapStart), 16, 46, 14, '#ffffff', 'left', 500, true);
    },
});

const fmtLap = t => t == null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
function physics(car, { th, st, hb }, dt) {
    const fx = Math.cos(car.a), fy = Math.sin(car.a);
    let fwd = car.vx * fx + car.vy * fy, lat = -car.vx * fy + car.vy * fx;
    const nr = nearest(C.tr, car.x, car.y, car.idx);
    const onTrack = nr.d < TW / 2 + 4;
    const maxF = onTrack ? 520 : 200;
    if (th > 0) fwd += 420 * dt * (1 - Math.max(0, fwd) / maxF);
    else if (th < 0) fwd -= (fwd > 0 ? 700 : 250) * dt;
    else fwd *= Math.pow(onTrack ? .7 : .35, dt);
    if (fwd < -150) fwd = -150;
    if (!onTrack) fwd *= Math.pow(.4, dt);
    // Direction : plus efficace à vitesse moyenne
    const turn = st * dt * 2.8 * Math.min(1, Math.abs(fwd) / 140) * Math.sign(fwd || 1);
    car.a += turn * (hb ? 1.35 : 1);
    // Adhérence latérale (faible au frein à main = dérapage)
    const grip = hb ? 1.2 : onTrack ? 9 : 4;
    lat *= Math.exp(-grip * dt);
    if (hb) fwd *= Math.pow(.55, dt);
    car.vx = fwd * fx - lat * fy; car.vy = fwd * fy + lat * fx;
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.skid = Math.abs(lat);
    if (car.skid > 90 && Math.random() < .6) C.marks.push({ x: car.x - fx * 12, y: car.y - fy * 12, t: 2.5 });
    if (car.skid > 130 && Math.random() < .5) C.smoke.push({ x: car.x - fx * 14, y: car.y - fy * 14, vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30, t: .9, r: 6 });
    if (!onTrack && Math.hypot(car.vx, car.vy) > 120 && Math.random() < .4) C.smoke.push({ x: car.x, y: car.y, vx: -car.vx * .1, vy: -car.vy * .1, t: .6, r: 5, dirt: true });
    if (!car.bot && car.skid > 120 && Math.random() < .05) J.tone(90, .06, 'sawtooth', .01);
    // Progression : on avance sur la piste par petits pas (pas de raccourci possible)
    const n = C.tr.pts.length;
    let di = nr.i - car.idx; if (di > n / 2) di -= n; if (di < -n / 2) di += n;
    if (Math.abs(di) < 40) {
        if (car.idx + di >= n && car.cp >= 3) { // ligne franchie après tous les secteurs
            car.lap++; car.cp = 0;
            const lt = J.time - car.lapStart; car.lapStart = J.time;
            if (car.best == null || lt < car.best) car.best = lt;
            if (!car.bot) J.tone(880, .12, 'triangle', .04);
            if (car.lap >= LAPS && !car.done) { car.done = true; car.finish = J.time; }
        }
        const before = car.idx;
        car.idx = (car.idx + di + n) % n;
        const sector = Math.floor(car.idx / (n / 4));
        if (sector === car.cp + 1 || (car.cp === 3 && sector === 0 && before > n * .75)) car.cp = Math.min(3, Math.max(car.cp, sector));
        car.prog = car.lap * n + car.idx;
    }
}
function botCtl(car) {
    if (car.done) return { th: 0, st: 0, hb: false };
    const n = C.tr.pts.length, speed = Math.hypot(car.vx, car.vy);
    const look = Math.floor(10 + speed / 25);
    const tgt = C.tr.pts[(car.idx + look) % n];
    let ang = Math.atan2(tgt.y - car.y, tgt.x - car.x) - car.a;
    while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    let curv = 0; for (let k = 4; k < look + 30; k += 4) curv = Math.max(curv, C.tr.pts[(car.idx + k) % n].curv);
    const vmax = (520 - curv * 900) * car.skill;
    return { th: speed < Math.max(160, vmax) ? 1 : speed > vmax + 60 ? -1 : 0, st: J.clamp(ang * 3 + car.err * .05, -1, 1), hb: false };
}
function drawCar(ctx, x, y, a, col, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; J.rr(-16, -8, 38, 20, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-14, -13, 9, 4); ctx.fillRect(-14, 9, 9, 4); ctx.fillRect(8, -13, 9, 4); ctx.fillRect(8, 9, 9, 4);
    const g = ctx.createLinearGradient(0, -10, 0, 10); g.addColorStop(0, col); g.addColorStop(.5, col); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-18, -9); ctx.lineTo(12, -10); ctx.quadraticCurveTo(21, -8, 21, 0); ctx.quadraticCurveTo(21, 8, 12, 10); ctx.lineTo(-18, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(15,22,35,.9)'; J.rr(-2, -7, 10, 14, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, -6, 3, 12);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-20, -10, 4, 20);
    ctx.fillStyle = '#fff'; ctx.fillRect(-12, -1.5, 22, 3);
    ctx.restore();
}
