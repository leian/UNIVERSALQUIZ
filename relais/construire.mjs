// Assemble le relais : relais/dist/worker.js = coque-debut.js + build/Code.gs + pages lib + coque-fin.js
// Usage : node construire.mjs (fabrique build/) puis node relais/construire.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url)), RACINE = join(ICI, '..'), BUILD = join(RACINE, 'build');
if (!existsSync(join(BUILD, 'Code.gs'))) throw new Error('build/Code.gs absent : lance d\'abord node construire.mjs');
const code = readFileSync(join(BUILD, 'Code.gs'), 'utf8');
const lib = {};
for (const f of readdirSync(join(BUILD, 'lib'))) if (f.endsWith('.html')) lib[f.slice(0, -5)] = readFileSync(join(BUILD, 'lib', f), 'utf8');
// les actions des parents sont appelées par leur nom (globalThis[nom]) : on les y expose
const apis = [...new Set([...code.matchAll(/^function (api[A-Z]\w*)\s*\(/gm)].map(m => m[1]))];
const sortie = [
  readFileSync(join(ICI, 'coque-debut.js'), 'utf8'),
  'LIB_FICHIERS_ = ' + JSON.stringify(lib) + ';',
  '/* ===================== build/Code.gs (inchangé) ===================== */',
  code,
  '/* ===================== fin de Code.gs ===================== */',
  apis.map(n => 'globalThis.' + n + ' = ' + n + ';').join('\n'),
  readFileSync(join(ICI, 'coque-fin.js'), 'utf8')
].join('\n');
mkdirSync(join(ICI, 'dist'), { recursive: true });
writeFileSync(join(ICI, 'dist', 'worker.js'), sortie);
console.log('relais/dist/worker.js : ' + Math.round(sortie.length / 1024) + ' Ko, ' + apis.length + ' actions');
