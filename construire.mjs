#!/usr/bin/env node
/* =====================================================================
   CONSTRUCTION DU PROJET APPS SCRIPT
   Prend le moteur (moteur/commun/, moteur/index.html, tableau-de-bord.html,
   controles.html) et fabrique le dossier build/, d'où outils/fabriquer-charge.mjs
   tire universal-quiz.json (lu par l'installateur en ligne).
   Usage : node construire.mjs
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const MOTEUR = join(ICI, 'moteur');
const SRC = join(ICI, 'src');
const BUILD = join(ICI, 'build');

const lire = p => readFileSync(p, 'utf8');
const erreur = m => { console.error('❌ ' + m); process.exit(1); };

function remplacer(texte, motif, par, nomFichier, attendu = true) {
  const avant = texte;
  const apres = texte.replace(motif, par);
  if (attendu && apres === avant) erreur(`${nomFichier} : motif introuvable (${motif}). Le moteur a changé, adapte construire.mjs.`);
  return apres;
}

// les fichiers commun/ sont insérés dans des balises <script> : ils ne doivent pas contenir « </script »
function verifierInline(texte, nom) {
  if (/<\/script/i.test(texte)) erreur(`${nom} contient « </script » : impossible de l'insérer tel quel dans une page.`);
  return texte;
}

// Apps Script n'accepte que du HTML valide dans un fichier .html : on entoure le JS et le CSS de leurs balises
const entourer = (texte, nom) => nom.endsWith('.css') ? `<style>\n${texte}\n</style>` : `<script>\n${texte}\n</script>`;

const CHEMIN = '(window.__UQ ? window.__UQ.chemin : location.pathname)';

const COMMUN = {
  'moteur-quiz.css': ['moteur-quiz-css', t => t],
  'suivi.js':        ['suivi-js', t => remplacer(t, /location\.pathname/g, CHEMIN, 'suivi.js')],
  'recompenses.js':  ['recompenses-js', t => t],
  'moteur-quiz.js':  ['moteur-quiz-js', t => t],
  'badges.js':       ['badges-js', t => remplacer(t, /location\.pathname/g, CHEMIN, 'badges.js')]
};

const PAGES = {
  'index.html': ['page-index', t => t],
  'controles.html': ['page-controles', t => t],
  'tableau-de-bord.html': ['page-tableau-de-bord', t => t]
};

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(join(BUILD, 'lib'), { recursive: true });

// 1. sources propres à Apps Script
let code = lire(join(SRC, 'Code.gs'));
if (process.env.UQ_PRENOM) {      // prénom donné par l'installateur
  const p = process.env.UQ_PRENOM.trim().slice(0, 40).replace(/[\\'\r\n]/g, c => c === "'" ? "\\'" : '');
  code = remplacer(code, /prenom: '[^'\n]*',/, `prenom: '${p}',`, 'Code.gs');
}
writeFileSync(join(BUILD, 'Code.gs'), code);
writeFileSync(join(BUILD, 'appsscript.json'), lire(join(SRC, 'appsscript.json')));
writeFileSync(join(BUILD, 'lib', 'pont.html'), entourer(verifierInline(lire(join(SRC, 'pont.html')), 'pont.html'), 'pont.js'));
writeFileSync(join(BUILD, 'lib', 'exemple-quiz.html'), lire(join(SRC, 'exemple-quiz.html')));
// consignes pour l'IA : une seule source (src/consignes.txt), insérée dans la page « Ajouter » et publiée sur GitHub Pages
// sous un nom tiré de son contenu (docs/consignes/<id>.txt) : un site d'une ancienne version garde ses consignes
const consignes = lire(join(SRC, 'consignes.txt')).replace(/\r\n/g, '\n');
verifierInline(consignes, 'consignes.txt');
const idConsignes = createHash('sha1').update(consignes).digest('hex').slice(0, 10);
const publiees = join(ICI, 'docs', 'consignes', idConsignes + '.txt');
if (!existsSync(publiees) || lire(publiees) !== consignes) {
  mkdirSync(dirname(publiees), { recursive: true });
  writeFileSync(publiees, consignes);
  console.log('📝 Nouvelles consignes : docs/consignes/' + idConsignes + '.txt (à committer)');
}
let ajouter = lire(join(SRC, 'page-ajouter.html'));
ajouter = remplacer(ajouter, /'__CONSIGNES__'/, () => JSON.stringify(consignes), 'page-ajouter.html');
ajouter = remplacer(ajouter, /__CONSIGNES_ID__/, idConsignes, 'page-ajouter.html');
writeFileSync(join(BUILD, 'lib', 'page-ajouter.html'), ajouter);

// 2. moteur commun
for (const [f, [nom, patch]] of Object.entries(COMMUN)) {
  const p = join(MOTEUR, 'commun', f);
  if (!existsSync(p)) erreur(`fichier manquant : commun/${f}`);
  writeFileSync(join(BUILD, 'lib', nom + '.html'), entourer(verifierInline(patch(lire(p)), f), f));
}

// 3. pages d'accueil
for (const [f, [nom, patch]] of Object.entries(PAGES)) {
  const p = join(MOTEUR, f);
  if (!existsSync(p)) erreur(`fichier manquant : ${f}`);
  writeFileSync(join(BUILD, 'lib', nom + '.html'), patch(lire(p)));
}

// 4. avertit si un fichier commun/ n'est pas pris en charge
const connus = new Set([...Object.keys(COMMUN), 'catalogue.js']);
readdirSync(join(MOTEUR, 'commun'))
  .filter(f => /\.(js|css)$/.test(f) && !connus.has(f))
  .forEach(f => console.warn(`⚠️  commun/${f} n'est pas inclus dans la version Apps Script (ajoute-le dans construire.mjs et Code.gs si un quiz l'utilise).`));

console.log('✅ Projet construit dans ' + BUILD);
