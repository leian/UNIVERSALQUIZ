#!/usr/bin/env node
/* =====================================================================
   INSTALLATION / MISE À JOUR DE UNIVERSAL QUIZ SUR GOOGLE APPS SCRIPT
   ---------------------------------------------------------------------
   Prérequis : Node.js 18 ou plus (https://nodejs.org)
   Usage (depuis la racine du dépôt) :   node installer.mjs [--prenom "Tom"]
   - 1re fois : connexion Google, création du projet, déploiement
   - fois suivantes : envoie la nouvelle version du moteur, même adresse web
   Fonctionne sous Windows, macOS et Linux.
   ===================================================================== */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const VERSION_CLASP = '2.4.2';
const OUTILS = join(ICI, '.outils');                 // clasp est installé ici, à côté du projet
const FICHIER_DEPLOIEMENT = join(ICI, '.deploiement-id');
const WINDOWS = !!process.env.UQ_DEPUIS_WINDOWS;     // lancé par Installer-Universal-Quiz.cmd

const titre = t => { if (!WINDOWS) console.log('\n\x1b[1m' + t + '\x1b[0m'); };
const stop = m => { console.error('\n' + (WINDOWS ? '' : '❌ ') + m + '\n'); process.exit(1); };

/* npm et clasp sont lancés directement avec node (process.execPath),
   sans passer par npx ni par le PATH : c'est ce qui marche partout,
   y compris avec le Node portable de l'installateur Windows. */
function npmCli() {
  const base = dirname(process.execPath);
  const candidats = [
    join(base, 'node_modules', 'npm', 'bin', 'npm-cli.js'),              // Windows
    join(base, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')  // macOS / Linux
  ];
  return candidats.find(existsSync);
}
function claspJs() {
  const pkg = join(OUTILS, 'node_modules', '@google', 'clasp', 'package.json');
  if (!existsSync(pkg)) return null;
  const p = JSON.parse(readFileSync(pkg, 'utf8'));
  if (p.version !== VERSION_CLASP) return null;
  const bin = typeof p.bin === 'string' ? p.bin : p.bin.clasp;
  return join(dirname(pkg), bin);
}
function installerClasp() {
  if (claspJs()) return;
  if (!WINDOWS) console.log('Installation de l\'outil clasp (une seule fois)…');
  const npm = npmCli();
  if (!npm) stop("npm est introuvable à côté de Node.js : réinstalle Node.js depuis https://nodejs.org.");
  mkdirSync(OUTILS, { recursive: true });
  const r = spawnSync(process.execPath, [npm, 'install', '--prefix', OUTILS, '--no-save', '--no-audit', '--no-fund', '--loglevel=error', `@google/clasp@${VERSION_CLASP}`], { stdio: 'inherit' });
  if (r.status !== 0 || !claspJs()) stop("Impossible d'installer l'outil clasp. Vérifie ta connexion Internet, puis relance.");
}
function clasp(args, { capturer = false } = {}) {
  const r = spawnSync(process.execPath, [claspJs(), ...args], {
    cwd: ICI, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' },
    stdio: capturer ? ['inherit', 'pipe', 'pipe'] : 'inherit'
  });
  if (r.error) stop("clasp n'a pas pu démarrer : " + r.error.message);
  if (capturer) { process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); }
  return r;
}
// option --prenom "Tom" : prénom de l'enfant, écrit dans les réglages de Code.gs
const iPrenom = process.argv.indexOf('--prenom');
const PRENOM = iPrenom > 0 ? String(process.argv[iPrenom + 1] || '').trim() : '';

function construire() {
  const env = PRENOM ? { ...process.env, UQ_PRENOM: PRENOM } : process.env;
  const r = spawnSync(process.execPath, [join(ICI, 'construire.mjs')], { stdio: 'inherit', env });
  if (r.status !== 0) stop('La construction du projet a échoué.');
}

const [maj] = process.versions.node.split('.').map(Number);
if (maj < 18) stop(`Node.js ${process.versions.node} est trop ancien : installe la version 18 ou plus (https://nodejs.org).`);

if (!WINDOWS) console.log('🧩 Universal Quiz — installation sur Google Apps Script');
installerClasp();
if (process.argv.includes('--verifier')) {      // diagnostic : clasp est-il prêt ?
  const r = clasp(['--version'], { capturer: true });
  process.exit(r.status || 0);
}

// 1. connexion au compte Google
if (!existsSync(join(homedir(), '.clasprc.json'))) {
  titre('1/4  Connexion à ton compte Google');
  if (!WINDOWS) console.log(`Avant de continuer, active l'« API Google Apps Script » (une seule fois) :
   → https://script.google.com/home/usersettings  (bouton sur « Activé »)
Une page de connexion Google va ensuite s'ouvrir dans ton navigateur.`);
  if (clasp(['login']).status !== 0) stop('Connexion Google interrompue.');
} else {
  titre('1/4  Compte Google : déjà connecté ✓');
}

// 2. création du projet Apps Script (une seule fois)
// clasp create (avec --rootDir build) écrit .clasp.json DANS build/, que construire.mjs efface :
// on le range à la racine, avec rootDir « build » (chemin relatif au dossier courant de clasp).
const CLASP_JSON = join(ICI, '.clasp.json');
function rangerClaspJson() {
  const dansBuild = join(ICI, 'build', '.clasp.json');
  if (existsSync(CLASP_JSON) || !existsSync(dansBuild)) return;
  const conf = JSON.parse(readFileSync(dansBuild, 'utf8'));
  if (!conf.scriptId) return;
  writeFileSync(CLASP_JSON, JSON.stringify({ scriptId: conf.scriptId, rootDir: 'build' }, null, 2) + '\n');
}
rangerClaspJson();          // reprend un projet déjà créé lors d'une tentative interrompue
construire();
if (!existsSync(CLASP_JSON)) {
  titre('2/4  Création du projet « Universal Quiz » dans ton compte');
  const r = clasp(['create', '--type', 'webapp', '--title', 'Universal Quiz', '--rootDir', 'build'], { capturer: true });
  rangerClaspJson();
  if (!existsSync(CLASP_JSON)) {
    stop(/Apps Script API/i.test((r.stdout || '') + (r.stderr || ''))
      ? "L'API Apps Script n'est pas activée : https://script.google.com/home/usersettings puis relance ce script."
      : 'Création du projet impossible (voir le message ci-dessus).');
  }
  construire();     // remet notre appsscript.json et nettoie build/
} else {
  titre('2/4  Projet Apps Script : déjà créé ✓');
}

// 3. envoi des fichiers
titre('3/4  Envoi du moteur sur Google');
const envoi = clasp(['push', '--force'], { capturer: true });
if (envoi.status !== 0) {
  stop(/Apps Script API/i.test((envoi.stdout || '') + (envoi.stderr || ''))
    ? "L'API Apps Script n'est pas activée : https://script.google.com/home/usersettings puis relance ce script."
    : "L'envoi a échoué (voir le message ci-dessus).");
}

// 4. déploiement en application web (même adresse à chaque mise à jour)
titre('4/4  Publication du site');
const ancien = existsSync(FICHIER_DEPLOIEMENT) ? readFileSync(FICHIER_DEPLOIEMENT, 'utf8').trim() : '';
const description = (ancien ? 'Mise à jour ' : 'Première version ') + new Date().toLocaleString('fr-FR');
const dep = clasp(ancien ? ['deploy', '--deploymentId', ancien, '--description', description] : ['deploy', '--description', description], { capturer: true });
const id = ((dep.stdout || '').match(/- (AKfy[\w-]+) @/) || [])[1] || ancien;
if (dep.status !== 0 || !id) stop('Le déploiement a échoué (voir le message ci-dessus).');
writeFileSync(FICHIER_DEPLOIEMENT, id + '\n');

const url = `https://script.google.com/macros/s/${id}/exec`;
if (process.env.UQ_DEPUIS_WINDOWS) { console.log('\n✅ Site en ligne : ' + url); process.exit(0); }
console.log(`
✅ C'est en ligne !

🌐 Adresse du site :
   ${url}

${ancien ? 'Mise à jour terminée : l\'adresse ne change pas.' : `Dernière étape (une seule fois) :
   1. Ouvre cette adresse dans ton navigateur, connecté avec le MÊME compte Google.
   2. Google demande des autorisations : « Examiner les autorisations » → choisis ton compte.
      S'il affiche « Google n'a pas validé cette application » :
      « Paramètres avancés » → « Accéder à Universal Quiz (non sécurisé) » → « Autoriser ».
      (C'est normal : c'est ton propre script, personne d'autre n'y a accès.)
   3. La page « Mes quiz » s'affiche avec un quiz d'exemple. Dans ton Google Drive,
      le dossier « Universal Quiz » et le Google Sheets des résultats ont été créés.
   4. Dépose tes quiz (.html) et tes contrôles (.pdf) dans ce dossier : ils apparaissent
      dans la liste en moins d'une minute.`}

Pour ouvrir le projet dans l'éditeur Google : node .outils/node_modules/@google/clasp/build/src/index.js open
`);
