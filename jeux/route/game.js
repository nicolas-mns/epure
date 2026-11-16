'use strict';
// ==================== Route ====================
// Conduite tranquille en pseudo-3D (technique des segments projetés, façon années 80).
// La route est générée à l'infini : virages, collines, paysages qui changent (forêt, désert,
// neige, bord de mer) et cycle jour / nuit.

const W = 900, H = 520, SEG = 200, ROAD = 2000, LANES = 3, CAM_H = 1000, DRAW = 220, FOV = 100;
const DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const MAXV = SEG * 60; // vitesse max (unités par seconde), affichée 180 km/h
const KM = MAXV / 50 * 1000; // unités par kilomètre (180 km/h = 50 m/s)
const BIOMES = [
    { name: 'Forêt', grass: ['#3f7d3a', '#376f33'], rumble: ['#e8e8e8', '#c0392b'], tree: 'pine', fog: '#a8c6a0' },
    { name: 'Désert', grass: ['#d9b779', '#cfab6a'], rumble: ['#f2f2f2', '#d35400'], tree: 'cactus', fog: '#e9cf9d' },
    { name: 'Neige', grass: ['#e8eef3', '#dbe3ea'], rumble: ['#ffffff', '#2c3e50'], tree: 'snow', fog: '#dde6ee' },
    { name: 'Côte', grass: ['#4f9a5b', '#47904f'], rumble: ['#ffffff', '#2980b9'], tree: 'palm', fog: '#b6d7e6' },
];
let R = null;

Jeu.create({
    id: 'route',
    modes: {
        balade: { desc: 'Aucune pression : la route, le paysage, le jour qui passe. Sortir de la route ralentit, rien de plus.',
            options: [{ id: 'auto', label: 'Vitesse', def: 1, choices: [[1, 'Régulateur', 'garde la vitesse tout seul'], [0, 'Manuelle', 'haut / bas']] }],
            rules: [['sunset', 'Un cycle jour / nuit complet toutes les 4 minutes.'], ['trees', 'Le paysage change tous les 5 km.'], ['flag', 'Quitte quand tu veux : ta distance est enregistrée.']] },
        trafic: { desc: 'La même route, avec de la circulation. Un accrochage et la balade s\'arrête.', rules: [['car', 'Dépasse les voitures sans les toucher.'], ['gauge', 'Plus tu vas vite, plus tu marques.']] },
        duel: { duel: 'race', desc: 'Même route, même trafic, 2 minutes. Les accrochages te ralentissent. La plus longue distance gagne.' },
    },
    size: [W, H],
    controls: [['<kbd>←</kbd> <kbd>→</kbd>', 'Tourner'], ['<kbd>↑</kbd>', 'Accélérer'], ['<kbd>↓</kbd>', 'Freiner']],
    touch: [['ArrowLeft', 'chevron-left'], ['ArrowDown', 'chevron-down'], ['ArrowUp', 'chevron-up'], ['ArrowRight', 'chevron-right']],
    duelFormat: r => `${(r.score / 1000).toFixed(1)} km`,
    progLabel: 'Sa distance',
    quitResult: () => R && J.mode === 'balade' && R.pos > SEG * 50 ? { score: Math.round(R.pos / KM * 1000), won: true } : null,
    start() {
        R = { segs: [], base: 0, pos: 0, x: 0, speed: J.mode === 'balade' ? MAXV * .55 : 0, cars: [], gen: { left: 0, curve: 0, hill: 0, y: 0 }, crashT: 0, carT: 0, sky: 0,
            shake: 0, stars: Array.from({ length: 80 }, () => [Math.random() * W, Math.random() * H * .5, Math.random()]) };
        R.dayStart = J.mode === 'balade' ? .3 : .35;
        ensure(0, DRAW + 10);
    },
    update(dt) {
        const up = J.keys.has('ArrowUp') || J.keys.has('KeyW') || J.keys.has('KeyZ');
        const down = J.keys.has('ArrowDown') || J.keys.has('KeyS');
        const left = J.keys.has('ArrowLeft') || J.keys.has('KeyA') || J.keys.has('KeyQ');
        const right = J.keys.has('ArrowRight') || J.keys.has('KeyD');
        const cruise = J.mode === 'balade' && J.opts.auto === 1;
        if (R.crashT > 0) R.crashT -= dt;
        if (up || (cruise && !down && R.speed < MAXV * .62)) R.speed += MAXV * .32 * dt;
        else if (down) R.speed -= MAXV * .9 * dt;
        else R.speed -= MAXV * .12 * dt;
        const off = Math.abs(R.x) > 1;
        if (off && R.speed > MAXV * .3) R.speed -= MAXV * .9 * dt;
        R.speed = J.clamp(R.speed, 0, MAXV);
        const seg = segAt(R.pos), ratio = R.speed / MAXV;
        const steer = (right ? 1 : 0) - (left ? 1 : 0);
        R.x += steer * dt * 2.2 * Math.max(.3, ratio);
        R.x -= dt * 2.2 * ratio * ratio * seg.curve * .32; // force centrifuge
        R.x = J.clamp(R.x, -2.4, 2.4);
        // Trafic et duel : glissières de sécurité, impossible de rouler dans l'herbe pour éviter les voitures
        if (J.mode !== 'balade' && Math.abs(R.x) > 1.05) {
            R.x = Math.sign(R.x) * 1.05; R.speed *= .97;
            if (!R.railT || R.railT <= 0) { J.shake(5, .15); J.tone(120, .06, 'square', .03); J.burst(R.x > 0 ? W / 2 + 90 : W / 2 - 90, H - 50, 10, '#ffd36b', 180, .35, 3); R.railT = .25; }
        }
        if (R.railT > 0) R.railT -= dt;
        R.steer = steer;
        R.pos += R.speed * dt;
        ensure(Math.floor(R.pos / SEG), DRAW + 10);
        // Circulation
        if (J.mode !== 'balade') {
            R.carT -= dt;
            if (R.carT <= 0) {
                // Rangées de voitures qui bouchent deux voies sur trois : la voie libre change à chaque
                // rangée, il faut donc vraiment se déplacer. Toute une rangée roule à la même vitesse
                // (les voitures ne se rentrent jamais dedans).
                const prog = Math.min(1, R.pos / (12 * KM));
                R.carT = J.rand(1.6, 2.4) * (1 - prog * .45);
                const lanes = [-.66, 0, .66], v = MAXV * J.rand(.28, .4);
                const row = J.rng() < .25 + prog * .55;
                let gap = J.int(0, 2);
                if (row && R.lastGap != null && gap === R.lastGap) gap = (gap + J.int(1, 2)) % 3;
                R.lastGap = gap;
                const z = R.pos + SEG * DRAW * .9;
                const pickCol = () => J.pick(['#c0392b', '#2e86de', '#f0b429', '#8e44ad', '#16a085', '#ecf0f1', '#e67e22']);
                if (row) lanes.forEach((off, k) => { if (k !== gap) R.cars.push({ z: z + J.rand(-60, 60), off, v, col: pickCol(), truck: J.rng() < .2 }); });
                else R.cars.push({ z, off: J.pick(lanes), v, col: pickCol(), truck: J.rng() < .25 });
            }
            for (const c of R.cars) c.z += c.v * dt;
            R.cars = R.cars.filter(c => c.z > R.pos - SEG * 2);
            for (const c of R.cars) {
                const dz = c.z - (R.pos + CAM_H * DEPTH * .9);
                if (dz > 0 && dz < SEG * (c.truck ? 1.2 : .8) && Math.abs(c.off - R.x) < (c.truck ? .46 : .42) && R.speed > c.v && R.crashT <= 0) {
                    J.sfx.boom(); R.shake = .4; J.shake(12, .4); J.burst(W / 2, H - 70, 30, '#ffb347', 260, .7, 4, 300);
                    if (J.mode === 'trafic') { R.speed = 0; J.end({ score: Math.round(R.pos / KM * 1000), text: `Accrochage après ${(R.pos / KM).toFixed(1)} km.` }); return; }
                    R.speed = c.v * .5; R.crashT = 1;
                }
            }
        }
        if (R.shake > 0) R.shake -= dt;
        if (up && R.speed < MAXV * .9 && Math.random() < .5) J.burst(W / 2 - 55 + Math.random() * 20, H - 40, 1, 'rgba(200,200,200,.6)', 40, .6, 6, -40);
        if (Math.abs(R.x) > 1 && R.speed > MAXV * .15 && Math.random() < .6) J.burst(W / 2 + (Math.random() - .5) * 120, H - 30, 2, '#a68a64', 90, .5, 4, -60);
        if (J.mode === 'duel') {
            J.prog((R.pos / KM).toFixed(1) + ' km');
            if (J.time >= 120) { J.end({ score: Math.round(R.pos / KM * 1000), title: 'Arrivée', text: `${(R.pos / KM).toFixed(1)} km en 2 minutes.` }); return; }
        }
        // Son du moteur, discret
        R.engine = (R.engine || 0) - dt;
        if (R.engine <= 0 && R.speed > 10) { R.engine = .12; J.tone(60 + ratio * 90, .1, 'sawtooth', .006); }
    },
    stats() {
        const rows = [['Distance', (R.pos / KM).toFixed(2) + ' km'], ['Vitesse', Math.round(R.speed / MAXV * 180) + ' km/h'], ['Paysage', biome(R.pos).name]];
        if (J.mode === 'duel') rows.push(['Reste', Math.max(0, Math.ceil(120 - J.time)) + ' s']);
        return rows;
    },
    draw(ctx) {
        const day = (R.dayStart + J.time / 240) % 1; // 0 = minuit, .5 = midi
        const light = Math.max(0, Math.sin(day * Math.PI * 2 - Math.PI / 2) * .5 + .5);
        const bio = biome(R.pos);
        // Ciel
        const sky = ctx.createLinearGradient(0, 0, 0, H * .6);
        const top = mix('#0b1026', '#4a90d9', light), bottom = mix('#1d2142', light > .2 && light < .5 ? '#f3a76b' : bio.fog, Math.min(1, light * 1.4));
        sky.addColorStop(0, top); sky.addColorStop(1, bottom);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        if (light < .35) for (const [x, y, b] of R.stars) { ctx.fillStyle = `rgba(255,255,255,${(.35 - light) * 2 * b})`; ctx.fillRect(x, y, 1.5, 1.5); }
        // Soleil / lune
        const ang = day * Math.PI * 2;
        const sx = W / 2 - Math.sin(ang) * W * .45, sy = H * .55 + Math.cos(ang) * H * .5;
        ctx.fillStyle = light > .3 ? '#fff4c2' : '#e9edf5'; ctx.beginPath(); ctx.arc(light > .3 ? sx : W - sx, light > .3 ? sy : H * 1.1 - sy, 24, 0, 7); ctx.fill();
        // Collines lointaines (parallaxe selon les virages)
        R.sky += (segAt(R.pos).curve * R.speed / MAXV) * .002;
        ctx.fillStyle = mix('#1a1f2e', mix(bio.grass[1], '#6b7d8f', .5), light);
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * .5 - 40 - Math.sin((x + R.sky * 900) / 130) * 22 - Math.sin((x + R.sky * 900) / 57) * 10);
        ctx.lineTo(W, H); ctx.fill();
        // Route
        const shakeX = R.shake > 0 ? (Math.random() - .5) * 10 : 0;
        const baseI = Math.floor(R.pos / SEG), basePct = (R.pos % SEG) / SEG;
        const base = getSeg(baseI);
        const camY = CAM_H + J.lerp(base.y1, base.y2, basePct);
        let x = 0, dx = -base.curve * basePct, maxy = H;
        const drawn = [];
        for (let n = 0; n < DRAW; n++) {
            const s = getSeg(baseI + n);
            const z1 = s.i * SEG - R.pos, z2 = z1 + SEG;
            const p1 = proj(x - R.x * ROAD, s.y1 - camY, z1), p2 = proj(x + dx - R.x * ROAD, s.y2 - camY, z2);
            x += dx; dx += s.curve;
            s.clip = maxy; s.p1 = p1;
            drawn.push(s);
            if (z1 <= DEPTH * 10 || p2.y >= maxy || p2.y >= p1.y) continue;
            const fog = Math.min(1, n / DRAW) ** 1.6;
            const alt = Math.floor(s.i / 3) % 2;
            const dim = c => mix(mix('#05070d', c, .25 + light * .75), mix('#0d1020', bio.fog, light), fog);
            ctx.fillStyle = dim(bio.grass[alt]); ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
            poly(ctx, p1.x + shakeX, p1.y, p1.w * 1.15, p2.x + shakeX, p2.y, p2.w * 1.15, dim(bio.rumble[alt]));
            poly(ctx, p1.x + shakeX, p1.y, p1.w, p2.x + shakeX, p2.y, p2.w, dim(alt ? '#5c5f66' : '#575a61'));
            if (J.mode !== 'balade') { ctx.fillStyle = dim(alt ? '#d0d3d8' : '#9aa0a6'); ctx.fillRect(p1.x + shakeX - p1.w * 1.12, p1.y - p1.w * .06, p1.w * .03 + 1, p1.w * .06 + 1); ctx.fillRect(p1.x + shakeX + p1.w * 1.09, p1.y - p1.w * .06, p1.w * .03 + 1, p1.w * .06 + 1); }
            if (alt) for (let l = 1; l < LANES; l++) {
                const k = -1 + 2 * l / LANES;
                poly(ctx, p1.x + shakeX + p1.w * k, p1.y, p1.w * .015, p2.x + shakeX + p2.w * k, p2.y, p2.w * .015, dim('#e8e8e8'));
            }
            maxy = p1.y;
        }
        // Décor et voitures, du plus loin au plus proche
        for (let n = drawn.length - 1; n > 0; n--) {
            const s = drawn[n];
            if (!s.p1 || s.p1.scale <= 0) continue;
            for (const sp of s.sprites) sprite(ctx, s, sp.off, sp.kind, light, shakeX);
            for (const c of R.cars) if (Math.floor(c.z / SEG) === s.i) sprite(ctx, s, c.off, c.truck ? 'truck' : 'car', light, shakeX, c.col);
        }
        // Effets de vitesse : traits et légère vibration au-delà de 70 %
        const ratio = R.speed / MAXV;
        J.speedLines((ratio - .65) * 2.5, 'radial');
        if (Math.abs(R.x) > 1 && R.speed > MAXV * .2) J.shake(2.5, .05);
                // Notre voiture
        const bounce = R.speed > 10 ? Math.sin(J.time * 30) * 1.2 : 0;
        playerCar(ctx, W / 2, H - 30 + bounce, R.steer || 0, light);
        if (light < .3) { ctx.fillStyle = 'rgba(255,240,180,.08)'; ctx.beginPath(); ctx.moveTo(W / 2 - 40, H - 60); ctx.lineTo(W / 2 - 220, H * .62); ctx.lineTo(W / 2 + 220, H * .62); ctx.lineTo(W / 2 + 40, H - 60); ctx.fill(); }
    },
});

// ---------- Route infinie ----------
function ensure(from, count) {
    while (R.segs.length + R.base < from + count) genSection();
    // On oublie les segments loin derrière
    const drop = from - 50 - R.base;
    if (drop > 500) { R.segs.splice(0, drop); R.base += drop; }
}
function genSection() {
    const g = R.gen, n = J.int(40, 110);
    const curve = J.rng() < .35 ? 0 : J.rand(-5, 5);
    const hill = J.rng() < .4 ? 0 : J.rand(-40, 40) * SEG / 100;
    const startCurve = g.curve;
    for (let k = 0; k < n; k++) {
        const t = k / n, ease = t < .2 ? t / .2 : t > .8 ? (1 - t) / .2 : 1;
        const i = R.base + R.segs.length;
        const y1 = g.y;
        g.y += Math.sin(t * Math.PI) * hill;
        const c = J.lerp(startCurve, curve, Math.min(1, t * 5)) * ease;
        const sprites = [];
        if (J.rng() < .35) sprites.push({ off: (J.rng() < .5 ? -1 : 1) * J.rand(1.3, 3.2), kind: 'tree' });
        if (i % 40 === 0) sprites.push({ off: -1.15, kind: 'post' }, { off: 1.15, kind: 'post' });
        R.segs.push({ i, curve: c, y1, y2: g.y, sprites });
    }
    g.curve = 0;
}
const getSeg = i => R.segs[Math.max(0, i - R.base)] || R.segs[R.segs.length - 1];
const segAt = z => getSeg(Math.floor(z / SEG));
const biome = z => BIOMES[Math.floor(z / (5 * KM)) % BIOMES.length];
function proj(x, y, z) {
    const scale = DEPTH / Math.max(1, z);
    return { x: Math.round(W / 2 + scale * x * W / 2), y: Math.round(H / 2 - scale * y * H / 2), w: Math.round(scale * ROAD * W / 2), scale };
}
function poly(ctx, x1, y1, w1, x2, y2, w2, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1); ctx.fill();
}
function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
function sprite(ctx, s, off, kind, light, shakeX, col) {
    const p = s.p1, sc = p.scale * W / 2;
    const x = p.x + shakeX + off * p.w, y = p.y;
    if (y > s.clip + 2 && kind !== 'car') return;
    const dim = c => mix('#05070d', c, .3 + light * .7);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, s.clip); ctx.clip();
    if (kind === 'tree') {
        const t = biome(s.i * SEG).tree, h = 900 * sc, w = 420 * sc;
        if (h < 1) { ctx.restore(); return; }
        if (t === 'pine' || t === 'snow') {
            ctx.fillStyle = dim('#5b3a1e'); ctx.fillRect(x - w * .08, y - h * .25, w * .16, h * .25);
            ctx.fillStyle = dim(t === 'snow' ? '#2f5d4a' : '#1f5c2e');
            for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - w * (.5 - k * .1), y - h * (.2 + k * .25)); ctx.lineTo(x, y - h * (.55 + k * .22)); ctx.lineTo(x + w * (.5 - k * .1), y - h * (.2 + k * .25)); ctx.fill(); }
            if (t === 'snow') { ctx.fillStyle = dim('#ffffff'); ctx.beginPath(); ctx.moveTo(x - w * .15, y - h * .82); ctx.lineTo(x, y - h * .99); ctx.lineTo(x + w * .15, y - h * .82); ctx.fill(); }
        } else if (t === 'cactus') {
            ctx.fillStyle = dim('#3b7d3a'); ctx.fillRect(x - w * .08, y - h * .7, w * .16, h * .7);
            ctx.fillRect(x - w * .32, y - h * .5, w * .1, h * .25); ctx.fillRect(x - w * .32, y - h * .32, w * .3, w * .1);
            ctx.fillRect(x + w * .22, y - h * .58, w * .1, h * .25); ctx.fillRect(x + w * .02, y - h * .4, w * .3, w * .1);
        } else {
            ctx.strokeStyle = dim('#7a5230'); ctx.lineWidth = Math.max(1, w * .08); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w * .2, y - h * .5, x + w * .1, y - h * .9); ctx.stroke();
            ctx.fillStyle = dim('#2e7d4f');
            for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * .55; ctx.beginPath(); ctx.ellipse(x + w * .1 + Math.cos(a) * w * .3, y - h * .9 + Math.sin(a) * h * .08 + h * .05, w * .3, h * .05, a, 0, 7); ctx.fill(); }
        }
    } else if (kind === 'post') {
        const h = 500 * sc, w = 40 * sc;
        ctx.fillStyle = dim('#dddddd'); ctx.fillRect(x - w / 2, y - h, w, h);
        ctx.fillStyle = light < .3 ? '#ffd27a' : dim('#c0392b'); ctx.fillRect(x - w / 2, y - h, w, h * .15);
    } else if (kind === 'truck') {
        const w = 400 * sc, h = 380 * sc;
        if (w < 2) { ctx.restore(); return; }
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - w / 2, y - h * .06, w, h * .06);
        ctx.fillStyle = dim('#d9d9d9'); J.rr(x - w / 2, y - h, w, h * .9, Math.max(1, w * .04)); ctx.fill();
        ctx.fillStyle = dim(col); ctx.fillRect(x - w / 2, y - h * .3, w, h * .08);
        ctx.fillStyle = light < .35 ? '#ff3b3b' : dim('#a93226'); ctx.fillRect(x - w * .46, y - h * .2, w * .1, h * .06); ctx.fillRect(x + w * .36, y - h * .2, w * .1, h * .06);
    } else if (kind === 'car') {
        const w = 360 * sc, h = 200 * sc;
        if (w < 2) { ctx.restore(); return; }
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - w / 2, y - h * .12, w, h * .12);
        ctx.fillStyle = dim(col); J.rr(x - w / 2, y - h, w, h * .9, Math.max(1, w * .08)); ctx.fill();
        ctx.fillStyle = dim('#1a2230'); ctx.fillRect(x - w * .36, y - h * .9, w * .72, h * .3);
        ctx.fillStyle = light < .35 ? '#ff3b3b' : dim('#a93226'); ctx.fillRect(x - w * .45, y - h * .45, w * .14, h * .1); ctx.fillRect(x + w * .31, y - h * .45, w * .14, h * .1);
    }
    ctx.restore();
}
function playerCar(ctx, x, y, steer, light) {
    const w = 170, h = 74, body = mix('#05070d', '#d64541', .35 + light * .65), dark = mix('#05070d', '#8e2420', .35 + light * .65);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 2, w * .56, 12, 0, 0, 7); ctx.fill();
    ctx.rotate(steer * .035);
    // Pneus
    ctx.fillStyle = '#121316'; J.rr(-w * .5, -h * .32, w * .17, h * .34, 5); ctx.fill(); J.rr(w * .33, -h * .32, w * .17, h * .34, 5); ctx.fill();
    // Carrosserie (dégradé) et toit
    const g = ctx.createLinearGradient(0, -h * 1.3, 0, 0); g.addColorStop(0, body); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-w * .48, -h * .12); ctx.lineTo(-w * .5, -h * .62); ctx.quadraticCurveTo(-w * .46, -h * .8, -w * .3, -h * .84); ctx.lineTo(w * .3, -h * .84); ctx.quadraticCurveTo(w * .46, -h * .8, w * .5, -h * .62); ctx.lineTo(w * .48, -h * .12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-w * .3, -h * .84); ctx.lineTo(-w * .22, -h * 1.26); ctx.lineTo(w * .22, -h * 1.26); ctx.lineTo(w * .3, -h * .84); ctx.closePath(); ctx.fill();
    // Lunette arrière avec reflet
    ctx.fillStyle = 'rgba(18,26,40,.92)'; ctx.beginPath(); ctx.moveTo(-w * .25, -h * .88); ctx.lineTo(-w * .19, -h * 1.2); ctx.lineTo(w * .19, -h * 1.2); ctx.lineTo(w * .25, -h * .88); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(-w * .14, -h * .9); ctx.lineTo(-w * .08, -h * 1.18); ctx.lineTo(-w * .02, -h * 1.18); ctx.lineTo(-w * .08, -h * .9); ctx.fill();
    // Aileron, feux, plaque, pots d'échappement
    ctx.fillStyle = dark; ctx.fillRect(-w * .44, -h * .9, w * .88, h * .07);
    const tail = light < .35 ? '#ff3030' : '#b3261e';
    ctx.fillStyle = tail; J.rr(-w * .46, -h * .6, w * .2, h * .12, 4); ctx.fill(); J.rr(w * .26, -h * .6, w * .2, h * .12, 4); ctx.fill();
    if (light < .35) { ctx.fillStyle = 'rgba(255,40,40,.25)'; ctx.beginPath(); ctx.arc(-w * .36, -h * .54, 26, 0, 7); ctx.arc(w * .36, -h * .54, 26, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#f1f1f1'; ctx.fillRect(-w * .1, -h * .42, w * .2, h * .12);
    ctx.fillStyle = '#2a2b30'; ctx.fillRect(-w * .38, -h * .18, w * .76, h * .08);
    ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.arc(-w * .3, -h * .1, 4, 0, 7); ctx.arc(-w * .22, -h * .1, 4, 0, 7); ctx.fill();
    ctx.restore();
}
