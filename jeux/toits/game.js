'use strict';
// ==================== Toits ====================
// Course sans fin sur 3 voies, vue de derrière en perspective.
// Gauche / droite : changer de voie. Espace / haut : sauter. Maj / bas : glisser.
// Obstacles : barrières basses (sauter), portiques (glisser), trains (changer de voie, ou monter
// dessus par une rampe). Pièces, aimant, super-saut. Chaque rangée laisse toujours un passage.
// (Toutes les grandeurs du monde sont en « unités » ; z = distance devant le joueur.)

const W = 900, H = 520, HORIZON = 175, F = 250, ZC = 2.6, CAMH = 2.7, LANEW = 1.35;
const G = 34, JUMP = 11.5, SUPER = 15.5, TRAIN_H = 2.3, RAMP = 3, SLIDE_T = .65;
let T = null;

Jeu.create({
    id: 'toits',
    modes: {
        classic: { desc: 'Cours sur les voies, évite trains et barrières, ramasse les pièces. Ça accélère.',
            rules: [['move-horizontal', 'Gauche / droite : changer de voie.'], ['arrow-up', 'Espace ou haut : sauter les barrières basses.'], ['arrow-down', 'Maj ou bas : glisser sous les portiques (en l\'air : redescendre vite).'], ['train-front', 'Les trains avec une rampe se grimpent : cours sur les toits !']] },
        nuit: { desc: 'La même course, de nuit et plus rapide dès le départ.', rules: [['moon', 'Départ à vitesse élevée.']] },
        duel: { duel: 'race', desc: 'Même parcours pour les deux. Le plus loin gagne.' },
    },
    size: [W, H],
    controls: [['<kbd>←</kbd> <kbd>→</kbd> / <kbd>Q</kbd> <kbd>D</kbd>', 'Changer de voie'], ['<kbd>Espace</kbd> <kbd>↑</kbd> <kbd>Z</kbd>', 'Sauter'], ['<kbd>Maj</kbd> <kbd>↓</kbd> <kbd>S</kbd>', 'Glisser']],
    touch: [['ArrowLeft', 'chevron-left'], ['ArrowDown', 'chevrons-down', 'Glisser'], ['Space', 'chevrons-up', 'Sauter'], ['ArrowRight', 'chevron-right']],
    help: 'Sur mobile : glisse le doigt à gauche, à droite, vers le haut ou vers le bas.',
    liveScore: () => Math.floor(T.dist),
    duelFormat: r => `${r.score} m`,
    progLabel: 'Sa distance',
    start() {
        const night = J.mode === 'nuit';
        T = { night, speed: night ? 19 : 14, dist: 0, coins: 0, lane: 0, x: 0, y: 0, vy: 0, ground: 0, slide: 0, onTrain: false, dead: false,
            objs: [], nextZ: 45, busy: [0, 0, 0], magnet: 0, sup: 0, run: 0, bump: 0, lastGap: 1 };
        while (T.nextZ < 140) genRow();
    },
    keydown(code) {
        if (T.dead) return;
        if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') moveLane(-1);
        if (code === 'ArrowRight' || code === 'KeyD') moveLane(1);
        if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ') jump();
        if (code === 'ArrowDown' || code === 'KeyS' || code === 'ShiftLeft' || code === 'ShiftRight') slide();
    },
    pointer(type, x, y) {
        if (type === 'down') T.sw = [x, y];
        if (type === 'up' && T.sw) {
            const dx = x - T.sw[0], dy = y - T.sw[1]; T.sw = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) { jump(); return; }
            if (Math.abs(dx) > Math.abs(dy)) moveLane(Math.sign(dx)); else if (dy < 0) jump(); else slide();
        }
    },
    update(dt) {
        if (T.dead) return;
        T.speed = Math.min(T.night ? 36 : 32, T.speed + dt * .22);
        const dz = T.speed * dt;
        T.dist += dz; T.run += dz;
        for (const o of T.objs) { o.z -= dz; if (o.z2 != null) o.z2 -= dz; }
        T.objs = T.objs.filter(o => (o.z2 ?? o.z) > -4 && !o.gone);
        T.nextZ -= dz;
        while (T.nextZ < 140) genRow();
        if (T.magnet > 0) T.magnet -= dt;
        if (T.sup > 0) T.sup -= dt;
        if (T.bump > 0) T.bump -= dt;
        // Déplacement latéral adouci
        T.x += (T.lane - T.x) * Math.min(1, dt * 14);
        // Sol sous le joueur : train (et sa rampe) ou rails
        const lane = Math.round(T.x);
        let ground = 0;
        for (const o of T.objs) if (o.type === 'train' && o.lane === lane) {
            if (o.z <= 0 && o.z2 >= 0 && T.y >= TRAIN_H - .45) ground = TRAIN_H;
            if (o.ramp && o.z - RAMP <= 0 && o.z >= 0) { const h = TRAIN_H * (1 - o.z / RAMP); if (T.y >= h - .6) ground = Math.max(ground, h); }
        }
        T.vy -= G * dt * (T.slide > 0 && T.y > ground ? 2.2 : 1);
        T.y += T.vy * dt;
        if (T.y <= ground) { if (T.vy < -14) { J.shake(3, .1); J.burst(laneX(T.x), groundY(0, ground) , 6, '#bbbbbb', 80, .3, 3); } T.y = ground; T.vy = 0; }
        T.onGround = T.y <= ground + .01;
        if (T.slide > 0) T.slide -= dt;
        // Collisions
        const h = T.slide > 0 ? .75 : 1.65;
        for (const o of T.objs) {
            if (o.lane !== lane && o.type !== 'coin' && o.type !== 'power') continue;
            if (o.type === 'coin' || o.type === 'power') {
                const reach = o.type === 'coin' && T.magnet > 0 ? 3 : .5;
                if (Math.abs(o.z) < .7 && (Math.abs(o.lane - T.x) < .45 || reach > 1) && Math.abs(o.h - (T.y + .8)) < (reach > 1 ? 4 : 1.2)) {
                    o.gone = true;
                    if (o.type === 'coin') { T.coins++; J.tone(1320, .04, 'square', .02); }
                    else { if (o.kind === 'magnet') T.magnet = 10; else T.sup = 10; J.sfx.good(); toast(o.kind === 'magnet' ? 'Aimant : 10 s' : 'Super-saut : 10 s', o.kind === 'magnet' ? 'magnet' : 'arrow-big-up', 1300); }
                }
                continue;
            }
            if (o.type === 'low' && Math.abs(o.z) < .35 && T.y < .7 && !T.onTrainTop) return die('Trébuché sur une barrière.');
            if (o.type === 'high' && Math.abs(o.z) < .35 && T.y < 1.9 && T.y + h > 1.05) return die('Assommé par un portique.');
            if (o.type === 'train' && o.z <= .3 && o.z2 >= 0 && T.y < TRAIN_H - .5) {
                const onRamp = o.ramp && o.z >= -.2 && T.y >= TRAIN_H * (1 - Math.max(0, o.z) / RAMP) - .7;
                if (!onRamp) return die('Percuté par un train.');
            }
        }
        if (T.speed > 24 && Math.random() < .3) J.burst(laneX(T.x) - 10 + Math.random() * 20, groundY(0, T.y) , 1, J.alpha('#ffffff', .6), 30, .3, 2);
        J.prog(Math.floor(T.dist) + ' m'); J.checkLive();
    },
    stats() { return [['Distance', Math.floor(T.dist).toLocaleString('fr-FR') + ' m'], ['Pièces', T.coins], ['Vitesse', Math.round(T.speed * 3.6) + ' km/h']]; },
    draw(ctx) {
        const c = J.c, night = T.night;
        // Ciel et ville au loin
        const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 40);
        if (night) { sky.addColorStop(0, '#05060f'); sky.addColorStop(1, '#232650'); } else { sky.addColorStop(0, c.light ? '#8fc3ee' : '#1a2338'); sky.addColorStop(1, c.light ? '#f6d7b0' : '#4a3550'); }
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        if (night) { ctx.fillStyle = '#f4f1de'; ctx.beginPath(); ctx.arc(720, 70, 24, 0, 7); ctx.fill(); }
        for (let i = 0; i < 26; i++) {
            const bw = 30 + (i * 37 % 40), bh = 40 + (i * 53 % 110), bx = ((i * 71 - T.run * .6) % (W + 200) + W + 200) % (W + 200) - 100;
            ctx.fillStyle = night ? '#141634' : c.light ? '#9aa9bd' : '#262b3d'; ctx.fillRect(bx, HORIZON - bh, bw, bh + 2);
            if (night) for (let wy = HORIZON - bh + 6; wy < HORIZON - 6; wy += 10) for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) if ((wx * 13 + wy * 7 + i) % 5 < 2) { ctx.fillStyle = '#f2cf6b'; ctx.fillRect(wx, wy, 3, 4); }
        }
        // Sol (ballast) en perspective
        ctx.fillStyle = night ? '#1b1a22' : c.light ? '#8d8172' : '#2a2620';
        ctx.beginPath(); ctx.moveTo(sx(-2.2, 120), HORIZON); ctx.lineTo(sx(2.2, 120), HORIZON); ctx.lineTo(sx(2.2, -2), H); ctx.lineTo(sx(-2.2, -2), H); ctx.fill();
        // Murs latéraux
        for (const side of [-1, 1]) {
            ctx.fillStyle = night ? '#232340' : c.light ? '#b6a993' : '#34302a';
            ctx.beginPath(); ctx.moveTo(sx(side * 2.2, 120), HORIZON); ctx.lineTo(sx(side * 2.2, 120), HORIZON - 8); ctx.lineTo(sx(side * 2.2, -2), H - 260); ctx.lineTo(sx(side * 2.2, -2), H); ctx.fill();
        }
        // Traverses qui défilent, puis rails
        ctx.fillStyle = night ? '#3a3036' : '#5a4632';
        const off = T.run % 2;
        for (let z = 60 - off; z > -2; z -= 2) { const y = groundY(z, 0), w = .55 * F / (z + ZC); for (let l = -1; l <= 1; l++) ctx.fillRect(sx(l * LANEW, z) - w, y - w * .08, w * 2, Math.max(1, w * .16)); }
        ctx.strokeStyle = night ? '#8a8fa8' : '#c9ccd2'; ctx.lineWidth = 2;
        for (let l = -1; l <= 1; l++) for (const k of [-.38, .38]) { ctx.beginPath(); ctx.moveTo(sx(l * LANEW + k, 70), groundY(70, 0)); ctx.lineTo(sx(l * LANEW + k, -1.5), groundY(-1.5, 0)); ctx.stroke(); }
        // Objets du plus loin au plus proche, avec le joueur à z = 0
        const list = T.objs.filter(o => o.z < 80 && (o.z2 ?? o.z) > -2).map(o => ({ o, z: o.type === 'train' ? Math.max(o.z, -1.5) : o.z }));
        list.push({ me: true, z: 0.01 });
        list.sort((a, b) => b.z - a.z);
        for (const it of list) it.me ? drawRunner(ctx) : drawObj(ctx, it.o);
        // Bonus actifs
        let bx = 16;
        if (T.magnet > 0) { J.text(`Aimant ${Math.ceil(T.magnet)} s`, bx, 22, 13, '#ffd166', 'left', 700); bx += 120; }
        if (T.sup > 0) J.text(`Super-saut ${Math.ceil(T.sup)} s`, bx, 22, 13, '#7bdff2', 'left', 700);
        J.text(`${Math.floor(T.dist)} m · ${T.coins} pièces`, W - 16, 22, 15, '#ffffff', 'right', 700, true);
        J.speedLines((T.speed - 22) / 14, 'radial');
    },
});

// ---------- Projection ----------
const sx = (x, z) => W / 2 + (x - T.x * LANEW * .55) * F / (z + ZC);
const groundY = (z, h) => HORIZON + (CAMH + T.y * .35 - h) * F / (z + ZC);
const laneX = l => sx(l * LANEW, 0);

// ---------- Génération : une rangée à la fois, toujours au moins une voie praticable ----------
function genRow() {
    const z = T.nextZ, prog = Math.min(1, T.dist / 2500);
    const free = [0, 1, 2].filter(l => T.busy[l] < z);
    // Voie garantie libre pour cette rangée (elle bouge peu d'une rangée à l'autre)
    let gap = T.lastGap;
    if (!free.includes(gap) || J.rng() < .35) gap = free.length ? J.pick(free) : 1;
    T.lastGap = gap;
    for (const l of free) {
        if (l === gap) {
            if (J.rng() < .55) coinsLine(l - 1, z, 0.7);
            continue;
        }
        const r = J.rng();
        if (r < .3 + prog * .2) {
            const len = J.rand(8, 16 + prog * 14), ramp = J.rng() < .45;
            T.objs.push({ type: 'train', lane: l - 1, z, z2: z + len, ramp, col: J.pick(['#c0392b', '#2e86de', '#16a085', '#e67e22', '#8e44ad']) });
            T.busy[l] = z + len + 4;
            if (ramp && J.rng() < .7) coinsLine(l - 1, z + 1, TRAIN_H + .7, Math.floor(len / 1.5));
        } else if (r < .55 + prog * .15) { T.objs.push({ type: 'low', lane: l - 1, z }); if (J.rng() < .5) coinsArc(l - 1, z); }
        else if (r < .75 + prog * .1) T.objs.push({ type: 'high', lane: l - 1, z });
        else if (J.rng() < .4) coinsLine(l - 1, z, .7);
    }
    if (J.rng() < .04) T.objs.push({ type: 'power', lane: gap - 1, z: z + 3, h: 1, kind: J.rng() < .5 ? 'magnet' : 'super' });
    T.nextZ += J.rand(9, 13) * (1 - prog * .3) + T.speed * .12;
}
function coinsLine(lane, z, h, n = 5) { for (let k = 0; k < n; k++) T.objs.push({ type: 'coin', lane, z: z + k * 1.5, h }); }
function coinsArc(lane, z) { for (let k = -2; k <= 2; k++) T.objs.push({ type: 'coin', lane, z: z + k * 1.1, h: .7 + (2.2 - k * k * .45) }); }

// ---------- Actions ----------
function moveLane(d) {
    const target = J.clamp(T.lane + d, -1, 1);
    if (target === T.lane) { J.shake(3, .1); return; }
    // On ne rentre pas dans le flanc d'un train (sauf si on est assez haut)
    const blocked = T.objs.some(o => o.type === 'train' && o.lane === target && o.z < .4 && o.z2 > -.4 && T.y < TRAIN_H - .4);
    if (blocked) { J.shake(6, .18); J.tone(140, .08, 'square', .03); T.bump = .3; return; }
    T.lane = target; J.tone(500, .03, 'triangle', .02);
}
function jump() { if (!T.onGround && T.y > .05) return; T.vy = T.sup > 0 ? SUPER : JUMP; T.slide = 0; J.sfx.jump(); }
function slide() { T.slide = SLIDE_T; if (!T.onGround) T.vy = Math.min(T.vy, -18); J.tone(200, .08, 'sawtooth', .015); }
function die(why) {
    T.dead = true; J.sfx.boom(); J.shake(14, .45);
    J.burst(laneX(T.x), groundY(0, T.y + .8), 40, J.c.accent, 260, .8, 4, 400);
    J.end({ score: Math.floor(T.dist), title: why, text: `${Math.floor(T.dist).toLocaleString('fr-FR')} m et ${T.coins} pièces.` });
}

// ---------- Dessin ----------
function box(ctx, lane, z1, z2, h0, h1, wHalf, front, top, side) {
    const x = lane * LANEW, near = Math.max(z1, -1.5);
    const fl = sx(x - wHalf, near), fr = sx(x + wHalf, near), ft = groundY(near, h1), fb = groundY(near, h0);
    if (z2 > near) {
        const bl = sx(x - wHalf, z2), br = sx(x + wHalf, z2), bt = groundY(z2, h1);
        ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(fl, ft); ctx.lineTo(bl, bt); ctx.lineTo(br, bt); ctx.lineTo(fr, ft); ctx.fill();
        const bb = groundY(z2, h0);
        ctx.fillStyle = side;
        if (bl > fl) { ctx.beginPath(); ctx.moveTo(fl, ft); ctx.lineTo(bl, bt); ctx.lineTo(bl, bb); ctx.lineTo(fl, fb); ctx.fill(); }
        if (br < fr) { ctx.beginPath(); ctx.moveTo(fr, ft); ctx.lineTo(br, bt); ctx.lineTo(br, bb); ctx.lineTo(fr, fb); ctx.fill(); }
    }
    ctx.fillStyle = front; ctx.fillRect(fl, ft, fr - fl, fb - ft);
    return { fl, fr, ft, fb };
}
function drawObj(ctx, o) {
    const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.round(v * k); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; };
    if (o.type === 'train') {
        if (o.ramp && o.z > -1) { // rampe : un plan incliné devant le train
            const x = o.lane * LANEW, z0 = o.z - RAMP;
            ctx.fillStyle = '#8b8f99'; ctx.beginPath();
            ctx.moveTo(sx(x - .55, Math.max(z0, -1.5)), groundY(Math.max(z0, -1.5), 0)); ctx.lineTo(sx(x - .55, o.z), groundY(o.z, TRAIN_H)); ctx.lineTo(sx(x + .55, o.z), groundY(o.z, TRAIN_H)); ctx.lineTo(sx(x + .55, Math.max(z0, -1.5)), groundY(Math.max(z0, -1.5), 0)); ctx.fill();
            ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx(x, Math.max(z0, -1.5)), groundY(Math.max(z0, -1.5), 0)); ctx.lineTo(sx(x, o.z), groundY(o.z, TRAIN_H)); ctx.stroke();
        }
        const r = box(ctx, o.lane, o.z, o.z2, 0, TRAIN_H, .6, shade(o.col, .85), shade(o.col, 1.05), shade(o.col, .6));
        if (o.z > -1.4) { // face avant : vitre et phares
            const w = r.fr - r.fl, hh = r.fb - r.ft;
            ctx.fillStyle = 'rgba(20,28,40,.9)'; ctx.fillRect(r.fl + w * .12, r.ft + hh * .12, w * .76, hh * .3);
            ctx.fillStyle = T.night ? '#fff6c4' : '#f4f4f4'; ctx.fillRect(r.fl + w * .12, r.ft + hh * .72, w * .14, hh * .08); ctx.fillRect(r.fr - w * .26, r.ft + hh * .72, w * .14, hh * .08);
            ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(r.fl, r.ft + hh * .52, w, Math.max(1, hh * .05));
        }
    } else if (o.type === 'low') {
        const r = box(ctx, o.lane, o.z, o.z + .25, 0, .7, .62, '#e8e8e8', '#ffffff', '#b0b0b0');
        const w = r.fr - r.fl; ctx.fillStyle = '#d63031'; for (let k = 0; k < 4; k++) ctx.fillRect(r.fl + k * w / 4, r.ft, w / 8, (r.fb - r.ft) * .45);
    } else if (o.type === 'high') {
        for (const s of [-.58, .58]) box(ctx, o.lane + s / LANEW, o.z, o.z + .15, 0, 1.95, .05, '#7f8c8d', '#95a5a6', '#5d6d7e');
        const r = box(ctx, o.lane, o.z, o.z + .2, 1.1, 1.95, .62, '#f1c40f', '#f7dc6f', '#b7950b');
        const w = r.fr - r.fl; ctx.fillStyle = '#1d1d1d'; for (let k = 0; k < 5; k++) ctx.fillRect(r.fl + k * w / 5 + w / 20, r.ft, w / 10, r.fb - r.ft);
    } else if (o.type === 'coin' || o.type === 'power') {
        let lane = o.lane;
        if (o.type === 'coin' && T.magnet > 0 && o.z < 12) { lane = J.lerp(o.lane, T.x, Math.max(0, 1 - o.z / 12)); }
        const x = sx(lane * LANEW, o.z), y = groundY(o.z, o.h), r = .28 * F / (o.z + ZC);
        if (r < 1) return;
        if (o.type === 'coin') { const sq = Math.abs(Math.sin(T.run * .8 + o.z)); ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.ellipse(x, y, r * (.3 + sq * .7), r, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#d4ac0d'; ctx.beginPath(); ctx.ellipse(x, y, r * (.3 + sq * .7) * .55, r * .55, 0, 0, 7); ctx.fill(); }
        else { ctx.fillStyle = o.kind === 'magnet' ? '#ff6b6b' : '#7bdff2'; ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 ${r * 1.6}px ${J.c.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.kind === 'magnet' ? 'U' : '↑', x, y + 1); }
    }
}
function drawRunner(ctx) {
    const x = laneX(T.x), y = groundY(0, T.y), s = F / ZC / 100; // ~1 px par cm
    const col = T.night ? '#e9ecff' : J.c.light ? '#16181d' : '#f2f2f2';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, groundY(0, T.ground || 0), 26 * s, 7 * s, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y);
    if (T.bump > 0) ctx.rotate(Math.sin(T.bump * 40) * .08);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = 9 * s;
    if (T.slide > 0 && T.onGround) {
        ctx.beginPath(); ctx.arc(0, -42 * s, 12 * s, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -34 * s); ctx.lineTo(0, -12 * s); ctx.moveTo(-20 * s, -4 * s); ctx.lineTo(0, -12 * s); ctx.lineTo(20 * s, -4 * s); ctx.stroke();
    } else {
        const ph = T.onGround ? Math.sin(T.run * 1.2) : .6;
        ctx.beginPath(); ctx.arc(0, -150 * s, 14 * s, 0, 7); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -134 * s); ctx.lineTo(0, -80 * s);
        ctx.moveTo(0, -80 * s); ctx.lineTo(-14 * s, (-40 + ph * 14) * s); ctx.lineTo(-14 * s, (ph > 0 ? -2 : -14) * s);
        ctx.moveTo(0, -80 * s); ctx.lineTo(14 * s, (-40 - ph * 14) * s); ctx.lineTo(14 * s, (ph < 0 ? -2 : -14) * s);
        ctx.moveTo(0, -126 * s); ctx.lineTo(-26 * s, (-100 - ph * 16) * s);
        ctx.moveTo(0, -126 * s); ctx.lineTo(26 * s, (-100 + ph * 16) * s);
        ctx.stroke();
        ctx.fillStyle = J.c.accent; J.rr(-16 * s, -132 * s, 32 * s, 40 * s, 8 * s); ctx.fill(); // sac à dos
    }
    ctx.restore();
}
