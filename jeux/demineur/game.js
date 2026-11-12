'use strict';
// ==================== Démineur — logique & interface ====================
// Dépend de commun/js/ui.js (store, settings, icon, toast, Stats…), solver.js, puzzles.js

const PRESETS = {
    beginner: { rows: 9, cols: 9, mines: 10, label: 'Débutant' },
    intermediate: { rows: 16, cols: 16, mines: 40, label: 'Intermédiaire' },
    expert: { rows: 16, cols: 30, mines: 99, label: 'Expert' },
};

const RAINBOW = ['#e5484d', '#f5a623', '#e8d44d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f'];

// ==================== Son ====================
const Sound = {
    ctx: null,
    ensure() {
        if (!settings.sound) return null;
        if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    tone(freq, dur = .08, type = 'sine', vol = .05, slide = 0, delay = 0) {
        const ctx = this.ensure(); if (!ctx) return;
        const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + .02);
    },
    noise(dur = .5, vol = .25) {
        const ctx = this.ensure(); if (!ctx) return;
        const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'lowpass'; f.frequency.value = 800; g.gain.value = vol;
        s.buffer = buf; s.connect(f).connect(g).connect(ctx.destination); s.start();
    },
    click() { this.tone(500, .04, 'triangle', .04, 150); },
    reveal(n) { this.tone(360 + Math.min(n, 40) * 10, .1, 'sine', .04, 250); },
    flag() { this.tone(640, .05, 'square', .02); },
    unflag() { this.tone(480, .05, 'square', .02, -150); },
    boom() { this.noise(.6, .3); this.tone(110, .4, 'sawtooth', .06, -80); },
    hit() { this.noise(.25, .18); },
    hint() { this.tone(880, .08, 'sine', .04); this.tone(1320, .12, 'sine', .03, 0, .07); },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .18, 'triangle', .05, 0, i * .09)); },
    bonus() { [784, 1046].forEach((f, i) => this.tone(f, .1, 'triangle', .04, 0, i * .06)); },
    coin() { this.tone(988, .06, 'square', .025); this.tone(1319, .1, 'square', .025, 0, .05); },
};
const vibrate = p => { if (settings.vibrate && navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) try { navigator.vibrate(p); } catch { /* ignoré */ } };

// ==================== Polyominos (MegaMines) ====================
function normShape(cells) {
    const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
    return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const shapeKey = s => s.map(p => p.join(',')).join(';');
// Tous les polyominos "fixes" (rotations distinctes) de taille n
const POLY = (() => {
    const out = { 1: [[[0, 0]]] };
    let cur = new Map([['0,0', [[0, 0]]]]);
    for (let n = 2; n <= 4; n++) {
        const next = new Map();
        for (const s of cur.values()) {
            const has = new Set(s.map(p => p.join(',')));
            for (const [r, c] of s) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (has.has((r + dr) + ',' + (c + dc))) continue;
                const ns = normShape([...s, [r + dr, c + dc]]);
                next.set(shapeKey(ns), ns);
            }
        }
        out[n] = [...next.values()];
        cur = next;
    }
    return out;
})();
const rotateShape = s => normShape(s.map(([r, c]) => [c, -r]));
function isConnected(cells) {
    if (!cells.length) return false;
    const set = new Set(cells.map(p => p.join(','))), seen = new Set([cells[0].join(',')]), stack = [cells[0]];
    while (stack.length) {
        const [r, c] = stack.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = (r + dr) + ',' + (c + dc);
            if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([r + dr, c + dc]); }
        }
    }
    return seen.size === cells.length;
}
function shapeSvg(shape, cell = 7, color = 'currentColor') {
    const h = Math.max(...shape.map(p => p[0])) + 1, w = Math.max(...shape.map(p => p[1])) + 1;
    return `<svg width="${w * (cell + 1)}" height="${h * (cell + 1)}">${shape.map(([r, c]) => `<rect x="${c * (cell + 1)}" y="${r * (cell + 1)}" width="${cell}" height="${cell}" rx="1.5" fill="${color}"/>`).join('')}</svg>`;
}

// ==================== Économie : bonus & malus ====================
const BONUSES = {
    time:     { name: '+15 secondes', desc: 'Ajouté immédiatement au chrono.', icon: 'alarm-clock-plus', price: 15, instant: true },
    shield:   { name: 'Bouclier', desc: 'Absorbe la prochaine mine.', icon: 'shield', price: 25 },
    probe:    { name: 'Sonde', desc: 'Teste une case sans risque.', icon: 'scan-search', price: 15 },
    radar:    { name: 'Radar', desc: 'Ouvre une zone 3×3 sans risque.', icon: 'radar', price: 25 },
    hint:     { name: 'Indice', desc: 'Montre une case sûre.', icon: 'lightbulb', price: 10 },
    freeze:   { name: 'Gel', desc: 'Stoppe le chrono 10 secondes.', icon: 'snowflake', price: 20 },
    double:   { name: 'Pièces ×2', desc: 'Double les gains de la grille suivante.', icon: 'badge-dollar-sign', price: 20, instant: true },
    purge:    { name: 'Purge', desc: 'Retire tous les malus de la grille en cours.', icon: 'sparkles', price: 35 },
    autoflag: { name: 'Déminage auto', desc: 'Pose les drapeaux sur toutes les mines certaines.', icon: 'flag-triangle-right', price: 30 },
};
const MALUS = {
    fog:       { name: 'Brouillard', icon: 'cloud-fog', desc: 'Les chiffres s\'effacent loin du curseur.' },
    noflags:   { name: 'Sans drapeaux', icon: 'flag-off', desc: 'Impossible de poser des drapeaux.' },
    cooldown:  { name: '1 clic / s', icon: 'hourglass', desc: 'Une seule révélation par seconde.' },
    rainbow:   { name: 'Arc-en-ciel', icon: 'rainbow', desc: 'Les chiffres deviennent des couleurs inconnues.' },
    nochord:   { name: 'Sans chording', icon: 'mouse-pointer-ban', desc: 'Cliquer sur un chiffre ne fait rien.' },
    fast:      { name: 'Chrono ×1.5', icon: 'gauge', desc: 'Le temps file plus vite.' },
    dense:     { name: 'Dense', icon: 'bomb', desc: '+30 % de mines.' },
    nocascade: { name: 'Sans cascade', icon: 'droplet-off', desc: 'Les zones vides ne s\'ouvrent plus seules.' },
    tiny:      { name: 'Myopie', icon: 'eye-off', desc: 'Grille affichée en tout petit.' },
};

// ==================== État ====================
let G = null;
let currentMode = store.get('mode', 'classic');
let classicPreset = store.get('classicPreset', 'beginner');
let rainbowPreset = store.get('rainbowPreset', 'beginner');
let pzChapter = store.get('pzChapter', 1);

function newState(mode, rows, cols, mineCount, extra = {}) {
    const n = rows * cols;
    return Object.assign({
        mode, rows, cols, mineCount,
        mines: new Uint8Array(n), adj: new Uint8Array(n),
        open: new Uint8Array(n), flag: new Uint8Array(n), shown: new Uint8Array(n),
        group: new Int16Array(n).fill(-1), groups: [],
        openCount: 0, started: false, over: false, generating: false,
        elapsed: 0, lastTick: 0, limit: 0, timerId: null,
        opts: {}, hintsUsed: 0, cursor: -1, cells: [], lit: new Set(), lastClick: 0,
    }, extra);
}
const nbOf = i => Solver.getNeighbors(G.rows, G.cols)[i];

// ==================== Configuration des modes ====================
const MODES = {
    classic: {
        title: 'Classique', icon: 'target',
        desc: 'Le démineur original. Le premier clic est toujours sûr.',
        body: () => `
            <div class="seg" id="seg-classic">${segPresets(classicPreset)}</div>
            <div class="fields ${classicPreset === 'custom' ? '' : 'hidden'}" id="custom-fields">
                ${range('c-rows', 'Lignes', 5, 30, store.get('cRows', 16))}
                ${range('c-cols', 'Colonnes', 5, 40, store.get('cCols', 16))}
                ${range('c-mines', 'Mines', 1, 250, store.get('cMines', 40))}
            </div>
            <div class="divider"></div>
            ${toggleHtml('opt-noguess', 'Sans hasard', 'Grille garantie résoluble par logique pure', 'noGuess', true)}
            ${toggleHtml('opt-noflags', 'Sans drapeaux', 'Tout se joue de tête', 'noFlags')}
            ${toggleHtml('opt-fog', 'Brouillard', 'Les chiffres s\'effacent loin du curseur', 'fog')}
            ${toggleHtml('opt-countdown', 'Contre-la-montre', 'Termine avant la fin du chrono', 'countdown')}`,
        best: () => bestLine('classic', PRESETS[classicPreset] ? classicPreset : null, 'time'),
        play: startClassic,
    },
    mega: {
        title: 'MegaMines', icon: 'shapes',
        desc: 'Les mines sont des formes de 1 à 4 cases. Les drapeaux aussi : dessine la forme, puis pose-la d\'un coup.',
        body: () => {
            const c = store.get('megaCfg', { size: 14, counts: [6, 4, 3, 2] });
            return `<div class="fields">
                ${range('m-size', 'Taille de la grille', 8, 24, c.size)}
                ${range('m-1', 'Mines de 1 case', 0, 25, c.counts[0])}
                ${range('m-2', 'Mines de 2 cases', 0, 15, c.counts[1])}
                ${range('m-3', 'Mines de 3 cases', 0, 12, c.counts[2])}
                ${range('m-4', 'Mines de 4 cases', 0, 10, c.counts[3])}
            </div>
            <ul class="rules">
                <li>${icon('info')}Les cases d'une forme se touchent par les côtés, jamais en diagonale.</li>
                <li>${icon('info')}Deux formes différentes ne se touchent jamais par un côté.</li>
            </ul>`;
        },
        best: () => bestLine('mega', null, 'time'),
        play: startMega,
    },
    rainbow: {
        title: 'Arc-en-ciel', icon: 'rainbow',
        desc: 'Les chiffres sont remplacés par des couleurs, et la correspondance est tirée au hasard à chaque partie. Déduis le code couleur en jouant.',
        body: () => `<div class="seg" id="seg-rainbow">${segPresets(rainbowPreset, false)}</div>
            <ul class="rules"><li>${icon('info')}La grille est toujours sans hasard : une fois le code trouvé, tout se déduit.</li></ul>`,
        best: () => bestLine('rainbow', rainbowPreset, 'time'),
        play: startRainbow,
    },
    economy: {
        title: 'Économie', icon: 'coins',
        desc: 'Enchaîne les grilles contre la montre. Gagne des pièces, achète des bonus… mais chaque grille ajoute des malus.',
        body: () => `<ul class="rules">
                <li>${icon('timer')}60 secondes au départ, +10 s par grille terminée.</li>
                <li>${icon('coins')}Les pièces gagnées dépendent de la taille de la grille et des malus actifs.</li>
                <li>${icon('shopping-cart')}Entre deux grilles, la boutique propose des bonus.</li>
                <li>${icon('skull')}À partir de la grille 2, des malus s'ajoutent : brouillard, sans drapeaux, 1 clic/s, arc-en-ciel…</li>
            </ul>`,
        best: () => bestLine('economy', null, 'score', 'grilles'),
        play: () => startEconomy(),
    },
    blitz: {
        title: 'Blitz', icon: 'zap',
        desc: '60 secondes. Chaque grille terminée rapporte du temps, chaque mine en coûte.',
        body: () => `<ul class="rules">
                <li>${icon('timer')}Grille terminée : +10 s et plus.</li>
                <li>${icon('bomb')}Mine touchée : −10 s, la partie continue.</li>
                <li>${icon('star')}Score : 1 point par case ouverte, +25 par grille.</li>
            </ul>`,
        best: () => bestLine('blitz', null, 'score', 'points'),
        play: () => startBlitz(),
    },
    survival: {
        title: 'Survie', icon: 'shield',
        desc: '3 boucliers. Les vagues grandissent et se densifient. Combien de temps tiendras-tu ?',
        body: () => `<ul class="rules">
                <li>${icon('shield')}Une mine touchée retire un bouclier au lieu de terminer la partie.</li>
                <li>${icon('shield-plus')}+1 bouclier toutes les 3 vagues (maximum 5).</li>
            </ul>`,
        best: () => bestLine('survival', null, 'score', 'vagues'),
        play: () => startSurvival(),
    },
    duel: {
        title: 'Duel 1v1', icon: 'swords',
        desc: 'Même grille sans hasard pour les deux joueurs. Le premier qui la termine gagne. Touche une mine et tu perds.',
        body: () => {
            if (!Online.configured) return `<ul class="rules"><li>${icon('cloud-off')}Le mode en ligne n'est pas encore activé sur ce site.</li></ul>`;
            if (!Online.user) return `<ul class="rules"><li>${icon('log-in')}Il faut un compte pour jouer en duel.</li></ul><a class="btn primary block" href="../../pages/account.html">${icon('log-in')} Se connecter</a>`;
            return `<div class="seg" id="seg-duel">${segPresets(store.get('duelPreset', 'beginner'), false)}</div>
                <button class="btn primary block" id="duel-create">${icon('plus')} Créer une partie</button>
                <div class="divider" style="margin:16px 0"></div>
                <div class="fields"><label>Code d'un ami<input id="duel-code" maxlength="4" placeholder="ABCD" style="height:40px;padding:0 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface-2);text-transform:uppercase;font-family:var(--mono);letter-spacing:.2em"></label></div>
                <button class="btn block" id="duel-join">${icon('log-in')} Rejoindre</button>`;
        },
        best: () => bestLine('duel', null, 'time'),
        play: () => {},
    },
};

function segPresets(active, custom = true) {
    const items = Object.entries(PRESETS).map(([k, p]) => `<button data-preset="${k}" class="${k === active ? 'active' : ''}"><b>${p.label}</b><small>${p.rows}×${p.cols} · ${p.mines}</small></button>`);
    if (custom) items.push(`<button data-preset="custom" class="${active === 'custom' ? 'active' : ''}"><b>Perso</b><small>à régler</small></button>`);
    return items.join('');
}
function range(id, label, min, max, val) {
    return `<label>${label} <output id="${id}-out">${val}</output><input type="range" id="${id}" min="${min}" max="${max}" value="${val}"></label>`;
}
function toggleHtml(id, title, sub, key, def = false) {
    const o = store.get('classicOpts', {});
    const on = key in o ? o[key] : def;
    return `<label class="toggle"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="sw"></span><div><b>${title}</b><small>${sub}</small></div></label>`;
}
function bestLine(mode, sub, kind, unit) {
    const list = Stats.all().filter(e => e.game === 'demineur' && e.mode === mode && (sub === null || e.sub === sub));
    if (!list.length) return '';
    const wins = list.filter(e => e.won).length;
    if (kind === 'time') {
        const times = list.filter(e => e.won).map(e => e.time);
        return `${list.length} parties · ${wins} victoires${times.length ? ` · record ${fmtTime(Math.min(...times))}` : ''}`;
    }
    return `${list.length} parties · record ${Math.max(...list.map(e => e.score || 0))} ${unit}`;
}

function selectMode(m) {
    currentMode = m; store.set('mode', m);
    $$('.mode-item').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    if (m === 'puzzles') { renderPuzzles(); show('puzzles'); return; }
    const M = MODES[m];
    $('#setup-icon').innerHTML = icon(M.icon);
    $('#setup-title').textContent = M.title;
    $('#setup-desc').textContent = M.desc;
    $('#setup-body').innerHTML = M.body();
    $('#setup-best').textContent = M.best();
    $$('#setup-body input[type=range]').forEach(el => el.addEventListener('input', () => { $('#' + el.id + '-out').textContent = el.value; }));
    $$('#seg-classic button').forEach(b => b.onclick = () => {
        classicPreset = b.dataset.preset; store.set('classicPreset', classicPreset);
        $$('#seg-classic button').forEach(x => x.classList.toggle('active', x === b));
        $('#custom-fields').classList.toggle('hidden', classicPreset !== 'custom');
        $('#setup-best').textContent = M.best();
    });
    $('#play-btn').classList.toggle('hidden', m === 'duel');
    $$('#seg-duel button').forEach(b => b.onclick = () => {
        store.set('duelPreset', b.dataset.preset);
        $$('#seg-duel button').forEach(x => x.classList.toggle('active', x === b));
    });
    if ($('#duel-create')) {
        $('#duel-create').onclick = () => Duel.create(store.get('duelPreset', 'beginner'));
        $('#duel-join').onclick = () => Duel.join($('#duel-code').value.trim().toUpperCase());
        $('#duel-code').onkeydown = e => { if (e.key === 'Enter') $('#duel-join').click(); };
    }
    $$('#seg-rainbow button').forEach(b => b.onclick = () => {
        rainbowPreset = b.dataset.preset; store.set('rainbowPreset', rainbowPreset);
        $$('#seg-rainbow button').forEach(x => x.classList.toggle('active', x === b));
        $('#setup-best').textContent = M.best();
    });
    show('setup');
}

function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id));
    if (id !== 'game') stopTimer();
}

function showModal({ title, ic, text, stars, extra, actions }) {
    $('#modal-title').innerHTML = (ic ? icon(ic) : '') + `<span>${title}</span>`;
    $('#modal-text').textContent = text || '';
    $('#modal-stars').innerHTML = stars === undefined ? '' : [1, 2, 3].map(k => icon('star', k <= stars ? 'star-on' : 'star-off')).join('');
    $('#modal-extra').innerHTML = '';
    if (extra) $('#modal-extra').appendChild(extra);
    const box = $('#modal-actions'); box.innerHTML = '';
    actions.forEach(a => {
        const b = document.createElement('button');
        b.className = 'btn' + (a.primary ? ' primary' : '');
        b.innerHTML = (a.icon ? icon(a.icon) : '') + a.label;
        b.onclick = () => { closeModals(); a.fn(); };
        box.appendChild(b);
    });
    $('#modal').classList.remove('hidden');
}

// ==================== Démarrage ====================
function startClassic() {
    let cfg = PRESETS[classicPreset];
    if (!cfg) {
        const rows = +$('#c-rows').value, cols = +$('#c-cols').value;
        store.set('cRows', rows); store.set('cCols', cols); store.set('cMines', +$('#c-mines').value);
        cfg = { rows, cols, mines: Math.max(1, Math.min(+$('#c-mines').value, rows * cols - 9)), label: 'Perso' };
    }
    const opts = { noGuess: $('#opt-noguess').checked, noFlags: $('#opt-noflags').checked, fog: $('#opt-fog').checked, countdown: $('#opt-countdown').checked };
    store.set('classicOpts', opts);
    G = newState('classic', cfg.rows, cfg.cols, cfg.mines, { opts, sub: classicPreset, title: `Classique · ${cfg.label}`, cfg });
    if (opts.countdown) G.limit = Math.round((cfg.rows * cfg.cols - cfg.mines) * .45 + 30);
    enterGame();
}
function restartClassic() { G = newState('classic', G.rows, G.cols, G.mineCount, { opts: G.opts, sub: G.sub, title: G.title, cfg: G.cfg, limit: G.limit }); enterGame(); }

function startRainbow(preset = rainbowPreset) {
    const p = PRESETS[preset] || PRESETS.beginner;
    G = newState('rainbow', p.rows, p.cols, p.mines, { sub: preset, title: `Arc-en-ciel · ${p.label}`, opts: { noGuess: true, rainbow: true } });
    G.colorMap = shuffle(RAINBOW.slice());
    enterGame();
    notice('rainbow', 'Les couleurs remplacent les chiffres de 1 à 8. Le code change à chaque partie.');
}

function startPuzzle(id) {
    const p = PUZZLES.find(x => x.id === id), d = parsePuzzle(p);
    G = newState('puzzle', d.rows, d.cols, d.mineCount, { puzzle: p, sub: p.id, title: `Puzzle ${p.id} · ${p.title}`, opts: { noGuess: true } });
    G.mines = d.mines; G.adj = Solver.computeAdjacent(d.rows, d.cols, d.mines);
    enterGame();
    G.started = true; startTimer();
    d.starts.forEach(s => revealCell(s, true));
    notice('lightbulb', p.hint);
}

const BLITZ_BOARDS = [[8, 8, 10], [9, 9, 12], [10, 10, 16], [10, 12, 20], [12, 12, 26], [12, 14, 32], [14, 14, 38]];
function startBlitz(run) {
    run = run || { level: 0, score: 0, remaining: 60 };
    const [r, c, m] = BLITZ_BOARDS[Math.min(run.level, BLITZ_BOARDS.length - 1)];
    G = newState('blitz', r, c, m, { run, title: `Blitz · grille ${run.level + 1}`, opts: { noGuess: true } });
    enterGame(); startTimer();
}

function survivalBoard(wave) {
    const rows = Math.min(7 + wave, 20), cols = Math.min(Math.round(rows * 1.25), 26);
    return [rows, cols, Math.round(rows * cols * Math.min(.11 + wave * .012, .21))];
}
function startSurvival(run) {
    run = run || { wave: 1, lives: 3 };
    const [r, c, m] = survivalBoard(run.wave);
    G = newState('survival', r, c, m, { run, title: `Survie · vague ${run.wave}`, opts: { noGuess: true } });
    enterGame();
}

function startMega() {
    const size = +$('#m-size').value, counts = [1, 2, 3, 4].map(k => +$('#m-' + k).value);
    store.set('megaCfg', { size, counts });
    const total = counts.reduce((a, n, i) => a + n * (i + 1), 0);
    if (!total) { toast('Ajoute au moins une mine.', 'info'); return; }
    if (total > size * size * .35) { toast('Trop de mines pour cette taille.', 'info'); return; }
    G = newState('mega', size, size, total, { counts, title: 'MegaMines', opts: {}, inv: [0, ...counts], megaSel: null, pads: { 2: [], 3: [], 4: [] } });
    enterGame();
    renderMegaTray();
}

// ----- Économie -----
const ECO_BOARDS = [[8, 8, 10], [9, 9, 13], [10, 10, 16], [10, 12, 20], [12, 12, 25], [12, 14, 30], [14, 14, 36], [14, 16, 42]];
function startEconomy(run) {
    if (!run) run = { grid: 1, coins: 0, earned: 0, remaining: 60, inv: {}, double: false, malus: [] };
    let [r, c, m] = ECO_BOARDS[Math.min(run.grid - 1, ECO_BOARDS.length - 1)];
    if (run.malus.includes('dense')) m = Math.round(m * 1.3);
    G = newState('economy', r, c, m, { run, title: `Économie · grille ${run.grid}`, opts: { noGuess: true } });
    applyMalusOpts();
    if (G.opts.rainbow) G.colorMap = shuffle(RAINBOW.slice());
    enterGame(); startTimer();
    renderEcoTray();
}
function applyMalusOpts() {
    const mal = new Set(G.run.malus);
    Object.assign(G.opts, {
        fog: mal.has('fog'), noFlags: mal.has('noflags'), rainbow: mal.has('rainbow'), noChord: mal.has('nochord'),
        noCascade: mal.has('nocascade'), cooldown: mal.has('cooldown'), speed: mal.has('fast') ? 1.5 : 1, tiny: mal.has('tiny'),
    });
}
function pickMalus(grid) {
    const n = Math.min(Math.floor(grid / 2), 4);
    return shuffle(Object.keys(MALUS)).slice(0, n);
}

function restart() {
    if (!G) return;
    closeModals();
    ({
        classic: restartClassic, puzzle: () => startPuzzle(G.puzzle.id), blitz: () => startBlitz(), survival: () => startSurvival(),
        rainbow: () => startRainbow(G.sub), economy: () => startEconomy(), duel: quit,
        mega: () => { G = newState('mega', G.rows, G.cols, G.mineCount, { counts: G.counts, title: 'MegaMines', opts: {}, inv: [0, ...G.counts], megaSel: null, pads: { 2: [], 3: [], 4: [] } }); enterGame(); renderMegaTray(); },
    })[G.mode]();
}
function quit() {
    stopTimer();
    Duel.leave();
    if (G && G.mode === 'puzzle') { renderPuzzles(); show('puzzles'); }
    else selectMode(currentMode);
}

// ==================== Plateau ====================
function enterGame() {
    stopTimer();
    show('game');
    $('#hud-title').textContent = G.title;
    $('#notice').classList.add('hidden');
    $('#tray').classList.add('hidden'); $('#tray').innerHTML = '';
    $('#chip-lives').classList.toggle('hidden', G.mode !== 'survival');
    $('#chip-score').classList.toggle('hidden', G.mode !== 'blitz');
    $('#chip-coins').classList.toggle('hidden', G.mode !== 'economy');
    $('#chip-opp').classList.toggle('hidden', G.mode !== 'duel');
    $('#flag-tool').classList.toggle('hidden', !!G.opts.noFlags);
    $('#flag-tool').classList.remove('on');
    $('#hint-btn').classList.toggle('hidden', G.mode === 'economy' || G.mode === 'duel');
    $$('.chip.malus').forEach(c => c.remove());
    if (G.mode === 'economy') G.run.malus.forEach(k => {
        const ch = document.createElement('div'); ch.className = 'chip malus'; ch.title = MALUS[k].desc;
        ch.innerHTML = icon(MALUS[k].icon) + MALUS[k].name; $('.hud-stats').appendChild(ch);
    });
    G.flagTool = false;
    if (G.mode === 'classic') {
        const tags = [G.opts.noGuess && 'sans hasard', G.opts.noFlags && 'sans drapeaux', G.opts.fog && 'brouillard', G.opts.countdown && 'contre-la-montre'].filter(Boolean);
        if (tags.length) notice('sliders-horizontal', tags.join(' · '));
    }
    buildBoard();
    updateHud();
}

function notice(ic, text) { const n = $('#notice'); n.innerHTML = icon(ic) + `<span>${text}</span>`; n.classList.remove('hidden'); }

function buildBoard() {
    const board = $('#board');
    board.innerHTML = '';
    board.className = 'board' + (G.opts.fog ? ' fog' : '');
    board.style.gridTemplateColumns = `repeat(${G.cols}, var(--size))`;
    const frag = document.createDocumentFragment();
    G.cells = new Array(G.rows * G.cols);
    for (let i = 0; i < G.rows * G.cols; i++) {
        const d = document.createElement('div');
        d.className = 'cell'; d.dataset.i = i;
        G.cells[i] = d; frag.appendChild(d);
    }
    board.appendChild(frag);
    fitBoard();
}

function fitBoard() {
    if (!G || !$('#screen-game').classList.contains('active')) return;
    const wrap = $('#board-wrap');
    const w = wrap.clientWidth - 24, h = Math.max(220, innerHeight - wrap.getBoundingClientRect().top - 36);
    let size = Math.floor(Math.min(w / G.cols, h / G.rows) - 2);
    size = Math.max(20, Math.min(42, size)) * settings.zoom;
    if (G.opts.tiny) size = Math.min(size, 17);
    $('#board').style.setProperty('--size', Math.round(Math.max(13, size)) + 'px');
}
function setZoom(d) { settings.zoom = Math.max(.6, Math.min(2.2, +(settings.zoom + d).toFixed(2))); saveSettings(); fitBoard(); }

const ICON_FLAG = () => icon('flag');
const ICON_MINE = () => icon('bomb');

function paint(i, delay) {
    const el = G.cells[i];
    let cls = 'cell', html = '';
    if (G.open[i]) {
        cls += ' open';
        const n = G.adj[i];
        if (n) {
            if (G.opts.rainbow) html = `<span class="dot" style="background:${G.colorMap[n - 1]}"></span>`;
            else { cls += ' n' + n; html = String(n); }
        }
        if (delay !== undefined && settings.anim) { cls += ' anim'; el.style.animationDelay = delay + 'ms'; }
    } else if (G.shown[i]) { cls += ' open mine'; html = ICON_MINE(); }
    else if (G.flag[i]) {
        cls += ' flag'; html = ICON_FLAG();
        const g = G.group[i];
        if (g >= 0 && G.groups[g].cells.length > 1) {
            cls += ' g';
            const r = Math.floor(i / G.cols), c = i % G.cols, same = j => G.group[j] === g;
            if (r === 0 || !same(i - G.cols)) cls += ' gt';
            if (r === G.rows - 1 || !same(i + G.cols)) cls += ' gb';
            if (c === 0 || !same(i - 1)) cls += ' gl';
            if (c === G.cols - 1 || !same(i + 1)) cls += ' gr';
        }
    }
    if (G.lit.has(i)) cls += ' lit';
    if (i === G.cursor) cls += ' cursor';
    el.className = cls;
    if (el.innerHTML !== html) el.innerHTML = html;
}

function updateHud() {
    let flags = 0, shown = 0;
    for (let i = 0; i < G.flag.length; i++) { flags += G.flag[i]; shown += G.shown[i]; }
    $('#hud-mines').textContent = G.mineCount - flags - shown;
    if (G.mode === 'survival') $('#hud-lives').textContent = G.run.lives;
    if (G.mode === 'blitz') $('#hud-score').textContent = G.run.score;
    if (G.mode === 'economy') $('#hud-coins').textContent = G.run.coins;
    updateTimer();
}

// ==================== Chrono ====================
// Pour Blitz / Économie : G.run.remaining décroît (vitesse variable, gel possible)
const isClockMode = () => G && (G.mode === 'blitz' || G.mode === 'economy');
function startTimer() {
    stopTimer();
    G.lastTick = performance.now();
    G.timerId = setInterval(tick, 100);
}
function stopTimer() { if (G && G.timerId) { clearInterval(G.timerId); G.timerId = null; } }
function tick() {
    if (!G || G.over) return;
    const now = performance.now(), dt = (now - G.lastTick) / 1000;
    G.lastTick = now;
    if (isClockMode()) {
        if (!(G.frozenUntil > now)) G.run.remaining -= dt * (G.opts.speed || 1);
        if (G.run.remaining <= 0) { G.run.remaining = 0; updateTimer(); clockOver(); return; }
    } else if (G.started) G.elapsed += dt;
    updateTimer();
}
function updateTimer() {
    if (!G) return;
    const chip = $('#chip-time');
    if (isClockMode()) {
        const left = G.run.remaining;
        $('#hud-time').textContent = fmtTime(Math.ceil(left));
        chip.classList.toggle('warn', left < 10);
        return;
    }
    if (G.limit) {
        const left = G.limit - G.elapsed;
        $('#hud-time').textContent = fmtTime(Math.ceil(left));
        chip.classList.toggle('warn', left < 15 && G.started);
        if (left <= 0 && !G.over && G.started) lose(-1, 'Temps écoulé');
    } else {
        $('#hud-time').textContent = fmtTime(G.elapsed);
        chip.classList.remove('warn');
    }
}

// ==================== Génération ====================
function randomMines(first) {
    const { rows, cols, mineCount } = G, n = rows * cols;
    const avoid = new Set([first]);
    if (n - mineCount >= 9) nbOf(first).forEach(j => avoid.add(j));
    const pool = [];
    for (let i = 0; i < n; i++) if (!avoid.has(i)) pool.push(i);
    const mines = new Uint8Array(n);
    for (let k = 0; k < mineCount && k < pool.length; k++) {
        const j = k + Math.floor(Math.random() * (pool.length - k));
        [pool[k], pool[j]] = [pool[j], pool[k]];
        mines[pool[k]] = 1;
    }
    return mines;
}
function megaMines(first) {
    const { rows, cols } = G, n = rows * cols;
    for (let attempt = 0; attempt < 300; attempt++) {
        const mines = new Uint8Array(n), avoid = new Set([first, ...nbOf(first)]);
        let ok = true;
        for (let size = 4; size >= 1 && ok; size--) {
            for (let k = 0; k < G.counts[size - 1] && ok; k++) {
                let placed = false;
                for (let t = 0; t < 300 && !placed; t++) {
                    const shape = POLY[size][Math.floor(Math.random() * POLY[size].length)];
                    const r0 = Math.floor(Math.random() * rows), c0 = Math.floor(Math.random() * cols);
                    const idx = [];
                    let bad = false;
                    for (const [r, c] of shape) {
                        const rr = r0 + r, cc = c0 + c;
                        if (rr >= rows || cc >= cols) { bad = true; break; }
                        idx.push(rr * cols + cc);
                    }
                    if (bad) continue;
                    // ni chevauchement, ni contact par un côté avec une autre forme
                    const clash = idx.some(i => {
                        if (mines[i] || avoid.has(i)) return true;
                        const r = Math.floor(i / cols), c = i % cols;
                        return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => a >= 0 && a < rows && b >= 0 && b < cols && mines[a * cols + b]);
                    });
                    if (clash) continue;
                    idx.forEach(i => { mines[i] = 1; });
                    placed = true;
                }
                if (!placed) ok = false;
            }
        }
        if (ok) return mines;
    }
    toast('Grille trop chargée : formes simplifiées.', 'info');
    return randomMines(first);
}

function generate(first, done) {
    if (G.mode === 'mega') { done(megaMines(first), true); return; }
    if (!G.opts.noGuess) { done(randomMines(first), true); return; }
    const t0 = performance.now(), myGame = G;
    let last = null, overlay = null;
    G.generating = true;
    const loadTimer = setTimeout(() => {
        overlay = document.createElement('div'); overlay.className = 'loading'; overlay.textContent = 'Génération d\'une grille sans hasard…';
        $('#board').appendChild(overlay);
    }, 150);
    const finish = (m, ok) => { clearTimeout(loadTimer); if (overlay) overlay.remove(); G.generating = false; done(m, ok); };
    const step = () => {
        if (G !== myGame) return;
        const s = performance.now();
        while (performance.now() - s < 35) {
            last = randomMines(first);
            if (Solver.checkNoGuess(G.rows, G.cols, last, [first]).solvable) { finish(last, true); return; }
        }
        if (performance.now() - t0 > 6000) { finish(last, false); return; }
        setTimeout(step, 0);
    };
    step();
}

// ==================== Actions ====================
function primaryAction(i) {
    if (!G || G.over || G.generating) return;
    if (G.armed) { useArmed(i); return; }
    if (G.open[i]) { chord(i); return; }
    if (G.flagTool) { secondaryAction(i); return; }
    if (G.flag[i] || G.shown[i]) return;
    if (G.opts.cooldown) {
        const now = performance.now();
        if (now - G.lastClick < 1000) { toast('Cadence limitée : 1 clic par seconde', 'hourglass', 900); shake(); return; }
        G.lastClick = now;
    }
    if (!G.started) { firstClick(i, () => revealCell(i)); return; }
    revealCell(i);
}
function firstClick(i, then) {
    G.started = true;
    generate(i, (mines, ok) => {
        G.mines = mines;
        G.adj = Solver.computeAdjacent(G.rows, G.cols, mines);
        if (!ok) toast('Pas de grille sans hasard trouvée à cette densité : grille classique.', 'info', 3500);
        if (!isClockMode()) startTimer();
        then();
    });
}

function secondaryAction(i) {
    if (!G || G.over || G.generating) return;
    if (G.open[i]) { chord(i); return; }
    if (G.mode === 'mega') { megaFlagAction(i); return; }
    toggleFlag(i);
}

function revealCell(i, silent) {
    if (G.open[i] || G.flag[i] || G.shown[i]) return;
    if (G.mines[i]) { mineHit(i); return; }
    const queue = [[i, 0]], seen = new Set([i]), opened = [];
    while (queue.length) {
        const [j, depth] = queue.shift();
        if (G.open[j] || G.flag[j] || G.mines[j] || G.shown[j]) continue;
        G.open[j] = 1; G.openCount++; opened.push([j, depth]);
        if (G.adj[j] === 0 && !G.opts.noCascade) for (const k of nbOf(j)) if (!seen.has(k)) { seen.add(k); queue.push([k, depth + 1]); }
    }
    opened.forEach(([j, depth]) => paint(j, Math.min(depth * 18, 500)));
    if (G.mode === 'blitz') G.run.score += opened.length;
    if (G.mode === 'duel') Duel.progress();
    if (!silent) { opened.length > 1 ? Sound.reveal(opened.length) : Sound.click(); }
    if (G.opts.fog) lightAround(i);
    updateHud();
    checkWin();
}

function chord(i) {
    if (!G.adj[i] || G.opts.noChord) return;
    const around = nbOf(i);
    const marked = around.filter(j => G.flag[j] || G.shown[j]).length;
    const targets = around.filter(j => !G.open[j] && !G.flag[j] && !G.shown[j]);
    if (marked !== G.adj[i] || !targets.length) {
        targets.forEach(j => { G.cells[j].classList.add('chord'); setTimeout(() => G.cells[j] && G.cells[j].classList.remove('chord'), 160); });
        return;
    }
    const bad = targets.find(j => G.mines[j]);
    if (bad !== undefined) { mineHit(bad); if (G.over) return; }
    targets.forEach(j => { if (!G.mines[j]) revealCell(j, true); });
    Sound.reveal(targets.length);
}

function toggleFlag(i) {
    if (G.open[i] || G.shown[i]) return;
    if (G.opts.noFlags) { toast('Drapeaux désactivés', 'flag-off'); return; }
    G.flag[i] ^= 1;
    G.flag[i] ? Sound.flag() : Sound.unflag();
    vibrate(G.flag[i] ? 20 : 8);
    paint(i); updateHud();
}

function mineHit(i) {
    if (G.mode === 'duel') { Duel.send('boom', {}); lose(i, 'Tu as touché une mine'); return; }
    const soft = G.mode === 'survival' || G.mode === 'blitz' || G.mode === 'economy';
    if (!soft) { lose(i); return; }
    G.shown[i] = 1; paint(i);
    Sound.hit(); vibrate([50, 30, 50]); shake();
    if (G.mode === 'survival') {
        G.run.lives--;
        if (G.run.lives <= 0) { updateHud(); lose(i, `Tombé à la vague ${G.run.wave}`); return; }
        toast(`Bouclier perdu, il en reste ${G.run.lives}`, 'shield-alert');
    } else if (G.mode === 'economy' && G.run.inv.shield > 0) {
        G.run.inv.shield--; renderEcoTray(); toast('Le bouclier a absorbé la mine', 'shield');
    } else {
        G.run.remaining -= 10; toast('−10 secondes', 'bomb');
    }
    updateHud(); checkWin();
}

function shake() { if (!settings.anim) return; const b = $('#board'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }

// ==================== MegaMines : drapeaux en forme ====================
function megaFlagAction(i) {
    if (G.flag[i]) { removeGroup(G.group[i]); return; }
    const sel = G.megaSel;
    if (!sel) {
        if (G.inv[1] > 0) { placeGroup([[0, 0]], i); return; }
        toast('Choisis d\'abord une forme de drapeau dans le panneau', 'shapes'); return;
    }
    placeGroup(sel.shape, i);
}
function shapeCellsAt(shape, i) {
    const r0 = Math.floor(i / G.cols), c0 = i % G.cols;
    const [ar, ac] = shape[0];
    const cells = [];
    for (const [r, c] of shape) {
        const rr = r0 + r - ar, cc = c0 + c - ac;
        if (rr < 0 || rr >= G.rows || cc < 0 || cc >= G.cols) return null;
        cells.push(rr * G.cols + cc);
    }
    return cells;
}
function placeGroup(shape, i) {
    const size = shape.length;
    if (G.inv[size] <= 0) { toast(`Plus de drapeau de ${size} case${size > 1 ? 's' : ''}`, 'info'); return; }
    const cells = shapeCellsAt(shape, i);
    if (!cells || cells.some(j => G.open[j] || G.flag[j] || G.shown[j])) { toast('La forme ne rentre pas ici', 'info', 1200); shake(); return; }
    const id = G.groups.length;
    G.groups.push({ size, cells });
    cells.forEach(j => { G.flag[j] = 1; G.group[j] = id; });
    G.inv[size]--;
    cells.forEach(j => paint(j));
    Sound.flag(); vibrate(20);
    clearPreview();
    if (G.inv[size] === 0 && G.megaSel && G.megaSel.shape.length === size) G.megaSel = null;
    updateHud(); renderMegaTray();
}
function removeGroup(id) {
    const g = G.groups[id]; if (!g) return;
    g.cells.forEach(j => { G.flag[j] = 0; G.group[j] = -1; paint(j); });
    G.inv[g.size]++;
    G.groups[id] = null;
    Sound.unflag(); updateHud(); renderMegaTray();
}
let previewCells = [];
function clearPreview() { previewCells.forEach(j => G.cells[j] && G.cells[j].classList.remove('preview-ok', 'preview-bad')); previewCells = []; }
let previewAt = -1;
function showPreview(i) {
    clearPreview();
    previewAt = i;
    if (!G || G.mode !== 'mega' || !G.megaSel || G.over) return;
    const cells = shapeCellsAt(G.megaSel.shape, i);
    if (!cells) return;
    const ok = !cells.some(j => G.open[j] || G.flag[j] || G.shown[j]) && G.inv[G.megaSel.shape.length] > 0;
    cells.forEach(j => G.cells[j].classList.add(ok ? 'preview-ok' : 'preview-bad'));
    previewCells = cells;
}
// Formes "libres" : une seule par famille (les rotations et miroirs se font avec T / M)
const mirrorShape = s => normShape(s.map(([r, c]) => [r, -c]));
function shapeVariants(s) {
    const out = []; let cur = normShape(s);
    for (let k = 0; k < 4; k++) { out.push(cur, mirrorShape(cur)); cur = rotateShape(cur); }
    return out;
}
const familyKey = s => shapeVariants(s).map(shapeKey).sort()[0];
const FREE_POLY = (() => {
    const out = {};
    for (let n = 1; n <= 4; n++) {
        const seen = new Map();
        for (const s of POLY[n]) { const k = familyKey(s); if (!seen.has(k)) seen.set(k, s); }
        out[n] = [...seen.values()];
    }
    return out;
})();
const SHAPE_NAMES = { 1: ['Simple'], 2: ['Duo'], 3: ['Ligne', 'Coin'] };
function selectShape(shape) {
    G.megaSel = shape ? { shape: normShape(shape) } : null;
    renderMegaTray();
}
function renderMegaTray() {
    const tray = $('#tray');
    tray.classList.remove('hidden');
    const cur = G.megaSel ? G.megaSel.shape : null;
    const curFam = cur ? familyKey(cur) : '';
    let html = '<div class="mega-bar">';
    for (let size = 1; size <= 4; size++) {
        const total = G.counts[size - 1];
        if (!total) continue;
        const left = G.inv[size];
        html += `<div class="mega-group ${left ? '' : 'empty'}"><div class="mega-head"><span>${size} case${size > 1 ? 's' : ''}</span><b>${left}<small>/${total}</small></b></div><div class="mega-shapes">`;
        FREE_POLY[size].forEach(s => {
            const fam = familyKey(s), on = fam === curFam;
            const shown = on ? cur : s;
            html += `<button class="mega-shape ${on ? 'active' : ''}" data-fam="${fam}" ${left ? '' : 'disabled'} title="Choisir cette forme">${shapeSvg(shown, 7)}</button>`;
        });
        html += '</div></div>';
    }
    html += `<div class="mega-current">${cur
        ? `<div class="mega-preview">${shapeSvg(cur, 13)}</div>
           <div class="mega-tools">
             <button class="mini-btn" data-mega="rotate" title="Tourner (T)" ${cur.length > 1 ? '' : 'disabled'}>${icon('rotate-cw')}</button>
             <button class="mini-btn" data-mega="mirror" title="Miroir (M)" ${cur.length > 2 ? '' : 'disabled'}>${icon('flip-horizontal-2')}</button>
             <button class="mini-btn" data-mega="none" title="Désélectionner (Échap)">${icon('x')}</button>
           </div>`
        : `<p class="muted mega-hint">Choisis une forme, puis clic droit sur le plateau pour la poser.</p>`}</div></div>`;
    tray.innerHTML = html;
    tray.querySelectorAll('[data-fam]').forEach(b => b.onclick = () => {
        if (b.dataset.fam === curFam) { selectShape(null); return; }
        const s = b.dataset.fam.split(';').map(p => p.split(',').map(Number));
        selectShape(s);
    });
    tray.querySelectorAll('[data-mega]').forEach(b => b.onclick = () => {
        const k = b.dataset.mega;
        if (k === 'rotate') rotateSel(); else if (k === 'mirror') mirrorSel(); else selectShape(null);
    });
}
function rotateSel() {
    if (!G.megaSel || G.megaSel.shape.length < 2) return;
    G.megaSel = { shape: rotateShape(G.megaSel.shape) };
    renderMegaTray(); if (previewAt >= 0) showPreview(previewAt);
}
function mirrorSel() {
    if (!G.megaSel || G.megaSel.shape.length < 3) return;
    G.megaSel = { shape: mirrorShape(G.megaSel.shape) };
    renderMegaTray(); if (previewAt >= 0) showPreview(previewAt);
}

// ==================== Économie : bonus en jeu ====================
function renderEcoTray() {
    const tray = $('#tray');
    const inv = G.run.inv;
    const usable = Object.keys(BONUSES).filter(k => !BONUSES[k].instant && inv[k] > 0);
    if (!usable.length) { tray.classList.add('hidden'); tray.innerHTML = ''; return; }
    tray.classList.remove('hidden');
    tray.innerHTML = usable.map(k => `<button class="bonus-btn ${G.armed === k ? 'armed' : ''}" data-bonus="${k}" ${k === 'shield' ? 'disabled title="Passif : absorbe la prochaine mine"' : ''}>${icon(BONUSES[k].icon)}${BONUSES[k].name}<span class="n">×${inv[k]}</span></button>`).join('');
    tray.querySelectorAll('[data-bonus]').forEach(b => b.onclick = () => useBonus(b.dataset.bonus));
}
function useBonus(k) {
    if (!G || G.over) return;
    const inv = G.run.inv;
    if (!inv[k]) return;
    if (k === 'probe' || k === 'radar') {
        G.armed = G.armed === k ? null : k;
        if (G.armed) toast(k === 'probe' ? 'Clique sur la case à sonder' : 'Clique au centre de la zone à ouvrir', BONUSES[k].icon);
        renderEcoTray(); return;
    }
    if (k === 'hint') { if (!hint(true)) return; }
    if (k === 'freeze') { G.frozenUntil = performance.now() + 10000; toast('Chrono gelé 10 secondes', 'snowflake'); }
    if (k === 'purge') {
        G.run.malus = []; applyMalusOpts();
        $$('.chip.malus').forEach(c => c.remove());
        $('#board').classList.remove('fog');
        $('#flag-tool').classList.remove('hidden');
        for (let i = 0; i < G.cells.length; i++) paint(i);
        fitBoard(); toast('Malus retirés', 'sparkles');
    }
    if (k === 'autoflag') {
        if (!G.started) { toast('Ouvre d\'abord une case', 'info'); return; }
        const view = buildView(), state = Int8Array.from(view);
        let found = 0;
        for (let guard = 0; guard < 40; guard++) {
            const res = Solver.deduce(G.rows, G.cols, state, G.mineCount);
            if (!res.mines.length && !res.safe.length) break;
            res.mines.forEach(m => { state[m] = -2; if (!G.flag[m] && !G.shown[m]) { G.flag[m] = 1; paint(m); found++; } });
            if (!res.mines.length) break;
        }
        toast(found ? `${found} drapeau${found > 1 ? 'x' : ''} posé${found > 1 ? 's' : ''}` : 'Aucune mine certaine pour l\'instant', 'flag-triangle-right');
        if (!found) return;
        updateHud();
    }
    inv[k]--; Sound.bonus(); renderEcoTray();
}
function useArmed(i) {
    const k = G.armed;
    const run = () => {
        G.armed = null;
        G.run.inv[k]--;
        if (k === 'probe') {
            if (G.open[i]) { G.run.inv[k]++; return; }
            if (G.mines[i]) { G.flag[i] = 1; paint(i); toast('Mine détectée, drapeau posé', 'scan-search'); }
            else revealCell(i);
        } else {
            const zone = [i, ...nbOf(i)];
            zone.forEach(j => { if (G.mines[j]) { if (!G.flag[j]) { G.flag[j] = 1; paint(j); } } });
            zone.forEach(j => { if (!G.mines[j]) revealCell(j, true); });
            Sound.reveal(9);
        }
        renderEcoTray(); updateHud();
    };
    if (!G.started) firstClick(i, run); else run();
}

// ==================== Fin de partie ====================
function record(won, extra = {}) {
    Stats.record(Object.assign({ game: 'demineur', mode: G.mode, sub: G.sub ?? null, won, time: Math.round(G.elapsed * 10) / 10, hints: G.hintsUsed }, extra));
}

function lose(i, reason) {
    G.over = true; stopTimer(); updateTimer();
    if (i >= 0) { G.shown[i] = 1; paint(i); G.cells[i].classList.add('boom'); }
    Sound.boom(); vibrate([100, 50, 150]); shake();
    const others = [];
    for (let j = 0; j < G.mines.length; j++) {
        if (G.mines[j] && !G.flag[j] && j !== i && !G.shown[j]) others.push(j);
        if (G.flag[j] && !G.mines[j]) G.cells[j].classList.add('wrong');
    }
    const step = settings.anim ? Math.min(25, 700 / Math.max(1, others.length)) : 0;
    others.forEach((j, k) => setTimeout(() => { if (G.cells[j] === undefined) return; G.shown[j] = 1; paint(j); }, k * step));
    const myGame = G;
    if (G.mode === 'survival') { record(false, { score: G.run.wave - 1 }); }
    else if (G.mode !== 'duel') record(false);
    setTimeout(() => { if (G === myGame) loseModal(reason); }, Math.min(1200, others.length * step + 600));
}

function loseModal(reason) {
    if (G.mode === 'survival') {
        showModal({ title: 'Fin de la survie', ic: 'shield-off', text: `${reason}.\n${bestLine('survival', null, 'score', 'vagues')}`,
            actions: [{ label: 'Rejouer', icon: 'rotate-ccw', primary: true, fn: () => startSurvival() }, { label: 'Retour', fn: quit }] });
        return;
    }
    if (G.mode === 'duel') { Duel.finish(false, reason || 'Perdu', true); return; }
    const pz = G.mode === 'puzzle';
    showModal({
        title: reason || 'Perdu', ic: 'bomb',
        text: pz ? 'Ce puzzle se résout sans deviner : une déduction était possible. L\'indice peut t\'aider.' : 'Une mine t\'a eu.',
        actions: [{ label: 'Réessayer', icon: 'rotate-ccw', primary: true, fn: restart }, { label: pz ? 'Liste des puzzles' : 'Retour', fn: quit }],
    });
}

function checkWin() {
    if (G.over || G.openCount < G.rows * G.cols - G.mineCount) return;
    G.over = true; stopTimer(); updateTimer();
    if (!G.opts.noFlags && G.mode !== 'mega') for (let j = 0; j < G.mines.length; j++) if (G.mines[j] && !G.shown[j] && !G.flag[j]) { G.flag[j] = 1; paint(j); }
    updateHud();

    if (G.mode === 'blitz') {
        const bonus = 10 + Math.round(G.mineCount * .5);
        G.run.level++; G.run.score += 25; G.run.remaining += bonus;
        Sound.bonus(); toast(`Grille terminée : +${bonus} s`, 'check');
        const run = G.run; setTimeout(() => startBlitz(run), 500);
        return;
    }
    if (G.mode === 'survival') {
        const run = G.run; run.wave++;
        let msg = `Vague ${run.wave}`;
        if ((run.wave - 1) % 3 === 0 && run.lives < 5) { run.lives++; msg += ' · +1 bouclier'; }
        Sound.bonus(); toast(msg, 'waves');
        setTimeout(() => startSurvival(run), 900);
        return;
    }
    if (G.mode === 'economy') { ecoGridDone(); return; }
    if (G.mode === 'duel') { Duel.send('done', { time: G.elapsed }); Duel.finish(true, `Grille terminée en ${fmtTime(G.elapsed)}, avant ${G.duel.opp}.`); return; }

    Sound.win(); vibrate([30, 40, 30]);
    const t = G.elapsed;
    const prevBest = bestTime(G.mode, G.sub);
    record(true);
    if (G.mode === 'puzzle') {
        const stars = G.hintsUsed === 0 ? 3 : G.hintsUsed <= 2 ? 2 : 1;
        const pz = store.get('puzzles', {});
        pz[G.puzzle.id] = Math.max(pz[G.puzzle.id] || 0, stars);
        store.set('puzzles', pz);
        const next = PUZZLES.find(p => p.id === G.puzzle.id + 1);
        const actions = [];
        if (next && isUnlocked(next)) actions.push({ label: `Suivant : ${next.title}`, icon: 'arrow-right', primary: true, fn: () => startPuzzle(next.id) });
        actions.push({ label: 'Rejouer', icon: 'rotate-ccw', primary: !actions.length, fn: restart }, { label: 'Liste des puzzles', fn: quit });
        showModal({ title: 'Puzzle résolu', ic: 'check', stars, text: `${fmtTime(t)} · ${G.hintsUsed ? G.hintsUsed + ' indice' + (G.hintsUsed > 1 ? 's' : '') : 'sans indice'}`, actions });
        return;
    }
    let text = `Temps : ${fmtTime(t)}`;
    if (prevBest === null || t < prevBest) text += '\nNouveau record';
    else text += `\nRecord : ${fmtTime(prevBest)}`;
    showModal({ title: 'Victoire', ic: 'trophy', text, actions: [{ label: 'Rejouer', icon: 'rotate-ccw', primary: true, fn: restart }, { label: 'Retour', fn: quit }] });
}
function bestTime(mode, sub) {
    const t = Stats.all().filter(e => e.game === 'demineur' && e.mode === mode && e.won && e.sub === (sub ?? null)).map(e => e.time);
    return t.length ? Math.min(...t) : null;
}

function clockOver() {
    G.over = true; stopTimer(); Sound.boom();
    if (G.mode === 'blitz') {
        const prev = Stats.all().filter(e => e.mode === 'blitz').map(e => e.score);
        record(false, { score: G.run.score });
        const rec = !prev.length || G.run.score > Math.max(...prev);
        showModal({ title: 'Temps écoulé', ic: 'timer-off', text: `Score : ${G.run.score} points\n${G.run.level} grille${G.run.level > 1 ? 's' : ''} terminée${G.run.level > 1 ? 's' : ''}${rec ? '\nNouveau record' : ''}`,
            actions: [{ label: 'Rejouer', icon: 'rotate-ccw', primary: true, fn: () => startBlitz() }, { label: 'Retour', fn: quit }] });
    } else {
        const done = G.run.grid - 1;
        const prev = Stats.all().filter(e => e.mode === 'economy').map(e => e.score);
        record(false, { score: done, coins: G.run.earned });
        const rec = !prev.length || done > Math.max(...prev);
        showModal({ title: 'Faillite', ic: 'timer-off', text: `${done} grille${done > 1 ? 's' : ''} terminée${done > 1 ? 's' : ''}\n${G.run.earned} pièces gagnées au total${rec ? '\nNouveau record' : ''}`,
            actions: [{ label: 'Rejouer', icon: 'rotate-ccw', primary: true, fn: () => startEconomy() }, { label: 'Retour', fn: quit }] });
    }
}

function ecoGridDone() {
    const run = G.run;
    let gain = 10 + Math.floor((G.rows * G.cols - G.mineCount) / 4) + run.malus.length * 6;
    if (run.double) { gain *= 2; run.double = false; }
    run.coins += gain; run.earned += gain;
    run.remaining += 10;
    run.grid++;
    Sound.coin();
    run.malus = pickMalus(run.grid);
    openShop(gain);
}
function openShop(gain) {
    const run = G.run;
    const offers = shuffle(Object.keys(BONUSES)).slice(0, 5);
    const box = document.createElement('div');
    const draw = () => {
        box.innerHTML = `<div class="shop">${offers.map(k => {
            const b = BONUSES[k], owned = run.inv[k] || 0;
            return `<button class="shop-item" data-buy="${k}" ${run.coins < b.price ? 'disabled' : ''}>${icon(b.icon)}<span class="txt"><b>${b.name}${owned && !b.instant ? ` <span class="muted">(×${owned})</span>` : ''}</b><small>${b.desc}</small></span><span class="price">${icon('coins')}${b.price}</span></button>`;
        }).join('')}</div>
        <div class="next-malus">${run.malus.length ? `Malus de la grille ${run.grid} : ${run.malus.map(k => `<span class="chip malus">${icon(MALUS[k].icon)}${MALUS[k].name}</span>`).join('')}` : `Grille ${run.grid} : aucun malus`}</div>`;
        $('#modal-text').textContent = `+${gain} pièces · ${run.coins} en poche · ${fmtTime(run.remaining)} restantes`;
        box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
            const k = b.dataset.buy, item = BONUSES[k];
            if (run.coins < item.price) return;
            run.coins -= item.price; Sound.coin();
            if (k === 'time') run.remaining += 15;
            else if (k === 'double') run.double = true;
            else run.inv[k] = (run.inv[k] || 0) + 1;
            draw();
        });
    };
    showModal({ title: 'Boutique', ic: 'shopping-cart', extra: box, actions: [{ label: `Grille ${run.grid}`, icon: 'arrow-right', primary: true, fn: () => startEconomy(run) }] });
    draw();
}

// ==================== Indice ====================
function buildView() {
    const view = new Int8Array(G.rows * G.cols);
    for (let i = 0; i < view.length; i++) view[i] = G.open[i] ? G.adj[i] : G.shown[i] ? -2 : -1;
    return view;
}
function hint(fromBonus) {
    if (!G || G.over || G.generating) return false;
    if (G.mode === 'economy' && !fromBonus) return false;
    if (!G.started) { toast('Le premier clic est toujours sûr', 'info'); return false; }
    const wrongFlag = G.flag.findIndex((f, i) => f && !G.mines[i]);
    let h = Solver.findHint(G.rows, G.cols, buildView(), G.mineCount, G.flag);
    if (wrongFlag >= 0 && (!h || h.type === 'mine')) h = { type: 'wrong', cell: wrongFlag };
    if (!h) { toast('Aucune déduction certaine ici', 'circle-help'); return false; }
    G.hintsUsed++;
    Sound.hint();
    const el = G.cells[h.cell], cls = h.type === 'safe' ? 'hint-safe' : 'hint-mine';
    el.classList.add(cls);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    setTimeout(() => el.classList.remove(cls), 2600);
    toast(h.type === 'safe' ? 'Cette case est sûre' : h.type === 'mine' ? 'Cette case est forcément une mine' : 'Ce drapeau est mal placé', 'lightbulb');
    return true;
}

// ==================== Brouillard ====================
function lightAround(center) {
    if (!G.opts.fog) return;
    const R = 2, r0 = Math.floor(center / G.cols), c0 = center % G.cols, next = new Set();
    for (let r = r0 - R; r <= r0 + R; r++) for (let c = c0 - R; c <= c0 + R; c++)
        if (r >= 0 && r < G.rows && c >= 0 && c < G.cols) next.add(r * G.cols + c);
    G.lit.forEach(i => { if (!next.has(i)) G.cells[i].classList.remove('lit'); });
    next.forEach(i => G.cells[i].classList.add('lit'));
    G.lit = next;
}

// ==================== Écran des puzzles ====================
function chapterSolved(ch) { const pz = store.get('puzzles', {}); return PUZZLES.filter(p => p.chapter === ch && pz[p.id]).length; }
function isUnlocked(p) { return p.chapter === 1 || chapterSolved(p.chapter - 1) >= 4; }
function puzzleThumb(p) {
    const d = parsePuzzle(p), s = 36 / Math.max(d.rows, d.cols);
    let rects = '';
    for (let i = 0; i < d.rows * d.cols; i++) if (d.mines[i]) rects += `<rect x="${(i % d.cols) * s}" y="${Math.floor(i / d.cols) * s}" width="${s * .85}" height="${s * .85}" fill="currentColor"/>`;
    return `<svg viewBox="0 0 36 36" style="color:var(--muted)">${rects}</svg>`;
}
function renderPuzzles() {
    const pz = store.get('puzzles', {});
    $('#pz-count').textContent = `${Object.keys(pz).length}/${PUZZLES.length}`;
    if (!PUZZLE_CHAPTERS.some(c => c.id === pzChapter)) pzChapter = 1;
    $('#pz-tabs').innerHTML = PUZZLE_CHAPTERS.map(ch => {
        const list = PUZZLES.filter(p => p.chapter === ch.id), locked = !isUnlocked(list[0]);
        return `<button class="tab ${ch.id === pzChapter ? 'active' : ''}" data-ch="${ch.id}">${icon(locked ? 'lock' : ch.icon)}${ch.name}<span class="count">${chapterSolved(ch.id)}/${list.length}</span></button>`;
    }).join('');
    $$('#pz-tabs .tab').forEach(t => t.onclick = () => { pzChapter = +t.dataset.ch; store.set('pzChapter', pzChapter); renderPuzzles(); });
    const ch = PUZZLE_CHAPTERS.find(c => c.id === pzChapter);
    const list = PUZZLES.filter(p => p.chapter === pzChapter);
    const locked = !isUnlocked(list[0]);
    $('#pz-desc').innerHTML = locked ? `<span class="locked-note">${icon('lock')}Résous 4 puzzles du chapitre précédent pour débloquer celui-ci.</span>` : ch.desc;
    $('#pz-grid').innerHTML = list.map(p => {
        const d = parsePuzzle(p), s = pz[p.id] || 0;
        return `<button class="pz-tile" data-id="${p.id}" ${locked ? 'disabled' : ''}>
            <span class="pz-thumb">${puzzleThumb(p)}</span>
            <span class="pz-info"><span class="t">${p.id}. ${p.title}</span><span class="m">${d.rows}×${d.cols} · ${d.mineCount} mines</span>
            <span class="stars-sm">${[1, 2, 3].map(k => icon('star', k <= s ? 'star-on' : 'star-off')).join('')}</span></span>
            <span class="pz-status ${s ? 'done' : ''}">${icon(s ? 'circle-check' : 'circle')}</span></button>`;
    }).join('');
    $$('#pz-grid .pz-tile').forEach(b => b.onclick = () => startPuzzle(+b.dataset.id));
}

// ==================== Événements ====================
const cellFromEvent = e => { const el = e.target.closest && e.target.closest('.cell'); return el ? +el.dataset.i : -1; };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function bindBoard() {
    const board = $('#board');
    let press = null;
    board.addEventListener('contextmenu', e => {
        e.preventDefault();
        const i = cellFromEvent(e);
        if (i >= 0 && !(press && press.longFired)) secondaryAction(i);
    });
    board.addEventListener('pointerdown', e => {
        const i = cellFromEvent(e); if (i < 0) return;
        Sound.ensure();
        press = { i, x: e.clientX, y: e.clientY, button: e.button, longFired: false };
        if (e.pointerType !== 'mouse') {
            press.timer = setTimeout(() => {
                if (!press || press.i !== i) return;
                press.longFired = true; vibrate(15);
                secondaryAction(i);
            }, 380);
        }
        if (e.button === 1) e.preventDefault();
    });
    const cancel = () => { if (press) clearTimeout(press.timer); };
    board.addEventListener('pointermove', e => {
        const i = cellFromEvent(e);
        if (G && i >= 0 && e.pointerType === 'mouse') { if (G.opts.fog) lightAround(i); showPreview(i); }
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { cancel(); press.moved = true; }
    });
    board.addEventListener('pointerleave', () => G && clearPreview());
    board.addEventListener('pointercancel', () => { cancel(); press = null; });
    board.addEventListener('pointerup', e => {
        if (!press) return;
        cancel();
        const i = cellFromEvent(e), p = press;
        setTimeout(() => { press = null; }, 0);
        if (i !== p.i || p.longFired || p.moved) return;
        if (G.opts.fog) lightAround(i);
        if (p.button === 0) primaryAction(i);
        else if (p.button === 1) chord(i);
    });
}

function moveCursor(dr, dc) {
    const prev = G.cursor;
    if (prev < 0) G.cursor = Math.floor(G.rows / 2) * G.cols + Math.floor(G.cols / 2);
    else G.cursor = Math.max(0, Math.min(G.rows - 1, Math.floor(prev / G.cols) + dr)) * G.cols + Math.max(0, Math.min(G.cols - 1, prev % G.cols + dc));
    if (prev >= 0) paint(prev);
    paint(G.cursor);
    if (G.opts.fog) lightAround(G.cursor);
    showPreview(G.cursor);
    G.cells[G.cursor].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function bindKeys() {
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (modalOpen()) { if ($('#modal').classList.contains('hidden')) closeModals(); return; }
            if (G && G.armed) { G.armed = null; renderEcoTray(); return; }
            if (G && G.megaSel) { selectShape(null); clearPreview(); return; }
            if ($('#screen-game').classList.contains('active')) quit();
            return;
        }
        if (modalOpen() || !$('#screen-game').classList.contains('active') || !G) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        const moves = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
        if (moves[k]) { e.preventDefault(); moveCursor(...moves[k]); }
        else if ((k === ' ' || k === 'enter') && G.cursor >= 0) { e.preventDefault(); primaryAction(G.cursor); }
        else if (k === 'f') { if (G.cursor >= 0) secondaryAction(G.cursor); else toggleFlagTool(); }
        else if (k === 't' && G.mode === 'mega') rotateSel();
        else if (k === 'm' && G.mode === 'mega') mirrorSel();
        else if (k === 'h') hint();
        else if (k === 'r') restart();
        else if (k === '+' || k === '=') setZoom(.1);
        else if (k === '-') setZoom(-.1);
    });
}

function toggleFlagTool() {
    if (!G || G.opts.noFlags) return;
    G.flagTool = !G.flagTool;
    $('#flag-tool').classList.toggle('on', G.flagTool);
    toast(G.flagTool ? 'Mode drapeau : un appui pose un drapeau' : 'Mode révélation', G.flagTool ? 'flag' : 'mouse-pointer-click', 1400);
}
function updateSoundBtn() { $('#sound-btn').innerHTML = icon(settings.sound ? 'volume-2' : 'volume-x'); }

const ACTIONS = {
    'open-help': () => $('#help').classList.remove('hidden'),
    'open-settings': () => $('#settings').classList.remove('hidden'),
    'close-modal': closeModals,
    'play': () => MODES[currentMode].play(),
    'quit': quit, 'restart': restart, 'hint': () => hint(), 'flag-tool': toggleFlagTool,
    'zoom-in': () => setZoom(.15), 'zoom-out': () => setZoom(-.15),
    'toggle-sound': () => { settings.sound = !settings.sound; saveSettings(); updateSoundBtn(); if (settings.sound) Sound.click(); },
};

function init() {
    renderThemes($('#themes'));
    hydrateIcons();
    updateSoundBtn();
    document.addEventListener('click', e => {
        const a = e.target.closest('[data-action]');
        if (a && ACTIONS[a.dataset.action]) ACTIONS[a.dataset.action]();
        if (e.target.classList.contains('modal') && e.target.id !== 'modal') closeModals();
    });
    $$('.mode-item').forEach(b => b.onclick = () => selectMode(b.dataset.mode));
    $('#opt-anim').checked = settings.anim; $('#opt-vibrate').checked = settings.vibrate;
    $('#opt-anim').onchange = e => { settings.anim = e.target.checked; saveSettings(); };
    $('#opt-vibrate').onchange = e => { settings.vibrate = e.target.checked; saveSettings(); };
    bindBoard(); bindKeys();
    addEventListener('resize', fitBoard);
    selectMode(MODES[currentMode] || currentMode === 'puzzles' ? currentMode : 'classic');
}
// ==================== Duel 1v1 (Supabase Realtime) ====================
// L'hôte crée un code, l'invité le rejoint, l'hôte génère la grille sans hasard et l'envoie.
// Messages : start (grille), progress (%), done (a fini), boom (a touché une mine).
const Duel = {
    ch: null, code: null, host: false, preset: null, lastSent: 0, started: false,
    myKey() { return Online.username + '#' + Online.user.id.slice(0, 6); },
    create(preset) {
        this.leave();
        this.code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
        this.host = true; this.preset = preset;
        this.connect();
        showModal({ title: `Code : ${this.code}`, ic: 'swords', text: 'Donne ce code à ton adversaire.\nLa partie démarre dès qu\'il rejoint.', actions: [{ label: 'Annuler', fn: () => this.leave() }] });
    },
    join(code) {
        if (!/^[A-Z]{4}$/.test(code)) { toast('Le code fait 4 lettres', 'info'); return; }
        this.leave();
        this.code = code; this.host = false;
        this.connect();
        showModal({ title: `Connexion à ${code}…`, ic: 'loader', text: 'En attente de la grille de l\'hôte.', actions: [{ label: 'Annuler', fn: () => this.leave() }] });
        this.joinTimer = setTimeout(() => {
            if (this.ch && !this.started) { this.leave(); closeModals(); toast('Aucune partie trouvée avec ce code', 'circle-x', 3000); }
        }, 10000);
    },
    connect() {
        const ch = this.ch = Online.client.channel('duel-' + this.code, { config: { broadcast: { self: false }, presence: { key: this.myKey() } } });
        ch.on('presence', { event: 'sync' }, () => {
            const players = Object.keys(ch.presenceState());
            if (players.length > 2 && !this.started) { toast('Partie déjà complète', 'circle-x'); this.leave(); closeModals(); return; }
            if (this.host && players.length === 2 && !this.started) this.startAsHost(players.find(p => p !== this.myKey()));
        });
        ch.on('presence', { event: 'leave' }, () => {
            if (G && G.mode === 'duel' && !G.over) this.finish(true, `${G.duel.opp} a quitté la partie.`);
        });
        ch.on('broadcast', { event: 'start' }, ({ payload }) => { if (!this.host && !this.started) { clearTimeout(this.joinTimer); this.begin(payload); } });
        ch.on('broadcast', { event: 'progress' }, ({ payload }) => {
            if (G && G.mode === 'duel') { G.duel.oppP = payload.p; $('#hud-opp').textContent = payload.p + ' %'; }
        });
        ch.on('broadcast', { event: 'done' }, ({ payload }) => {
            if (G && G.mode === 'duel' && !G.over) this.finish(false, `${G.duel.opp} a terminé en ${fmtTime(payload.time)}.`);
        });
        ch.on('broadcast', { event: 'boom' }, () => {
            if (G && G.mode === 'duel' && !G.over) this.finish(true, `${G.duel.opp} a touché une mine.`);
        });
        ch.subscribe(status => { if (status === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
    },
    startAsHost(oppKey) {
        this.started = true;
        const p = PRESETS[this.preset] || PRESETS.beginner;
        const start = Math.floor(p.rows / 2) * p.cols + Math.floor(p.cols / 2);
        G = newState('duel', p.rows, p.cols, p.mines, { opts: {} });
        let mines = null;
        const t0 = performance.now();
        do { mines = randomMines(start); } while (!Solver.checkNoGuess(p.rows, p.cols, mines, [start]).solvable && performance.now() - t0 < 3000);
        const payload = { rows: p.rows, cols: p.cols, mines: [...mines.keys()].filter(i => mines[i]), start, preset: this.preset, host: Online.username };
        // petit délai pour que l'invité ait fini de s'abonner
        setTimeout(() => { this.send('start', payload); this.begin(payload, (oppKey || '').split('#')[0]); }, 400);
    },
    begin(d, oppName) {
        this.started = true;
        closeModals();
        const opp = this.host ? oppName : d.host;
        G = newState('duel', d.rows, d.cols, d.mines.length, { opts: { noGuess: true }, sub: d.preset, title: `Duel contre ${opp}`, duel: { opp, oppP: 0 } });
        d.mines.forEach(i => { G.mines[i] = 1; });
        G.adj = Solver.computeAdjacent(G.rows, G.cols, G.mines);
        enterGame();
        $('#hud-opp').textContent = '0 %';
        G.started = true; startTimer();
        revealCell(d.start, true);
        toast(`Duel contre ${opp} : c'est parti`, 'swords');
    },
    send(event, payload) { if (this.ch) this.ch.send({ type: 'broadcast', event, payload }); },
    progress() {
        const now = performance.now();
        if (now - this.lastSent < 250) return;
        this.lastSent = now;
        this.send('progress', { p: Math.floor(G.openCount / (G.rows * G.cols - G.mineCount) * 100) });
    },
    finish(won, text, quiet) {
        if (G.duelDone) return;
        G.duelDone = true; G.over = true; stopTimer();
        Stats.record({ game: 'demineur', mode: 'duel', sub: G.sub ?? null, won, time: Math.round(G.elapsed * 10) / 10 });
        if (won) Sound.win(); else if (!quiet) Sound.boom();
        showModal({ title: won ? 'Victoire' : 'Défaite', ic: won ? 'trophy' : 'swords', text, actions: [{ label: 'Retour', primary: true, fn: quit }] });
    },
    leave() {
        clearTimeout(this.joinTimer);
        if (this.ch) { try { this.ch.untrack(); Online.client.removeChannel(this.ch); } catch { /* déjà fermé */ } }
        this.ch = null; this.started = false;
    },
};
Online.onChange(() => { if (currentMode === 'duel' && $('#screen-setup').classList.contains('active')) selectMode('duel'); });

init();
