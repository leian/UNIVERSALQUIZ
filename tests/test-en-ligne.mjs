/* =====================================================================
   TEST DE L'INSTALLATEUR EN LIGNE (en-ligne/Code.gs), SANS GOOGLE
   Simule GitHub (universal-quiz.json) et l'API Apps Script, puis vérifie :
   installation, interrupteur API non activé, mise à jour (même adresse),
   projet supprimé par l'utilisateur, et que la page s'affiche sans erreur.
   Usage : node tests/test-en-ligne.mjs   (lancé aussi par tests/test.mjs)
   ===================================================================== */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
if (spawnSync(process.execPath, [join(RACINE, 'outils', 'fabriquer-charge.mjs')], { stdio: 'inherit', env: { ...process.env, TAG: 'v-test' } }).status !== 0) process.exit(1);
const CHARGE = readFileSync(join(RACINE, 'dist', 'universal-quiz.json'), 'utf8');

let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + '[en ligne] ' + m); if (!c) echecs++; };

// ---- faux Google ----
const userProps = {};
const projets = {};             // scriptId → { contenu, versions, deploiements: { id: version } }
let apiActivee = false, n = 0;
const journal = [];
const reponse = (code, corps) => ({ getResponseCode: () => code, getContentText: () => typeof corps === 'string' ? corps : JSON.stringify(corps) });

function fausseApi(url, o) {
  const methode = (o.method || 'get').toUpperCase();
  const corps = o.payload ? JSON.parse(o.payload) : null;
  journal.push(methode + ' ' + url.replace('https://script.googleapis.com/v1/projects', ''));
  if (!/^Bearer jeton/.test(o.headers && o.headers.Authorization)) return reponse(401, { error: { message: 'pas de jeton' } });
  if (!apiActivee) return reponse(403, { error: { code: 403, message: 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings then retry.' } });
  const m = url.match(/projects(?:\/([^/]+))?(?:\/(content|versions|deployments))?(?:\/([^/]+))?$/);
  const [, id, quoi, sous] = m;
  if (!id && methode === 'POST') { const sid = 'script' + (++n); projets[sid] = { titre: corps.title, versions: 0, deploiements: {} }; return reponse(200, { scriptId: sid }); }
  const p = projets[id];
  if (!p) return reponse(404, { error: { code: 404, message: 'Requested entity was not found.' } });
  if (!quoi && methode === 'GET') return reponse(200, { scriptId: id, title: p.titre });
  if (quoi === 'content' && methode === 'PUT') { p.contenu = corps.files; return reponse(200, { scriptId: id, files: corps.files }); }
  if (quoi === 'versions' && methode === 'POST') return reponse(200, { versionNumber: ++p.versions });
  const web = did => ({ deploymentId: did, entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://script.google.com/macros/s/' + did + '/exec' } }] });
  if (quoi === 'deployments' && methode === 'POST') { const did = 'AKfy' + (++n); p.deploiements[did] = corps.versionNumber; return reponse(200, web(did)); }
  if (quoi === 'deployments' && methode === 'DELETE') {
    if (!(sous in p.deploiements)) return reponse(404, { error: { code: 404, message: 'not found' } });
    delete p.deploiements[sous]; return reponse(200, {});
  }
  if (quoi === 'deployments' && methode === 'PUT') {
    if (!(sous in p.deploiements)) return reponse(404, { error: { code: 404, message: 'not found' } });
    p.deploiements[sous] = corps.deploymentConfig.versionNumber; return reponse(200, web(sous));
  }
  return reponse(400, { error: { message: 'requête inattendue ' + methode + ' ' + url } });
}

const ctx = {
  console: { log: console.log, warn: console.warn, error: () => {} },   // les erreurs attendues ne polluent pas la sortie
  UrlFetchApp: { fetch: (url, o = {}) => /github\.com/.test(url) ? reponse(200, CHARGE) : fausseApi(url, o) },
  ScriptApp: { getOAuthToken: () => 'jeton-de-test', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/INSTALLATEUR/exec' }) },
  PropertiesService: { getUserProperties: () => ({
    getProperty: k => userProps[k] ?? null, setProperty: (k, v) => { userProps[k] = String(v); },
    getProperties: () => ({ ...userProps }), setProperties: o => { for (const k in o) userProps[k] = String(o[k]); },
    deleteProperty: k => { delete userProps[k]; },
    deleteAllProperties: () => { for (const k in userProps) delete userProps[k]; }
  }) },
  LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  HtmlService: { createHtmlOutput: html => { const o = { html, setTitle: () => o, setFaviconUrl: () => o, addMetaTag: () => o }; return o; } }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(RACINE, 'en-ligne', 'Code.gs'), 'utf8'), ctx, { filename: 'en-ligne/Code.gs' });

// 1. état initial
let e = ctx.apiEtat();
ok(!e.installe && e.derniere === 'v-test', 'état initial : rien d\'installé, dernière version lue sur GitHub');

// 2. interrupteur non activé
let r = ctx.apiInstaller('Zoé');
ok(r.erreur === 'api' && !Object.keys(projets).length, 'API Apps Script non activée → message « active l\'interrupteur », rien de créé');

// 3. installation
apiActivee = true;
journal.length = 0;
r = ctx.apiInstaller("Zoé l'aînée");
const p1 = projets.script1;
const code = p1 && p1.contenu.find(f => f.name === 'Code');
ok(r.ok && /\/macros\/s\/AKfy\d+\/exec$/.test(r.url), 'installation : site créé (' + r.url + ')');
ok(journal.join(' | ') === 'POST  | PUT /script1/content | POST /script1/versions | POST /script1/deployments', 'installation : création → envoi → version → publication');
ok(code && /prenom: 'Zoé l’aînée',/.test(code.source), 'prénom écrit dans les réglages (apostrophe neutralisée)');
const charge = JSON.parse(CHARGE);
ok(p1.contenu.length === charge.fichiers.length && p1.contenu.some(f => f.name === 'lib/page-ajouter' && f.type === 'HTML') && p1.contenu.some(f => f.name === 'appsscript' && f.type === 'JSON'), 'tous les fichiers du moteur sont envoyés (' + p1.contenu.length + ')');
ok(JSON.parse(p1.contenu.find(f => f.name === 'appsscript').source).webapp.access === 'ANYONE_ANONYMOUS', 'le site de la famille reste ouvert sans compte pour l\'enfant');
ok(/version: 'v-test',/.test(code.source) && /installateur: 'https:\/\/script\.google\.com\/macros\/s\/INSTALLATEUR\/exec'/.test(code.source), 'version et adresse de l\'installateur écrites dans le site (bandeau « mise à jour »)');
const url1 = r.url;

// 4. mise à jour : même projet, même adresse
journal.length = 0;
r = ctx.apiMettreAJour();
ok(r.ok && r.maj && r.url === url1 && Object.keys(projets).length === 1, 'mise à jour : même adresse, pas de nouveau projet');
ok(/PUT \/script1\/deployments\/AKfy/.test(journal.join(' | ')) && p1.versions === 2, 'mise à jour : nouvelle version publiée sur le même déploiement');
ok(/prenom: 'Zoé l’aînée',/.test(p1.contenu.find(f => f.name === 'Code').source), 'mise à jour : le prénom est conservé');
e = ctx.apiEtat();
ok(e.installe && e.url === url1 && e.version === 'v-test', 'état après installation : site et version connus');

// 5. projet supprimé par la famille → réinstallation propre
delete projets.script1;
r = ctx.apiMettreAJour();
ok(r.ok && Object.keys(projets).length === 1 && !projets.script1 && r.url !== url1, 'projet supprimé → recréé automatiquement');

// 6. ?recommencer=1 : l'installateur oublie tout, l'ancien site reste en place
const avant = Object.keys(projets).length;
ctx.doGet({ parameter: { recommencer: '1' } });
e = ctx.apiEtat();
ok(!e.installe && Object.keys(projets).length === avant, '?recommencer=1 : retour à l\'écran d\'installation, ancien site intact');
r = ctx.apiInstaller('Test');
ok(r.ok && Object.keys(projets).length === avant + 1, 'après ?recommencer=1 : nouvelle installation complète');

// 6 bis. bouton « Repartir de zéro »
const sid = userProps.scriptId, did = userProps.deploymentId;
r = ctx.apiRecommencer();
ok(r.desactive && !(did in projets[sid].deploiements) && !ctx.apiEtat().installe, 'bouton « Repartir de zéro » : ancien site désactivé (déploiement supprimé), l\'installateur l\'oublie');

// 7. la page : HTML complet et script valide
const html = ctx.doGet({ parameter: {} }).html;
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';
let syntaxe = true; try { new vm.Script(script); } catch (err) { syntaxe = false; console.log(err); }
ok(/Installer mon site/.test(html) && /usersettings/.test(html) && syntaxe && !/<\/script/i.test(script), 'page de l\'installateur : contenu et script valides');

console.log(echecs ? `[en ligne] ${echecs} échec(s)` : '[en ligne] tout est vert');
process.exit(echecs ? 1 : 0);
