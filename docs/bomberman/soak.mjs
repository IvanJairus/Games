import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('docs/bomberman/style-preview.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'file://' + process.cwd() + '/docs/bomberman/style-preview.html'
});
const w = dom.window;
await new Promise(r => setTimeout(r, 300));

const E = s => w.eval(s);
E('window.__boom = 0; const _ex = explode; explode = function(b){ window.__boom++; return _ex(b); };');

const soft = () => E('G.grid.flat().filter(c => c === "soft").length');
const N = 12, TICKS = 900;
let booms = 0, botDied = 0, neverBombed = 0, dug = 0, survived = 0;
const rows = [];

for (let r = 0; r < N; r++) {
  E('newGame(); window.__boom = 0;');
  const s0 = soft();
  E(`for (let i = 0; i < ${TICKS}; i++) tick(1/60)`);
  const b = E('window.__boom');
  const over = E('String(G.over)');
  booms += b;
  dug += s0 - soft();
  if (over === 'win') botDied++;
  if (over === 'null') survived++;
  if (b === 0) neverBombed++;
  rows.push(`booms=${b} dug=${s0 - soft()} over=${over}`);
}

console.log(JSON.stringify({ runs: N, secondsEach: TICKS / 60, totalBooms: booms, botSuicides: botDied, neverBombed, runsBotSurvivedAll: survived, softDug: dug, rows }, null, 1));

// Pemain manusia: keluar dari sudut, tanam bom, lari 4 petak. Harus selamat.
E('newGame()');
E('for (let x = 1; x <= 9; x++) G.grid[1][x] = "empty"');
E('G.players[0].x = 4; G.players[0].y = 1; G.players[0].ax = 4; G.players[0].ay = 1; G.players[0].mv = null');
E('place(G.players[0])');
const bombCell = E('G.bombs[0].x + "," + G.bombs[0].y');
E('for (let i = 0; i < 200; i++) { if (!G.players[0].mv) tryMove(G.players[0], 1, 0); tick(1/60); }');
console.log(JSON.stringify({ label: 'pemain lari 4 petak', bombCell, pos: E('G.players[0].x + "," + G.players[0].y'), alive: E('G.players[0].alive'), over: E('String(G.over)') }));

// Pemain diam di atas bom sendiri di pokor sempit: harus mati (aturan klasik).
E('newGame()');
E('place(G.players[0])');
E('for (let i = 0; i < 200; i++) tick(1/60)');
console.log(JSON.stringify({ label: 'pemain diam di atas bom', alive: E('G.players[0].alive'), over: E('String(G.over)') }));

// Rantai ledakan di jalur bersih: satu pemicu harus menyalakan dua bom berikutnya.
E('newGame()');
E('for (let x = 1; x <= 9; x++) G.grid[1][x] = "empty"');
E('G.bombs = [{id:901,x:3,y:1,t:0.02,range:2,owner:G.players[0]},{id:902,x:5,y:1,t:9,range:2,owner:G.players[0]},{id:903,x:7,y:1,t:9,range:2,owner:G.players[0]}]');
E('window.__boom = 0; G.players[1].x = 1; G.players[1].y = 7; G.players[0].x = 1; G.players[0].y = 7;');
E('for (let i = 0; i < 40; i++) tick(1/60)');
console.log(JSON.stringify({ label: 'rantai 3 bom di jalur bersih', explosionsFromOneTrigger: E('window.__boom'), bombsLeft: E('G.bombs.length'), flamesRightAfter: E('G.flames.length') }));

w.close();
