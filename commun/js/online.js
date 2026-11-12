'use strict';
// ==================== Fonctions en ligne (Supabase) ====================
// À charger après config.js, ui.js et le script supabase-js.

const Online = {
    client: null, user: null, username: null, isAdmin: false, listeners: [],
    get configured() { return !!(typeof EPURE_CONFIG !== 'undefined' && EPURE_CONFIG.SUPABASE_URL && EPURE_CONFIG.SUPABASE_ANON_KEY && window.supabase); },

    async init() {
        if (!this.configured) { this.emit(); return; }
        this.client = supabase.createClient(EPURE_CONFIG.SUPABASE_URL, EPURE_CONFIG.SUPABASE_ANON_KEY);
        let user = null;
        try {
            const { data } = await this.client.auth.getSession();
            if (data.session) {
                // Vérifie auprès du serveur que le compte existe toujours (sinon : session périmée)
                const { data: u, error } = await this.client.auth.getUser();
                if (error || !u.user) await this.client.auth.signOut({ scope: 'local' });
                else user = u.user;
            }
        } catch (e) {
            console.warn('Session invalide, déconnexion locale', e);
            try { await this.client.auth.signOut({ scope: 'local' }); } catch { /* rien */ }
        }
        await this.setUser(user);
        // Ne jamais attendre un appel Supabase directement dans ce callback (risque de blocage)
        this.client.auth.onAuthStateChange((_e, session) => {
            const u = session ? session.user : null;
            if ((u && u.id) === (this.user && this.user.id)) return;
            setTimeout(() => this.setUser(u), 0);
        });
    },
    async setUser(user) {
        this.user = user;
        this.username = null; this.isAdmin = false;
        if (user) {
            try {
                const { data } = await this.client.from('profiles').select('username,is_admin').eq('id', user.id).maybeSingle();
                this.username = data ? data.username : (user.user_metadata && user.user_metadata.username) || 'joueur';
                this.isAdmin = !!(data && data.is_admin);
            } catch { this.username = 'joueur'; }
        }
        this.emit();
    },
    onChange(fn) { this.listeners.push(fn); fn(this); },
    emit() { this.listeners.forEach(fn => { try { fn(this); } catch (e) { console.error(e); } }); },

    // Pas d'e-mail demandé : le compte utilise une adresse interne tirée du pseudo (aucun mail n'est envoyé)
    pseudoEmail(username) { return username.trim().toLowerCase() + '@' + this.EMAIL_DOMAIN; },
    EMAIL_DOMAIN: 'joueurs.epure.app',
    isPseudoEmail(email) { return !!email && email.endsWith('@' + this.EMAIL_DOMAIN); },
    async signUp(username, password) {
        const { data, error } = await this.client.auth.signUp({ email: this.pseudoEmail(username), password, options: { data: { username } } });
        if (error) throw error;
        return data;
    },
    // Accepte un pseudo ou un e-mail (anciens comptes)
    async signIn(login, password) {
        const email = login.includes('@') ? login.trim() : this.pseudoEmail(login);
        const { error } = await this.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
    },
    async signOut() { await this.client.auth.signOut(); },
    async deleteAccount() {
        const { error } = await this.client.rpc('delete_my_account');
        if (error) throw error;
        await this.client.auth.signOut();
    },

    async saveGame(e) {
        if (!this.client || !this.user) return;
        const row = { game: e.game, mode: e.mode, sub: e.sub == null ? null : String(e.sub), won: !!e.won, time: e.time ?? null, score: e.score ?? null };
        const { error } = await this.client.from('games').insert(row);
        if (error) console.warn('Sauvegarde en ligne impossible :', error.message);
    },
    // Envoie l'historique local la première fois qu'on se connecte sur cet appareil
    async syncLocal() {
        if (!this.user) return 0;
        const key = 'synced_' + this.user.id;
        if (store.get(key, false)) return 0;
        const rows = Stats.all().map(e => ({ game: e.game, mode: e.mode, sub: e.sub == null ? null : String(e.sub), won: !!e.won, time: e.time ?? null, score: e.score ?? null, created_at: new Date(e.date).toISOString() }));
        for (let i = 0; i < rows.length; i += 500) {
            const { error } = await this.client.from('games').insert(rows.slice(i, i + 500));
            if (error) { console.warn(error.message); return 0; }
        }
        store.set(key, true);
        return rows.length;
    },
    async leaderboard(game, mode, sub, kind) {
        if (!this.client) return [];
        if (kind === 'time') {
            let q = this.client.from('leaderboard_time').select('username,best_time,wins').eq('game', game).eq('mode', mode).order('best_time').limit(10);
            q = sub == null ? q.is('sub', null) : q.eq('sub', String(sub));
            const { data } = await q; return data || [];
        }
        const { data } = await this.client.from('leaderboard_score').select('username,best_score,played').eq('game', game).eq('mode', mode).order('best_score', { ascending: false }).limit(10);
        return data || [];
    },
};

// Chaque partie enregistrée localement part aussi en ligne si on est connecté
const _record = Stats.record.bind(Stats);
Stats.record = entry => { _record(entry); Online.saveGame(entry); };

// Bouton compte dans la barre du haut (élément #account-btn)
Online.onChange(o => {
    const b = document.getElementById('account-btn');
    if (!b) return;
    b.classList.toggle('hidden', !o.configured);
    b.title = o.user ? `Connecté : ${o.username || ''}` : 'Se connecter';
    b.classList.toggle('on', !!o.user);
    // Petite couronne au-dessus du bouton compte pour les admins
    b.classList.toggle('is-admin', !!o.isAdmin);
    if (o.isAdmin && !b.querySelector('.crown')) { const c = document.createElement('span'); c.className = 'crown'; c.innerHTML = icon('crown'); b.append(c); }
    // Lien admin, ajouté à côté du bouton compte
    let a = document.getElementById('admin-btn');
    if (o.isAdmin && !a) {
        a = document.createElement('a');
        a.id = 'admin-btn'; a.className = 'icon-btn'; a.title = 'Administration';
        a.href = b.getAttribute('href').replace('account.html', 'admin.html');
        a.innerHTML = icon('shield-check');
        b.before(a);
    }
    if (a) a.classList.toggle('hidden', !o.isAdmin);
});
document.addEventListener('DOMContentLoaded', () => Online.init());
