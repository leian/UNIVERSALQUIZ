#!/usr/bin/env node
/* =====================================================================
   FABRIQUE « Installer-Universal-Quiz.cmd »
   Un seul fichier à donner aux amis : un double-clic sous Windows
   installe (ou met à jour) Universal Quiz dans leur compte Google.
   Il contient : un petit lanceur, le script outils/installeur-windows.ps1
   et tous les fichiers du projet (encodés en base64).
   Usage :  node outils/fabriquer-installeur.mjs   → dist/Installer-Universal-Quiz.cmd
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'dist', 'Installer-Universal-Quiz.cmd');

function lister(dossier) {
  return readdirSync(dossier).flatMap(n => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? lister(p) : [p];
  });
}
const fichiers = ['LICENSE.md', 'construire.mjs', 'installer.mjs'].map(f => join(RACINE, f))
  .concat(lister(join(RACINE, 'moteur')), lister(join(RACINE, 'src')));

const lanceur = [
  '@echo off',
  'setlocal',
  'title Installation de Universal Quiz',
  'set "UQ_SELF=%~f0"',
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:UQ_SELF,[Text.Encoding]::UTF8); $d=$t.IndexOf('#'+'PS-DEBUT#'); $f=$t.IndexOf('#'+'FICHIERS#'); Invoke-Expression $t.Substring($d, $f-$d)"`,
  'echo.',
  'pause',
  'exit /b',
  ''
];
const ps = readFileSync(join(RACINE, 'outils', 'installeur-windows.ps1'), 'utf8');
if (ps.includes('#PS-DEBUT#') || ps.includes('#FICHIERS#')) { console.error('❌ installeur-windows.ps1 ne doit pas contenir les marques littérales'); process.exit(1); }

const lignes = fichiers.map(p => `#F ${relative(RACINE, p).split('\\').join('/')} ${readFileSync(p).toString('base64')}`);
const contenu = [...lanceur, '#PS-DEBUT#', ps, '#FICHIERS#', ...lignes, ''].join('\n').replace(/\r?\n/g, '\r\n');

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, contenu);
console.log(`✅ ${relative(RACINE, SORTIE)} (${fichiers.length} fichiers, ${Math.round(contenu.length / 1024)} Ko)`);
