#!/usr/bin/env node
/* =====================================================================
   FABRIQUE « universal-quiz.json » : le moteur prêt à installer,
   lu par l'installateur en ligne (en-ligne/Code.gs) dans la Release GitHub.
   Format : { version, fichiers: [{ name, type, source }] } — le format
   attendu par l'API Apps Script (projects.updateContent).
   Usage :  TAG=v1.6 node outils/fabriquer-charge.mjs   → dist/universal-quiz.json
   ===================================================================== */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(RACINE, 'build');
const SORTIE = join(RACINE, 'dist', 'universal-quiz.json');

const env = { ...process.env };
delete env.UQ_PRENOM;                 // le prénom est ajouté par l'installateur, chez chaque famille
if (spawnSync(process.execPath, [join(RACINE, 'construire.mjs')], { stdio: 'inherit', env }).status !== 0) process.exit(1);

const lister = d => readdirSync(d).flatMap(n => statSync(join(d, n)).isDirectory() ? lister(join(d, n)) : [join(d, n)]);
const TYPES = { '.gs': 'SERVER_JS', '.js': 'SERVER_JS', '.html': 'HTML', '.json': 'JSON' };

const fichiers = lister(BUILD).filter(p => !p.endsWith('.clasp.json')).map(p => {
  const rel = relative(BUILD, p).split('\\').join('/');
  const ext = rel.slice(rel.lastIndexOf('.'));
  if (!TYPES[ext]) { console.error('❌ type de fichier inconnu : ' + rel); process.exit(1); }
  return { name: rel.slice(0, -ext.length), type: TYPES[ext], source: readFileSync(p, 'utf8') };
});
if (!fichiers.some(f => f.name === 'appsscript') || !fichiers.some(f => f.name === 'Code')) { console.error('❌ Code.gs ou appsscript.json manquant'); process.exit(1); }
if (!/prenom: '[^'\n]*',/.test(fichiers.find(f => f.name === 'Code').source)) { console.error('❌ réglage « prenom » introuvable dans Code.gs'); process.exit(1); }

const version = process.env.TAG || process.env.GITHUB_REF_NAME || 'dev';
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify({ version, fichiers }));
console.log(`✅ ${relative(RACINE, SORTIE)} : ${fichiers.length} fichiers, version ${version}`);
