// Vérifie que chaque modèle de salle d'Élan et de Gravité est praticable :
// depuis chaque ouverture, on doit pouvoir atteindre toutes les autres ouvertures et le point « @ »
// (départ, sortie ou clé). Modèle de déplacement simplifié mais prudent (pics « ? » comptés comme présents).
// Usage : node outils/verifier-salles.js
const fs = require('fs'), path = require('path');
const load = (file, name) => { const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); const m = src.match(new RegExp('const ' + name + ' = (\\[[\\s\\S]*?\\n\\]);')); return eval(m[1]); };
const W = 24, H = 14;
const mirror = rows => rows.map(r => [...r].reverse().map(c => c === '>' ? '<' : c === '<' ? '>' : c).join(''));
function openings(rows) {
    const o = [];
    if ([9, 10, 11].every(y => rows[y][0] === '.')) o.push('L');
    if ([9, 10, 11].every(y => rows[y][23] === '.')) o.push('R');
    if ([10, 11, 12, 13].every(x => rows[0][x] === '.')) o.push('T');
    if ([10, 11, 12, 13].every(x => rows[13][x] === '.')) o.push('B');
    return o;
}
function check(rows, kind) {
    const at = (x, y) => x < 0 || x >= W ? '#' : y < 0 || y >= H ? '.' : rows[y][x];
    const solidCh = (c, sw) => '#D=><Jx'.includes(c) || (c === 'r' && sw === 0) || (c === 'b' && sw === 1);
    const solid = (x, y, sw) => solidCh(at(x, y), sw);
    const bad = (x, y) => '^?'.includes(at(x, y));
    const free = (x, y, sw) => !solid(x, y, sw) && !bad(x, y);
    const hasSwitch = rows.join('').includes('x');
    const goals = {}; openings(rows).forEach(o => { goals[o] = false; });
    let at0 = null; rows.forEach((r, y) => { const x = r.indexOf('@'); if (x >= 0) at0 = [x, y]; });
    const results = {};
    for (const entry of openings(rows)) {
        const seen = new Set(), reached = new Set(), q = [];
        const push = n => { const k = n.join(','); if (!seen.has(k)) { seen.add(k); q.push(n); } };
        // Points d'entrée
        const starts = [];
        for (const sw of [0]) {
            if (entry === 'L') starts.push(['st', 0, 11, sw, 1]);
            if (entry === 'R') starts.push(['st', 23, 11, sw, 1]);
            if (entry === 'T') for (let x = 10; x <= 13; x++) starts.push(['fall', x, 0, sw, 1]);
            if (entry === 'B') for (let x = 10; x <= 13; x++) starts.push(kind === 'jump' ? ['jump', x, 13, sw, 5] : ['fall', x, 13, sw, -1]);
        }
        starts.forEach(push);
        while (q.length) {
            const [t, x, y, sw, g] = q.shift();
            if (kind === 'jump') {
                const stand = (xx, yy) => free(xx, yy, sw) && free(xx, yy - 1, sw) && solid(xx, yy + 1, sw);
                const crouch = (xx, yy) => free(xx, yy, sw) && solid(xx, yy - 1, sw) && solid(xx, yy + 1, sw);
                const vine = (xx, yy) => at(xx, yy) === '|';
                const wallCell = (xx, yy) => free(xx, yy, sw) && free(xx, yy - 1, sw) && (solid(xx - 1, yy, sw) || solid(xx + 1, yy, sw)) && [1, 2, 3, 4, 5].some(d => solid(xx + d, yy, sw) && solid(xx - 1, yy, sw) || solid(xx - d, yy, sw) && solid(xx + 1, yy, sw));
                const fallFrom = (xx, yy) => { // tombe depuis (xx, yy) avec un peu de dérive
                    let y2 = yy; while (y2 < H && !solid(xx, y2 + 1, sw)) y2++;
                    if (y2 >= H) { if (xx >= 10 && xx <= 13) reached.add('B'); return; }
                    const drift = Math.min(3, Math.floor((y2 - yy) / 2) + 1);
                    for (let dx = -drift; dx <= drift; dx++) { let yy2 = yy; const x2 = xx + dx; if (!free(x2, yy, sw)) continue; while (yy2 < H && !solid(x2, yy2 + 1, sw)) { if (bad(x2, yy2)) { yy2 = -1; break; } yy2++; } if (yy2 >= 0 && yy2 < H && stand(x2, yy2)) push(['st', x2, yy2, sw, 1]); if (yy2 >= H && x2 >= 10 && x2 <= 13) reached.add('B'); }
                };
                const jumpFrom = (xx, yy, up, reachX) => {
                    if (yy - up <= 0 && xx >= 9 && xx <= 14) reached.add('T');
                    for (let y2 = Math.max(0, yy - up); y2 <= Math.min(H - 1, yy + 8); y2++) for (let x2 = xx - reachX; x2 <= xx + reachX; x2++) {
                        if (x2 < 0 || x2 >= W) continue;
                        if (y2 < yy && Math.abs(x2 - xx) > reachX - 1) continue;
                        if (stand(x2, y2) || crouch(x2, y2)) push(['st', x2, y2, sw, 1]);
                        if (vine(x2, y2)) push(['vine', x2, y2, sw, 1]);
                        if (wallCell(x2, y2)) push(['wall', x2, y2, sw, 1]);
                    }
                    for (let dx = -reachX; dx <= reachX; dx++) if (free(xx + dx, yy, sw)) fallFrom(xx + dx, yy);
                };
                if (t === 'fall') { if (free(x, y, sw)) fallFrom(x, y); continue; }
                if (t === 'jump') { jumpFrom(x, y, g, 3); continue; }
                if (at0 && x === at0[0] && (y === at0[1] || y - 1 === at0[1])) reached.add('@');
                if (x === 0 && y >= 9 && y <= 11) reached.add('L');
                if (x === 23 && y >= 9 && y <= 11) reached.add('R');
                if (t === 'vine') {
                    if (y <= 1 && x >= 10 && x <= 13) reached.add('T');
                    for (const dy of [-1, 1]) if (vine(x, y + dy)) push(['vine', x, y + dy, sw, 1]);
                    if (stand(x, y)) push(['st', x, y, sw, 1]);
                    jumpFrom(x, y, 3, 4); continue;
                }
                if (t === 'wall') {
                    if (y <= 2 && x >= 10 && x <= 13) reached.add('T');
                    for (let y2 = y - 3; y2 <= y + 3; y2++) for (let x2 = x - 5; x2 <= x + 5; x2++) if (wallCell(x2, y2)) push(['wall', x2, y2, sw, 1]);
                    jumpFrom(x, y, 3, 4); continue;
                }
                // Debout
                const under = at(x, y + 1);
                if (under === 'x') push(['st', x, y, 1 - sw, 1]);
                for (const dx of [-1, 1]) {
                    const x2 = x + dx;
                    if (stand(x2, y) || crouch(x2, y)) push(['st', x2, y, sw, 1]);
                    else if (free(x2, y, sw)) fallFrom(x2, y);
                    if (x2 < 0 || x2 >= W) { if (x2 < 0 && y >= 9) reached.add('L'); if (x2 >= W && y >= 9) reached.add('R'); }
                }
                if (vine(x, y) || vine(x, y - 1)) push(['vine', x, vine(x, y) ? y : y - 1, sw, 1]);
                if (!crouch(x, y)) {
                    if (under === '>') jumpFrom(x + 6, y, 3, 7);
                    if (under === '<') jumpFrom(x - 6, y, 3, 7);
                    jumpFrom(x, y, under === 'J' ? 8 : 3, under === 'J' ? 5 : 4);
                }
            } else {
                // Gravité : (x, y, g) ; g = 1 debout au sol, g = -1 au plafond
                const okNode = (xx, yy, gg) => free(xx, yy, sw) && free(xx, yy - gg, sw) && solid(xx, yy + gg, sw);
                const fall = (xx, yy, gg) => { // chute dans le sens gg depuis (xx, yy)
                    let y2 = yy; let dist = 0;
                    while (true) { if (solid(xx, y2, sw) && dist > 0) return; if (y2 + gg < 0) { if (xx >= 10 && xx <= 13) reached.add('T'); return; } if (y2 + gg >= H) { if (xx >= 10 && xx <= 13) reached.add('B'); return; } if (solid(xx, y2 + gg, sw)) break; y2 += gg; dist++; }
                    const drift = Math.min(4, Math.floor(dist * .35));
                    for (let dx = -drift; dx <= drift; dx++) {
                        const x2 = xx + dx; let yy2 = yy, ok = true;
                        if (!free(x2, yy, sw)) continue;
                        while (true) { if (bad(x2, yy2)) { ok = false; break; } if (yy2 + gg < 0 || yy2 + gg >= H) { ok = false; if (x2 >= 10 && x2 <= 13) reached.add(gg < 0 ? 'T' : 'B'); break; } if (solid(x2, yy2 + gg, sw)) break; yy2 += gg; }
                        if (ok && okNode(x2, yy2, gg)) push(['st', x2, yy2, sw, gg]);
                    }
                };
                if (t === 'fall') { fall(x, y, g); continue; }
                if (at0 && x === at0[0] && Math.abs(y - at0[1]) <= 1) reached.add('@');
                if (x === 0 && y >= 9 && y <= 11) reached.add('L');
                if (x === 23 && y >= 9 && y <= 11) reached.add('R');
                if (at(x, y + g) === 'x') push(['st', x, y, 1 - sw, g]);
                for (const dx of [-1, 1]) {
                    const x2 = x + dx;
                    if (x2 < 0) { if (y >= 9) reached.add('L'); continue; }
                    if (x2 >= W) { if (y >= 9) reached.add('R'); continue; }
                    if (okNode(x2, y, g)) push(['st', x2, y, sw, g]);
                    else if (free(x2, y, sw) && free(x2, y - g, sw)) fall(x2, y, g);
                }
                // Bascule : le corps pivote, puis chute dans l'autre sens
                fall(x, y - g, -g);
            }
        }
        results[entry] = reached;
    }
    const problems = [];
    for (const [entry, reached] of Object.entries(results)) {
        for (const o of openings(rows)) if (o !== entry && !reached.has(o)) problems.push(`${entry}→${o}`);
        if (at0 && !reached.has('@')) problems.push(`${entry}→@`);
    }
    if (kind === 'flip' && openings(rows).includes('T') && openings(rows).includes('B')) problems.push('haut ET bas ouverts');
    return problems;
}
let total = 0, fails = 0;
for (const [file, name, kind] of [['jeux/elan/game.js', 'ELAN_ROOMS', 'jump'], ['jeux/gravite/game.js', 'GRAV_ROOMS', 'flip']]) {
    for (const t of load(file, name)) for (const mir of [false, true]) {
        const rows = mir ? mirror(t.rows) : t.rows;
        total++;
        const lens = rows.map(r => r.length);
        if (rows.length !== H || lens.some(l => l !== W)) { fails++; console.log(`✗ ${name} « ${t.name} »${mir ? ' (miroir)' : ''} : taille ${rows.length} lignes, longueurs ${lens.join(',')}`); continue; }
        const p = check(rows, kind);
        if (p.length) { fails++; console.log(`✗ ${name} « ${t.name} »${mir ? ' (miroir)' : ''} [${openings(rows).join('')}] : ${p.join(', ')}`); }
    }
}
console.log(`${total - fails}/${total} salles praticables.`);
process.exitCode = fails ? 1 : 0;
