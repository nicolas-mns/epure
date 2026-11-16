'use strict';
// ==================== Outils communs à tous les jeux ====================
// Stockage local, thèmes (+ polices), icônes Lucide, langue FR/EN, toasts, modales, statistiques.

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const store = {
    get(k, d) { try { const v = localStorage.getItem('arc_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('arc_' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

const settings = Object.assign({ theme: 'graphite', sound: true, anim: true, vibrate: true, zoom: 1, lang: (navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en' }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

// Thèmes : couleurs dans base.css, polices chargées à la demande
const THEMES = [
    { id: 'graphite', name: 'Graphite', c: ['#0c0c0d', '#232327', '#d4d4d8'] },
    { id: 'ardoise', name: 'Ardoise', c: ['#0f1419', '#222c37', '#7aa2c8'] },
    { id: 'nord', name: 'Nord', c: ['#2e3440', '#3b4252', '#88c0d0'] },
    { id: 'bordeaux', name: 'Bordeaux', c: ['#110b0c', '#2a1d1f', '#c4848c'] },
    { id: 'papier', name: 'Papier', c: ['#f4f1ea', '#ddd7c8', '#3d3a33'] },
    { id: 'clair', name: 'Clair', c: ['#fafafa', '#dcdce0', '#18181b'] },
    { id: 'terminal', name: 'Terminal', c: ['#050805', '#132013', '#4ade80'], fonts: 'VT323' },
    { id: 'farwest', name: 'Far West', c: ['#e8d5ae', '#b98b52', '#7a2e12'], fonts: 'Rye|Special+Elite' },
    { id: 'arcade', name: 'Arcade 8-bit', c: ['#0d0221', '#241734', '#ff2a6d'], fonts: 'Press+Start+2P|VT323' },
    { id: 'journal', name: 'Journal', c: ['#f2eee3', '#d9d3c3', '#111111'], fonts: 'Playfair+Display:wght@700;900|Source+Serif+4:wght@400;600' },
    { id: 'cyber', name: 'Cyberpunk', c: ['#09000f', '#1a0b2e', '#fcee0a'], fonts: 'Orbitron:wght@500;700|Rajdhani:wght@500;600;700' },
    { id: 'retro95', name: 'Rétro 95', c: ['#008080', '#c0c0c0', '#000080'] },
    { id: 'ocean', name: 'Océan', c: ['#04202f', '#0b3b52', '#4fd1c5'], fonts: 'Nunito:wght@400;600;800' },
    { id: 'bonbon', name: 'Bonbon', c: ['#fff0f6', '#ffd6e8', '#e64980'], fonts: 'Fredoka:wght@400;500;600' },
    { id: 'medieval', name: 'Grimoire', c: ['#1c1610', '#3a2e20', '#c9a24a'], fonts: 'Cinzel:wght@500;700|EB+Garamond:wght@400;600' },
    { id: 'espace', name: 'Espace', c: ['#03040b', '#12162b', '#a5b4fc'], fonts: 'Space+Grotesk:wght@400;500;700' },
];
const _loadedFonts = new Set();
function loadFonts(spec) {
    if (!spec || _loadedFonts.has(spec)) return;
    _loadedFonts.add(spec);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + spec.split('|').map(f => 'family=' + f).join('&') + '&display=swap';
    document.head.appendChild(l);
}

// Icône Lucide sous forme de chaîne SVG (avec cache)
const _iconCache = new Map();
function icon(name, cls = '') {
    const key = name + '|' + cls;
    if (_iconCache.has(key)) return _iconCache.get(key);
    let html = '';
    try {
        const pascal = name.replace(/(^|-)(\w)/g, (_, __, ch) => ch.toUpperCase());
        const node = window.lucide && lucide.icons[pascal];
        if (node) {
            const el = lucide.createElement(node);
            el.setAttribute('class', `lucide lucide-${name} ${cls}`.trim());
            html = el.outerHTML;
        }
    } catch { /* lucide indisponible */ }
    _iconCache.set(key, html);
    return html;
}
function hydrateIcons(root = document) {
    root.querySelectorAll('i[data-icon]').forEach(el => {
        const svg = icon(el.dataset.icon, el.className);
        if (svg) el.outerHTML = svg;
    });
}

function applyTheme(id) {
    const th = THEMES.find(t => t.id === id) || THEMES[0];
    settings.theme = th.id; saveSettings();
    loadFonts(th.fonts);
    document.body.dataset.theme = th.id;
    $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === th.id));
    document.dispatchEvent(new CustomEvent('themechange'));
}
function renderThemes(container) {
    container.innerHTML = THEMES.map(t => `<button class="theme-btn" data-theme="${t.id}"><span class="theme-swatch">${t.c.map(c => `<i style="background:${c}"></i>`).join('')}</span>${t.name}</button>`).join('');
    container.querySelectorAll('.theme-btn').forEach(b => b.onclick = () => applyTheme(b.dataset.theme));
    applyTheme(settings.theme);
}

// ==================== Langue FR / EN ====================
// Le site est écrit en français. En anglais, chaque texte affiché est traduit à la volée
// grâce au dictionnaire I18N_EN (commun/js/i18n.js) : clé = texte français exact,
// ou modèle avec {n} pour les textes contenant des nombres ou des noms.
const I18N = { exact: new Map(), patterns: [] };
function i18nInit() {
    if (typeof I18N_EN === 'undefined' || I18N.ready) return;
    I18N.ready = true;
    for (const [fr, en] of Object.entries(I18N_EN)) {
        if (fr.includes('{')) {
            const names = [];
            const re = new RegExp('^' + fr.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_, n) => { names.push(n); return '(.+?)'; }) + '$');
            I18N.patterns.push({ re, names, en });
        } else I18N.exact.set(fr, en);
    }
}
function tr(text) {
    if (settings.lang !== 'en' || !text) return text;
    i18nInit();
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    const core = text.trim();
    if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return text;
    if (I18N.exact.has(core)) return lead + I18N.exact.get(core) + trail;
    for (const p of I18N.patterns) {
        const m = core.match(p.re);
        if (m) {
            let out = p.en;
            p.names.forEach((n, i) => { out = out.replace('{' + n + '}', tr(m[i + 1])); });
            return lead + out + trail;
        }
    }
    // Plusieurs lignes : traduire ligne par ligne
    if (core.includes('\n')) return lead + core.split('\n').map(l => tr(l)).join('\n') + trail;
    return text;
}
const t = tr; // alias pratique dans le code des jeux
const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'SVG', 'svg', 'TEXTAREA', 'CODE', 'KBD']);
function translateNode(node) {
    if (node.nodeType === 3) {
        if (node.nodeValue !== node.__done) node.__fr = node.nodeValue; // texte changé par le jeu : nouvel original
        const out = settings.lang === 'en' ? tr(node.__fr) : node.__fr;
        if (node.nodeValue !== out) node.nodeValue = out;
        node.__done = out;
        return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.nodeName) || node.classList.contains('cell')) return;
    for (const a of ['title', 'placeholder', 'aria-label']) {
        if (!node.hasAttribute(a)) continue;
        const key = '__fr_' + a, cur = node.getAttribute(a);
        if (node[key] === undefined || cur !== node[key + '_done']) node[key] = cur;
        const out = settings.lang === 'en' ? tr(node[key]) : node[key];
        if (cur !== out) node.setAttribute(a, out);
        node[key + '_done'] = out;
    }
    node.childNodes.forEach(translateNode);
}
let _i18nObserver = null;
function startI18n() {
    document.documentElement.lang = settings.lang;
    translateNode(document.body);
    document.title = settings.lang === 'en' ? tr(document.__frTitle || (document.__frTitle = document.title)) : (document.__frTitle || document.title);
    if (_i18nObserver) return;
    _i18nObserver = new MutationObserver(muts => {
        if (settings.lang !== 'en') return;
        for (const m of muts) {
            if (m.type === 'characterData') translateNode(m.target);
            else m.addedNodes.forEach(translateNode);
            if (m.type === 'attributes') translateNode(m.target);
        }
    });
    _i18nObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
}
function setLang(lang) {
    settings.lang = lang; saveSettings();
    startI18n();
    $$('.lang-btn').forEach(b => { b.textContent = lang.toUpperCase(); });
    document.dispatchEvent(new CustomEvent('langchange'));
}
// Bouton de langue ajouté automatiquement dans la barre du haut
function addLangButton() {
    const bar = $('.topbar');
    if (!bar || bar.querySelector('.lang-btn')) return;
    const b = document.createElement('button');
    b.className = 'icon-btn lang-btn'; b.title = 'Langue';
    b.textContent = settings.lang.toUpperCase();
    b.onclick = () => setLang(settings.lang === 'fr' ? 'en' : 'fr');
    const spacer = bar.querySelector('.spacer');
    (spacer ? spacer.nextSibling : null) ? bar.insertBefore(b, spacer.nextSibling) : bar.appendChild(b);
}

function toast(msg, ic, ms = 2200) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.className = 'toast';
    el.innerHTML = (ic ? icon(ic) : '') + `<span>${msg}</span>`;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toast.tid); toast.tid = setTimeout(() => el.classList.add('hidden'), ms);
}

// Écran de fin de partie (tous les jeux) : R ou Entrée = « Rejouer »
document.addEventListener('keydown', e => {
    if (!['KeyR', 'Enter', 'NumpadEnter'].includes(e.code) || e.ctrlKey || e.metaKey) return;
    const m = document.getElementById('modal');
    if (!m || m.classList.contains('hidden')) return;
    const b = [...m.querySelectorAll('#modal-actions button')].find(x => /Rejouer|Play again|Nouvelle partie|Recommencer/i.test(x.textContent));
    if (b) { e.preventDefault(); e.stopImmediatePropagation(); b.click(); }
}, true);

const closeModals = () => $$('.modal').forEach(m => m.classList.add('hidden'));
const modalOpen = () => $$('.modal').some(m => !m.classList.contains('hidden'));

const fmtTime = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ==================== Statistiques ====================
// Chaque partie terminée est enregistrée : { game, mode, won, time, score, date }
const Stats = {
    record(entry) {
        const all = store.get('history', []);
        all.push(Object.assign({ date: Date.now() }, entry));
        if (all.length > 3000) all.splice(0, all.length - 3000);
        store.set('history', all);
    },
    all() { return store.get('history', []); },
};

// Menu « Jeux » dans la barre du haut : un bouton qui ouvre la liste de tous les jeux (catalogue.js)
function addGameNav() {
    const brand = document.querySelector('.topbar .brand');
    if (!brand || document.querySelector('.game-nav') || typeof CATALOGUE === 'undefined') return;
    const root = brand.getAttribute('href').replace(/\/?$/, '/');
    const cur = (location.pathname.match(/\/jeux\/([^/]+)/) || [])[1];
    const wrap = document.createElement('div');
    wrap.className = 'game-nav';
    wrap.innerHTML = `<button class="game-nav-btn" aria-expanded="false">${icon('layout-grid')}<span>Jeux</span>${icon('chevron-down')}</button>
        <div class="game-menu hidden">${CATEGORIES.map(([cat, label, ic]) => `<div class="gm-cat"><p>${icon(ic)}<span>${label}</span></p>
            ${Object.entries(CATALOGUE).filter(([, g]) => g.cat === cat).map(([id, g]) => `<a href="${root}jeux/${id}/" class="${id === cur ? 'current' : ''}">${icon(g.icon)}<span>${g.name}</span></a>`).join('')}</div>`).join('')}</div>`;
    brand.after(wrap);
    const btn = wrap.querySelector('.game-nav-btn'), menu = wrap.querySelector('.game-menu');
    const toggle = open => { menu.classList.toggle('hidden', !open); btn.setAttribute('aria-expanded', open); };
    btn.onclick = e => { e.stopPropagation(); toggle(menu.classList.contains('hidden')); };
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
}

// Initialisation commune
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(settings.theme);
    addGameNav();
    addLangButton();
    startI18n();
});
if (document.readyState !== 'loading') { applyTheme(settings.theme); addGameNav(); addLangButton(); startI18n(); }
