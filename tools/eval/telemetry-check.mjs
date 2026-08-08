/* ============================================================================
   telemetry-check.mjs — O CLIENTE CHAMA AS 4 ROTAS NOVAS + O HOOK DE ARMA EXISTE.
   ----------------------------------------------------------------------------
   POR QUE EXISTE (lei 3 da casa: régua que não morde não existe)
     A telemetria nova (feat/telemetria) só vale se o cliente de fato disparar os
     sendBeacon pros 4 endpoints e se o game.js contar abate por arma. Tudo isso é
     código que falha em SILÊNCIO: remover um `_funnel('match_start')` ou apagar a
     rota não dá erro de sintaxe nem de runtime — o dado simplesmente para de
     chegar e ninguém percebe. Este portão é o que transforma "esquecer" em vermelho.

   O QUE EXIGE (lê o fonte de produção, sem subir o jogo):
     · TL1  main.js dispara sendBeacon para os 4 endpoints novos:
             /api/match · /api/funnel · /api/perf · /api/acquisition
     · TL2  o funil está wired nos pontos que importam:
             land (carga) · match_start (startGame) · match_end (recordMatchStats) · quit
     · TL3  game.js tem o hook de abate por arma (`_wperf[weap]` incrementado no _kill)
     · TL4  as 4 rotas existem em src/pages/api/

   MUTAÇÃO (prova que morde):
     --mutante=sem-match    remove o endpoint /api/match do main.js in-memory → TL1 vermelha
     --mutante=sem-funil    remove _funnel('match_start') → TL2 vermelha
     --mutante=sem-arma     remove o hook _wperf do game.js → TL3 vermelha

   Uso: node tools/eval/telemetry-check.mjs [--mutante=sem-match|sem-funil|sem-arma]
   ============================================================================ */
import { readFileSync, existsSync } from 'node:fs';

const MUT = (process.argv.find((a) => a.startsWith('--mutante=')) || '').split('=')[1] || '';
const read = (p) => readFileSync(p, 'utf8');

let main = read('public/js/main.js');
let game = read('public/js/game.js');

/* MUTAÇÃO in-memory: simula o defeito sem tocar no disco (o contrário seria o
 * portão verde com a mutação colada, que é exatamente o que a lei 3 reprova). */
if (MUT === 'sem-match')  main = main.replaceAll("'/api/match'", "'/api/REMOVIDO'");
if (MUT === 'sem-funil')  main = main.replaceAll("_funnel('match_start')", "/* removido */");
if (MUT === 'sem-arma')   game = game.replaceAll('this._wperf[weap]', '/* removido */');

const falhas = [];

// TL1 — os 4 endpoints novos são chamados pelo cliente.
const endpoints = ['/api/match', '/api/funnel', '/api/perf', '/api/acquisition'];
const faltam = endpoints.filter((e) => !main.includes(e));
if (faltam.length) falhas.push(`TL1 main.js NÃO chama: ${faltam.join(', ')}`);

// TL2 — funil wired nos 4 pontos de decisão (sem um, a conversão mente).
const funil = { land: "_funnel('land')", 'match_start': "_funnel('match_start')", 'match_end': "_funnel('match_end')", quit: "_funnel('quit')" };
const funilFalta = Object.entries(funil).filter(([, s]) => !main.includes(s)).map(([k]) => k);
if (funilFalta.length) falhas.push(`TL2 funil sem passo(s): ${funilFalta.join(', ')}`);

// TL3 — hook de abate por arma no _kill (sem ele, weapon_kills vem sempre vazio).
if (!game.includes('this._wperf[weap]')) falhas.push('TL3 game.js sem hook _wperf no _kill (weapon_kills nunca seria preenchido)');

// TL4 — as 4 rotas existem (sem rota, o sendBeacon vai pro vazio e o dado some).
const rotas = ['match', 'funnel', 'perf', 'acquisition'].map((r) => `src/pages/api/${r}.ts`);
const rotasFaltam = rotas.filter((r) => !existsSync(r));
if (rotasFaltam.length) falhas.push(`TL4 rota(s) ausente(s): ${rotasFaltam.join(', ')}`);

for (const f of falhas) console.log(`  \x1b[31m✗\x1b[0m ${f}`);
if (!falhas.length) console.log('  \x1b[32m✓\x1b[0m TL1 endpoints no cliente · TL2 funil wired · TL3 hook de arma · TL4 rotas existem');

// prova que a mutação morde: se veio --mutante e NÃO acendeu, o portão é cego.
if (MUT && !falhas.length) {
  console.log(`  \x1b[31m✗\x1b[0m MUTAÇÃO '${MUT}' não acendeu nenhuma cláusula — portão cego (lei 3)`);
  falhas.push('mutacao-cega');
}
console.log(falhas.length ? `\x1b[31mTELEMETRY ${falhas.length} VERMELHA(S)\x1b[0m${MUT ? ` (mutante=${MUT})` : ''}` : '\x1b[32mTELEMETRY verde\x1b[0m');
if (falhas.length) process.exitCode = 1;
