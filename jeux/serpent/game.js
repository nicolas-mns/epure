'use strict';
// ==================== Serpent ====================

const MODES = {
    classic: { title: 'Classique', icon: 'square', desc: 'Mange, grandis, et évite les murs comme ta propre queue.',
        rules: [['apple', 'Chaque fruit rapporte 1 point et allonge le serpent.'], ['star', 'Une étoile apparaît parfois : 5 points, mais elle disparaît vite.']] },
    wrap: { title: 'Sans murs', icon: 'infinity', desc: 'Les bords du terrain se rejoignent : sortir d\'un côté fait revenir de l\'autre.',
        rules: [['infinity', 'Seule ta queue peut te faire perdre.']] },
    maze: { title: 'Labyrinthe', icon: 'brick-wall', desc: 'Des murs se dressent sur le terrain. Il en apparaît un nouveau tous les 5 fruits.',
        rules: [['brick-wall', 'Un nouveau mur tous les 5 fruits.'], ['apple', 'Les fruits n\'apparaissent jamais dans un cul-de-sac fermé.']] },
    timed: { title: 'Chrono 90 s', icon: 'timer', desc: 'Le plus de fruits possible en 90 secondes. Les murs ne tuent pas : ils te font perdre 5 secondes.',
        rules: [['timer', '90 secondes au départ.'], ['alarm-clock-minus', 'Choc contre un mur ou ta queue : −5 s et le serpent repart.']] },
};
const SPEEDS = { slow: { base: 6, gain: .12, max: 11 }, normal: { base: 8, gain: .2, max: 16 }, fast: { base: 12, gain: .25, max: 22 } };
const W = 22, H = 18;

const cfg = Object.assign({ speed: 'normal', grid: true }, store.get('serpentCfg', {}));
const saveCfg = () => store.set('serpentCfg', cfg);
let currentMode = store.get('serpentMode', 'classic');
if (!MODES[currentMode]) currentMode = 'classic';

const Sound = {
    ctx: null,
    ensure() {
        if (!settings.sound) return null;
        if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    tone(f, d = .06, type = 'triangle', v = .04, slide = 0, delay = 0) {
        const c = this.ensure(); if (!c) return;
        const tt = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f, tt);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), tt + d);
        g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(.0001, tt + d);
        o.connect(g).connect(c.destination); o.start(tt); o.stop(tt + d + .02);
    },
    eat() { this.tone(660, .06, 'square', .03, 220); },
    star() { [784, 988, 1319].forEach((f, i) => this.tone(f, .08, 'square', .03, 0, i * .05)); },
    hit() { this.tone(160, .25, 'sawtooth', .06, -90); },
    over() { [392, 330, 262].forEach((f, i) => this.tone(f, .22, 'triangle', .05, 0, i * .13)); },
};

// ==================== État ====================
let S = null;
const key = (x, y) => y * W + x;

function newGame(mode) {
    const sx = Math.floor(W / 4), sy = Math.floor(H / 2);
    S = {
        mode, snake: [[sx, sy], [sx - 1, sy], [sx - 2, sy]], dir: [1, 0], queue: [], grow: 0,
        walls: new Set(), food: null, star: null, starT: 0,
        score: 0, eaten: 0, time: 0, remaining: 90, acc: 0, over: false, paused: false, started: false, countdown: 2.4, lastCount: 0, flash: 0,
    };
    if (mode === 'maze') buildMaze();
    placeFood();
}
function buildMaze() {
    const add = (x, y) => S.walls.add(key(x, y));
    for (let x = 5; x < W - 5; x++) { add(x, 3); add(x, H - 4); }
    for (let y = 7; y < H - 7; y++) { add(Math.floor(W / 2), y); }
}
function occupied(x, y) {
    if (S.walls.has(key(x, y))) return true;
    return S.snake.some(([a, b]) => a === x && b === y);
}
function freeCells() {
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!occupied(x, y) && !(S.food && S.food[0] === x && S.food[1] === y) && !(S.star && S.star[0] === x && S.star[1] === y)) out.push([x, y]);
    return out;
}
// Vérifie qu'une case est atteignable depuis la tête (pour ne pas piéger un fruit)
function reachable(target) {
    const [hx, hy] = S.snake[0], seen = new Set([key(hx, hy)]), q = [[hx, hy]];
    while (q.length) {
        const [x, y] = q.shift();
        if (x === target[0] && y === target[1]) return true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let nx = x + dx, ny = y + dy;
            if (S.mode === 'wrap') { nx = (nx + W) % W; ny = (ny + H) % H; }
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const k = key(nx, ny);
            if (seen.has(k) || S.walls.has(k)) continue;
            seen.add(k); q.push([nx, ny]);
        }
    }
    return false;
}
function placeFood() {
    const free = freeCells().filter(c => S.mode !== 'maze' || reachable(c));
    S.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
}
function maybeStar() {
    if (S.star || Math.random() > .18) return;
    const free = freeCells();
    if (!free.length) return;
    S.star = free[Math.floor(Math.random() * free.length)];
    S.starT = 6;
}
function addWall() {
    const [hx, hy] = S.snake[0];
    const free = freeCells().filter(([x, y]) => Math.abs(x - hx) + Math.abs(y - hy) > 4);
    for (let tries = 0; tries < 30 && free.length; tries++) {
        const [x, y] = free[Math.floor(Math.random() * free.length)];
        const horiz = Math.random() < .5, len = 3;
        const cells = Array.from({ length: len }, (_, i) => horiz ? [x + i, y] : [x, y + i]).filter(([a, b]) => a < W && b < H && !occupied(a, b));
        if (cells.length < 2) continue;
        cells.forEach(([a, b]) => S.walls.add(key(a, b)));
        if (S.food && !reachable(S.food)) placeFood();
        return;
    }
}

// ==================== Boucle ====================
const speedNow = () => { const sp = SPEEDS[cfg.speed]; return Math.min(sp.max, sp.base + S.eaten * sp.gain); };
let last = 0;
function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - last) / 1000 || 0); last = now;
    if (!S) return;
    if (!S.over && !S.paused) update(dt);
    draw();
}
function update(dt) {
    if (!S.started) {
        S.countdown -= dt;
        const n = Math.ceil(S.countdown);
        if (n !== S.lastCount) { S.lastCount = n; overlay(n > 0 ? `<span class="count">${n}</span>` : null); }
        if (S.countdown <= 0) { S.started = true; overlay(null); }
        return;
    }
    S.time += dt;
    S.flash = Math.max(0, S.flash - dt);
    if (S.mode === 'timed') { S.remaining -= dt; if (S.remaining <= 0) { S.remaining = 0; endGame(); return; } }
    if (S.star) { S.starT -= dt; if (S.starT <= 0) S.star = null; }
    S.acc += dt;
    const step = 1 / speedNow();
    while (S.acc >= step && !S.over) { S.acc -= step; tick(); }
    updateStats();
}
function tick() {
    if (S.queue.length) S.dir = S.queue.shift();
    const [hx, hy] = S.snake[0];
    let nx = hx + S.dir[0], ny = hy + S.dir[1];
    if (S.mode === 'wrap') { nx = (nx + W) % W; ny = (ny + H) % H; }
    const outside = nx < 0 || ny < 0 || nx >= W || ny >= H;
    const tailMoves = S.grow === 0;
    const body = S.snake.slice(0, tailMoves ? -1 : undefined);
    const crash = outside || S.walls.has(key(nx, ny)) || body.some(([a, b]) => a === nx && b === ny);
    if (crash) {
        if (S.mode === 'timed') {
            Sound.hit(); S.remaining -= 5; S.flash = .4;
            // Le serpent repart d'une position sûre, réduit à 3 segments
            const free = freeCells().filter(([x, y]) => x > 2 && x < W - 3);
            const [sx, sy] = free.length ? free[Math.floor(Math.random() * free.length)] : [5, 5];
            S.snake = [[sx, sy], [sx - 1, sy], [sx - 2, sy]].map(([a, b]) => [(a + W) % W, b]);
            S.dir = [1, 0]; S.queue = []; S.grow = 0;
            return;
        }
        Sound.hit(); endGame(); return;
    }
    S.snake.unshift([nx, ny]);
    if (S.grow > 0) S.grow--; else S.snake.pop();
    if (S.food && nx === S.food[0] && ny === S.food[1]) {
        S.score += 1; S.eaten++; S.grow += 1; Sound.eat();
        if (S.mode === 'maze' && S.eaten % 5 === 0) addWall();
        placeFood(); maybeStar();
        if (!S.food) { endGame(true); return; }
    }
    if (S.star && nx === S.star[0] && ny === S.star[1]) {
        S.score += 5; S.grow += 2; S.star = null; Sound.star();
    }
}
function setDir(dx, dy) {
    if (!S || S.over) return;
    if (S.paused) return;
    const lastDir = S.queue.length ? S.queue[S.queue.length - 1] : S.dir;
    if ((dx === -lastDir[0] && dy === -lastDir[1]) || (dx === lastDir[0] && dy === lastDir[1])) return;
    if (S.queue.length < 3) S.queue.push([dx, dy]);
}

function endGame(perfect) {
    if (S.over) return;
    S.over = true; Sound.over();
    const prev = history(S.mode).map(e => e.score || 0);
    Stats.record({ game: 'serpent', mode: S.mode, sub: cfg.speed, won: !!perfect || S.mode === 'timed', time: Math.round(S.time * 10) / 10, score: S.score });
    const best = Math.max(0, ...prev);
    const title = perfect ? 'Terrain rempli !' : S.mode === 'timed' ? 'Temps écoulé' : 'Partie terminée';
    const text = `Score : ${S.score}\nLongueur : ${S.snake.length}${S.score > best ? '\nNouveau record' : `\nRecord : ${best}`}`;
    setTimeout(() => showModal(title, perfect ? 'trophy' : 'skull', text), 350);
}
const history = mode => Stats.all().filter(e => e.game === 'serpent' && e.mode === mode && e.sub === cfg.speed);

function showModal(title, ic, text) {
    $('#modal-title').innerHTML = icon(ic) + `<span>${title}</span>`;
    $('#modal-text').textContent = text;
    const box = $('#modal-actions'); box.innerHTML = '';
    [['Rejouer', 'rotate-ccw', true, () => start(S.mode)], ['Retour', null, false, quit]].forEach(([l, ic2, primary, fn]) => {
        const b = document.createElement('button');
        b.className = 'btn' + (primary ? ' primary' : '');
        b.innerHTML = (ic2 ? icon(ic2) : '') + l;
        b.onclick = () => { closeModals(); fn(); };
        box.appendChild(b);
    });
    $('#modal').classList.remove('hidden');
}
function overlay(html) {
    const o = $('#overlay');
    if (!html) { o.classList.add('hidden'); return; }
    o.innerHTML = `<div>${html}</div>`; o.classList.remove('hidden');
}
function togglePause() {
    if (!S || S.over || !S.started) return;
    S.paused = !S.paused;
    overlay(S.paused ? `Pause<br><small>Espace pour reprendre</small>` : null);
}

// ==================== Rendu ====================
let C = {}, cell = 26;
function readColors() {
    const cs = getComputedStyle(document.body), v = n => cs.getPropertyValue(n).trim();
    C = { grid: v('--cell-line') || v('--border'), snake: v('--accent'), head: v('--text'), food: v('--danger'), star: v('--warn') || '#f5a623', wall: v('--muted'), bg: v('--surface'), flash: v('--danger') };
}
function fit() {
    const mobile = matchMedia('(max-width: 860px)').matches;
    const maxW = Math.min(innerWidth - (mobile ? 40 : 460), 760), maxH = innerHeight - (mobile ? 330 : 120);
    cell = Math.max(12, Math.floor(Math.min(maxW / W, maxH / H, 34)));
    const c = $('#board'), dpr = devicePixelRatio || 1;
    c.width = W * cell * dpr; c.height = H * cell * dpr;
    c.style.width = W * cell + 'px'; c.style.height = H * cell + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); }
function draw() {
    const ctx = $('#board').getContext('2d');
    ctx.clearRect(0, 0, W * cell, H * cell);
    if (cfg.grid) {
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 1; x < W; x++) { ctx.moveTo(x * cell + .5, 0); ctx.lineTo(x * cell + .5, H * cell); }
        for (let y = 1; y < H; y++) { ctx.moveTo(0, y * cell + .5); ctx.lineTo(W * cell, y * cell + .5); }
        ctx.stroke();
    }
    if (!S) return;
    if (S.flash > 0) { ctx.globalAlpha = S.flash * .5; ctx.fillStyle = C.flash; ctx.fillRect(0, 0, W * cell, H * cell); ctx.globalAlpha = 1; }
    ctx.fillStyle = C.wall;
    S.walls.forEach(k => rr(ctx, (k % W) * cell + 1, Math.floor(k / W) * cell + 1, cell - 2, cell - 2, 3));
    if (S.food) {
        ctx.fillStyle = C.food;
        ctx.beginPath(); ctx.arc(S.food[0] * cell + cell / 2, S.food[1] * cell + cell / 2, cell * .34, 0, 7); ctx.fill();
    }
    if (S.star) {
        const pulse = .8 + .2 * Math.sin(performance.now() / 120);
        ctx.fillStyle = C.star; ctx.globalAlpha = S.starT < 2 ? (Math.sin(performance.now() / 60) > 0 ? 1 : .3) : 1;
        star(ctx, S.star[0] * cell + cell / 2, S.star[1] * cell + cell / 2, cell * .42 * pulse);
        ctx.globalAlpha = 1;
    }
    const n = S.snake.length;
    S.snake.forEach(([x, y], i) => {
        ctx.fillStyle = i === 0 ? C.head : C.snake;
        ctx.globalAlpha = S.over ? .45 : 1 - (i / n) * .45;
        const pad = i === 0 ? 1 : 2;
        rr(ctx, x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2, cell * .3);
    });
    ctx.globalAlpha = 1;
    // yeux
    const [hx, hy] = S.snake[0], [dx, dy] = S.dir;
    ctx.fillStyle = C.bg;
    const cx = hx * cell + cell / 2, cy = hy * cell + cell / 2, off = cell * .2;
    [[-1, 1]].flat().forEach(s => {
        ctx.beginPath();
        ctx.arc(cx + dx * off + dy * off * s, cy + dy * off - dx * off * s, cell * .09, 0, 7);
        ctx.fill();
    });
}
function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * .45 : r;
        ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
}
function updateStats() {
    const items = [['Score', S.score], ['Longueur', S.snake.length]];
    items.push(S.mode === 'timed' ? ['Restant', fmtTime(Math.ceil(S.remaining))] : ['Temps', fmtTime(S.time)]);
    items.push(['Vitesse', speedNow().toFixed(1)]);
    const html = items.map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');
    if ($('#stats').innerHTML !== html) $('#stats').innerHTML = html;
}

// ==================== Navigation ====================
function selectMode(m) {
    currentMode = m; store.set('serpentMode', m);
    $$('.mode-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    const M = MODES[m];
    $('#setup-icon').innerHTML = icon(M.icon);
    $('#setup-title').textContent = M.title;
    $('#setup-desc').textContent = M.desc;
    $('#setup-rules').innerHTML = M.rules.map(([ic, txt]) => `<li>${icon(ic)}${txt}</li>`).join('');
    $$('#seg-speed button').forEach(b => b.classList.toggle('active', b.dataset.speed === cfg.speed));
    const h = history(m);
    $('#setup-best').textContent = h.length ? `${h.length} parties · record ${Math.max(...h.map(e => e.score || 0))}` : '';
    show('setup');
    if (S) S.over = true;
}
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id)); }
function start(mode) { closeModals(); readColors(); newGame(mode); show('game'); fit(); overlay(null); updateStats(); }
function quit() { if (S) S.over = true; overlay(null); selectMode(currentMode); }
const updateSoundBtn = () => { $('#sound-btn').innerHTML = icon(settings.sound ? 'volume-2' : 'volume-x'); };

const ACTIONS = {
    'play': () => start(currentMode), 'pause': togglePause, 'restart': () => start(S ? S.mode : currentMode), 'quit': quit,
    'open-help': () => { if (S && !S.paused && S.started && !S.over) togglePause(); $('#help').classList.remove('hidden'); },
    'open-settings': () => { if (S && !S.paused && S.started && !S.over) togglePause(); $('#settings').classList.remove('hidden'); },
    'close-modal': () => { closeModals(); readColors(); },
    'toggle-sound': () => { settings.sound = !settings.sound; saveSettings(); updateSoundBtn(); },
};
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], z: [0, -1], w: [0, -1], s: [0, 1], q: [-1, 0], a: [-1, 0], d: [1, 0] };
const TOUCH = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function init() {
    renderThemes($('#themes'));
    document.addEventListener('themechange', readColors);
    hydrateIcons(); updateSoundBtn();
    $('#opt-grid').checked = cfg.grid; $('#opt-grid').onchange = e => { cfg.grid = e.target.checked; saveCfg(); };
    document.addEventListener('click', e => {
        const a = e.target.closest('[data-action]');
        if (a && ACTIONS[a.dataset.action]) ACTIONS[a.dataset.action]();
        if (e.target.classList.contains('modal') && e.target.id !== 'modal') ACTIONS['close-modal']();
    });
    $$('.mode-item').forEach(b => b.onclick = () => selectMode(b.dataset.mode));
    $$('#seg-speed button').forEach(b => b.onclick = () => { cfg.speed = b.dataset.speed; saveCfg(); selectMode(currentMode); });
    document.addEventListener('keydown', e => {
        if (!$('#screen-game').classList.contains('active') || modalOpen()) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (DIRS[k]) { e.preventDefault(); Sound.ensure(); setDir(...DIRS[k]); }
        else if (k === ' ' || k === 'Escape' || k === 'p') { e.preventDefault(); togglePause(); }
        else if (k === 'r') start(S.mode);
    });
    $$('#touch [data-dir]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); Sound.ensure(); setDir(...TOUCH[b.dataset.dir]); }));
    // Balayage sur le terrain
    let sw = null;
    const board = $('#board');
    board.addEventListener('touchstart', e => { const p = e.touches[0]; sw = [p.clientX, p.clientY]; }, { passive: true });
    board.addEventListener('touchmove', e => {
        if (!sw) return;
        const p = e.touches[0], dx = p.clientX - sw[0], dy = p.clientY - sw[1];
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        Math.abs(dx) > Math.abs(dy) ? setDir(Math.sign(dx), 0) : setDir(0, Math.sign(dy));
        sw = [p.clientX, p.clientY];
        e.preventDefault();
    }, { passive: false });
    addEventListener('blur', () => { if (S && S.started && !S.over && !S.paused) togglePause(); });
    addEventListener('resize', () => { if ($('#screen-game').classList.contains('active')) fit(); });
    readColors();
    selectMode(currentMode);
    requestAnimationFrame(loop);
}
init();
