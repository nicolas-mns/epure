'use strict';
// ==================== Fusion ====================

const MODES = {
    classic: { title: 'Classique 4×4', icon: 'grid-2x2', n: 4, desc: 'Fusionne les tuiles jusqu\'à atteindre 2048. Tu peux continuer après.',
        rules: [['merge', 'Deux tuiles identiques qui se touchent fusionnent.'], ['undo-2', '3 retours en arrière par partie.']] },
    big: { title: 'Grand 5×5', icon: 'grid-3x3', n: 5, desc: 'Plus de place, des parties plus longues. Objectif : 4096.',
        rules: [['maximize', 'Grille 5×5 : idéal pour viser très haut.']] },
    mini: { title: 'Mini 3×3', icon: 'square', n: 3, desc: 'Neuf cases seulement. Atteindre 256 est déjà un exploit.',
        rules: [['flame', 'Chaque coup compte : pas de retour en arrière.']] },
    timed: { title: 'Chrono 3 min', icon: 'timer', n: 4, desc: 'Le plus gros score possible en 3 minutes.',
        rules: [['timer', 'Le chrono démarre au premier coup.'], ['zap', 'Pas de retour en arrière : joue vite.']] },
    blocks: { title: 'Obstacles', icon: 'square-x', n: 5, desc: 'Deux rochers immobiles bloquent la grille 5×5. Les tuiles ne peuvent pas les traverser.',
        rules: [['square-x', 'Les rochers ne bougent jamais et ne fusionnent pas.'], ['undo-2', '3 retours en arrière par partie.']] },
};
const GOAL = { classic: 2048, big: 4096, mini: 256, timed: Infinity, blocks: 2048 };
let currentMode = store.get('fusionMode', 'classic');
if (!MODES[currentMode]) currentMode = 'classic';

const Sound = {
    ctx: null,
    ensure() {
        if (!settings.sound) return null;
        if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    tone(f, d = .06, type = 'sine', v = .035, delay = 0) {
        const c = this.ensure(); if (!c) return;
        const tt = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f, tt);
        g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(.0001, tt + d);
        o.connect(g).connect(c.destination); o.start(tt); o.stop(tt + d + .02);
    },
    slide() { this.tone(240, .04, 'triangle', .02); },
    merge(v) { this.tone(300 + Math.log2(v) * 60, .09, 'triangle', .04); },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .2, 'triangle', .05, i * .1)); },
    over() { [392, 330, 262].forEach((f, i) => this.tone(f, .22, 'triangle', .05, i * .13)); },
};

// ==================== État ====================
// grid[r][c] = null | { id, v } | { rock: true }
let S = null, nextId = 1;

function newGame(mode) {
    const n = MODES[mode].n;
    S = { mode, n, grid: Array.from({ length: n }, () => Array(n).fill(null)), score: 0, moves: 0, history: [], undos: mode === 'mini' || mode === 'timed' ? 0 : 3,
        won: false, keepPlaying: false, over: false, time: 0, remaining: 180, started: false, maxTile: 0 };
    if (mode === 'blocks') { S.grid[1][1] = { rock: true }; S.grid[3][3] = { rock: true }; }
    addTile(); addTile();
}
function empties() {
    const out = [];
    for (let r = 0; r < S.n; r++) for (let c = 0; c < S.n; c++) if (!S.grid[r][c]) out.push([r, c]);
    return out;
}
function addTile() {
    const e = empties(); if (!e.length) return null;
    const [r, c] = e[Math.floor(Math.random() * e.length)];
    S.grid[r][c] = { id: nextId++, v: Math.random() < .9 ? 2 : 4, isNew: true };
    return S.grid[r][c];
}
const snapshot = () => ({ grid: S.grid.map(row => row.map(t => t && (t.rock ? { rock: true } : { id: t.id, v: t.v }))), score: S.score });

// Déplacement : dir 0=gauche 1=droite 2=haut 3=bas
function move(dir) {
    if (!S || S.over || (S.won && !S.keepPlaying)) return;
    const n = S.n, before = snapshot();
    let moved = false, gained = 0;
    S.grid.forEach(row => row.forEach(t => { if (t) { t.isNew = false; t.merged = false; } }));
    const lineCoords = i => Array.from({ length: n }, (_, k) => {
        if (dir === 0) return [i, k]; if (dir === 1) return [i, n - 1 - k];
        if (dir === 2) return [k, i]; return [n - 1 - k, i];
    });
    for (let i = 0; i < n; i++) {
        const coords = lineCoords(i);
        // Les rochers découpent la ligne en segments indépendants
        let seg = [];
        const flush = () => {
            const tiles = seg.map(([r, c]) => S.grid[r][c]).filter(Boolean);
            const out = [];
            for (let k = 0; k < tiles.length; k++) {
                const t = tiles[k];
                if (k + 1 < tiles.length && tiles[k + 1].v === t.v) {
                    const m = { id: nextId++, v: t.v * 2, merged: true, from: [t.id, tiles[k + 1].id] };
                    gained += m.v; out.push(m); k++;
                    Sound.merge(m.v);
                } else out.push(t);
            }
            seg.forEach(([r, c], k) => {
                const nt = out[k] || null;
                const old = S.grid[r][c];
                if ((old && old.id) !== (nt && nt.id)) moved = true;
                S.grid[r][c] = nt;
            });
            seg = [];
        };
        for (const [r, c] of coords) {
            if (S.grid[r][c] && S.grid[r][c].rock) { flush(); continue; }
            seg.push([r, c]);
        }
        flush();
    }
    if (!moved) return;
    if (!S.started) { S.started = true; S.t0 = performance.now(); }
    if (S.undos > 0 || S.history.length) { S.history.push(before); if (S.history.length > 20) S.history.shift(); }
    S.score += gained; S.moves++;
    Sound.slide();
    addTile();
    S.maxTile = Math.max(S.maxTile, ...S.grid.flat().filter(t => t && !t.rock).map(t => t.v));
    render(dir);
    if (!S.won && S.maxTile >= GOAL[S.mode]) { S.won = true; setTimeout(winModal, 300); return; }
    if (!canMove()) setTimeout(() => endGame(false), 350);
}
function canMove() {
    if (empties().length) return true;
    const n = S.n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const t = S.grid[r][c]; if (!t || t.rock) continue;
        if (c + 1 < n && S.grid[r][c + 1] && S.grid[r][c + 1].v === t.v) return true;
        if (r + 1 < n && S.grid[r + 1][c] && S.grid[r + 1][c].v === t.v) return true;
    }
    return false;
}
function undo() {
    if (!S || S.over || !S.history.length || S.undos <= 0) { if (S && S.undos <= 0) toast(t('Plus de retour en arrière'), 'undo-2'); return; }
    const p = S.history.pop();
    S.grid = p.grid; S.score = p.score; S.undos--;
    render(null, true);
}

function endGame(won) {
    if (S.over) return;
    S.over = true;
    won ? Sound.win() : Sound.over();
    const prev = history(S.mode).map(e => e.score || 0), best = Math.max(0, ...prev);
    Stats.record({ game: 'fusion', mode: S.mode, sub: null, won: won || S.won, time: Math.round(S.time * 10) / 10, score: S.score });
    const title = S.mode === 'timed' ? 'Temps écoulé' : 'Plus aucun coup possible';
    const text = `Score : ${S.score.toLocaleString('fr-FR')}\nPlus grande tuile : ${S.maxTile}${S.score > best ? '\nNouveau record' : `\nRecord : ${best.toLocaleString('fr-FR')}`}`;
    showModal(title, S.mode === 'timed' ? 'timer-off' : 'grid-2x2', text, [['Rejouer', 'rotate-ccw', true, () => start(S.mode)], ['Retour', null, false, quit]]);
}
function winModal() {
    Sound.win();
    showModal(`${GOAL[S.mode]} atteint !`, 'trophy', `Score : ${S.score.toLocaleString('fr-FR')} en ${S.moves} coups.`, [
        ['Continuer', 'arrow-right', true, () => { S.keepPlaying = true; }],
        ['Terminer', null, false, () => endGame(true)],
    ]);
}
const history = mode => Stats.all().filter(e => e.game === 'fusion' && e.mode === mode);
function showModal(title, ic, text, actions) {
    $('#modal-title').innerHTML = icon(ic) + `<span>${title}</span>`;
    $('#modal-text').textContent = text;
    const box = $('#modal-actions'); box.innerHTML = '';
    actions.forEach(([l, ic2, primary, fn]) => {
        const b = document.createElement('button');
        b.className = 'btn' + (primary ? ' primary' : '');
        b.innerHTML = (ic2 ? icon(ic2) : '') + l;
        b.onclick = () => { closeModals(); fn(); };
        box.appendChild(b);
    });
    $('#modal').classList.remove('hidden');
}

// ==================== Rendu ====================
const tileEls = new Map();
function geometry() {
    const tiles = $('#fz-tiles'), W = tiles.clientWidth, gap = parseFloat(getComputedStyle($('#fz-board')).getPropertyValue('--gap')) || 10;
    const size = (W - gap * (S.n - 1)) / S.n;
    return { size, gap };
}
function buildCells() {
    const b = $('#fz-board');
    b.style.setProperty('--n', S.n);
    b.style.setProperty('--gap', S.n >= 5 ? '8px' : '10px');
    $('#fz-cells').innerHTML = Array.from({ length: S.n * S.n }, (_, i) => `<div class="${S.grid[Math.floor(i / S.n)][i % S.n]?.rock ? 'rock' : ''}"></div>`).join('');
    $('#fz-tiles').innerHTML = ''; tileEls.clear();
}
function render(dir, instant) {
    const { size, gap } = geometry();
    const seen = new Set();
    for (let r = 0; r < S.n; r++) for (let c = 0; c < S.n; c++) {
        const tl = S.grid[r][c];
        if (!tl || tl.rock) continue;
        seen.add(tl.id);
        const x = c * (size + gap), y = r * (size + gap);
        let el = tileEls.get(tl.id);
        const fresh = !el;
        if (fresh) {
            el = document.createElement('div');
            tileEls.set(tl.id, el);
            $('#fz-tiles').appendChild(el);
            // Une tuile fusionnée part de la position de ses parents
            if (tl.merged && tl.from && !instant) {
                tl.from.forEach(pid => { const pe = tileEls.get(pid); if (pe) { pe.style.transform = `translate(${x}px, ${y}px)`; pe.style.zIndex = 1; } });
            }
        }
        el.className = `tile v${tl.v > 2048 ? 'big' : tl.v}${tl.isNew && !instant ? ' new' : ''}${tl.merged && fresh && !instant ? ' merged' : ''}`;
        el.style.width = el.style.height = size + 'px';
        const digits = String(tl.v).length;
        el.style.fontSize = size * (digits <= 2 ? .45 : digits === 3 ? .38 : digits === 4 ? .3 : .24) + 'px';
        el.textContent = tl.v;
        if (fresh && instant) el.style.transition = 'none';
        el.style.transform = `translate(${x}px, ${y}px)`;
        if (fresh && instant) requestAnimationFrame(() => { el.style.transition = ''; });
    }
    // Retirer les tuiles absorbées après l'animation de glissement
    tileEls.forEach((el, id) => {
        if (seen.has(id)) return;
        tileEls.delete(id);
        if (instant) el.remove(); else setTimeout(() => el.remove(), 120);
    });
    updateHud();
}
function updateHud() {
    $('#fz-score').textContent = S.score.toLocaleString('fr-FR');
    const best = Math.max(S.score, 0, ...history(S.mode).map(e => e.score || 0));
    $('#fz-best').textContent = best.toLocaleString('fr-FR');
    $('#undo-n').textContent = S.undos;
    $('#undo-btn').classList.toggle('hidden', S.mode === 'mini' || S.mode === 'timed');
    $('#undo-btn').disabled = !S.undos || !S.history.length;
    $('#chip-time').classList.toggle('hidden', S.mode !== 'timed');
}
function tick() {
    requestAnimationFrame(tick);
    if (!S || S.over || !S.started) return;
    S.time = (performance.now() - S.t0) / 1000;
    if (S.mode === 'timed') {
        const left = Math.max(0, 180 - S.time);
        $('#fz-time').textContent = fmtTime(Math.ceil(left));
        $('#chip-time').classList.toggle('warn', left < 15);
        if (left <= 0) endGame(false);
    }
}

// ==================== Navigation ====================
function selectMode(m) {
    currentMode = m; store.set('fusionMode', m);
    $$('.mode-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    const M = MODES[m];
    $('#setup-icon').innerHTML = icon(M.icon);
    $('#setup-title').textContent = M.title;
    $('#setup-desc').textContent = M.desc;
    $('#setup-rules').innerHTML = M.rules.map(([ic, txt]) => `<li>${icon(ic)}${txt}</li>`).join('');
    const h = history(m);
    $('#setup-best').textContent = h.length ? `${h.length} parties · record ${Math.max(...h.map(e => e.score || 0)).toLocaleString('fr-FR')}` : '';
    show('setup');
}
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id)); }
function start(mode) {
    closeModals();
    newGame(mode);
    show('game');
    $('#fz-title').textContent = MODES[mode].title;
    $('#fz-time').textContent = '3:00';
    buildCells();
    requestAnimationFrame(() => render(null, true));
}
function quit() { if (S && !S.over && S.moves > 0) { S.over = true; Stats.record({ game: 'fusion', mode: S.mode, sub: null, won: S.won, time: Math.round(S.time * 10) / 10, score: S.score }); } selectMode(currentMode); }
const updateSoundBtn = () => { $('#sound-btn').innerHTML = icon(settings.sound ? 'volume-2' : 'volume-x'); };
const ACTIONS = {
    'play': () => start(currentMode), 'restart': () => start(S ? S.mode : currentMode), 'quit': quit, 'undo': undo,
    'open-help': () => $('#help').classList.remove('hidden'), 'open-settings': () => $('#settings').classList.remove('hidden'),
    'close-modal': closeModals,
    'toggle-sound': () => { settings.sound = !settings.sound; saveSettings(); updateSoundBtn(); },
};
const KEYS = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, q: 0, a: 0, d: 1, z: 2, w: 2, s: 3 };

function init() {
    renderThemes($('#themes'));
    hydrateIcons(); updateSoundBtn();
    document.addEventListener('click', e => {
        const a = e.target.closest('[data-action]');
        if (a && ACTIONS[a.dataset.action]) ACTIONS[a.dataset.action]();
        if (e.target.classList.contains('modal') && e.target.id !== 'modal') closeModals();
    });
    $$('.mode-item').forEach(b => b.onclick = () => selectMode(b.dataset.mode));
    document.addEventListener('keydown', e => {
        if (!$('#screen-game').classList.contains('active') || modalOpen()) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k in KEYS) { e.preventDefault(); Sound.ensure(); move(KEYS[k]); }
        else if (k === 'u') undo();
        else if (k === 'r') start(S.mode);
    });
    let sw = null;
    const b = $('#fz-board');
    b.addEventListener('pointerdown', e => { sw = [e.clientX, e.clientY]; Sound.ensure(); });
    b.addEventListener('pointerup', e => {
        if (!sw) return;
        const dx = e.clientX - sw[0], dy = e.clientY - sw[1]; sw = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        Math.abs(dx) > Math.abs(dy) ? move(dx < 0 ? 0 : 1) : move(dy < 0 ? 2 : 3);
    });
    addEventListener('resize', () => { if (S && $('#screen-game').classList.contains('active')) render(null, true); });
    selectMode(currentMode);
    requestAnimationFrame(tick);
}
init();
