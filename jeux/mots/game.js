'use strict';
// ==================== Mots ====================
// Trouver un mot de 5 lettres en 6 essais. Vert : bonne place ; jaune : dans le mot ; gris : absent.
// Contre le bot : vous cherchez le même mot en parallèle, le moins d'essais gagne.

const LANG_OPT = { id: 'lang', label: 'Langue des mots', def: settings.lang === 'en' ? 'en' : 'fr', choices: [['fr', 'Français'], ['en', 'Anglais']] };
const ROWS_KB = { fr: ['AZERTYUIOP', 'QSDFGHJKLM', '>WXCVBN<'], en: ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<'] };
let M = null;

// 2 = bien placée, 1 = mal placée, 0 = absente (gère les lettres en double)
function feedback(guess, ans) {
    const res = [0, 0, 0, 0, 0], left = {};
    for (let i = 0; i < 5; i++) { if (guess[i] === ans[i]) res[i] = 2; else left[ans[i]] = (left[ans[i]] || 0) + 1; }
    for (let i = 0; i < 5; i++) if (!res[i] && left[guess[i]]) { res[i] = 1; left[guess[i]]--; }
    return res;
}
const fbKey = f => f.join('');

// ---------- Bot ----------
function botGuess(B) {
    const lvl = J.opts.level, list = WORDS[J.opts.lang];
    // Mots encore compatibles avec tout ce que le bot a vu
    const ok = w => B.rows.every(r => fbKey(feedback(r.w, w)) === fbKey(r.f));
    if (lvl === 1) {
        // Facile : ne retient que les lettres bien placées
        const greens = w => B.rows.every(r => r.f.every((v, i) => v !== 2 || w[i] === r.w[i]));
        const c = list.filter(greens); return J.pick(c.length ? c : list);
    }
    const cands = list.filter(ok);
    if (!cands.length) return J.pick(list);
    if (lvl === 2 || cands.length <= 2) return J.pick(cands);
    if (lvl === 3 && B.rows.length === 0) return J.pick(['fr', 'en'].includes(J.opts.lang) ? (J.opts.lang === 'fr' ? ['SAINT', 'TERRE', 'ROUTE', 'CARTE', 'LIENS'] : ['SLATE', 'CRANE', 'TRACE', 'STARE', 'RAISE']).filter(w => list.includes(w)) : cands);
    // Expert (et difficile ensuite) : l'essai qui laisse le moins de candidats en moyenne
    const pool = lvl === 4 ? [...new Set([...cands.slice(0, 60), ...list.filter((_, i) => i % 7 === 0)])] : cands.slice(0, 40);
    let best = cands[0], bestScore = Infinity;
    for (const g of pool) {
        const buckets = {};
        for (const a of cands) { const k = fbKey(feedback(g, a)); buckets[k] = (buckets[k] || 0) + 1; }
        let s = 0; for (const k in buckets) s += buckets[k] * buckets[k];
        s /= cands.length;
        if (cands.includes(g)) s -= .5;
        if (s < bestScore) { bestScore = s; best = g; }
    }
    return best;
}

Jeu.create({
    id: 'mots',
    modes: {
        jour: { desc: 'Le même mot pour tout le monde aujourd\'hui. Un seul essai par jour compte vraiment !', options: [LANG_OPT], seed: daySeed,
            rules: [['square-check', 'Vert : bonne lettre à la bonne place.'], ['square-dot', 'Jaune : la lettre est dans le mot, ailleurs.'], ['square', 'Gris : la lettre n\'est pas dans le mot.']] },
        libre: { desc: 'Autant de mots que tu veux.', options: [LANG_OPT], rules: [['trophy', 'Points : 6 si trouvé au 1er essai, 1 au 6e, 0 sinon.']] },
        bot: { bot: true, desc: 'Toi et le bot cherchez le même mot en même temps. Le moins d\'essais gagne. Tu ne vois ses couleurs qu\'à la fin.', options: [LANG_OPT, BOT_LEVELS] },
        duel: { duel: 'race', desc: 'Même mot pour les deux joueurs. Le moins d\'essais gagne ; à égalité, le plus rapide.', options: [LANG_OPT] },
    },
    size: () => [J.mode === 'bot' || J.mode === 'duel' ? 720 : 520, 640],
    maxScale: 1.3,
    countdown: false,
    showTime: true,
    typing: true,
    controls: [['Lettres', 'Taper'], ['<kbd>Entrée</kbd>', 'Valider'], ['<kbd>Retour</kbd>', 'Effacer']],
    sub() { return J.opts.lang; },
    duelCompare(a, b) { return (a.won - b.won) || (b.tries - a.tries) || (b.time - a.time); },
    duelFormat(r) { return r.won ? `${r.tries} essai${r.tries > 1 ? 's' : ''}` : 'raté'; },
    progLabel: 'Ses essais',

    start() {
        const list = WORDS[J.opts.lang];
        M = { ans: list[Math.floor(J.rng() * list.length)], rows: [], cur: '', letters: {}, shake: 0, msg: '', msgT: 0, opp: [],
            bot: J.mode === 'bot' ? { rows: [], done: false } : null, keys: [] };
    },
    update(dt) { if (M.shake > 0) M.shake -= dt; if (M.msgT > 0) M.msgT -= dt; },
    keydown(code, e) {
        if (J.over) return;
        if (code === 'Enter' || code === 'NumpadEnter') submit();
        else if (code === 'Backspace') M.cur = M.cur.slice(0, -1);
        else if (e && e.key && /^[a-zA-Z]$/.test(e.key) && M.cur.length < 5) M.cur += e.key.toUpperCase();
    },
    pointer(type, x, y) {
        if (type !== 'down' || J.over) return;
        const k = M.keys.find(k => x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
        if (!k) return;
        J.sfx.click();
        if (k.ch === '>') submit(); else if (k.ch === '<') M.cur = M.cur.slice(0, -1); else if (M.cur.length < 5) M.cur += k.ch;
    },
    onDuel(e, p) { if (e === 'row') M.opp.push(p); },
    stats() { return [['Essai', `${Math.min(6, M.rows.length + 1)}/6`]]; },

    draw(ctx) {
        const c = J.c;
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, J.W, J.H);
        const side = !!(M.bot || J.duel.on);
        const T = 58, G = 7, gx = side ? 40 : (J.W - (5 * T + 4 * G)) / 2, gy = 22;
        const col = v => v === 2 ? c.ok : v === 1 ? c.warn : c.surface3;
        for (let r = 0; r < 6; r++) {
            const row = M.rows[r], isCur = r === M.rows.length && !J.over;
            const dx = isCur && M.shake > 0 ? Math.sin(M.shake * 60) * 6 : 0;
            for (let i = 0; i < 5; i++) {
                const x = gx + i * (T + G) + dx, y = gy + r * (T + G);
                const ch = row ? row.w[i] : isCur ? M.cur[i] : '';
                J.rr(x, y, T, T, 6);
                if (row) { ctx.fillStyle = col(row.f[i]); ctx.fill(); }
                else { ctx.strokeStyle = ch ? c.muted : c.border; ctx.lineWidth = 2; ctx.stroke(); }
                if (ch) J.text(ch, x + T / 2, y + T / 2 + 1, 28, row && row.f[i] ? '#fff' : c.text, 'center', 700);
            }
        }
        // Grille de l'adversaire (bot ou duel) : couleurs seules, lettres révélées à la fin
        if (side) {
            const t = 30, g = 5, ox = gx + 5 * (T + G) + 60, oy = gy + 10;
            J.text(M.bot ? `Bot · ${BOT_LEVELS.choices[J.opts.level - 1][1]}` : J.duel.opp, ox + (5 * (t + g)) / 2, oy - 2, 14, c.muted);
            const rows = M.bot ? M.bot.rows : M.opp;
            for (let r = 0; r < 6; r++) for (let i = 0; i < 5; i++) {
                const row = rows[r], x = ox + i * (t + g), y = oy + 16 + r * (t + g);
                J.rr(x, y, t, t, 4);
                if (row) { ctx.fillStyle = col(row.f[i]); ctx.fill(); if (J.over && row.w) J.text(row.w[i], x + t / 2, y + t / 2 + 1, 15, '#fff', 'center', 700); }
                else { ctx.strokeStyle = c.border; ctx.lineWidth = 1.5; ctx.stroke(); }
            }
        }
        // Clavier
        const kb = ROWS_KB[J.opts.lang], ky = gy + 6 * (T + G) + 14, kh = 48, kg = 6;
        const kw = Math.min(44, (J.W - 20 - 9 * kg) / 10);
        M.keys = [];
        kb.forEach((row, ri) => {
            const widths = [...row].map(ch => ch === '>' || ch === '<' ? kw * 1.55 : kw);
            const total = widths.reduce((a, b) => a + b, 0) + kg * (row.length - 1);
            let x = (J.W - total) / 2;
            [...row].forEach((ch, i) => {
                const y = ky + ri * (kh + kg), w = widths[i], st = M.letters[ch];
                J.rr(x, y, w, kh, 6);
                ctx.fillStyle = st === 2 ? c.ok : st === 1 ? c.warn : st === 0 ? c.bg : c.surface3; ctx.fill();
                const label = ch === '>' ? 'OK' : ch === '<' ? '⌫' : ch;
                J.text(label, x + w / 2, y + kh / 2 + 1, ch === '>' ? 14 : 17, st != null && st > 0 ? '#fff' : st === 0 ? c.muted : c.text, 'center', 700);
                M.keys.push({ ch, x, y, w, h: kh });
                x += w + kg;
            });
        });
        if (M.msgT > 0) { J.rr(J.W / 2 - 150, 250, 300, 44, 8); ctx.fillStyle = c.text; ctx.fill(); J.text(M.msg, J.W / 2, 272, 15, c.bg); }
    },
});

function flash(msg) { M.msg = msg; M.msgT = 1.6; }
function submit() {
    if (M.cur.length < 5) { M.shake = .3; flash('Pas assez de lettres'); J.sfx.bad(); return; }
    const w = M.cur, f = feedback(w, M.ans);
    M.rows.push({ w, f }); M.cur = '';
    f.forEach((v, i) => { M.letters[w[i]] = Math.max(M.letters[w[i]] ?? -1, v); });
    J.tone(f.every(v => v === 2) ? 880 : 440 + f.reduce((a, b) => a + b, 0) * 40, .08, 'triangle', .04);
    const won = f.every(v => v === 2), n = M.rows.length;
    if (J.duel.on) { J.duel.send('row', { f, w }); J.prog(`${n}/6`); }
    if (M.bot && !M.bot.done) {
        const g = botGuess(M.bot), bf = feedback(g, M.ans);
        M.bot.rows.push({ w: g, f: bf });
        if (bf.every(v => v === 2)) M.bot.done = true;
    }
    if (M.bot) {
        const bn = M.bot.rows.length, bWon = M.bot.done;
        // Fin : le joueur a fini (gagné ou 6 essais) et le bot aussi, ou l'un a gagné avant l'autre
        if (won || n >= 6 || bWon) {
            // Si le bot a trouvé et pas encore le joueur, le joueur peut encore égaliser ce tour-ci seulement
            if (!won && bWon && n < bn) return;
            if (!won && !bWon && n < 6) return;
            const res = won && (!bWon || n < bn) ? 1 : won && bWon && n === bn ? 0 : -1;
            J.end({ won: res > 0, draw: res === 0, text: `Le mot était ${M.ans}. Toi : ${won ? n + ' essai(s)' : 'raté'} · Bot : ${bWon ? bn + ' essai(s)' : 'raté'}.` });
        }
        return;
    }
    if (won || n >= 6) {
        const score = won ? 7 - n : 0;
        J.end({ won, score, tries: won ? n : 7, title: won ? ['Génial !', 'Superbe !', 'Bravo !', 'Bien joué', 'Pas mal', 'Ouf !'][n - 1] : 'Raté',
            text: `Le mot était ${M.ans}.${won ? ` Trouvé en ${n} essai${n > 1 ? 's' : ''}.` : ''}` });
    }
}
