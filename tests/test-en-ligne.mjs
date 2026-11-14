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
  const m = url.replace(/\?.*$/, '').match(/projects(?:\/([^/]+))?(?:\/(content|versions|deployments))?(?:\/([^/]+))?$/);
  const [, id, quoi, sous] = m;
  if (!id && methode === 'POST') { const sid = 'script' + (++n); projets[sid] = { titre: corps.title, versions: 0, deploiements: {} }; return reponse(200, { scriptId: sid }); }
  const p = projets[id];
  if (!p) return reponse(404, { error: { code: 404, message: 'Requested entity was not found.' } });
  if (!quoi && methode === 'GET') return reponse(200, { scriptId: id, title: p.titre });
  if (quoi === 'content' && methode === 'PUT') { p.contenu = corps.files; return reponse(200, { scriptId: id, files: corps.files }); }
  if (quoi === 'versions' && methode === 'GET') {           // liste paginée (50 par page)
    const tous = [...Array(p.versions).keys()].map(i => ({ versionNumber: i + 1 })), debut = +((url.match(/pageToken=(\d+)/) || [])[1] || 0);
    return reponse(200, Object.assign({ versions: tous.slice(debut, debut + 50) }, debut + 50 < tous.length ? { nextPageToken: String(debut + 50) } : {}));
  }
  if (quoi === 'versions' && methode === 'POST') { ++p.versions; (p.instantanes = p.instantanes || {})[p.versions] = p.contenu; return reponse(200, { versionNumber: p.versions }); }
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
ok(journal.join(' | ') === 'POST  | PUT /script1/content | POST /script1/versions | POST /script1/deployments | PUT /script1/content | POST /script1/versions | POST /script1/deployments | PUT /script1/content | POST /script1/versions | PUT /script1/deployments/' + userProps.deploymentId + ' | PUT /script1/content | POST /script1/versions | PUT /script1/deployments/' + userProps.deploymentIdParent,
  'installation : création → deux publications (enfant, parent) → republiées avec l\'adresse de l\'autre');
// ce que sert chaque publication
const servi = did => { const v = p1.deploiements[did]; const c = p1.instantanes[v]; return { code: c.find(f => f.name === 'Code').source, acces: JSON.parse(c.find(f => f.name === 'appsscript').source).webapp.access }; };
const sE = servi(userProps.deploymentId), sP = servi(userProps.deploymentIdParent);
ok(r.urlParent && r.urlParent !== r.url && userProps.urlParent === r.urlParent, 'installation : deux adresses, site de l\'enfant et espace parent');
ok(sE.acces === 'ANYONE_ANONYMOUS' && /espace: 'enfant'/.test(sE.code), 'site de l\'enfant : ouvert sans compte, réglé en espace « enfant »');
ok(sP.acces === 'MYSELF' && /espace: 'parent'/.test(sP.code), 'espace parent : accès « Seulement moi » (compte Google du parent)');
ok(sE.code.includes("urlParent: '" + r.urlParent + "'") && sP.code.includes("urlEnfant: '" + r.url + "'"), 'chaque espace connaît l\'adresse de l\'autre');
ok(code && /prenom: 'Zoé l’aînée',/.test(code.source), 'prénom écrit dans les réglages (apostrophe neutralisée)');
const charge = JSON.parse(CHARGE);
ok(p1.contenu.length === charge.fichiers.length && p1.contenu.some(f => f.name === 'lib/page-ajouter' && f.type === 'HTML') && p1.contenu.some(f => f.name === 'appsscript' && f.type === 'JSON'), 'tous les fichiers du moteur sont envoyés (' + p1.contenu.length + ')');
ok(/version: 'v-test',/.test(code.source) && /installateur: 'https:\/\/script\.google\.com\/macros\/s\/INSTALLATEUR\/exec'/.test(code.source), 'version et adresse de l\'installateur écrites dans le site (bandeau « mise à jour »)');
const url1 = r.url;

// 4. mise à jour : même projet, même adresse
journal.length = 0;
r = ctx.apiMettreAJour();
ok(r.ok && r.maj && r.url === url1 && Object.keys(projets).length === 1, 'mise à jour : même adresse, pas de nouveau projet');
ok(r.urlParent === userProps.urlParent && !/POST \/script1\/deployments/.test(journal.join(' | ')) && p1.versions === 6, 'mise à jour : deux nouvelles versions publiées sur les deux mêmes publications');
ok(/prenom: 'Zoé l’aînée',/.test(p1.contenu.find(f => f.name === 'Code').source), 'mise à jour : le prénom est conservé');
e = ctx.apiEtat();
ok(e.installe && e.url === url1 && e.version === 'v-test', 'état après installation : site et version connus');
ok(e.versions === 6 && !e.alerteVersions && /projects\/script1\/edit$/.test(e.lienProjet), 'état : nombre de versions du site compté, pas d\'alerte');
p1.versions = 172; e = ctx.apiEtat();
ok(e.versions === 172 && e.alerteVersions, 'état : alerte « ménage des versions » à partir de 170 (liste paginée)');
p1.versions = 199; const avantMaj = JSON.stringify(p1.deploiements);
r = ctx.apiMettreAJour();
ok(r.erreur === 'versions' && r.versions === 199 && p1.versions === 199 && JSON.stringify(p1.deploiements) === avantMaj, 'plus de place pour 2 versions : mise à jour refusée proprement, site intact');
p1.versions = 6;

// 4 bis. site installé avant l'espace parent : la mise à jour le crée, l'adresse de l'enfant ne change pas
delete userProps.deploymentIdParent; delete userProps.urlParent;
r = ctx.apiMettreAJour();
ok(r.ok && r.maj && r.nouveauParent && r.url === url1 && r.urlParent && servi(userProps.deploymentIdParent).acces === 'MYSELF', 'ancien site mis à jour : espace parent ajouté, adresse de l\'enfant inchangée');

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
const sid = userProps.scriptId, did = userProps.deploymentId, didP = userProps.deploymentIdParent;
r = ctx.apiRecommencer();
ok(r.desactive && !(did in projets[sid].deploiements) && !(didP in projets[sid].deploiements) && !ctx.apiEtat().installe, 'bouton « Repartir de zéro » : ancien site désactivé (déploiement supprimé), l\'installateur l\'oublie');

// 6 bis. plusieurs sites dans le même compte : un autre enfant, puis les révisions d'un parent
r = ctx.apiInstaller('Tom', 'CE1');
const principal = { id: userProps.scriptId, url: r.url };
ok(r.ok && /classe: 'CE1',/.test(projets[principal.id].contenu.find(f => f.name === 'Code').source) && /classeAnnee: 20\d\d/.test(projets[principal.id].contenu.find(f => f.name === 'Code').source)
  && /nomDossier: 'SoccaQuiz',/.test(projets[principal.id].contenu.find(f => f.name === 'Code').source), 'installation : la classe est écrite dans le site, dossier « SoccaQuiz » pour le site principal');
const avantAjout = Object.keys(projets).length;
let r2 = ctx.apiAjouterSite({ prenom: 'Léa', classe: '6e' });
const a1 = JSON.parse(userProps.autres)[0], codeLea = projets[a1.scriptId].contenu.find(f => f.name === 'Code').source;
ok(r2.ok && r2.n === 1 && Object.keys(projets).length === avantAjout + 1 && projets[a1.scriptId].titre === 'SoccaQuiz – Léa' && /nomDossier: 'SoccaQuiz – Léa',/.test(codeLea) && /classe: '6e',/.test(codeLea) && /prenom: 'Léa',/.test(codeLea)
  && userProps.scriptId === principal.id && r2.url !== principal.url, 'autre site : nouveau projet « SoccaQuiz – Léa », son propre dossier, sa classe ; le site principal est intact');
let r3 = ctx.apiAjouterSite({ prenom: '', classe: 'adulte' });
const a2 = JSON.parse(userProps.autres)[1];
ok(r3.ok && r3.n === 2 && a2.dossier === 'SoccaQuiz – Mes révisions' && /classe: 'adulte',/.test(projets[a2.scriptId].contenu.find(f => f.name === 'Code').source), 'site pour moi : dossier « SoccaQuiz – Mes révisions », classe adulte');
e = ctx.apiEtat();
ok(e.sites.length === 3 && e.sites.map(x => x.n).join() === '0,1,2' && e.sites[1].prenom === 'Léa' && e.sites[2].classe === 'adulte' && e.installe && e.url === principal.url, 'état : les trois sites sont listés, le site principal reste aux champs habituels');
const verLea = projets[a1.scriptId].versions;
r = ctx.apiMettreAJour(1);
ok(r.ok && r.maj && r.n === 1 && projets[a1.scriptId].versions === verLea + 2 && r.url === r2.url, 'mise à jour d\'un autre site : son projet seulement, même adresse');
r = ctx.apiRecommencer(1);
e = ctx.apiEtat();
ok(r.desactive && e.sites.length === 2 && e.sites[1].classe === 'adulte' && e.sites[1].n === 1 && e.installe, 'suppression d\'un autre site : désactivé, les autres sites sont gardés et renumérotés');
ctx.doGet({ parameter: { recommencer: '1' } });

// 7. la page : HTML complet et script valide
const html = ctx.doGet({ parameter: {} }).html;
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';
let syntaxe = true; try { new vm.Script(script); } catch (err) { syntaxe = false; console.log(err); }
ok(/Installer mon site/.test(html) && /usersettings/.test(html) && syntaxe && !/<\/script/i.test(script), 'page de l\'installateur : contenu et script valides');

console.log(echecs ? `[en ligne] ${echecs} échec(s)` : '[en ligne] tout est vert');
process.exit(echecs ? 1 : 0);
