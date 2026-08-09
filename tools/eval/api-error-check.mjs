import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const files = {
  leaderboard: read('src/pages/api/leaderboard.ts'),
  register: read('src/pages/api/register.ts'),
  submit: read('src/pages/api/submit-match.ts'),
  index: read('src/pages/index.astro'),
  client: read('public/js/main.js'),
};
const mutant = process.argv.find(arg => arg.startsWith('--mutante='))?.split('=')[1];

if (mutant === 'vazamento') {
  files.submit = files.submit.replace("message: 'não foi possível validar esta partida'", 'message');
}
if (mutant === 'cache') files.index = files.index.replace('v=${BUILD_ID}', 'v=${V}');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} nao encontrado`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} incompleto`);
}

const context = vm.createContext({});
const mapper = functionSource(files.submit, 'submitErrorPayload').replace('message: string', 'message');
vm.runInContext(`${mapper}; globalThis.map = submitErrorPayload`, context);
const cases = [
  ['token inválido: pg secret xyz', 'invalid_token'],
  ['aguarde antes de submeter outra partida: row 42', 'submit_cooldown'],
  ['limite diário: private detail', 'daily_limit_reached'],
  ['database password is hunter2', 'submit_rejected'],
];
for (const [raw, code] of cases) {
  const result = context.map(raw);
  if (result.error !== code || JSON.stringify(result).includes(raw)) throw new Error(`payload inseguro para ${code}`);
}

for (const [name, source] of Object.entries(files).filter(([name]) => ['leaderboard', 'register', 'submit'].includes(name))) {
  if (/JSON\.stringify\s*\(\s*\{\s*error:\s*error\.message/.test(source)) throw new Error(`${name} ainda expoe error.message`);
}
if (!files.register.includes("jsonError(409, 'register_conflict'")) throw new Error('register sem codigo publico fixo');
if (!files.leaderboard.includes("jsonError(500, 'leaderboard_unavailable'")) throw new Error('leaderboard sem codigo publico fixo');
if (!files.index.includes('const BUILD_ID = import.meta.env.VERCEL_GIT_COMMIT_SHA || V;')) throw new Error('build id nao usa o SHA do deploy');
if (!files.index.includes('v=${BUILD_ID}')) throw new Error('main.js continua com cache key compartilhada');
if (!files.client.includes("error === 'submit_cooldown'")) throw new Error('cliente nao reconhece cooldown sanitizado');

console.log('APIERR PASS: erros internos ficam no log e o cliente recebe codigos estaveis');
