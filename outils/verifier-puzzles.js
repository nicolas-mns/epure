// Vérifie que chaque puzzle est 100 % déductible :  node outils/verifier-puzzles.js
const Solver = require('../jeux/demineur/solver.js');
const { PUZZLES, parsePuzzle } = require('../jeux/demineur/puzzles.js');

let bad = 0;
for (const p of PUZZLES) {
    const lens = new Set(p.grid.map(l => l.length));
    const d = parsePuzzle(p);
    const res = Solver.checkNoGuess(d.rows, d.cols, d.mines, d.starts);
    const tag = res.solvable ? 'OK ' : 'BLOQUÉ';
    const lv = res.levelCounts.slice(1).join('/');
    console.log(`${tag} #${p.id} ${p.title.padEnd(16)} ${d.rows}x${d.cols} mines=${d.mineCount} étapes=${res.steps} niveaux(1/2/3)=${lv}${lens.size > 1 ? '  ⚠ lignes inégales' : ''}`);
    if (!res.solvable || lens.size > 1) {
        bad++;
        if (!res.solvable) {
            for (let r = 0; r < d.rows; r++) {
                let s = '      ';
                for (let c = 0; c < d.cols; c++) {
                    const v = res.stuckState[r * d.cols + c];
                    s += v === -1 ? (d.mines[r * d.cols + c] ? 'x' : '#') : v === -2 ? '*' : String(v);
                }
                console.log(s);
            }
        }
    }
}
console.log(bad ? `\n${bad} puzzle(s) à corriger` : '\nTous les puzzles sont résolubles sans hasard ✔');
process.exit(bad ? 1 : 0);
