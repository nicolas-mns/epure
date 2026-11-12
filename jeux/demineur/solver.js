// ==================== Solveur logique de Démineur ====================
// Sert à : valider les puzzles (100 % déductibles), générer des grilles
// "sans hasard", et fournir des indices au joueur.
// État d'une case pour le solveur : -1 inconnue, -2 mine connue, 0..8 chiffre révélé.

(function (root) {
    const nbCache = new Map();

    function getNeighbors(rows, cols) {
        const key = rows + 'x' + cols;
        if (nbCache.has(key)) return nbCache.get(key);
        const nb = new Array(rows * cols);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const list = [];
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (!dr && !dc) continue;
                        const rr = r + dr, cc = c + dc;
                        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) list.push(rr * cols + cc);
                    }
                }
                nb[r * cols + c] = list;
            }
        }
        nbCache.set(key, nb);
        return nb;
    }

    function computeAdjacent(rows, cols, mines) {
        const nb = getNeighbors(rows, cols);
        const adj = new Uint8Array(rows * cols);
        for (let i = 0; i < rows * cols; i++) {
            let n = 0;
            for (const j of nb[i]) if (mines[j]) n++;
            adj[i] = n;
        }
        return adj;
    }

    // Construit les contraintes {cells, count} à partir des chiffres révélés
    function buildConstraints(rows, cols, state) {
        const nb = getNeighbors(rows, cols);
        const seen = new Map();
        for (let i = 0; i < state.length; i++) {
            if (state[i] < 0) continue;
            const unk = [];
            let known = 0;
            for (const j of nb[i]) {
                if (state[j] === -1) unk.push(j);
                else if (state[j] === -2) known++;
            }
            if (!unk.length) continue;
            const key = unk.join(',');
            if (!seen.has(key)) seen.set(key, { cells: unk, count: state[i] - known });
        }
        return [...seen.values()];
    }

    // Niveau 1 : règles triviales ; niveau 2 : sous-ensembles ; niveau 3 : énumération + compte global
    function deduce(rows, cols, state, totalMines) {
        const safe = new Set(), mines = new Set();
        const cons = buildConstraints(rows, cols, state);

        for (const c of cons) {
            if (c.count === 0) c.cells.forEach(x => safe.add(x));
            else if (c.count === c.cells.length) c.cells.forEach(x => mines.add(x));
        }
        if (safe.size || mines.size) return { safe: [...safe], mines: [...mines], level: 1 };

        // Sous-ensembles / paires
        const byCell = new Map();
        cons.forEach((c, k) => c.cells.forEach(x => {
            if (!byCell.has(x)) byCell.set(x, []);
            byCell.get(x).push(k);
        }));
        const sets = cons.map(c => new Set(c.cells));
        for (let a = 0; a < cons.length; a++) {
            const partners = new Set();
            cons[a].cells.forEach(x => byCell.get(x).forEach(k => { if (k !== a) partners.add(k); }));
            for (const b of partners) {
                const A = cons[a], B = cons[b];
                const aOnly = A.cells.filter(x => !sets[b].has(x));
                const bOnly = B.cells.filter(x => !sets[a].has(x));
                // Si A - B a autant de cases que (A.count - B.count), elles sont toutes des mines et B - A est sûr
                if (aOnly.length && A.count - B.count === aOnly.length) {
                    aOnly.forEach(x => mines.add(x));
                    bOnly.forEach(x => safe.add(x));
                }
                if (!aOnly.length && bOnly.length && B.count === A.count) bOnly.forEach(x => safe.add(x));
            }
        }
        if (safe.size || mines.size) return { safe: [...safe], mines: [...mines], level: 2 };

        return enumerate(rows, cols, state, totalMines, cons);
    }

    function enumerate(rows, cols, state, totalMines, cons) {
        const safe = [], mines = [];
        let knownMines = 0, unknownCount = 0;
        for (let i = 0; i < state.length; i++) {
            if (state[i] === -2) knownMines++;
            else if (state[i] === -1) unknownCount++;
        }
        const R = totalMines - knownMines;

        // Composantes connexes des contraintes
        const parent = cons.map((_, i) => i);
        const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
        const owner = new Map();
        cons.forEach((c, k) => c.cells.forEach(x => {
            if (owner.has(x)) parent[find(k)] = find(owner.get(x));
            else owner.set(x, k);
        }));
        const groups = new Map();
        cons.forEach((c, k) => {
            const g = find(k);
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(c);
        });
        const frontierSet = new Set(owner.keys());
        const interior = unknownCount - frontierSet.size;

        const comps = [];
        for (const gc of groups.values()) comps.push(solveComponent(gc));

        // Sommes atteignables par les composantes
        const reach = (skip) => {
            let s = new Uint8Array(1); s[0] = 1;
            comps.forEach((cp, idx) => {
                if (idx === skip) return;
                const ns = new Uint8Array(s.length + cp.size);
                for (let a = 0; a < s.length; a++) if (s[a])
                    for (let k = 0; k <= cp.size; k++) if (cp.possK[k]) ns[a + k] = 1;
                s = ns;
            });
            return s;
        };
        const okRest = (s, k) => {
            for (let a = 0; a < s.length; a++) if (s[a]) {
                const m = R - k - a;
                if (m >= 0 && m <= interior) return true;
            }
            return false;
        };

        comps.forEach((cp, idx) => {
            if (cp.flexible) return;
            const s = reach(idx);
            const validK = [];
            for (let k = 0; k <= cp.size; k++) validK[k] = cp.possK[k] && okRest(s, k);
            cp.cells.forEach((cell, ci) => {
                let canMine = false, canSafe = false;
                for (let k = 0; k <= cp.size; k++) {
                    if (!validK[k]) continue;
                    if (cp.mineAt[ci][k]) canMine = true;
                    if (cp.safeAt[ci][k]) canSafe = true;
                }
                if (!canMine && canSafe) safe.push(cell);
                else if (canMine && !canSafe) mines.push(cell);
            });
        });

        if (interior > 0) {
            const s = reach(-1);
            let minM = Infinity, maxM = -Infinity;
            for (let a = 0; a < s.length; a++) if (s[a]) {
                const m = R - a;
                if (m >= 0 && m <= interior) { minM = Math.min(minM, m); maxM = Math.max(maxM, m); }
            }
            if (maxM === 0 || minM === interior) {
                for (let i = 0; i < state.length; i++) {
                    if (state[i] === -1 && !frontierSet.has(i)) (maxM === 0 ? safe : mines).push(i);
                }
            }
        }
        return { safe, mines, level: 3 };
    }

    function solveComponent(consList) {
        const cellSet = new Set();
        consList.forEach(c => c.cells.forEach(x => cellSet.add(x)));
        const cells = [...cellSet];
        const size = cells.length;
        const index = new Map(cells.map((c, i) => [c, i]));
        const flexible = () => ({ cells, size, flexible: true, possK: new Array(size + 1).fill(true) });
        if (size > 40) return flexible();

        // Ordonner les cases pour que les contraintes se ferment vite
        const order = [];
        const placed = new Set();
        const queue = [consList[0]];
        const usedCons = new Set();
        while (order.length < size) {
            let c = queue.shift();
            if (!c) c = consList.find(x => !usedCons.has(x));
            if (usedCons.has(c)) continue;
            usedCons.add(c);
            for (const x of c.cells) if (!placed.has(x)) {
                placed.add(x); order.push(index.get(x));
                consList.forEach(o => { if (!usedCons.has(o) && o.cells.includes(x)) queue.push(o); });
            }
        }
        const pos = new Array(size);
        order.forEach((ci, p) => (pos[ci] = p));
        const C = consList.map(c => ({ idx: c.cells.map(x => index.get(x)), count: c.count, last: Math.max(...c.cells.map(x => pos[index.get(x)])) }));
        const consOfCell = Array.from({ length: size }, () => []);
        C.forEach((c, k) => c.idx.forEach(ci => consOfCell[ci].push(k)));
        const assigned = new Int8Array(size).fill(-1);
        const sum = new Int32Array(C.length), left = Int32Array.from(C.map(c => c.idx.length));

        const possK = new Array(size + 1).fill(false);
        const mineAt = Array.from({ length: size }, () => new Array(size + 1).fill(false));
        const safeAt = Array.from({ length: size }, () => new Array(size + 1).fill(false));
        let nodes = 0, aborted = false;

        function rec(p, mineCount) {
            if (aborted) return;
            if (++nodes > 300000) { aborted = true; return; }
            if (p === size) {
                possK[mineCount] = true;
                for (let i = 0; i < size; i++) (assigned[i] ? mineAt : safeAt)[i][mineCount] = true;
                return;
            }
            const ci = order[p];
            for (let v = 0; v <= 1; v++) {
                let ok = true;
                for (const k of consOfCell[ci]) {
                    sum[k] += v; left[k]--;
                    if (sum[k] > C[k].count || sum[k] + left[k] < C[k].count) ok = false;
                }
                assigned[ci] = v;
                if (ok) rec(p + 1, mineCount + v);
                for (const k of consOfCell[ci]) { sum[k] -= v; left[k]++; }
                assigned[ci] = -1;
            }
        }
        rec(0, 0);
        if (aborted) return flexible();
        return { cells, size, possK, mineAt, safeAt };
    }

    // Révèle une case (avec propagation des zéros) dans un état de solveur
    function revealInto(rows, cols, state, adj, mines, start) {
        const nb = getNeighbors(rows, cols);
        const stack = [start];
        let count = 0;
        while (stack.length) {
            const i = stack.pop();
            if (state[i] >= 0 || mines[i]) continue;
            state[i] = adj[i]; count++;
            if (adj[i] === 0) for (const j of nb[i]) if (state[j] === -1) stack.push(j);
        }
        return count;
    }

    // Vérifie qu'une grille est entièrement résoluble sans deviner.
    // Retourne { solvable, steps, maxLevel, levelCounts, stuckState }
    function checkNoGuess(rows, cols, mines, startCells, preRevealed) {
        const n = rows * cols;
        const adj = computeAdjacent(rows, cols, mines);
        const state = new Int8Array(n).fill(-1);
        let total = 0;
        for (let i = 0; i < n; i++) if (mines[i]) total++;
        const safeTotal = n - total;
        let revealed = 0;
        (preRevealed || []).forEach(i => { if (state[i] < 0) { state[i] = adj[i]; revealed++; } });
        startCells.forEach(i => { revealed += revealInto(rows, cols, state, adj, mines, i); });
        const levelCounts = [0, 0, 0, 0];
        let steps = 0, maxLevel = 0;
        while (revealed < safeTotal) {
            const res = deduce(rows, cols, state, total);
            if (!res.safe.length && !res.mines.length) {
                return { solvable: false, steps, maxLevel, levelCounts, stuckState: state, adj };
            }
            steps++;
            levelCounts[res.level]++;
            maxLevel = Math.max(maxLevel, res.level);
            res.mines.forEach(i => { state[i] = -2; });
            res.safe.forEach(i => { revealed += revealInto(rows, cols, state, adj, mines, i); });
        }
        return { solvable: true, steps, maxLevel, levelCounts, adj };
    }

    // Indice : à partir de la vue du joueur, trouve une case sûre ou une mine certaine
    function findHint(rows, cols, view, totalMines, flags) {
        const state = Int8Array.from(view);
        let firstMine = null;
        for (let guard = 0; guard < 60; guard++) {
            const res = deduce(rows, cols, state, totalMines);
            if (res.safe.length) {
                if (firstMine !== null && guard > 0) return { type: 'mine', cell: firstMine };
                return { type: 'safe', cell: res.safe[0], level: res.level };
            }
            if (!res.mines.length) break;
            for (const m of res.mines) {
                if (firstMine === null && !(flags && flags[m])) firstMine = m;
                state[m] = -2;
            }
        }
        return firstMine !== null ? { type: 'mine', cell: firstMine } : null;
    }

    const api = { getNeighbors, computeAdjacent, deduce, checkNoGuess, findHint, revealInto };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Solver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
