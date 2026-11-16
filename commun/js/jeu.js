'use strict';
// ==================== Moteur commun des jeux d'Epure ====================
// Construit toute la page d'un jeu (modes, réglages, canevas, pause, compte à rebours,
// salon de duel, fin de partie, statistiques). Chaque jeu appelle Jeu.create({...})
// et ne fournit que sa logique : start, update, draw, entrées, bot, duel.
//
// L'objet global J est l'API donnée aux jeux :
//   J.mode, J.opts, J.rng(), J.seed, J.ctx, J.W, J.H, J.c (couleurs du thème), J.keys (touches enfoncées),
//   J.time (secondes de jeu), J.end(res), J.duel { on, host, opp, send(ev, p) }, J.prog(v), J.tone(...)

const J = {
    mode: null, opts: {}, seed: 0, ctx: null, W: 0, H: 0, c: {}, keys: new Set(), time: 0, over: false,
    duel: { on: false, host: false, opp: '', send() {} }, oppRes: null, oppProg: null,
    rng: Math.random,
    rand(a, b) { return a + this.rng() * (b - a); },
    int(a, b) { return Math.floor(this.rand(a, b + 1)); },
    pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    font(size, weight = 600, mono = false) { return `${weight} ${size}px ${mono ? J.c.mono : J.c.font}`; },
    text(str, x, y, size = 16, color = J.c.text, align = 'center', weight = 600, mono = false) {
        const ctx = J.ctx; ctx.font = J.font(size, weight, mono); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.fillText(tr(String(str)), x, y);
    },
    rr(x, y, w, h, r = 6) { const ctx = J.ctx; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); },
    // Couleur du thème avec transparence (les thèmes utilisent des couleurs hexadécimales)
    alpha(color, a) {
        let h = (color || '#888').trim();
        if (h[0] !== '#') return h;
        if (h.length === 4) h = '#' + [...h.slice(1)].map(x => x + x).join('');
        const n = parseInt(h.slice(1, 7), 16);
        return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    },
};

// Générateur pseudo-aléatoire avec graine (les deux joueurs d'un duel ont la même suite)
function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const daySeed = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

// Petits sons synthétisés (aucun fichier)
J.tone = (f, d = .06, type = 'triangle', v = .04, slide = 0, delay = 0) => {
    if (!settings.sound) return;
    try {
        if (!J._ac) J._ac = new (window.AudioContext || window.webkitAudioContext)();
        const c = J._ac; if (c.state === 'suspended') c.resume();
        const tt = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f, tt);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), tt + d);
        g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(.0001, tt + d);
        o.connect(g).connect(c.destination); o.start(tt); o.stop(tt + d + .02);
    } catch { /* audio indisponible */ }
};
J.sfx = {
    click: () => J.tone(520, .04, 'square', .025),
    good: () => [660, 880].forEach((f, i) => J.tone(f, .07, 'square', .03, 0, i * .06)),
    bad: () => J.tone(160, .22, 'sawtooth', .05, -80),
    win: () => [523, 659, 784, 1047].forEach((f, i) => J.tone(f, .14, 'triangle', .05, 0, i * .09)),
    lose: () => [392, 330, 262].forEach((f, i) => J.tone(f, .2, 'triangle', .05, 0, i * .12)),
    jump: () => J.tone(330, .09, 'square', .025, 330),
    shot: () => J.tone(900, .05, 'square', .02, -500),
    boom: () => J.tone(110, .3, 'sawtooth', .06, -60),
};

const Jeu = (() => {
    let def, info, raf = 0, last = 0, running = false, paused = false, countdown = 0, statsT = 0, started = false;
    let currentMode;
    const cfgKey = () => def.id + 'Cfg';
    const H = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---------- Construction de la page ----------
    function buildPage() {
        const ROOT = def.root || '../../';
        document.title = `${info.name} · Epure`;
        const modes = Object.entries(info.modes).filter(([k]) => def.modes[k]);
        const solo = modes.filter(([k]) => k !== 'duel'), duel = modes.filter(([k]) => k === 'duel');
        const modeBtn = ([k, m]) => `<button class="mode-item" data-mode="${k}">${icon(m[1])}<span>${m[0]}</span></button>`;
        document.body.insertAdjacentHTML('afterbegin', `
        <header class="topbar">
            <a class="brand" href="${ROOT}" title="Retour à Epure">${icon('gamepad-2')} EPURE <span class="sep">/</span> <span>${info.name}</span></a>
            <div class="spacer"></div>
            <a class="icon-btn hidden" id="account-btn" href="${ROOT}pages/account.html" title="Compte">${icon('circle-user')}</a>
            <button class="icon-btn" id="sound-btn" title="Son"></button>
            <button class="icon-btn" id="help-btn" title="Contrôles">${icon('keyboard')}</button>
            <a class="icon-btn" href="${ROOT}pages/stats.html" title="Statistiques">${icon('chart-column')}</a>
            <button class="icon-btn" id="theme-btn" title="Thème">${icon('palette')}</button>
        </header>
        <div class="app">
            <nav class="side">
                <p class="section-title">Modes</p>${solo.map(modeBtn).join('')}
                ${duel.length ? `<p class="section-title">En ligne</p>${duel.map(modeBtn).join('')}` : ''}
                ${(def.links || []).map(([href, ic, label]) => `<a class="mode-item" href="${href}">${icon(ic)}<span>${label}</span></a>`).join('')}
            </nav>
            <main class="content">
                <section id="screen-setup" class="screen active">
                    <div class="setup card">
                        <div class="setup-head"><span class="setup-icon" id="setup-icon"></span><div><h2 id="setup-title"></h2><p class="muted" id="setup-desc"></p></div></div>
                        <div id="setup-opts"></div>
                        <ul class="rules" id="setup-rules"></ul>
                        <div class="setup-best muted" id="setup-best"></div>
                        <button class="btn primary block" id="play-btn">${icon('play')} Jouer</button>
                        <div id="duel-box" class="hidden"></div>
                    </div>
                </section>
                <section id="screen-game" class="screen">
                    <div class="stage">
                        <div class="col">
                            <div class="panel stats" id="stats"></div>
                            <div class="panel actions">
                                <button class="icon-btn" id="pause-btn" title="Pause (Échap)">${icon('pause')}</button>
                                <button class="icon-btn" id="restart-btn" title="Recommencer (R)">${icon('rotate-ccw')}</button>
                                <button class="icon-btn" id="quit-btn" title="Quitter">${icon('arrow-left')}</button>
                            </div>
                        </div>
                        <div class="well" id="well">
                            <canvas id="board" tabindex="0"></canvas>
                            <div class="overlay hidden" id="overlay"></div>
                        </div>
                    </div>
                    <div class="jtouch" id="touch"></div>
                </section>
            </main>
        </div>
        <div class="modal hidden" id="modal"><div class="modal-card"><h2 id="modal-title"></h2><p id="modal-text"></p><div class="modal-actions" id="modal-actions"></div></div></div>
        <div class="modal hidden" id="settings"><div class="modal-card"><h2>Thème</h2><div class="themes" id="themes"></div><div class="modal-actions"><button class="btn primary" data-close>Fermer</button></div></div></div>
        <div class="modal hidden" id="help"><div class="modal-card help"><h2>Contrôles</h2>
            <table class="keys">${(def.controls || []).map(([k, l]) => `<tr><td>${k}</td><td>${l}</td></tr>`).join('')}
            <tr><td><kbd>Échap</kbd> <kbd>P</kbd></td><td>Pause</td></tr><tr><td><kbd>R</kbd></td><td>Recommencer</td></tr></table>
            ${def.help ? `<p class="muted" style="margin-top:12px;line-height:1.5">${def.help}</p>` : ''}
            <div class="modal-actions"><button class="btn primary" data-close>Compris</button></div></div></div>`);
    }

    // ---------- Couleurs du thème ----------
    function readColors() {
        const cs = getComputedStyle(document.body), v = n => cs.getPropertyValue('--' + n).trim();
        Object.assign(J.c, {
            bg: v('bg'), surface: v('surface'), surface2: v('surface-2'), surface3: v('surface-3'), border: v('border'),
            text: v('text'), muted: v('muted'), accent: v('accent'), accentInk: v('accent-ink'),
            danger: v('danger') || '#e5484d', ok: v('ok') || '#46a758', warn: v('warn') || '#f5a623',
            cell: v('cell'), font: v('font') || 'Inter, sans-serif', mono: v('mono') || 'monospace',
            n: [1, 2, 3, 4, 5, 6, 7, 8].map(i => v('n' + i)),
        });
        J.c.light = (cs.colorScheme || '').includes('light');
    }

    // ---------- Configuration ----------
    function loadOpts(m) {
        const saved = store.get(cfgKey(), {})[m] || {};
        const o = Object.assign({}, def.modes[m].defaults || {}, saved);
        (def.modes[m].options || []).forEach(op => {
            const ok = op.choices.some(c => c[0] === saved[op.id]);
            o[op.id] = ok ? saved[op.id] : (op.def ?? op.choices[0][0]);
        });
        return o;
    }
    function saveOpts(m, o) { const all = store.get(cfgKey(), {}); all[m] = o; store.set(cfgKey(), all); }

    function bestLine(m) {
        const [, , kind, unit] = info.modes[m];
        const list = Stats.all().filter(e => e.game === def.id && e.mode === m);
        if (!list.length) return '';
        if (kind === 'time') { const w = list.filter(e => e.won && e.time); return w.length ? `Record : ${fmtTime(Math.min(...w.map(e => e.time)))}` : ''; }
        if (kind === 'score') return `Record : ${Math.max(...list.map(e => e.score || 0)).toLocaleString('fr-FR')} ${unit || ''}`;
        const w = list.filter(e => e.won).length;
        return `${w} victoire${w > 1 ? 's' : ''} sur ${list.length} partie${list.length > 1 ? 's' : ''}`;
    }

    function selectMode(m) {
        if (!def.modes[m]) m = Object.keys(def.modes)[0];
        currentMode = m; store.set(def.id + (def.root ? 'DuelMode' : 'Mode'), m);
        const md = def.modes[m], [title, ic] = info.modes[m];
        $$('.mode-item[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
        $('#setup-icon').innerHTML = icon(ic);
        $('#setup-title').textContent = title;
        $('#setup-desc').textContent = md.desc || '';
        $('#setup-rules').innerHTML = (md.rules || []).map(([i, t]) => `<li>${icon(i)}<span>${t}</span></li>`).join('');
        $('#setup-best').textContent = bestLine(m);
        const o = loadOpts(m);
        $('#setup-opts').innerHTML = (md.options || []).map(op => `<p class="section-title">${op.label}</p>
            <div class="seg" data-opt="${op.id}">${op.choices.map(([v, b, s]) => `<button data-v="${v}" class="${o[op.id] === v ? 'active' : ''}"><b>${b}</b>${s ? `<small>${s}</small>` : ''}</button>`).join('')}</div>`).join('');
        $$('#setup-opts .seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => {
            const op = md.options.find(x => x.id === seg.dataset.opt);
            o[op.id] = op.choices.find(c => String(c[0]) === b.dataset.v)[0];
            saveOpts(m, o);
            seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        }));
        // Réglage sur mesure (ex. grille de choix des niveaux)
        if (md.setup) { const box = document.createElement('div'); $('#setup-opts').appendChild(box); md.setup(box, o, () => saveOpts(m, o)); }
        const isDuel = !!md.duel;
        $('#play-btn').classList.toggle('hidden', isDuel);
        $('#duel-box').classList.toggle('hidden', !isDuel);
        if (isDuel) renderDuelBox();
        show('setup');
    }

    function show(name) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name)); }

    // ---------- Canevas ----------
    function sizeCanvas() {
        const cv = $('#board'), dpr = Math.min(2, window.devicePixelRatio || 1);
        const [w, h] = typeof def.size === 'function' ? def.size() : def.size;
        J.W = w; J.H = h;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        J.ctx = cv.getContext('2d');
        J.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fitCanvas();
    }
    function fitCanvas() {
        const cv = $('#board'); if (!J.W) return;
        const narrow = innerWidth < 860;
        const availW = Math.min(innerWidth - (narrow ? 40 : 230 + 150 + 90), 1400);
        const availH = innerHeight - (narrow ? 230 : 130);
        const s = Math.max(.3, Math.min(availW / J.W, availH / J.H, def.maxScale || 1.6));
        cv.style.width = Math.floor(J.W * s) + 'px'; cv.style.height = Math.floor(J.H * s) + 'px';
    }
    function toLocal(e) {
        const r = $('#board').getBoundingClientRect();
        return [(e.clientX - r.left) / r.width * J.W, (e.clientY - r.top) / r.height * J.H];
    }

    // ---------- Partie ----------
    function startGame(m, seed, opts) {
        closeModals();
        J.mode = m; J.opts = opts || loadOpts(m);
        J.seed = seed ?? (def.modes[m].seed ? def.modes[m].seed() : Math.floor(Math.random() * 2 ** 31));
        J.rng = mulberry32(J.seed);
        J.time = 0; J.over = false; J.oppRes = null; J.oppProg = null; J.myRes = null;
        J.keys.clear(); J.parts = []; J._shake = 0; J.camX = 0; J.camY = 0;
        paused = false; started = true;
        show('game');
        sizeCanvas();
        def.start();
        renderTouch();
        const realtime = !!def.update;
        countdown = realtime && def.countdown !== false ? 3 : 0;
        running = true;
        $('#pause-btn').classList.toggle('hidden', !realtime || !!J.duel.on);
        $('#restart-btn').classList.toggle('hidden', !!J.duel.on);
        overlay(countdown ? `<span class="count">3</span>` : '');
        updateStats(true);
        $('#board').focus({ preventScroll: true });
    }
    function overlay(html) { const o = $('#overlay'); o.innerHTML = html; o.classList.toggle('hidden', !html); }
    function setPause(p) {
        if (!running || J.over || !def.update || J.duel.on || countdown > 0) return;
        paused = p;
        overlay(p ? `<div>${icon('pause')}<br>Pause<br><small>Échap pour reprendre</small></div>` : '');
    }
    function loop(ts) {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
        if (!started || !J.ctx) return;
        if (running && !paused && !J.over) {
            if (countdown > 0) {
                const before = Math.ceil(countdown);
                countdown -= dt;
                const now = Math.ceil(countdown);
                if (countdown <= 0) { overlay(''); J.tone(880, .12, 'square', .04); }
                else if (now !== before) { overlay(`<span class="count">${now}</span>`); J.tone(440, .08, 'square', .03); }
            } else if (def.update) {
                J.time += dt;
                def.update(dt);
            }
        }
        if (def.anim && !paused) def.anim(dt);
        // Effets communs : vibration de l'écran et particules (en coordonnées du jeu, décalées par J.camX / J.camY)
        if (!paused) fxStep(dt);
        const ctx = J.ctx;
        ctx.save();
        if (J._shake > 0) ctx.translate((Math.random() - .5) * J._shakeAmp * 2, (Math.random() - .5) * J._shakeAmp * 2);
        def.draw(ctx);
        fxDraw(ctx);
        ctx.restore();
        statsT -= dt; if (statsT <= 0) { statsT = .2; updateStats(); }
    }
    function updateStats() {
        const rows = def.stats ? def.stats() : [];
        if (def.update || def.showTime) rows.push(['Temps', fmtTime(J.time)]);
        if (J.duel.on) rows.push(['Adversaire', H(J.duel.opp || '…')], ...(J.oppProg != null ? [[def.progLabel || 'Son score', J.oppProg]] : []));
        $('#stats').innerHTML = rows.map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');
    }
    J.redraw = () => { if (J.ctx) def.draw(J.ctx); updateStats(); };
    J.prog = v => { // progression envoyée à l'adversaire (duel « course »)
        if (!J.duel.on) return;
        const now = performance.now();
        if (now - (J._lastProg || 0) < 400) return;
        J._lastProg = now;
        J.duel.send('prog', { v });
    };

    // ---------- Effets : vibration, particules, traits de vitesse ----------
    J._shake = 0; J._shakeAmp = 0; J.parts = []; J.camX = 0; J.camY = 0;
    J.shake = (amp = 6, dur = .25) => { J._shakeAmp = Math.max(J._shake > 0 ? J._shakeAmp : 0, amp); J._shake = Math.max(J._shake, dur); };
    // Gerbe de particules : x, y en coordonnées du monde du jeu
    J.burst = (x, y, n = 12, color, speed = 160, life = .6, size = 3, grav = 0) => {
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (.3 + Math.random() * .7); J.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: life * (.6 + Math.random() * .4), life, col: color || J.c.accent, size, grav }); }
        if (J.parts.length > 600) J.parts.splice(0, J.parts.length - 600);
    };
    // Traits de vitesse (à appeler dans draw) : intensité 0..1, du centre vers les bords ou horizontaux
    J.speedLines = (k, mode = 'radial') => {
        if (k <= .05) return;
        k = Math.min(1, k);
        const ctx = J.ctx; ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${Math.min(.25, k * .25)})`; ctx.lineWidth = 1.5;
        const n = Math.floor(6 + k * 16);
        for (let i = 0; i < n; i++) {
            if (mode === 'radial') {
                const a = Math.random() * Math.PI * 2, r0 = Math.max(J.W, J.H) * (.35 + Math.random() * .2), r1 = r0 + 40 + k * 120;
                ctx.beginPath(); ctx.moveTo(J.W / 2 + Math.cos(a) * r0, J.H / 2 + Math.sin(a) * r0); ctx.lineTo(J.W / 2 + Math.cos(a) * r1, J.H / 2 + Math.sin(a) * r1); ctx.stroke();
            } else { const y = Math.random() * J.H, x = Math.random() * J.W, l = 30 + k * 90; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l, y); ctx.stroke(); }
        }
        ctx.restore();
    };
    function fxStep(dt) {
        if (J._shake > 0) J._shake -= dt;
        for (const p of J.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.vx *= .985; p.vy *= .985; p.t -= dt; }
        J.parts = J.parts.filter(p => p.t > 0);
    }
    function fxDraw(ctx) {
        for (const p of J.parts) { ctx.globalAlpha = Math.max(0, p.t / p.life); ctx.fillStyle = p.col; ctx.fillRect(p.x - J.camX - p.size / 2, p.y - J.camY - p.size / 2, p.size, p.size); }
        ctx.globalAlpha = 1;
    }
    // Glissade : Maj gauche / droite (en plus des touches propres à chaque jeu)
    J.slideHeld = () => J.keys.has('ShiftLeft') || J.keys.has('ShiftRight');

    // Fin de partie. res = { won, score, time, title, text }
    J.end = res => {
        if (J.over) return;
        J.over = true;
        res = Object.assign({ time: Math.round(J.time * 10) / 10 }, res);
        const md = def.modes[J.mode];
        if (J.duel.on && md.duel === 'race') {
            J.myRes = res;
            J.duel.send('fin', res);
            if (J.oppRes) finishRace(); else overlay(`<div>${icon('hourglass')}<br>${res.title || 'Terminé'}<br><small>En attente de ${H(J.duel.opp)}…</small></div>`);
            return;
        }
        finish(res);
    };
    function finishRace() {
        const me = J.myRes, op = J.oppRes;
        const cmp = def.duelCompare ? def.duelCompare(me, op) : ((me.won ? 1 : 0) - (op.won ? 1 : 0)) || ((me.score || 0) - (op.score || 0)) || ((op.time || 0) - (me.time || 0));
        const fmt = r => def.duelFormat ? def.duelFormat(r) : (r.score != null ? r.score : fmtTime(r.time));
        finish({ won: cmp > 0, draw: cmp === 0, score: me.score, time: me.time,
            text: `Toi : ${fmt(me)} · ${J.duel.opp} : ${fmt(op)}` });
    }
    function finish(res) {
        J.over = true; running = false;
        overlay('');
        const md = def.modes[J.mode], [, , kind] = info.modes[J.mode];
        const sub = def.sub ? def.sub() : null;
        if (!res.noRecord) Stats.record({ game: def.id, mode: J.mode, sub: sub == null ? null : String(sub), won: !!res.won, time: res.time ?? null, score: res.score ?? null });
        (res.won ? J.sfx.win : res.draw ? J.sfx.click : J.sfx.lose)();
        const title = res.title || (res.draw ? 'Égalité' : kind === 'score' && !J.duel.on && !md.bot ? 'Partie terminée' : res.won ? 'Victoire' : 'Défaite');
        const ic = res.draw ? 'equal' : res.won ? 'trophy' : kind === 'score' && !J.duel.on ? 'flag' : 'frown';
        $('#modal-title').innerHTML = icon(ic) + `<span>${title}</span>`;
        $('#modal-text').textContent = res.text || '';
        const box = $('#modal-actions'); box.innerHTML = '';
        const btn = (label, ic2, fn, primary) => { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.innerHTML = icon(ic2) + `<span>${label}</span>`; b.onclick = fn; box.appendChild(b); };
        if (J.duel.on) {
            btn('Menu', 'arrow-left', () => { Duel.leave(); closeModals(); selectMode('duel'); }, true);
        } else {
            btn('Menu', 'arrow-left', () => { closeModals(); quit(); });
            btn('Rejouer', 'rotate-ccw', () => startGame(J.mode), !res.extra);
            (res.extra || []).forEach(([label, ic3, fn]) => btn(label, ic3, () => { closeModals(); fn(); }, true));
        }
        setTimeout(() => $('#modal').classList.remove('hidden'), res.instant ? 0 : 450);
    }
    function quit() {
        // Certains modes sans fin (ex. la Balade de Route) enregistrent la partie quand on quitte
        if (started && !J.over && def.quitResult) {
            const r = def.quitResult();
            if (r) Stats.record({ game: def.id, mode: J.mode, sub: null, won: !!r.won, time: Math.round(J.time * 10) / 10, score: r.score ?? null });
        }
        running = false; started = false; J.over = true;
        if (def.stop) def.stop();
        if (J.duel.on) Duel.leave();
        overlay(''); selectMode(currentMode);
    }

    // ---------- Commandes tactiles ----------
    function renderTouch() {
        const box = $('#touch');
        const pads = def.touch ? (typeof def.touch === 'function' ? def.touch() : def.touch) : [];
        box.innerHTML = pads.map(([code, ic, label]) => `<button data-code="${code}">${icon(ic)}${label ? `<span>${label}</span>` : ''}</button>`).join('');
        box.classList.toggle('hidden', !pads.length);
        box.querySelectorAll('button').forEach(b => {
            const code = b.dataset.code;
            const down = e => { e.preventDefault(); if (!J.keys.has(code)) { J.keys.add(code); def.keydown && def.keydown(code, e); } b.classList.add('on'); };
            const up = e => { e.preventDefault(); J.keys.delete(code); def.keyup && def.keyup(code, e); b.classList.remove('on'); };
            b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
        });
    }

    // ---------- Entrées ----------
    function bindInputs() {
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modalOpen()) { if ($('#modal').classList.contains('hidden')) closeModals(); return; }
            if (modalOpen() || !$('#screen-game').classList.contains('active')) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.target.tagName === 'INPUT') return;
            if (e.code === 'Escape' || e.code === 'KeyP' && !def.typing) { setPause(!paused); e.preventDefault(); return; }
            if (e.code === 'KeyR' && !J.duel.on && !def.noRestartKey && !def.typing) { startGame(J.mode); e.preventDefault(); return; }
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
            if (paused || countdown > 0 && def.update) { J.keys.add(e.code); return; }
            if (!J.keys.has(e.code) || !def.update) def.keydown && def.keydown(e.code, e);
            J.keys.add(e.code);
        });
        document.addEventListener('keyup', e => { J.keys.delete(e.code); def.keyup && def.keyup(e.code, e); });
        window.addEventListener('blur', () => { J.keys.clear(); setPause(true); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
        const cv = $('#board');
        const ptr = type => e => {
            if (!def.pointer || paused || J.over && type !== 'move') return;
            if (countdown > 0 && def.update) return;
            if (type === 'down') { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); }
            const [x, y] = toLocal(e);
            def.pointer(type, x, y, e);
        };
        cv.addEventListener('pointerdown', ptr('down'));
        cv.addEventListener('pointermove', ptr('move'));
        cv.addEventListener('pointerup', ptr('up'));
        cv.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('resize', fitCanvas);
        $('#pause-btn').onclick = () => setPause(!paused);
        $('#restart-btn').onclick = () => startGame(J.mode);
        $('#quit-btn').onclick = () => { if (J.duel.on && !J.over && !confirm('Quitter le duel ? Tu perds la partie.')) return; if (J.duel.on && !J.over) J.duel.send('quit', {}); quit(); };
        $('#play-btn').onclick = () => startGame(currentMode);
        $$('.mode-item[data-mode]').forEach(b => b.onclick = () => { if (started && !J.over && J.duel.on) return; running = false; started = false; Duel.leave(); selectMode(b.dataset.mode); });
        $('#theme-btn').onclick = () => $('#settings').classList.remove('hidden');
        $('#help-btn').onclick = () => $('#help').classList.remove('hidden');
        $$('[data-close]').forEach(b => b.onclick = closeModals);
        $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'modal') closeModals(); }));
        const sb = $('#sound-btn');
        const paintSound = () => { sb.innerHTML = icon(settings.sound ? 'volume-2' : 'volume-x'); };
        sb.onclick = () => { settings.sound = !settings.sound; saveSettings(); paintSound(); };
        paintSound();
        document.addEventListener('themechange', () => { readColors(); });
    }

    // ---------- Duel en ligne (Supabase Realtime) ----------
    const Duel = {
        ch: null, code: null, started: false,
        myKey() { return Online.username + '#' + Online.user.id.slice(0, 6); },
        create() {
            this.leave();
            this.code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
            J.duel.host = true; this.connect();
            this.wait(`Code : ${this.code}`, 'swords', 'Donne ce code à ton adversaire. La partie démarre dès qu\'il rejoint.');
        },
        join(code) {
            if (!/^[A-Z]{4}$/.test(code)) { toast('Le code fait 4 lettres', 'info'); return; }
            this.leave();
            this.code = code; J.duel.host = false; this.connect();
            this.wait(`Connexion à ${code}…`, 'loader', 'En attente de l\'hôte.');
            this.joinTimer = setTimeout(() => { if (!this.started) { this.leave(); closeModals(); toast('Aucune partie trouvée avec ce code', 'circle-x', 3000); } }, 10000);
        },
        wait(title, ic, text) {
            $('#modal-title').innerHTML = icon(ic) + `<span>${title}</span>`;
            $('#modal-text').textContent = text;
            const box = $('#modal-actions'); box.innerHTML = '';
            const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Annuler';
            b.onclick = () => { closeModals(); this.leave(); }; box.appendChild(b);
            $('#modal').classList.remove('hidden');
        },
        connect() {
            const ch = this.ch = Online.client.channel(def.id + '-' + this.code, { config: { broadcast: { self: false }, presence: { key: this.myKey() } } });
            ch.on('presence', { event: 'sync' }, () => {
                const players = Object.keys(ch.presenceState());
                if (players.length > 2 && !this.started) { toast('Partie déjà complète', 'circle-x'); this.leave(); closeModals(); return; }
                if (J.duel.host && players.length === 2 && !this.started) {
                    J.duel.opp = players.find(k => k !== this.myKey()).split('#')[0];
                    const seed = Math.floor(Math.random() * 2 ** 31), opts = loadOpts('duel');
                    setTimeout(() => { this.send('start', { seed, opts, host: Online.username }); this.begin(seed, opts); }, 400);
                }
            });
            ch.on('presence', { event: 'leave' }, () => { if (this.started && !J.over) J.end({ won: true, text: `${J.duel.opp} a quitté la partie.`, instant: true }); });
            ch.on('broadcast', { event: 'start' }, ({ payload }) => { if (!J.duel.host && !this.started) { clearTimeout(this.joinTimer); J.duel.opp = payload.host; this.begin(payload.seed, payload.opts); } });
            ch.on('broadcast', { event: 'prog' }, ({ payload }) => { J.oppProg = payload.v; if (def.onOppProg) def.onOppProg(payload.v); });
            ch.on('broadcast', { event: 'quit' }, () => { if (!J.over) J.end({ won: true, text: `${J.duel.opp} a abandonné.`, instant: true }); });
            ch.on('broadcast', { event: 'fin' }, ({ payload }) => {
                J.oppRes = payload;
                if (J.myRes) finishRace();
                else if (def.liveScore && !J.over) toast(`${J.duel.opp} a terminé : ${def.duelFormat ? def.duelFormat(payload) : payload.score ?? fmtTime(payload.time)}`, 'flag', 3000);
            });
            ch.on('broadcast', { event: 'g' }, ({ payload }) => { if (def.onDuel) def.onDuel(payload.e, payload.p); });
            ch.subscribe(st => { if (st === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
        },
        begin(seed, opts) {
            this.started = true;
            J.duel.on = true;
            J.duel.send = (e, p) => this.send('g', { e, p });
            closeModals();
            startGame('duel', seed, opts);
        },
        send(event, payload) { if (this.ch) this.ch.send({ type: 'broadcast', event, payload }); },
        leave() {
            clearTimeout(this.joinTimer);
            if (this.ch) { try { this.ch.untrack(); Online.client.removeChannel(this.ch); } catch { /* déjà fermé */ } }
            this.ch = null; this.started = false; J.duel.on = false; J.duel.send = () => {};
        },
    };
    // Course : si l'adversaire a fini et qu'on le dépasse, on gagne tout de suite
    J.checkLive = () => {
        if (!J.duel.on || J.over || !J.oppRes || !def.liveScore) return;
        if (def.liveScore() > (J.oppRes.score || 0)) J.end({ won: true, score: def.liveScore(), title: 'Tu l\'as dépassé !' });
    };
    function renderDuelBox() {
        const box = $('#duel-box');
        if (!Online.configured) { box.innerHTML = `<p class="muted">${icon('cloud-off')} Le mode en ligne n'est pas activé.</p>`; return; }
        if (!Online.user) { box.innerHTML = `<a class="btn primary block" href="${def.root || '../../'}pages/account.html">${icon('log-in')} Se connecter pour jouer en duel</a>`; return; }
        box.innerHTML = `<button class="btn primary block" id="vs-create">${icon('plus')} Créer une partie</button>
            <div class="duel-join"><input id="vs-code" maxlength="4" placeholder="CODE"><button class="btn" id="vs-join">${icon('log-in')} Rejoindre</button></div>
            <p class="muted duel-note">Les réglages de l'hôte s'appliquent aux deux joueurs.</p>`;
        $('#vs-create').onclick = () => Duel.create();
        $('#vs-join').onclick = () => Duel.join($('#vs-code').value.trim().toUpperCase());
        $('#vs-code').onkeydown = e => { if (e.key === 'Enter') $('#vs-join').click(); };
    }

    return {
        create(d) {
            def = d; info = CATALOGUE[d.id];
            // Le duel « course » utilise les mêmes réglages que le premier mode s'il n'en a pas
            buildPage();
            readColors();
            renderThemes($('#themes'));
            hydrateIcons();
            bindInputs();
            // Mode demandé dans l'adresse (?mode=bot), sinon le dernier utilisé
            const asked = new URLSearchParams(location.search).get('mode');
            currentMode = d.modes[asked] ? asked : store.get(d.id + (d.root ? 'DuelMode' : 'Mode'), Object.keys(d.modes)[0]);
            selectMode(currentMode);
            Online.onChange(() => { if (currentMode === 'duel' && $('#screen-setup').classList.contains('active')) renderDuelBox(); });
            raf = requestAnimationFrame(loop);
        },
        get mode() { return currentMode; },
        get def() { return def; },
        startGame, quit,
    };
})();

// Choix de difficulté réutilisable pour les bots
const BOT_LEVELS = { id: 'level', label: 'Niveau du bot', def: 2, choices: [[1, 'Facile', 'pour découvrir'], [2, 'Moyen', 'il réfléchit un peu'], [3, 'Difficile', 'attention'], [4, 'Expert', 'sans pitié']] };
