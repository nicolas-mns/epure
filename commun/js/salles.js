'use strict';
// ==================== Moteur de salles (Élan et Gravité) ====================
// Un niveau = plusieurs salles reliées (gauche, droite, haut, bas). On passe d'une salle à l'autre
// en sortant par une ouverture ; chaque salle se souvient de ce qui s'y est passé (clés prises,
// portes ouvertes, gemmes ramassées), et l'état des interrupteurs rouge / bleu vaut pour tout le niveau.
// Une mort ramène à l'entrée de la salle actuelle.
//
// Les salles sont des modèles en texte (24 × 14 cases), assemblés au hasard (graine = numéro du niveau).
// Ouvertures normalisées : gauche/droite = lignes 9 à 11 ; haut/bas = colonnes 10 à 13.
// Légende commune :
//   #  mur              .  vide             ^  pics            ?  pics selon la difficulté
//   o  scie (va-et-vient horizontal)        O  scie verticale  !  scie selon la difficulté
//   =  plateforme fragile (se brise, revient)   x  interrupteur   r / b  blocs rouges / bleus
//   *  gemme            L  laser (s'allume et s'éteint)       @  point spécial (départ, sortie, clé)
// Élan seulement : C canon, B chauve-souris, | liane, > < accélérateur, J ressort, ~ zone de ralenti.

const SAL = { T: 36, CW: 24, CH: 14 };
SAL.W = SAL.T * SAL.CW; SAL.H = SAL.T * SAL.CH;
const TILE = { EMPTY: 0, WALL: 1, SPIKE: 2, CRUMBLE: 3, DOOR: 4, RED: 5, BLUE: 6, VINE: 7, BOOSTR: 8, BOOSTL: 9, SPRING: 10, SLOW: 11, SWITCH: 12, EXIT: 13 };
const DIRS4 = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
const OPP = { L: 'R', R: 'L', T: 'B', B: 'T' };

// ---------- Modèles ----------
function salOpenings(rows) {
    const o = new Set(), at = (x, y) => rows[y][x];
    if ([9, 10, 11].every(y => at(0, y) === '.')) o.add('L');
    if ([9, 10, 11].every(y => at(23, y) === '.')) o.add('R');
    if ([10, 11, 12, 13].every(x => at(x, 0) === '.')) o.add('T');
    if ([10, 11, 12, 13].every(x => at(x, 13) === '.')) o.add('B');
    return o;
}
function salMirror(rows) { return rows.map(r => [...r].reverse().map(ch => ch === '>' ? '<' : ch === '<' ? '>' : ch).join('')); }
function salPrepare(list) {
    const out = [];
    for (const t of list) {
        for (const mir of [false, true]) {
            const rows = mir ? salMirror(t.rows) : t.rows.slice();
            if (rows.length !== SAL.CH || rows.some(r => r.length !== SAL.CW)) { console.warn('Salle mal formée :', t.name, rows.map(r => r.length)); continue; }
            out.push({ name: t.name + (mir ? ' (miroir)' : ''), tier: t.tier || 1, rows, open: salOpenings(rows), noBranch: /[xrb]/.test(rows.join('')) });
            if (t.symmetric) break;
        }
    }
    return out;
}

// ---------- Génération d'un niveau ----------
function salLevel(n, templates, salt) {
    const rng = mulberry32(n * 7919 + salt), R = (a, b) => a + Math.floor(rng() * (b - a + 1)), pick = a => a[Math.floor(rng() * a.length)];
    const maxTier = n < 12 ? 1 : n < 45 ? 2 : 3;
    const count = Math.min(9, 2 + Math.floor(n / 11));
    for (let attempt = 0; attempt < 60; attempt++) {
        // Chemin principal : marche aléatoire sur une grille, sans repasser
        const path = [[0, 0]], used = new Set(['0,0']);
        let ok = true;
        while (path.length < count && ok) {
            const [x, y] = path[path.length - 1];
            const opts = [['R', 5], ['T', 2], ['B', 2], ['L', 1]].filter(([d]) => !used.has((x + DIRS4[d][0]) + ',' + (y + DIRS4[d][1])));
            if (!opts.length) { ok = false; break; }
            let tot = opts.reduce((a, o) => a + o[1], 0), r = rng() * tot, d = opts[0][0];
            for (const [dd, w] of opts) { if ((r -= w) < 0) { d = dd; break; } }
            const nx = x + DIRS4[d][0], ny = y + DIRS4[d][1];
            path.push([nx, ny]); used.add(nx + ',' + ny);
        }
        if (!ok) continue;
        const rooms = path.map(([x, y], i) => ({ gx: x, gy: y, need: new Set(), main: i }));
        for (let i = 0; i < rooms.length - 1; i++) {
            const a = rooms[i], b = rooms[i + 1], d = Object.keys(DIRS4).find(k => DIRS4[k][0] === b.gx - a.gx && DIRS4[k][1] === b.gy - a.gy);
            a.need.add(d); b.need.add(OPP[d]);
            a.next = d;
        }
        // Branche avec une clé, et une porte plus loin sur le chemin
        const keys = n >= 6 ? (n >= 40 && count >= 5 ? 2 : 1) : 0;
        const doors = [];
        let branchOk = true;
        for (let k = 0; k < keys; k++) {
            const cands = [];
            for (let i = 0; i < path.length - 1; i++) for (const d of Object.keys(DIRS4)) {
                const r0 = rooms[i], nx = r0.gx + DIRS4[d][0], ny = r0.gy + DIRS4[d][1];
                if (!used.has(nx + ',' + ny) && r0.main !== undefined) cands.push([i, d, nx, ny]);
            }
            if (!cands.length) { branchOk = false; break; }
            const [i, d, nx, ny] = pick(cands);
            rooms[i].need.add(d);
            rooms.push({ gx: nx, gy: ny, need: new Set([OPP[d]]), branch: true, key: true, parent: i });
            used.add(nx + ',' + ny);
            const j = R(i, rooms.filter(r => r.main !== undefined).length - 2);
            doors.push(j);
        }
        if (!branchOk) continue;
        // Choix des modèles : il faut au moins les ouvertures demandées (les autres seront murées)
        let fail = false;
        for (const r of rooms) {
            const parentOfBranch = rooms.some(b => b.branch && b.parent === r.main);
            const cands = templates.filter(t => t.tier <= maxTier && [...r.need].every(d => t.open.has(d)) && !(r.branch && t.noBranch) && !(parentOfBranch && t.noBranch));
            if (!cands.length) { fail = true; break; }
            // Préférer les modèles du niveau de difficulté actuel
            const top = cands.filter(t => t.tier === maxTier);
            r.tpl = pick(top.length && rng() < .6 ? top : cands);
        }
        if (fail) continue;
        const pOpt = Math.min(.9, .1 + n / 110), pSaw = Math.min(.75, Math.max(0, (n - 8) / 110));
        const level = { n, rooms: new Map(), start: null, gems: 0 };
        rooms.forEach((r, idx) => {
            const rows = r.tpl.rows.map(s => [...s]);
            // Murer les ouvertures inutilisées
            for (const d of r.tpl.open) if (!r.need.has(d)) {
                if (d === 'L') [9, 10, 11].forEach(y => { rows[y][0] = '#'; });
                if (d === 'R') [9, 10, 11].forEach(y => { rows[y][23] = '#'; });
                if (d === 'T') [10, 11, 12, 13].forEach(x => { rows[0][x] = '#'; });
                if (d === 'B') [10, 11, 12, 13].forEach(x => { rows[13][x] = '#'; rows[12][x] = rows[12][x] === '.' ? '#' : rows[12][x]; });
            }
            // Porte verrouillée dans l'ouverture vers la salle suivante
            if (r.main !== undefined && doors.includes(r.main) && r.next) {
                const d = r.next;
                if (d === 'L') [9, 10, 11].forEach(y => { rows[y][0] = 'D'; });
                if (d === 'R') [9, 10, 11].forEach(y => { rows[y][23] = 'D'; });
                if (d === 'T') [10, 11, 12, 13].forEach(x => { rows[0][x] = 'D'; });
                if (d === 'B') [10, 11, 12, 13].forEach(x => { rows[12][x] = 'D'; });
            }
            // Point spécial, options de difficulté
            for (let y = 0; y < SAL.CH; y++) for (let x = 0; x < SAL.CW; x++) {
                const ch = rows[y][x];
                if (ch === '@') rows[y][x] = idx === 0 ? 'P' : r.main === rooms.filter(q => q.main !== undefined).length - 1 ? 'E' : r.key ? 'K' : (rng() < .5 ? '*' : '.');
                else if (ch === '?') rows[y][x] = rng() < pOpt ? '^' : '.';
                else if (ch === '!') rows[y][x] = rng() < pSaw ? 'o' : '.';
            }
            const room = salBuildRoom(rows, r.gx, r.gy);
            room.branch = !!r.branch; room.main = r.main;
            level.gems += room.items.filter(it => it.kind === 'gem').length;
            level.rooms.set(r.gx + ',' + r.gy, room);
            if (idx === 0) level.start = room;
        });
        return level;
    }
    return null;
}
function salBuildRoom(rows, gx, gy) {
    const g = new Uint8Array(SAL.CW * SAL.CH), items = [], ents = [], spawn = { x: 2.5, y: 11 };
    const map = { '#': 1, '^': 2, '=': 3, 'D': 4, 'r': 5, 'b': 6, '|': 7, '>': 8, '<': 9, 'J': 10, '~': 11, 'x': 12, 'E': 13 };
    for (let y = 0; y < SAL.CH; y++) for (let x = 0; x < SAL.CW; x++) {
        const ch = rows[y][x];
        if (map[ch] !== undefined) g[y * SAL.CW + x] = map[ch];
        if (ch === '*') items.push({ kind: 'gem', x, y });
        if (ch === 'K') items.push({ kind: 'key', x, y });
        if (ch === 'P') { spawn.x = x + .5; spawn.y = y + 1; }
        if ('oOCBL'.includes(ch)) ents.push({ ch, x, y });
    }
    return { gx, gy, g, items, ents, spawn, seen: false, doorsOpen: false };
}

// ---------- Jeu ----------
function sallesJeu(cfg) {
    const T = SAL.T, kindJump = cfg.kind === 'jump';
    const templates = salPrepare(cfg.templates);
    let S = null;
    const progress = () => store.get(cfg.id + 'Progress', { max: 1, best: {} });
    const LEVEL_PICK = {
        defaults: { level: 1 },
        setup(box, o, save) {
            const p = progress();
            box.innerHTML = `<p class="section-title">Niveau</p><div class="lvl-grid">${Array.from({ length: 100 }, (_, i) => {
                const n = i + 1, locked = n > p.max, best = p.best[n];
                return `<button data-n="${n}" class="${o.level === n ? 'active' : ''} ${locked ? 'locked' : ''} ${best ? 'done' : ''}" ${locked ? 'disabled' : ''} title="${best ? 'Record : ' + fmtTime(best) : locked ? 'Verrouillé' : 'Niveau ' + n}">${n}</button>`;
            }).join('')}</div><p class="muted lvl-note">${p.max - 1} niveau${p.max > 2 ? 'x' : ''} terminé${p.max > 2 ? 's' : ''} sur 100.</p>`;
            if (o.level > p.max) o.level = p.max;
            box.querySelectorAll('button[data-n]').forEach(b => b.onclick = () => { o.level = +b.dataset.n; save(); box.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); });
        },
    };
    const rules = cfg.rules;

    Jeu.create({
        id: cfg.id,
        modes: {
            niveaux: Object.assign({ desc: cfg.desc, rules }, LEVEL_PICK),
            duel: { duel: 'race', desc: 'Même niveau pour les deux, avec le fantôme de ton adversaire quand il est dans ta salle. Le premier à la sortie gagne.',
                options: [{ id: 'tier', label: 'Difficulté du niveau', def: 2, choices: [[1, 'Facile', 'niveaux 5 à 25'], [2, 'Moyen', 'niveaux 30 à 60'], [3, 'Difficile', 'niveaux 65 à 100']] }] },
        },
        size: [SAL.W, SAL.H],
        maxScale: 1.4,
        controls: cfg.controls,
        touch: cfg.touch,
        help: cfg.help,
        sub() { return J.mode === 'niveaux' ? J.opts.level : J.opts.tier; },
        duelCompare: (a, b) => (a.won - b.won) || (b.time - a.time),
        duelFormat: r => r.won ? fmtTime(r.time) : 'abandon',
        progLabel: 'Sa salle',
        start() {
            const n = J.mode === 'duel' ? [0, 5, 30, 65][J.opts.tier] + Math.floor(J.rng() * [0, 21, 31, 36][J.opts.tier]) : J.opts.level;
            const level = salLevel(n, templates, cfg.salt);
            S = { n, level, room: level.start, keys: 0, gems: 0, deaths: 0, sw: 0, swCool: 0, ghost: null, net: 0, bullets: [], flash: 0, trans: 0, msg: '', msgT: 0 };
            S.p = newPlayer(level.start.spawn.x * T, level.start.spawn.y * T);
            enterRoom(level.start, true);
        },
        keydown(code) {
            if (['Space', 'ArrowUp', 'KeyW', 'KeyZ'].includes(code)) { S.p.jumpBuf = .14; S.p.jumpKey = code; }
        },
        update(dt) {
            if (S.dead > 0) { S.dead -= dt; if (S.dead <= 0) respawn(); return; }
            if (S.msgT > 0) S.msgT -= dt;
            if (S.swCool > 0) S.swCool -= dt;
            const p = S.p;
            kindJump ? physJump(p, dt) : physFlip(p, dt);
            // Interrupteur sous les pieds : une bascule par contact
            const under = p.ground ? [Math.floor(p.x / T), Math.floor((p.y + 3 * p.g) / T)] : null;
            const ui = under && tileAt(under[0], under[1]) === TILE.SWITCH ? under[1] * SAL.CW + under[0] : null;
            if (ui != null && p.underSw !== ui) pressSwitch();
            p.underSw = ui;
            stepEntities(dt);
            checkHazards();
            checkEdges();
            if (J.duel.on) { S.net -= dt; if (S.net <= 0) { S.net = .08; J.duel.send('pos', [S.room.gx, S.room.gy, Math.round(p.x), Math.round(p.y), p.g || 1, p.crouch ? 1 : 0]); J.prog(`Salle ${[...S.level.rooms.values()].filter(r => r.seen).length}`); } }
        },
        onDuel(e, p) { if (e === 'pos') S.ghost = p; },
        stats() {
            const rows = [['Niveau', S.n]];
            if (S.level.gems) rows.push(['Gemmes', `${S.gems}/${S.level.gems}`]);
            rows.push(['Clés', S.keys], ['Morts', S.deaths]);
            return rows;
        },
        draw(ctx) { drawRoom(ctx); },
        // Accès pour les tests automatiques (outils, console)
        debug: () => ({ S, enterRoom, TILE, SAL }),
    });

    // ---------- Joueur ----------
    function newPlayer(x, y) { return { x, y, vx: 0, vy: 0, g: 1, ground: false, crouch: false, slide: 0, wall: 0, wallLock: 0, coyote: 0, jumpBuf: 0, climb: false, dash: 0, onCrumble: null, crumbleT: 0, face: 1, flipCool: 0 }; }
    const height = p => p.crouch ? T * .72 : T * 1.4;
    const tileAt = (tx, ty) => tx < 0 || tx >= SAL.CW || ty < 0 || ty >= SAL.CH ? -1 : S.room.g[ty * SAL.CW + tx];
    function solid(tx, ty) {
        const v = tileAt(tx, ty);
        if (v === -1) return false; // hors salle : géré par les transitions
        if (v === TILE.WALL || v === TILE.DOOR || v === TILE.BOOSTR || v === TILE.BOOSTL || v === TILE.SPRING || v === TILE.SWITCH) return true;
        if (v === TILE.CRUMBLE) return !S.room.broken || !S.room.broken[ty * SAL.CW + tx];
        if (v === TILE.RED) return S.sw === 0;
        if (v === TILE.BLUE) return S.sw === 1;
        return false;
    }
    // Boîte du joueur : (x, y) = milieu des pieds ; en gravité inversée, y = milieu de la tête posée au plafond
    function box(p, h = height(p)) { return p.g > 0 ? { l: p.x - T * .3, r: p.x + T * .3, t: p.y - h, b: p.y } : { l: p.x - T * .3, r: p.x + T * .3, t: p.y, b: p.y + h }; }
    function tilesIn(b) { const o = []; for (let y = Math.floor(b.t / T); y <= Math.floor((b.b - .01) / T); y++) for (let x = Math.floor(b.l / T); x <= Math.floor((b.r - .01) / T); x++) o.push([x, y]); return o; }
    function moveX(p) {
        const b = box(p);
        for (const [tx, ty] of tilesIn(b)) if (solid(tx, ty)) {
            if (p.vx > 0) p.x = tx * T - T * .3 - .01; else if (p.vx < 0) p.x = (tx + 1) * T + T * .3 + .01;
            p.vx = 0; return true;
        }
        return false;
    }
    function moveY(p) {
        const b = box(p);
        let landed = false;
        for (const [tx, ty] of tilesIn(b)) if (solid(tx, ty)) {
            const h = height(p);
            if (p.vy * p.g > 0) { // vers le « sol »
                if (p.g > 0) p.y = ty * T - .01; else p.y = (ty + 1) * T + .01;
                landed = true; onLand(p, tx, ty);
            } else { if (p.g > 0) p.y = (ty + 1) * T + h + .01; else p.y = ty * T - h - .01; bump(tx, ty); }
            p.vy = 0;
            break;
        }
        return landed;
    }
    function onLand(p, tx, ty) {
        const v = tileAt(tx, ty);
        if (v === TILE.SPRING) { p.vy = -1080 * p.g; J.tone(300, .12, 'square', .04, 500); J.burst(p.x, p.y, 10, '#f5b041', 160, .4, 3); p.springT = .15; return; }
        if (v === TILE.BOOSTR || v === TILE.BOOSTL) { p.dash = .42; p.vx = (v === TILE.BOOSTR ? 1 : -1) * 760; J.tone(500, .15, 'sawtooth', .03, 500); J.shake(3, .12); }
        if (v === TILE.CRUMBLE) { p.onCrumble = ty * SAL.CW + tx; }
    }
    function bump(tx, ty) { if (tileAt(tx, ty) === TILE.SWITCH) pressSwitch(tx, ty); }
    function pressSwitch() {
        if (S.swCool > 0) return;
        S.swCool = .7; S.sw ^= 1;
        J.tone(S.sw ? 880 : 440, .12, 'square', .04); J.shake(4, .15);
        flash(S.sw ? 'Blocs bleus solides' : 'Blocs rouges solides');
    }
    const keyDown = (...codes) => codes.some(c => J.keys.has(c));

    // Physique « saut » (Élan) : courir, sauter, saut mural, glissade, lianes, ressorts, accélérateurs
    function physJump(p, dt) {
        const left = keyDown('ArrowLeft', 'KeyA', 'KeyQ'), right = keyDown('ArrowRight', 'KeyD'), up = keyDown('ArrowUp', 'KeyW', 'KeyZ'), down = keyDown('ArrowDown', 'KeyS');
        const slideKey = down || J.slideHeld();
        const dir = (right ? 1 : 0) - (left ? 1 : 0);
        if (dir) p.face = dir;
        // Liane
        const cx = Math.floor(p.x / T), midY = Math.floor((p.y - T * .7) / T);
        const onVine = tileAt(cx, midY) === TILE.VINE || tileAt(cx, Math.floor((p.y - 2) / T)) === TILE.VINE;
        if (onVine && (up || (down && !p.ground)) && !p.climb && !(p.jumpBuf > 0 && p.jumpKey === 'Space')) { p.climb = true; p.vx = 0; p.jumpBuf = 0; }
        if (p.climb && !onVine) p.climb = false;
        if (p.climb) {
            p.vy = up ? -170 : down ? 170 : 0; p.vx = dir * 120;
            if (p.jumpBuf > 0 && p.jumpKey === 'Space') { p.climb = false; p.vy = -560; p.vx = dir * 260; p.jumpBuf = 0; J.sfx.jump(); }
            else p.jumpBuf = 0;
            p.x += p.vx * dt; moveX(p); p.y += p.vy * dt; if (moveY(p)) { p.ground = true; p.climb = false; }
            return;
        }
        // Glissade (Maj ou bas) : accroupi, et élan si on courait
        if (slideKey && p.ground && !p.crouch) { p.crouch = true; if (Math.abs(p.vx) > 140) { p.slide = .5; p.vx = Math.sign(p.vx) * Math.max(Math.abs(p.vx), 380); J.tone(200, .1, 'sawtooth', .015); J.burst(p.x, p.y, 6, '#bbbbbb', 70, .3, 3); } }
        if (p.crouch && !slideKey && !blockedAbove(p)) { p.crouch = false; p.slide = 0; }
        if (p.slide > 0) p.slide -= dt;
        if (p.dash > 0) p.dash -= dt;
        const max = p.crouch && p.slide <= 0 ? 120 : 270;
        if (p.dash > 0) { /* l'accélérateur impose sa vitesse */ }
        else if (p.slide > 0) p.vx *= Math.pow(.5, dt);
        else if (dir) p.vx += dir * (p.ground ? 1900 : 1250) * dt;
        else if (p.ground) p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), 2300 * dt);
        if (p.dash <= 0 && p.slide <= 0) p.vx = J.clamp(p.vx, -max, max);
        if (p.jumpBuf > 0) p.jumpBuf -= dt;
        if (p.coyote > 0) p.coyote -= dt;
        if (p.wallLock > 0) p.wallLock -= dt;
        if (p.jumpBuf > 0) {
            if ((p.ground || p.coyote > 0) && !(p.crouch && blockedAbove(p))) { p.vy = -640; p.ground = false; p.coyote = 0; p.jumpBuf = 0; p.crouch = false; p.slide = 0; J.sfx.jump(); }
            else if (p.wall) { p.vy = -600; p.vx = -p.wall * 300; p.wall = 0; p.jumpBuf = 0; p.wallLock = .15; J.tone(420, .07, 'square', .025, 200); J.burst(p.x + p.wall * 10, p.y - 20, 5, '#cccccc', 80, .25, 3); }
        }
        const held = keyDown('Space', 'ArrowUp', 'KeyW', 'KeyZ');
        p.vy += 1850 * (p.vy < 0 && !held && !p.springT ? 1.9 : 1) * dt;
        if (p.springT > 0) p.springT -= dt;
        if (p.wall && p.vy > 110) p.vy = 110;
        p.vy = Math.min(p.vy, 900);
        p.x += p.vx * dt; moveX(p);
        p.wall = 0;
        if (!p.ground) {
            const h = height(p);
            if (solidAtPx(p.x + T * .32, p.y - h * .6) && (right || p.wallLock <= 0 && solidAtPx(p.x + T * .32, p.y - 4))) p.wall = 1;
            if (solidAtPx(p.x - T * .32, p.y - h * .6) && (left || p.wallLock <= 0 && solidAtPx(p.x - T * .32, p.y - 4))) p.wall = -1;
        }
        const was = p.ground;
        p.y += p.vy * dt;
        p.ground = moveY(p) || (p.vy === 0 && solidAtPx(p.x - T * .28, p.y + 2) || p.vy === 0 && solidAtPx(p.x + T * .28, p.y + 2));
        if (was && !p.ground && p.vy >= 0) p.coyote = .09;
        crumbleStep(p, dt);
    }
    // Physique « gravité » : marcher, inverser la gravité quand on touche une surface
    function physFlip(p, dt) {
        const left = keyDown('ArrowLeft', 'KeyA', 'KeyQ'), right = keyDown('ArrowRight', 'KeyD');
        const dir = (right ? 1 : 0) - (left ? 1 : 0);
        if (dir) p.face = dir;
        if (dir) p.vx += dir * (p.ground ? 2000 : 1300) * dt; else p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), (p.ground ? 2400 : 900) * dt);
        p.vx = J.clamp(p.vx, -240, 240);
        if (p.jumpBuf > 0) p.jumpBuf -= dt;
        if (p.flipCool > 0) p.flipCool -= dt;
        if (p.jumpBuf > 0 && (p.ground || p.coyote > 0) && p.flipCool <= 0) {
            // Bascule : la boîte pivote autour du milieu du corps
            const h = height(p);
            p.y = p.g > 0 ? p.y - h : p.y + h;
            p.g = -p.g; p.vy = 0; p.ground = false; p.jumpBuf = 0; p.coyote = 0; p.flipCool = .12;
            J.tone(p.g > 0 ? 330 : 550, .07, 'triangle', .035, p.g > 0 ? -120 : 120);
            J.burst(p.x, p.y, 8, J.c.accent, 100, .3, 3);
        }
        if (p.coyote > 0) p.coyote -= dt;
        p.vy += 1900 * p.g * dt;
        p.vy = J.clamp(p.vy, -950, 950);
        p.x += p.vx * dt; moveX(p);
        const was = p.ground;
        p.y += p.vy * dt;
        p.ground = moveY(p) || (p.vy === 0 && (p.g > 0 ? solidAtPx(p.x, p.y + 2) : solidAtPx(p.x, p.y - 2)));
        if (was && !p.ground) p.coyote = .08;
        crumbleStep(p, dt);
    }
    const solidAtPx = (x, y) => solid(Math.floor(x / T), Math.floor(y / T));
    function blockedAbove(p) { return solidAtPx(p.x - T * .25, p.y - T * 1.4) || solidAtPx(p.x + T * .25, p.y - T * 1.4); }
    function crumbleStep(p, dt) {
        if (p.onCrumble == null) return;
        const i = p.onCrumble, under = p.g > 0 ? Math.floor((p.y + 2) / T) * SAL.CW + Math.floor(p.x / T) : Math.floor((p.y - 2) / T) * SAL.CW + Math.floor(p.x / T);
        if (!p.ground || under !== i) { p.crumbleT = 0; p.onCrumble = null; return; }
        p.crumbleT += dt;
        if (p.crumbleT > .45) {
            S.room.broken = S.room.broken || {}; S.room.broken[i] = 3;
            J.burst((i % SAL.CW + .5) * T, (Math.floor(i / SAL.CW) + .5) * T, 12, '#a0703a', 120, .5, 4, 400);
            J.tone(160, .1, 'square', .03);
            p.onCrumble = null; p.crumbleT = 0;
        }
    }

    // ---------- Salles ----------
    function enterRoom(room, first) {
        S.room = room; room.seen = true;
        S.entry = { x: S.p.x, y: S.p.y, g: S.p.g, vx: first ? 0 : S.p.vx, vy: first ? 0 : S.p.vy };
        if (first) { S.entry.x = room.spawn.x * T; S.entry.y = room.spawn.y * T - .01; }
        S.bullets = [];
        // Entités (réinitialisées à chaque entrée)
        S.ents = room.ents.map(e => {
            const x = (e.x + .5) * T, y = (e.y + .5) * T;
            if (e.ch === 'o' || e.ch === 'O') return { type: 'saw', x, y, ox: x, oy: y, axis: e.ch === 'o' ? 0 : 1, t: (e.x + e.y) * .7 };
            if (e.ch === 'B') return { type: 'bat', x, y, hx: x, hy: y, t: e.x };
            if (e.ch === 'C') return { type: 'cannon', x, y, t: 1 + (e.x % 3) * .4 };
            if (e.ch === 'L') {
                const downward = tileAt(e.x, e.y - 1) === TILE.WALL || e.y === 0, step = downward ? 1 : -1;
                let len = 0; for (let yy = e.y + step; yy >= 0 && yy < SAL.CH && !solid(e.x, yy); yy += step) len++;
                return { type: 'laser', x, y, tx: e.x, ty: e.y, step, len, t: (e.x * .37) % 2.4 };
            }
        }).filter(Boolean);
        if (room.broken) for (const k in room.broken) delete room.broken[k];
    }
    function checkEdges() {
        const p = S.p, h = height(p);
        const cy = p.g > 0 ? p.y - h / 2 : p.y + h / 2;
        let d = null;
        if (p.x < 0) d = 'L'; else if (p.x > SAL.W) d = 'R'; else if (cy < 0) d = 'T'; else if (cy > SAL.H) d = 'B';
        if (!d) return;
        const nx = S.room.gx + DIRS4[d][0], ny = S.room.gy + DIRS4[d][1], next = S.level.rooms.get(nx + ',' + ny);
        if (!next) { if (d === 'B' || d === 'T') die(); else { p.x = J.clamp(p.x, 2, SAL.W - 2); p.vx = 0; } return; }
        if (d === 'L') p.x += SAL.W; if (d === 'R') p.x -= SAL.W;
        if (d === 'T') { p.y += SAL.H; if (kindJump && p.vy > -560) p.vy = -560; }
        if (d === 'B') p.y -= SAL.H;
        J.tone(620, .05, 'triangle', .02);
        enterRoom(next, false);
    }
    function respawn() {
        const e = S.entry;
        S.p = Object.assign(newPlayer(e.x, e.y), { g: e.g, vx: e.vx * .3, vy: kindJump && e.vy < -300 ? -560 : 0 });
        enterRoom(S.room, false);
        S.entry = e;
    }
    function die() {
        if (S.dead > 0) return;
        S.deaths++; S.dead = .55;
        J.sfx.bad(); J.shake(9, .3);
        J.burst(S.p.x, S.p.y + (S.p.g > 0 ? -20 : 20), 26, J.c.accent, 240, .7, 4, 500);
    }
    function flash(msg) { S.msg = msg; S.msgT = 1.6; }

    // ---------- Pièges et objets ----------
    function inSlow(x, y) { return tileAt(Math.floor(x / T), Math.floor(y / T)) === TILE.SLOW; }
    function stepEntities(dt) {
        const p = S.p;
        for (const e of S.ents) {
            const k = inSlow(e.x, e.y) ? .3 : 1;
            e.t += dt * k;
            if (e.type === 'saw') {
                const off = Math.sin(e.t * 1.6) * T * 3;
                if (e.axis === 0) e.x = e.ox + off; else e.y = e.oy + off;
            } else if (e.type === 'bat') {
                const dx = p.x - e.x, dy = (p.y - T * .7 * p.g) - e.y, d = Math.hypot(dx, dy);
                const chase = d < T * 6.5;
                const tx = chase ? p.x : e.hx + Math.sin(e.t) * T * 1.5, ty = chase ? p.y - T * .7 * p.g : e.hy + Math.cos(e.t * 1.7) * T * .6;
                const sp = (chase ? 105 : 60) * k;
                const ddx = tx - e.x, ddy = ty - e.y, dd = Math.hypot(ddx, ddy) || 1;
                e.x += ddx / dd * sp * dt; e.y += ddy / dd * sp * dt + Math.sin(e.t * 9) * .6;
            } else if (e.type === 'cannon') {
                e.t -= dt * 2 * k;
                if (e.t <= 0) {
                    e.t = 2.2;
                    const dx = p.x - e.x, dy = p.y - T * .7 - e.y, d = Math.hypot(dx, dy) || 1;
                    S.bullets.push({ x: e.x, y: e.y, vx: dx / d * 230, vy: dy / d * 230 });
                    J.tone(180, .08, 'square', .03, -80); J.burst(e.x + dx / d * 16, e.y + dy / d * 16, 5, '#ffb347', 80, .25, 3);
                }
            }
        }
        for (const b of S.bullets) { const k = inSlow(b.x, b.y) ? .25 : 1; b.x += b.vx * dt * k; b.y += b.vy * dt * k; if (solidAtPx(b.x, b.y) || b.x < -20 || b.x > SAL.W + 20 || b.y < -20 || b.y > SAL.H + 20) { b.dead = true; J.burst(b.x, b.y, 4, '#ffb347', 60, .2, 2); } }
        S.bullets = S.bullets.filter(b => !b.dead);
        if (S.room.broken) for (const k in S.room.broken) { S.room.broken[k] -= dt; if (S.room.broken[k] <= 0) { const bx = k % SAL.CW, by = Math.floor(k / SAL.CW); const pb = box(p); if (!(pb.r > bx * T && pb.l < (bx + 1) * T && pb.b > by * T && pb.t < (by + 1) * T)) delete S.room.broken[k]; } }
    }
    function checkHazards() {
        const p = S.p, b = box(p), inset = 5;
        const hb = { l: b.l + inset, r: b.r - inset, t: b.t + inset, b: b.b - inset };
        for (const [tx, ty] of tilesIn(hb)) {
            const v = tileAt(tx, ty);
            if (v === TILE.SPIKE) return die();
            if (v === TILE.EXIT) return win();
        }
        // Portes : on les ouvre au contact avec une clé
        for (const [tx, ty] of tilesIn({ l: b.l - 3, r: b.r + 3, t: b.t - 3, b: b.b + 3 })) if (tileAt(tx, ty) === TILE.DOOR) {
            if (S.keys > 0) { openDoor(); break; } else if (!S.doorMsg) { flash('Porte verrouillée : trouve une clé'); S.doorMsg = 1.5; }
        }
        if (S.doorMsg > 0) S.doorMsg -= 1 / 60;
        const cx = p.x, cy = p.g > 0 ? p.y - height(p) / 2 : p.y + height(p) / 2;
        for (const e of S.ents) {
            if (e.type === 'saw' && Math.hypot(e.x - cx, e.y - cy) < T * .42 + T * .3) return die();
            if (e.type === 'bat' && Math.abs(e.x - cx) < T * .55 && Math.abs(e.y - cy) < height(p) / 2 + T * .2) return die();
            if (e.type === 'laser' && laserOn(e)) {
                const x0 = e.tx * T + T * .35, x1 = e.tx * T + T * .65;
                const y0 = e.step > 0 ? (e.ty + 1) * T : (e.ty - e.len) * T, y1 = e.step > 0 ? (e.ty + 1 + e.len) * T : e.ty * T;
                if (b.r > x0 && b.l < x1 && b.b > y0 && b.t < y1) return die();
            }
        }
        for (const bl of S.bullets) if (bl.x > b.l && bl.x < b.r && bl.y > b.t && bl.y < b.b) return die();
        // Objets
        for (const it of S.room.items) {
            if (it.taken) continue;
            const ix = (it.x + .5) * T, iy = (it.y + .5) * T;
            if (ix > b.l - 8 && ix < b.r + 8 && iy > b.t - 8 && iy < b.b + 8) {
                it.taken = true;
                if (it.kind === 'gem') { S.gems++; J.tone(1320, .06, 'square', .03); J.burst(ix, iy, 14, '#7bdff2', 140, .5, 3); }
                else { S.keys++; J.sfx.good(); J.burst(ix, iy, 20, '#f1c40f', 160, .6, 3); flash('Clé ramassée !'); }
            }
        }
    }
    const laserOn = e => (e.t % 2.4) < 1.3;
    function openDoor() {
        S.keys--;
        const g = S.room.g;
        for (let i = 0; i < g.length; i++) if (g[i] === TILE.DOOR) { g[i] = TILE.EMPTY; J.burst((i % SAL.CW + .5) * T, (Math.floor(i / SAL.CW) + .5) * T, 8, '#f1c40f', 120, .5, 3); }
        J.sfx.good(); J.shake(5, .2); flash('Porte ouverte');
    }
    function win() {
        if (J.over) return;
        J.burst(S.p.x, S.p.y - 20, 50, J.c.ok, 260, 1, 4);
        const t = Math.round(J.time * 10) / 10;
        let extra;
        if (J.mode === 'niveaux') {
            const p = progress();
            p.max = Math.max(p.max, Math.min(100, S.n + 1));
            if (!p.best[S.n] || t < p.best[S.n]) p.best[S.n] = t;
            store.set(cfg.id + 'Progress', p);
            if (S.n < 100) extra = [['Niveau suivant', 'arrow-right', () => { const all = store.get(cfg.id + 'Cfg', {}); all.niveaux = Object.assign(all.niveaux || {}, { level: S.n + 1 }); store.set(cfg.id + 'Cfg', all); Jeu.startGame('niveaux', undefined, { level: S.n + 1 }); }]];
        }
        J.end({ won: true, time: t, extra, title: `Niveau ${S.n} terminé`, text: `${fmtTime(t)} · ${S.deaths} mort${S.deaths > 1 ? 's' : ''}${S.level.gems ? ` · ${S.gems}/${S.level.gems} gemmes` : ''}.` });
    }

    // ---------- Dessin ----------
    function drawRoom(ctx) {
        const c = J.c, g = S.room.g, t = J.time;
        const bg = ctx.createLinearGradient(0, 0, 0, SAL.H);
        bg.addColorStop(0, c.light ? '#e6edf3' : '#11141b'); bg.addColorStop(1, c.light ? '#f5f1e8' : '#1b1922');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, SAL.W, SAL.H);
        // Motif de fond propre à chaque salle
        ctx.fillStyle = J.alpha(c.muted, .07);
        for (let k = 0; k < 9; k++) { const s = (S.room.gx * 13 + S.room.gy * 7 + k * 37) % 97; ctx.fillRect((s * 9) % SAL.W, (s * 5) % SAL.H, 40 + s % 60, 140 + s % 120); }
        for (let y = 0; y < SAL.CH; y++) for (let x = 0; x < SAL.CW; x++) {
            const v = g[y * SAL.CW + x], px = x * T, py = y * T;
            if (!v) continue;
            if (v === TILE.WALL) {
                ctx.fillStyle = c.surface3; ctx.fillRect(px, py, T, T);
                ctx.fillStyle = J.alpha(c.muted, .28); ctx.fillRect(px, py, T, T);
                ctx.fillStyle = J.alpha(c.bg, .35); ctx.fillRect(px, py + (y % 2 ? T / 2 : 0), T, 1); ctx.fillRect(px + ((x + y) % 2 ? T / 2 : 0), py, 1, T / 2);
                const open = (dx, dy) => { const w = tileAt(x + dx, y + dy); return w !== -1 && !solid(x + dx, y + dy) && w !== TILE.WALL; };
                ctx.fillStyle = c.accent;
                if (open(0, -1)) ctx.fillRect(px, py, T, 3);
                if (open(0, 1)) ctx.fillRect(px, py + T - 3, T, 3);
                ctx.fillStyle = J.alpha(c.accent, .35);
                if (open(-1, 0)) ctx.fillRect(px, py, 2, T);
                if (open(1, 0)) ctx.fillRect(px + T - 2, py, 2, T);
            } else if (v === TILE.SPIKE) drawSpike(ctx, x, y);
            else if (v === TILE.CRUMBLE) {
                const br = S.room.broken && S.room.broken[y * SAL.CW + x];
                if (br) { ctx.strokeStyle = J.alpha('#a0703a', .35); ctx.setLineDash([4, 4]); ctx.strokeRect(px + 2, py + 2, T - 4, T - 4); ctx.setLineDash([]); }
                else { ctx.fillStyle = '#a0703a'; ctx.fillRect(px, py, T, T * .45); ctx.strokeStyle = '#6b4a23'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + T * .3, py); ctx.lineTo(px + T * .45, py + T * .45); ctx.moveTo(px + T * .7, py); ctx.lineTo(px + T * .6, py + T * .45); ctx.stroke(); }
            } else if (v === TILE.DOOR) { ctx.fillStyle = '#b7950b'; ctx.fillRect(px + 2, py, T - 4, T); ctx.fillStyle = '#f1c40f'; ctx.fillRect(px + T / 2 - 4, py + T / 2 - 4, 8, 8); }
            else if (v === TILE.RED || v === TILE.BLUE) {
                const on = v === TILE.RED ? S.sw === 0 : S.sw === 1, col = v === TILE.RED ? '#e74c3c' : '#3498db';
                if (on) { ctx.fillStyle = col; ctx.fillRect(px + 1, py + 1, T - 2, T - 2); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(px + 4, py + 4, T - 8, 4); }
                else { ctx.strokeStyle = J.alpha(col, .5); ctx.setLineDash([5, 4]); ctx.strokeRect(px + 3, py + 3, T - 6, T - 6); ctx.setLineDash([]); }
            } else if (v === TILE.VINE) {
                ctx.strokeStyle = '#3f9a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px + T / 2, py); ctx.bezierCurveTo(px + T * .2, py + T * .3, px + T * .8, py + T * .6, px + T / 2, py + T); ctx.stroke();
                ctx.fillStyle = '#56b45f'; ctx.beginPath(); ctx.ellipse(px + T * .35, py + T * .4, 6, 3, -.6, 0, 7); ctx.ellipse(px + T * .65, py + T * .75, 6, 3, .6, 0, 7); ctx.fill();
            } else if (v === TILE.BOOSTR || v === TILE.BOOSTL) {
                ctx.fillStyle = c.surface3; ctx.fillRect(px, py, T, T); ctx.fillStyle = '#2ecc71';
                const d = v === TILE.BOOSTR ? 1 : -1, ph = (t * 4) % 1;
                for (let k = 0; k < 2; k++) { const ax = px + T / 2 + d * ((k * .5 + ph * .5) * T - T * .4); ctx.beginPath(); ctx.moveTo(ax - d * 6, py + 4); ctx.lineTo(ax + d * 4, py + 10); ctx.lineTo(ax - d * 6, py + 16); ctx.fill(); }
            } else if (v === TILE.SPRING) {
                ctx.fillStyle = c.surface3; ctx.fillRect(px, py + T * .6, T, T * .4);
                ctx.strokeStyle = '#f5b041'; ctx.lineWidth = 3; ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(px + 6, py + T * .6 - k * 6); ctx.lineTo(px + T - 6, py + T * .6 - k * 6 - 3); } ctx.stroke();
                ctx.fillStyle = '#e67e22'; ctx.fillRect(px + 3, py + T * .6 - 26, T - 6, 5);
            } else if (v === TILE.SLOW) { ctx.fillStyle = 'rgba(155,89,182,.13)'; ctx.fillRect(px, py, T, T); ctx.strokeStyle = 'rgba(155,89,182,.3)'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 6 + Math.sin(t * 3 + x) * 3, 0, 7); ctx.stroke(); }
            else if (v === TILE.SWITCH) { ctx.fillStyle = c.surface3; ctx.fillRect(px, py, T, T); ctx.fillStyle = S.sw ? '#3498db' : '#e74c3c'; J.rr(px + 6, py + 6, T - 12, T - 12, 5); ctx.fill(); }
            else if (v === TILE.EXIT) {
                const r = T * .55 + Math.sin(t * 4) * 3;
                const grd = ctx.createRadialGradient(px + T / 2, py + T / 2, 2, px + T / 2, py + T / 2, r);
                grd.addColorStop(0, '#ffffff'); grd.addColorStop(.4, J.alpha(c.ok, .9)); grd.addColorStop(1, J.alpha(c.ok, 0));
                ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, r, 0, 7); ctx.fill();
            }
        }
        // Objets
        for (const it of S.room.items) {
            if (it.taken) continue;
            const ix = (it.x + .5) * T, iy = (it.y + .5) * T + Math.sin(t * 3 + it.x) * 3;
            if (it.kind === 'gem') { ctx.fillStyle = '#7bdff2'; ctx.beginPath(); ctx.moveTo(ix, iy - 9); ctx.lineTo(ix + 7, iy); ctx.lineTo(ix, iy + 9); ctx.lineTo(ix - 7, iy); ctx.fill(); }
            else { ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ix - 5, iy, 6, 0, 7); ctx.moveTo(ix + 1, iy); ctx.lineTo(ix + 13, iy); ctx.moveTo(ix + 9, iy); ctx.lineTo(ix + 9, iy + 6); ctx.stroke(); }
        }
        // Pièges animés
        for (const e of S.ents) {
            if (e.type === 'saw') {
                ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(t * 10);
                ctx.fillStyle = '#c0c4cc'; ctx.beginPath();
                for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? T * .3 : T * .44; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
                ctx.fill(); ctx.fillStyle = '#5d6168'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.restore();
            } else if (e.type === 'bat') {
                const flap = Math.sin(t * 18) * 8;
                ctx.fillStyle = '#3a2d4a'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x - 16, e.y - 6 - flap); ctx.lineTo(e.x - 8, e.y + 2); ctx.lineTo(e.x, e.y + 4); ctx.lineTo(e.x + 8, e.y + 2); ctx.lineTo(e.x + 16, e.y - 6 - flap); ctx.fill();
                ctx.beginPath(); ctx.arc(e.x, e.y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#ff5252'; ctx.fillRect(e.x - 3, e.y - 2, 2, 2); ctx.fillRect(e.x + 1, e.y - 2, 2, 2);
            } else if (e.type === 'cannon') {
                const a = Math.atan2(S.p.y - T * .7 - e.y, S.p.x - e.x);
                ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.arc(e.x, e.y, T * .38, 0, 7); ctx.fill();
                ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(a); ctx.fillStyle = '#2d3239'; ctx.fillRect(0, -6, T * .55, 12); ctx.restore();
                if (e.t < .4) { ctx.fillStyle = J.alpha('#ff5252', .6); ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, 7); ctx.fill(); }
            } else if (e.type === 'laser') {
                const on = laserOn(e), warn = !on && (e.t % 2.4) > 2.0;
                ctx.fillStyle = '#4b5563'; ctx.fillRect(e.tx * T + 6, e.ty * T + (e.step > 0 ? 0 : T * .6), T - 12, T * .4);
                const y0 = e.step > 0 ? (e.ty + 1) * T : (e.ty - e.len) * T, len = e.len * T;
                if (on) { ctx.fillStyle = 'rgba(255,60,60,.35)'; ctx.fillRect(e.tx * T + T * .25, y0, T * .5, len); ctx.fillStyle = '#ff4d4d'; ctx.fillRect(e.tx * T + T * .42, y0, T * .16, len); }
                else if (warn) { ctx.fillStyle = 'rgba(255,60,60,.25)'; ctx.fillRect(e.tx * T + T * .47, y0, T * .06, len); }
            }
        }
        ctx.fillStyle = '#ffb347'; for (const b of S.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill(); }
        // Fantôme de l'adversaire (duel)
        const gh = S.ghost;
        if (gh && gh[0] === S.room.gx && gh[1] === S.room.gy) drawHero(ctx, { x: gh[2], y: gh[3], g: gh[4], crouch: !!gh[5], face: 1, vx: 0, ground: true }, J.alpha(c.danger, .55));
        if (!(S.dead > 0)) drawHero(ctx, S.p, c.accent);
        drawMap(ctx);
        if (S.msgT > 0) { ctx.globalAlpha = Math.min(1, S.msgT * 2); J.rr(SAL.W / 2 - 160, 14, 320, 34, 8); ctx.fillStyle = J.alpha(c.bg, .85); ctx.fill(); J.text(S.msg, SAL.W / 2, 31, 14, c.text); ctx.globalAlpha = 1; }
        J.text(`Niveau ${S.n}`, 12, 16, 13, c.muted, 'left', 700);
        if (S.keys) { ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(96, 16, 5, 0, 7); ctx.moveTo(101, 16); ctx.lineTo(112, 16); ctx.stroke(); J.text(`× ${S.keys}`, 118, 16, 13, '#f1c40f', 'left', 700); }
    }
    function drawSpike(ctx, x, y) {
        const px = x * T, py = y * T;
        // Orientation : vers l'opposé du mur voisin
        let d = 'up';
        if (tileAt(x, y + 1) === TILE.WALL) d = 'up'; else if (tileAt(x, y - 1) === TILE.WALL) d = 'down'; else if (tileAt(x - 1, y) === TILE.WALL) d = 'right'; else if (tileAt(x + 1, y) === TILE.WALL) d = 'left';
        ctx.fillStyle = J.c.danger; ctx.beginPath();
        for (let k = 0; k < 3; k++) {
            const a = k * T / 3, b = a + T / 6, e = a + T / 3;
            if (d === 'up') { ctx.moveTo(px + a, py + T); ctx.lineTo(px + b, py + T * .3); ctx.lineTo(px + e, py + T); }
            if (d === 'down') { ctx.moveTo(px + a, py); ctx.lineTo(px + b, py + T * .7); ctx.lineTo(px + e, py); }
            if (d === 'right') { ctx.moveTo(px, py + a); ctx.lineTo(px + T * .7, py + b); ctx.lineTo(px, py + e); }
            if (d === 'left') { ctx.moveTo(px + T, py + a); ctx.lineTo(px + T * .3, py + b); ctx.lineTo(px + T, py + e); }
        }
        ctx.fill();
    }
    function drawHero(ctx, p, col) {
        ctx.save(); ctx.translate(p.x, p.y);
        if (p.g < 0) ctx.scale(1, -1);
        const f = p.face < 0 ? -1 : 1;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
        if (p.crouch) {
            ctx.beginPath(); ctx.arc(9 * f, -18, 6, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.moveTo(5 * f, -14); ctx.lineTo(-9 * f, -8); ctx.lineTo(-16 * f, -2); ctx.moveTo(-5 * f, -9); ctx.lineTo(6 * f, -2); ctx.stroke();
        } else if (p.climb) {
            const ph = Math.sin(J.time * 10) * (Math.abs(p.vy) > 1 ? 1 : 0);
            ctx.beginPath(); ctx.arc(0, -44, 7, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, -37); ctx.lineTo(0, -18); ctx.moveTo(0, -34); ctx.lineTo(-8, -46 + ph * 4); ctx.moveTo(0, -34); ctx.lineTo(8, -46 - ph * 4);
            ctx.moveTo(0, -18); ctx.lineTo(-6, -4 - ph * 4); ctx.moveTo(0, -18); ctx.lineTo(6, -4 + ph * 4); ctx.stroke();
        } else {
            const ph = p.ground ? Math.sin(J.time * 14) * Math.min(1, Math.abs(p.vx) / 160) : 0;
            const a = p.ground ? ph * .8 : .6, b = p.ground ? -ph * .8 : -.2;
            ctx.beginPath(); ctx.arc(2 * f, -44, 7, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, -37); ctx.lineTo(0, -19);
            ctx.moveTo(0, -19); ctx.lineTo(Math.sin(a) * 14 * f, -19 + Math.cos(a) * 15);
            ctx.moveTo(0, -19); ctx.lineTo(Math.sin(b) * 14 * f, -19 + Math.cos(b) * 15);
            if (p.wall) { ctx.moveTo(0, -33); ctx.lineTo(p.wall * 10, -43); ctx.moveTo(0, -31); ctx.lineTo(p.wall * 11, -36); }
            else { ctx.moveTo(0, -33); ctx.lineTo(-Math.sin(a) * 11 * f, -24); ctx.moveTo(0, -33); ctx.lineTo(-Math.sin(b) * 11 * f, -24); }
            ctx.stroke();
        }
        if (p.dash > 0) { ctx.globalAlpha = .4; ctx.fillRect(-26 * Math.sign(p.vx), -40, 14, 3); ctx.fillRect(-34 * Math.sign(p.vx), -28, 18, 3); ctx.globalAlpha = 1; }
        ctx.restore();
    }
    // Mini-carte des salles visitées
    function drawMap(ctx) {
        const rooms = [...S.level.rooms.values()];
        const xs = rooms.map(r => r.gx), ys = rooms.map(r => r.gy), minX = Math.min(...xs), minY = Math.min(...ys);
        const cw = 18, ch = 11, ox = SAL.W - (Math.max(...xs) - minX + 1) * (cw + 3) - 12, oy = 10;
        for (const r of rooms) {
            if (!r.seen && !rooms.some(q => q.seen && Math.abs(q.gx - r.gx) + Math.abs(q.gy - r.gy) === 1 && !r.branch)) continue;
            const x = ox + (r.gx - minX) * (cw + 3), y = oy + (r.gy - minY) * (ch + 3);
            ctx.fillStyle = r === S.room ? J.c.accent : r.seen ? J.alpha(J.c.text, .45) : J.alpha(J.c.text, .12);
            ctx.fillRect(x, y, cw, ch);
            if (r.seen && r.items.some(i => i.kind === 'key' && !i.taken)) { ctx.fillStyle = '#f1c40f'; ctx.fillRect(x + cw / 2 - 2, y + ch / 2 - 2, 4, 4); }
            if (r.seen && [...r.g].includes(TILE.EXIT)) { ctx.fillStyle = J.c.ok; ctx.fillRect(x + cw / 2 - 3, y + ch / 2 - 3, 6, 6); }
        }
    }
}
