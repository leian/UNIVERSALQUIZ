/* =====================================================================
   TEST DE L'INSTALLATEUR EN LIGNE (en-ligne/Code.gs), SANS GOOGLE
   Simule GitHub (universal-quiz.json) et l'API Apps Script, puis vérifie :
   installation, interrupteur API non activé, mise à jour (même adresse),
   installation interrompue, publication ou projet supprimés par l'utilisateur,
   sites désignés par leur scriptId, désactivation, effacement complet, GitHub
   indisponible, et que la page s'affiche sans erreur.
   Usage : node tests/test-en-ligne.mjs   (lancé aussi par tests/test.mjs)
   UQ_CHARGE=<fichier universal-quiz.json> : utilise ce fichier au lieu de construire le projet (n'écrit ni build/ ni dist/).
   ===================================================================== */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.UQ_CHARGE && spawnSync(process.execPath, [join(RACINE, 'outils', 'fabriquer-charge.mjs')], { stdio: 'inherit', env: { ...process.env, TAG: 'v-test' } }).status !== 0) process.exit(1);
let CHARGE = readFileSync(process.env.UQ_CHARGE || join(RACINE, 'dist', 'universal-quiz.json'), 'utf8');
if (process.env.UQ_CHARGE) CHARGE = JSON.stringify(Object.assign(JSON.parse(CHARGE), { version: 'v-test' }));
// sections 1 à 11 : ancien moteur (accès à tout le Drive, deux publications par site) ; section 12 : programme de la famille
const CHARGE_ANCIEN = (() => { const c = JSON.parse(CHARGE); const m = c.fichiers.find(f => f.name === 'appsscript');
  m.source = JSON.stringify(Object.assign(JSON.parse(m.source), { oauthScopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'] }), null, 2); return JSON.stringify(c); })();
let CHARGE_ACTUELLE = CHARGE_ANCIEN;
const nonAutorises = new Set();  // programmes de la famille pas encore autorisés dans l'éditeur (le site ne répond pas)
const scriptProps = {};

let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + '[en ligne] ' + m); if (!c) echecs++; };

// ---- faux Google ----
const userProps = {};
const projets = {};             // scriptId → { contenu, versions, deploiements: { id: version } }
let apiActivee = false, n = 0, github = true;
let panne = null;               // (méthode, url) → réponse forcée (panne simulée), ou rien
const journal = [];
const reponse = (code, corps) => ({ getResponseCode: () => code, getContentText: () => typeof corps === 'string' ? corps : JSON.stringify(corps) });

function fausseApi(url, o) {
  const methode = (o.method || 'get').toUpperCase();
  const corps = o.payload ? JSON.parse(o.payload) : null;
  journal.push(methode + ' ' + url.replace('https://script.googleapis.com/v1/projects', ''));
  if (!/^Bearer jeton/.test(o.headers && o.headers.Authorization)) return reponse(401, { error: { message: 'pas de jeton' } });
  const forcee = panne && panne(methode, url);
  if (forcee) return forcee;
  if (!apiActivee) return reponse(403, { error: { code: 403, message: 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings then retry.' } });
  const m = url.replace(/\?.*$/, '').match(/projects(?:\/([^/]+))?(?:\/(content|versions|deployments))?(?:\/([^/]+))?$/);
  const [, id, quoi, sous] = m;
  if (!id && methode === 'POST') { const sid = 'script' + (++n); projets[sid] = { titre: corps.title, versions: 0, deploiements: {} }; if (CHARGE_ACTUELLE === CHARGE) nonAutorises.add(sid); return reponse(200, { scriptId: sid }); }
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
  if (quoi === 'deployments' && methode === 'POST') { const did = 'AKfy' + (++n); p.deploiements[did] = corps.versionNumber; (p.desc = p.desc || {})[did] = corps.description; return reponse(200, web(did)); }
  if (quoi === 'deployments' && methode === 'GET' && !sous) return reponse(200, { deployments: Object.keys(p.deploiements).map(did => Object.assign(web(did), { deploymentConfig: { versionNumber: p.deploiements[did], description: (p.desc || {})[did] || '' } })) });
  if (quoi === 'deployments' && methode === 'GET' && sous) return sous in p.deploiements ? reponse(200, web(sous)) : reponse(404, { error: { code: 404, message: 'not found' } });
  if (quoi === 'deployments' && methode === 'DELETE') {
    if (!(sous in p.deploiements)) return reponse(404, { error: { code: 404, message: 'not found' } });
    delete p.deploiements[sous]; return reponse(200, {});
  }
  if (quoi === 'deployments' && methode === 'PUT') {
    if (!(sous in p.deploiements)) return reponse(404, { error: { code: 404, message: 'not found' } });
    p.deploiements[sous] = corps.deploymentConfig.versionNumber; (p.desc = p.desc || {})[sous] = corps.deploymentConfig.description; return reponse(200, web(sous));
  }
  return reponse(400, { error: { message: 'requête inattendue ' + methode + ' ' + url } });
}

// le site de l'enfant répond-il ? (sa publication existe et son programme n'est pas « à la corbeille »)
const corbeilleSites = new Set(); let attentes = 0;
const statsRecues = [];          // compteurs anonymes reçus par la (fausse) console
let consolePanne = false;
function siteEnLigne(url) {
  const did = (url.match(/\/s\/([^/]+)\/exec/) || [])[1];
  const p = Object.entries(projets).find(([, x]) => did in x.deploiements);
  if (p && nonAutorises.has(p[0])) return reponse(200, '<html>Autorisation requise</html>');
  return p && !corbeilleSites.has(p[0]) ? reponse(200, { v: 1, version: 'v-test' }) : reponse(404, '<html>Page introuvable</html>');
}

const cache = {};
const ctx = {
  console: { log: console.log, warn: console.warn, error: () => {} },   // les erreurs attendues ne polluent pas la sortie
  UrlFetchApp: { fetch: (url, o = {}) => /github\.com/.test(url) ? (github ? reponse(200, CHARGE_ACTUELLE) : reponse(503, 'indisponible'))
    : /leian\.github\.io\/UNIVERSALQUIZ\/soccaquiz\.json$/.test(url) ? reponse(200, { propositions: 'https://script.google.com/macros/s/AKfyCONSOLE/exec' })
    : /\/AKfyCONSOLE\/exec$/.test(url) ? (consolePanne ? (() => { throw new Error('réseau'); })() : (statsRecues.push(JSON.parse(o.payload)), reponse(200, { ok: true })))
    : /\/exec\?api=etat$/.test(url) ? siteEnLigne(url) : fausseApi(url, o) },
  Utilities: { sleep: () => { attentes++; }, getUuid: () => randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, t) => [...createHash('sha256').update(String(t), 'utf8').digest()].map(b => b > 127 ? b - 256 : b) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  ScriptApp: { AuthMode: { FULL: 'FULL' }, requireAllScopes: () => { global.__toutes = (global.__toutes || 0) + 1; }, invalidateAuth: () => { global.__authRetiree = (global.__authRetiree || 0) + 1; }, getOAuthToken: () => 'jeton-de-test', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/INSTALLATEUR/exec' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => scriptProps[k] ?? null }), getUserProperties: () => ({
    getProperty: k => userProps[k] ?? null, setProperty: (k, v) => { userProps[k] = String(v); },
    getProperties: () => ({ ...userProps }), setProperties: o => { for (const k in o) userProps[k] = String(o[k]); },
    deleteProperty: k => { delete userProps[k]; },
    deleteAllProperties: () => { for (const k in userProps) delete userProps[k]; }
  }) },
  LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }, createHtmlOutput: html => { const o = { html, cadre: '', setTitle: () => o, setFaviconUrl: () => o, addMetaTag: () => o, setXFrameOptionsMode: m => { o.cadre = m; return o; } }; return o; } }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(RACINE, 'en-ligne', 'Code.gs'), 'utf8'), ctx, { filename: 'en-ligne/Code.gs' });

// 1. état initial
let e = ctx.apiEtat();
ok(!e.installe && e.derniere === 'v-test' && !e.sites.length, 'état initial : rien d\'installé, dernière version lue sur GitHub');

// 2. interrupteur non activé
let r = ctx.apiInstaller('Zoé');
ok(r.erreur === 'api' && !Object.keys(projets).length, 'API Apps Script non activée → message « active l\'interrupteur », rien de créé');

ok(e.api === false, 'état initial, interrupteur coupé : l\'étape 1 « Active l\'API » reste affichée');
apiActivee = true;
{ const nb = Object.keys(projets).length, ea = ctx.apiEtat();
  ok(ea.api === true && Object.keys(projets).length === nb, 'interrupteur déjà activé (depuis le mail) : détecté sans rien créer, l\'étape 1 est cachée'); }
panne = () => { throw new Error('réseau'); };
ok(ctx.apiEtat().api === null, 'vérification impossible (pas de réponse) : l\'étape 1 reste affichée par prudence');
panne = null;

// 3. installation
journal.length = 0;
r = ctx.apiInstaller("Zoé l'aînée");
const p1 = projets.script1;
const code = p1 && p1.contenu.find(f => f.name === 'Code');
ok(r.ok && /\/macros\/s\/AKfy\d+\/exec$/.test(r.url) && r.id === 'script1' && !r.maj && !r.nouveauSite, 'installation : site créé (' + r.url + ')');
ok(journal.join(' | ') === 'POST  | PUT /script1/content | POST /script1/versions | POST /script1/deployments | PUT /script1/content | POST /script1/versions | POST /script1/deployments | PUT /script1/content | POST /script1/versions | PUT /script1/deployments/' + userProps.deploymentIdParent + ' | PUT /script1/content | POST /script1/versions | PUT /script1/deployments/' + userProps.deploymentId,
  'installation : création → deux publications (enfant, parent) → republiées avec l\'adresse de l\'autre, le parent d\'abord');
// ce que sert chaque publication
const servi = did => { const v = p1.deploiements[did]; const c = p1.instantanes[v]; const w = JSON.parse(c.find(f => f.name === 'appsscript').source).webapp; return { code: c.find(f => f.name === 'Code').source, acces: w.access, executeAs: w.executeAs }; };
const sE = servi(userProps.deploymentId), sP = servi(userProps.deploymentIdParent);
ok(r.urlParent && r.urlParent !== r.url && userProps.urlParent === r.urlParent, 'installation : deux adresses, site de l\'enfant et espace parent');
ok(sE.acces === 'ANYONE_ANONYMOUS' && /espace: 'enfant'/.test(sE.code), 'site de l\'enfant : ouvert sans compte, réglé en espace « enfant »');
ok(sP.acces === 'ANYONE' && sP.executeAs === 'USER_ACCESSING' && sE.executeAs === 'USER_DEPLOYING' && /espace: 'parent'/.test(sP.code), 'espace parent : ouvert avec le compte Google du visiteur (accès vérifié par le site : partage Drive du dossier)');
ok(sE.code.includes("urlParent: '" + r.urlParent + "'") && sP.code.includes("urlEnfant: '" + r.url + "'"), 'chaque espace connaît l\'adresse de l\'autre');
ok(code && /prenom: 'Zoé l’aînée',/.test(code.source), 'prénom écrit dans les réglages (apostrophe neutralisée)');
const charge = JSON.parse(CHARGE);
ok(p1.contenu.length === charge.fichiers.length && p1.contenu.some(f => f.name === 'lib/page-ajouter' && f.type === 'HTML') && p1.contenu.some(f => f.name === 'appsscript' && f.type === 'JSON'), 'tous les fichiers du moteur sont envoyés (' + p1.contenu.length + ')');
ok(/version: 'v-test',/.test(code.source) && /installateur: 'https:\/\/script\.google\.com\/macros\/s\/INSTALLATEUR\/exec'/.test(code.source), 'version et adresse de l\'installateur écrites dans le site (bandeau « mise à jour »)');
const url1 = r.url;

// 4. mise à jour : même projet, même adresse
journal.length = 0;
r = ctx.apiMettreAJour({ n: 0, id: 'script1' });
ok(r.ok && r.maj && !r.adresseChangee && r.url === url1 && Object.keys(projets).length === 1, 'mise à jour : même adresse, pas de nouveau projet');
ok(r.urlParent === userProps.urlParent && !/POST \/script1\/deployments/.test(journal.join(' | ')) && p1.versions === 6, 'mise à jour : deux nouvelles versions publiées sur les deux mêmes publications');
ok(/GET \/script1\/deployments\/AKfy/.test(journal.join(' | ')), 'mise à jour : les deux publications sont vérifiées avant');
ok(/prenom: 'Zoé l’aînée',/.test(p1.contenu.find(f => f.name === 'Code').source), 'mise à jour : le prénom est conservé');
e = ctx.apiEtat();
ok(e.installe && e.url === url1 && e.version === 'v-test' && !e.sites[0].nouvelle && !e.sites[0].incomplet, 'état après installation : site et version connus, pas de « nouvelle version »');
ok(e.versions === 6 && !e.alerteVersions && /projects\/script1\/edit$/.test(e.lienProjet), 'état : nombre de versions du site compté, pas d\'alerte');
p1.versions = 172; e = ctx.apiEtat();
ok(e.versions === 172 && e.alerteVersions, 'état : alerte « ménage des versions » à partir de 170 (liste paginée)');
p1.versions = 199; const avantMaj = JSON.stringify(p1.deploiements);
r = ctx.apiMettreAJour();
ok(r.erreur === 'versions' && r.versions === 199 && p1.versions === 199 && JSON.stringify(p1.deploiements) === avantMaj, 'plus de place pour 2 versions : mise à jour refusée proprement, site intact');
p1.versions = 6;
ok(ctx.plusRecente_('v2.10', 'v2.9') && !ctx.plusRecente_('v2.0.1', 'v2.1') && !ctx.plusRecente_('v2.1', 'v2.1') && ctx.plusRecente_('v2.1', '') && !ctx.plusRecente_('', 'v2.1'),
  'comparaison des versions : v2.10 > v2.9, jamais de rétrogradation proposée');
const descAvant = JSON.stringify(p1.desc);
Object.keys(p1.desc).forEach(k => { p1.desc[k] = 'SoccaQuiz v0.9 – essai'; }); cache.derniere = 'v1.0';
ok(ctx.apiEtat().sites[0].nouvelle, 'nouvelle version proposée seulement si elle est plus grande');
cache.derniere = 'v0.8';
ok(!ctx.apiEtat().sites[0].nouvelle, 'version plus ancienne marquée « dernière » sur GitHub : pas proposée');
// cohérence avec l'espace parent : la version publiée fait foi, pas celle retenue par l'installateur
cache.derniere = 'v1.0'; userProps.version = 'v1.0';
{ const e2 = ctx.apiEtat(); ok(e2.sites[0].version === 'v0.9' && e2.sites[0].nouvelle && userProps.version === 'v0.9', 'version réellement publiée lue sur le site (ancienne mémoire de l\'installateur corrigée) : la mise à jour est bien proposée'); }
// l'espace parent a vu une version plus récente que la mémoire de 10 min : GitHub est relu
cache.derniere = 'v0.8';
{ const e3 = ctx.apiEtat({ d: 'v9.9' }); ok(e3.sites[0].derniere === 'v-test' && cache.derniere === 'v-test', 'lien de l\'espace parent (?d=…) plus récent que la mémoire : dernière version relue sur GitHub'); }
p1.desc = JSON.parse(descAvant); delete cache.derniere; userProps.version = 'v-test';

// 4 bis. site installé avant l'espace parent : la mise à jour le crée, l'adresse de l'enfant ne change pas
delete userProps.deploymentIdParent; delete userProps.urlParent;
r = ctx.apiMettreAJour();
ok(r.ok && r.maj && r.nouveauParent && r.url === url1 && r.urlParent && servi(userProps.deploymentIdParent).acces === 'ANYONE', 'ancien site mis à jour : espace parent ajouté, adresse de l\'enfant inchangée');

// 4 ter. publication de l'enfant supprimée à la main : recréée, et l'espace parent reçoit la nouvelle adresse
delete p1.deploiements[userProps.deploymentId];
r = ctx.apiMettreAJour();
ok(r.ok && r.maj && r.adresseChangee && r.url !== url1 && userProps.url === r.url && servi(userProps.deploymentIdParent).code.includes("urlEnfant: '" + r.url + "'") && servi(userProps.deploymentId).acces === 'ANYONE_ANONYMOUS',
  'publication de l\'enfant supprimée : recréée, nouvelle adresse annoncée et connue de l\'espace parent');

// 4 quater. erreur 403 sur le projet : rien n'est recréé, message clair ; autres erreurs traduites
const sid0 = userProps.scriptId, nbProjets = Object.keys(projets).length;
panne = (m, u) => m === 'GET' && u.endsWith('/' + sid0) ? reponse(403, { error: { code: 403, message: 'The caller does not have permission' } }) : null;
r = ctx.apiMettreAJour();
panne = null;
ok(r.erreur && /refuse l'accès/.test(r.erreur) && /comptes Google/.test(r.erreur) && /caller/.test(r.detail) && userProps.scriptId === sid0 && Object.keys(projets).length === nbProjets, 'erreur 403 : site gardé, pas de nouveau projet, message traduit (texte d\'origine en détail)');
panne = (m, u) => m === 'POST' && /versions$/.test(u) ? reponse(429, { error: { code: 429, message: 'Quota exceeded for quota metric' } }) : null;
r = ctx.apiMettreAJour();
panne = null;
ok(/réessaie demain/.test(r.erreur) && /Quota/.test(r.detail), 'quota dépassé : « réessaie demain »');
let compte = 0;
panne = (m, u) => m === 'PUT' && /deployments\//.test(u) && ++compte === 2 ? reponse(500, { error: { code: 500, message: 'Internal error' } }) : null;
r = ctx.apiMettreAJour();
panne = null;
ok(/clique à nouveau sur « Mettre à jour »/.test(r.erreur), 'mise à jour arrêtée entre les deux espaces : il est dit de la relancer');
const t = ctx.traduire_(Object.assign(new Error('Script has reached the version limit of 200'), { scriptId: 'scriptX', n: 2 }));
ok(t.erreur === 'versions' && t.n === 2 && /scriptX/.test(t.lienProjet), 'limite des versions : carte « ménage » sur le bon site, lien vers le bon projet');

// 5. installation interrompue entre les deux publications : rien n'est créé en double
const avantInterruption = Object.keys(projets).length;
compte = 0;
panne = (m, u) => m === 'POST' && /deployments$/.test(u) && ++compte === 2 ? reponse(500, { error: { code: 500, message: 'Internal error' } }) : null;
let r2 = ctx.apiAjouterSite({ prenom: 'Paul', classe: 'CP' });
panne = null;
let aP = JSON.parse(userProps.autres || '[]')[0];
ok(r2.erreur && /Terminer l'installation/.test(r2.erreur) && aP && aP.scriptId && aP.deploymentId && !aP.deploymentIdParent && !aP.version, 'installation interrompue : le site et sa publication enfant sont enregistrés aussitôt');
e = ctx.apiEtat();
ok(e.sites.length === 2 && e.sites[1].incomplet && e.sites[1].id === aP.scriptId, 'état : site interrompu affiché « à terminer »');
r2 = ctx.apiMettreAJour({ n: 1, id: aP.scriptId });
aP = JSON.parse(userProps.autres || '[]')[0];
ok(r2.ok && !r2.maj && Object.keys(projets).length === avantInterruption + 1 && Object.keys(projets[aP.scriptId].deploiements).length === 2 && aP.version === 'v-test',
  'reprise : installation terminée sur le même projet, deux publications en tout (aucune orpheline)');

// 5 bis. sites désignés par leur scriptId
r = ctx.apiMettreAJour({ n: 1, id: 'script-inconnu' });
ok(r.erreur && /recharge la page/.test(r.erreur), 'site désigné par un scriptId inconnu (autre onglet) : action refusée');
r = ctx.apiMettreAJour({ n: 5, id: aP.scriptId });
ok(r.ok && r.n === 1 && r.id === aP.scriptId, 'le scriptId fait foi, même si le rang a changé');

// 5 ter. désactivation impossible : le site est gardé
panne = m => m === 'DELETE' ? reponse(500, { error: { code: 500, message: 'Backend Error' } }) : null;
r = ctx.apiRecommencer({ n: 1, id: aP.scriptId });
panne = null;
ok(r.erreur && /n'a pas pu être désactivé/.test(r.erreur) && JSON.parse(userProps.autres || '[]').length === 1, 'désactivation en échec : le site n\'est pas oublié');
r = ctx.apiRecommencer({ n: 1, id: aP.scriptId });
ok(r.ok && r.desactive && JSON.parse(userProps.autres || '[]').length === 0 && !Object.keys(projets[aP.scriptId].deploiements).length, 'désactivation réussie : publications supprimées, site oublié');

// 6. projet supprimé par la famille → nouveau site, annoncé comme tel
delete projets[userProps.scriptId];
const avantSuppr = Object.keys(projets).length;
r = ctx.apiMettreAJour();
ok(r.ok && r.nouveauSite && !r.maj && Object.keys(projets).length === avantSuppr + 1 && r.url !== url1, 'projet supprimé (404 seulement) → recréé, annoncé comme nouveau site');

// 6 bis. GitHub indisponible : les sites restent affichés
github = false; delete cache.derniere;
e = ctx.apiEtat();
ok(!e.erreur && e.sites.length === 1 && e.sites[0].url === r.url && e.derniere === '' && e.erreurGithub, 'GitHub indisponible : sites affichés quand même, sans version');
github = true; ctx.apiEtat();
ok(cache.derniere === 'v-test', 'version de GitHub gardée en cache (10 min)');

// 6 ter. réglage absent du moteur publié : rien n'est publié
const bonneCharge = CHARGE_ACTUELLE, versionsAvant = projets[userProps.scriptId].versions;
CHARGE_ACTUELLE = JSON.stringify(Object.assign(JSON.parse(bonneCharge), { fichiers: JSON.parse(bonneCharge).fichiers.map(f => f.name === 'Code' ? Object.assign({}, f, { source: f.source.replace(/espace: '[^'\n]*'/, 'zone: \'\'') }) : f) }));
journal.length = 0;
r = ctx.apiMettreAJour();
CHARGE_ACTUELLE = bonneCharge;
ok(r.erreur && /« espace »/.test(r.erreur) && !/content/.test(journal.join(' | ')) && projets[userProps.scriptId].versions === versionsAvant, 'réglage « espace » introuvable : refus, aucun code envoyé');

// 7. bouton « Repartir de zéro »
const sid = userProps.scriptId, did = userProps.deploymentId, didP = userProps.deploymentIdParent;
r = ctx.apiRecommencer();
ok(r.desactive && !(did in projets[sid].deploiements) && !(didP in projets[sid].deploiements) && !ctx.apiEtat().installe, 'bouton « Repartir de zéro » : ancien site désactivé (déploiement supprimé), l\'installateur l\'oublie');

// 8. plusieurs sites dans le même compte : un autre enfant, puis les révisions d'un parent
r = ctx.apiInstaller('Tom', 'CE1');
const principal = { id: userProps.scriptId, url: r.url };
ok(r.ok && /classe: 'CE1',/.test(projets[principal.id].contenu.find(f => f.name === 'Code').source) && /classeAnnee: 20\d\d/.test(projets[principal.id].contenu.find(f => f.name === 'Code').source)
  && /nomDossier: 'SoccaQuiz',/.test(projets[principal.id].contenu.find(f => f.name === 'Code').source), 'installation : la classe est écrite dans le site, dossier « SoccaQuiz » pour le site principal');
const avantAjout = Object.keys(projets).length;
r2 = ctx.apiAjouterSite({ prenom: 'Léa', classe: '6e' });
const a1 = JSON.parse(userProps.autres || '[]')[0], codeLea = projets[a1.scriptId].contenu.find(f => f.name === 'Code').source;
ok(r2.ok && r2.n === 1 && Object.keys(projets).length === avantAjout + 1 && projets[a1.scriptId].titre === 'SoccaQuiz – Léa' && /nomDossier: 'SoccaQuiz – Léa',/.test(codeLea) && /classe: '6e',/.test(codeLea) && /prenom: 'Léa',/.test(codeLea)
  && userProps.scriptId === principal.id && r2.url !== principal.url, 'autre site : nouveau projet « SoccaQuiz – Léa », son propre dossier, sa classe ; le site principal est intact');
let r3 = ctx.apiAjouterSite({ prenom: '', classe: 'adulte' });
const a2 = JSON.parse(userProps.autres || '[]')[1];
ok(r3.ok && r3.n === 2 && a2.dossier === 'SoccaQuiz – Mes révisions' && /classe: 'adulte',/.test(projets[a2.scriptId].contenu.find(f => f.name === 'Code').source), 'site pour moi : dossier « SoccaQuiz – Mes révisions », classe adulte');
e = ctx.apiEtat();
ok(e.sites.length === 3 && e.sites.map(x => x.n).join() === '0,1,2' && e.sites[1].prenom === 'Léa' && e.sites[2].classe === 'adulte' && e.installe && e.url === principal.url, 'état : les trois sites sont listés, le site principal reste aux champs habituels');
const verLea = projets[a1.scriptId].versions;
r = ctx.apiMettreAJour({ n: 1, id: a1.scriptId });
ok(r.ok && r.maj && r.n === 1 && projets[a1.scriptId].versions === verLea + 2 && r.url === r2.url, 'mise à jour d\'un autre site : son projet seulement, même adresse');
r = ctx.apiRecommencer({ n: 1, id: a1.scriptId });
e = ctx.apiEtat();
ok(r.desactive && e.sites.length === 2 && e.sites[1].classe === 'adulte' && e.sites[1].n === 1 && e.installe, 'suppression d\'un autre site : désactivé, les autres sites sont gardés et renumérotés');
r = ctx.apiRecommencer({ n: 2, id: a2.scriptId });          // ancien rang (onglet pas rechargé) : le scriptId fait foi
ok(r.ok && r.n === 1 && JSON.parse(userProps.autres || '[]').length === 0 && userProps.scriptId === principal.id, 'onglet pas rechargé : c\'est bien le site désigné qui est supprimé, pas un autre');

// 9. droit à l'effacement : chaque site supprimé l'un après l'autre → l'installateur ne garde plus rien
r3 = ctx.apiAjouterSite({ prenom: 'Léo', classe: 'CM1' });
const deps = [userProps.deploymentId, JSON.parse(userProps.autres || '[]')[0].deploymentId];
ctx.apiRecommencer({ id: r3.id }); r = ctx.apiRecommencer({ id: principal.id });
ok(r.ok && !Object.keys(userProps).length && !(deps[0] in projets[principal.id].deploiements) && !(deps[1] in projets[r3.id].deploiements), 'tous les sites supprimés un à un : chacun désactivé, plus aucune propriété gardée par l\'installateur');
ctx.doGet({ parameter: { recommencer: '1' } });
ok(!ctx.apiEtat().installe && Object.keys(projets).length > 0, '?recommencer=1 n\'existe plus (aucun effet)');

// 9 bis. supprimer le site principal quand il y en a d'autres : le suivant prend sa place, rien d'autre ne change
{
  const r1 = ctx.apiInstaller('Toom', 'CM2'); const r2 = ctx.apiAjouterSite({ prenom: 'Caroline', classe: '2de' });
  const etat0 = ctx.apiEtat();
  const caro = etat0.sites.find(x => x.prenom === 'Caroline');
  const html = ctx.doGet({ parameter: { supprime: r1.id } }).html;
  ok(/window\.__SUPPR = \{"id":/.test(html) && /"prenom":"Toom"/.test(html) && /window\.__SUPPR = null/.test(ctx.doGet({ parameter: { supprime: 'inconnu-1234567890' } }).html), 'suppression : retour de l\'espace parent → dernière étape proposée (seulement pour un site connu)');
  const r = ctx.apiRecommencer({ id: r1.id });
  const etat = ctx.apiEtat();
  ok(r.ok && r.urlParent === r1.urlParent && etat.installe && etat.sites.length === 1 && etat.sites[0].prenom === 'Caroline' && etat.sites[0].url === caro.url && userProps.dossier && /Caroline/.test(userProps.dossier) && r.restants.length === 1,
    'suppression du site principal : le site de Caroline prend sa place (même adresse, même dossier), adresses restantes renvoyées pour la famille — ' + JSON.stringify({ n: etat.sites.length, dossier: userProps.dossier }));
  ctx.apiRecommencer({ id: etat.sites[0].id });
  ok(!Object.keys(userProps).length, 'dernier site supprimé : plus rien de gardé');
}

// 9 ter. désinstallation complète par l'espace parent : fin automatique (page ou cadre invisible), garde-fou, accès retiré au dernier site
{
  const r1 = ctx.apiInstaller('Tom', 'CE1'); const r2 = ctx.apiAjouterSite({ prenom: 'Léa', classe: '6e' });
  const page = ctx.doGet({ parameter: { supprime: r2.id, cadre: '1' } });
  const sansCadre = ctx.doGet({ parameter: { supprime: r2.id } }), ordinaire = ctx.doGet({ parameter: { cadre: '1' } });
  ok(page.cadre === 'ALLOWALL' && /"cadre":true/.test(page.html) && !sansCadre.cadre && !ordinaire.cadre && /auto: true/.test(page.html),
    'retour de suppression : page chargeable dans le cadre invisible de l\'espace parent (et seulement dans ce cas), fin sans bouton');
  // garde-fou : un lien « ?supprime=… » vers un site qui répond encore ne supprime rien
  attentes = 0;
  let r = ctx.apiRecommencer({ id: r2.id, auto: true });
  ok(r.vivant && !r.ok && attentes === 3 && ctx.apiEtat().sites.length === 2 && Object.keys(projets[r2.id].deploiements).length === 2,
    'fin automatique refusée tant que le site répond (lien piégé) : rien n\'est supprimé, confirmation demandée');
  // programme à la corbeille (supprimé par son espace parent) : Google refuse même de supprimer ses publications → oublié quand même
  corbeilleSites.add(r2.id);
  const avant = global.__authRetiree || 0;
  panne = m => m === 'DELETE' ? reponse(403, { error: { code: 403, message: 'The caller does not have permission' } }) : null;
  r = ctx.apiRecommencer({ id: r2.id, auto: true });
  ok(r.ok && r.corbeille && !r.desinstalle && (global.__authRetiree || 0) === avant && ctx.apiEtat().sites.length === 1, 'site qui ne répond plus : oublié automatiquement ; un autre site reste, l\'accès de l\'installateur est gardé');
  r = ctx.apiRecommencer({ id: r1.id });
  ok(r.erreur && ctx.apiEtat().sites.length === 1, 'suppression ordinaire refusée par Google : le site est gardé (rien n\'est oublié à tort)');
  corbeilleSites.add(r1.id);
  r = ctx.apiRecommencer({ id: r1.id, auto: true });
  panne = null;
  ok(r.ok && r.desinstalle && (global.__authRetiree || 0) === avant + 1 && !Object.keys(userProps).length, 'dernier site supprimé : l\'installateur retire son propre accès (désinstallation complète)');
}

// 9 quater. compteurs anonymes : un « +1 » par installation, mise à jour, suppression ; rien sur la famille
{
  statsRecues.length = 0;
  const evts = () => statsRecues.map(x => x.evts.map(y => y.e + (y.n ? ':' + y.n : '')).join('+')).join(' ');
  const r1 = ctx.apiInstaller('Tom', 'CE1'); const r2 = ctx.apiAjouterSite({ prenom: 'Léa', classe: '6e' });
  ctx.apiMettreAJour({ id: r1.id });
  ok(evts() === 'installation installation maj' && statsRecues.every(x => x.type === 'stat') && statsRecues[0].evts[0].v === 'v-test' && userProps.stat === '1',
    'compteurs : installation, autre site, mise à jour — ' + evts());
  delete userProps.stat; statsRecues.length = 0;             // famille installée avant les compteurs
  ctx.apiMettreAJour({ id: r2.id });
  ok(evts() === 'existant:2+maj', 'site installé avant les compteurs : compté une fois (« existant »), à sa première mise à jour — ' + evts());
  statsRecues.length = 0;
  ctx.apiRecommencer({ id: r2.id }); const garde = userProps.stat; ctx.apiRecommencer({ id: r1.id });
  const brut = JSON.stringify(statsRecues);
  ok(evts() === 'suppression suppression' && garde === '1' && !Object.keys(userProps).length, 'suppressions comptées ; dernier site supprimé : l\'installateur ne garde plus rien, même pas la marque des compteurs');
  ok(!/Tom|Léa|script\d|AKfy|@|CE1|6e/.test(brut) && Object.keys(statsRecues[0]).sort().join() === 'evts,type', 'compteurs : ni prénom, ni classe, ni identifiant de site, ni adresse — ' + brut);
  consolePanne = true;
  const avant = statsRecues.length;
  const r3 = ctx.apiInstaller('Zoé', 'CM1');
  ok(r3.ok && statsRecues.length === avant, 'console injoignable : l\'installation se fait quand même (un compteur n\'est jamais bloquant)');
  consolePanne = false; ctx.apiRecommencer({ id: r3.id });
}

// 12. programme de la famille (chantier « sans alerte ») : un programme pour tous les enfants, une publication,
//     autorisation dans l'éditeur (la page attend que le site réponde), lien du premier appareil du parent
{
  for (const k in userProps) delete userProps[k];
  const sha = t => createHash('sha256').update(t, 'utf8').digest('hex');
  // site installé avant : la nouvelle version ne peut pas le remplacer (le supprimer, puis installer), rien n'est publié
  const ancien = ctx.apiInstaller('Ancien', 'CM1');
  CHARGE_ACTUELLE = CHARGE; delete cache.derniere; delete cache.famille;
  const versionsAvant = projets[ancien.id].versions;
  let r = ctx.apiMettreAJour({ id: ancien.id });
  ok(r.erreur && r.migration && projets[ancien.id].versions === versionsAvant && ctx.apiEtat().sites[0].migration, 'ancien site + programme de la famille : mise à jour refusée : supprimer puis installer, rien n\'est publié — ' + (r.erreur || '').slice(0, 60));
  CHARGE_ACTUELLE = CHARGE_ANCIEN; delete cache.derniere; delete cache.famille;
  ctx.apiRecommencer({ id: ancien.id });
  CHARGE_ACTUELLE = CHARGE; delete cache.derniere; delete cache.famille;
  r = ctx.apiInstaller('Tom', 'CE1');
  const p = projets[r.id], dep = userProps.deploymentId, code = () => p.contenu.find(f => f.name === 'Code').source, man = JSON.parse(p.contenu.find(f => f.name === 'appsscript').source);
  ok(r.ok && r.famille && !r.pret && !r.invitation && Object.keys(p.deploiements).length === 1 && p.versions === 2 && userProps.modele === 'famille' && !userProps.deploymentIdParent && /projects\/script\d+\/edit$/.test(r.lienProjet),
    'famille : un programme, une seule publication (2 versions : création puis adresse connue) ; pas encore autorisé → lien vers l\'éditeur, pas encore de lien parent');
  ok(/espace: 'enfant'/.test(code()) && code().includes("urlEnfant: '" + r.url + "'") && /invitation: '[0-9a-f]{64}'/.test(code()) && code().includes("invitation: '" + sha(userProps.invit) + "'") && userProps.invitH === sha(userProps.invit),
    'famille : le programme connaît son adresse et l\'empreinte du code du premier appareil (seule l\'empreinte est écrite)');
  ok(man.oauthScopes.join() === 'https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/userinfo.email' && man.webapp.executeAs === 'USER_DEPLOYING' && man.webapp.access === 'ANYONE_ANONYMOUS',
    'famille : manifeste du moteur gardé (fichiers créés par SoccaQuiz + adresse e-mail ; exécuté par le parent, ouvert sans compte)');
  let e = ctx.apiEtat();
  ok(e.sites.length === 1 && e.sites[0].famille && e.sites[0].aAutoriser && e.sites[0].urlParent === 'https://app.soccaquiz.fr/parent/?s=' + dep, 'état : carte « autorise ton site » (le site ne répond pas encore), espace parent sur app.soccaquiz.fr');
  let a = ctx.apiAutorise({ id: r.id });
  ok(!a.pret && !a.invitation, 'attente : pas encore autorisé');
  nonAutorises.delete(r.id);
  a = ctx.apiAutorise({ id: r.id });
  ok(a.pret && a.invitation === 'https://app.soccaquiz.fr/parent/?s=' + dep + '#i=' + userProps.invit && !ctx.apiEtat().sites[0].aAutoriser, 'autorisation donnée dans l\'éditeur : détectée, lien du premier appareil (#i=<code>)');
  const nb = Object.keys(projets).length;
  r = ctx.apiAjouterSite({ prenom: 'Léa', classe: '6e' });
  ok(r.erreur && /Ajouter un enfant/.test(r.erreur) && Object.keys(projets).length === nb, 'autre enfant : pas de nouveau programme, il s\'ajoute dans l\'espace parent');
  const h0 = userProps.invitH, v0 = p.versions;
  r = ctx.apiMettreAJour({ id: p === projets[userProps.scriptId] ? userProps.scriptId : '' });
  ok(r.ok && r.maj && r.pret && userProps.deploymentId === dep && p.versions === v0 + 1 && code().includes("invitation: '" + h0 + "'") && Object.keys(p.deploiements).length === 1, 'mise à jour : même publication, une version, empreinte gardée');
  const code0 = userProps.invit;
  r = ctx.apiNouvelAppareil({ id: userProps.scriptId });
  ok(r.ok && userProps.invit !== code0 && r.invitation.endsWith('#i=' + userProps.invit) && code().includes("invitation: '" + sha(userProps.invit) + "'"), 'nouvel appareil : nouveau code, écrit dans le programme, nouveau lien');
  scriptProps.ORIGINE = 'https://essai.soccaquiz.pages.dev';
  ok(ctx.apiAutorise({ id: userProps.scriptId }).invitation.startsWith('https://essai.soccaquiz.pages.dev/parent/?s='), 'essai : adresse de l\'appli réglable (propriété ORIGINE de l\'installateur)');
  delete scriptProps.ORIGINE;
  const avantT = global.__toutes || 0;
  const html12 = ctx.doGet({ parameter: {} }).html;
  ok((global.__toutes || 0) === avantT + 1 && /requireAllScopes\(ScriptApp\.AuthMode\.FULL\)/.test(readFileSync(new URL('../src/Code.gs', import.meta.url), 'utf8').split('function autoriser')[1].slice(0, 400)),
    'autorisation incomplète (case décochée) : l\'installateur et « autoriser » du programme redemandent tout à Google');
  ok(/Ouvrir le programme/.test(html12) && /apiAutorise/.test(html12) && /apiNouvelAppareil/.test(html12), 'page : étape « autorise ton site » et lien d\'un nouvel appareil');
  // suppression : publications retirées, code vidé (le programme ne peut pas être mis à la corbeille), plus rien de gardé
  const sid = userProps.scriptId;
  r = ctx.apiRecommencer({ id: sid });
  ok(r.ok && !Object.keys(projets[sid].deploiements).length && /supprimé/.test(projets[sid].contenu.find(f => f.name === 'Code').source) && !/oauthScopes/.test(projets[sid].contenu.find(f => f.name === 'appsscript').source) && !Object.keys(userProps).length,
    'suppression : publication retirée, code vidé (plus d\'autorisation demandée), l\'installateur ne garde plus rien');
  CHARGE_ACTUELLE = CHARGE_ANCIEN; delete cache.derniere; delete cache.famille;
}

// 10. la page : HTML complet et script valide ; pas de journal d'erreur chez l'éditeur
const html = ctx.doGet({ parameter: {} }).html;
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';
let syntaxe = true; try { new vm.Script(script); } catch (err) { syntaxe = false; console.log(err); }
ok(/Installer mon site/.test(html) && /usersettings/.test(html) && syntaxe && !/<\/script/i.test(script), 'page de l\'installateur : contenu et script valides');
ok(!/apiEffacerTout|Effacer toutes mes données/.test(html) && /supprime chaque site/.test(html) && /ne le partage qu\\?'avec lui/.test(html), 'page : plus de bouton « Effacer tout » (doublon), le pied de page explique comment tout effacer');
const source = readFileSync(join(RACINE, 'en-ligne', 'Code.gs'), 'utf8');
ok(!/console\.(error|log)/.test(source) && !/recommencer === '1'/.test(source) && JSON.parse(readFileSync(join(RACINE, 'en-ligne', 'appsscript.json'), 'utf8')).exceptionLogging === 'NONE', 'aucun journal d\'erreur envoyé à l\'éditeur (exceptionLogging NONE, pas de console)');

// 11. appli installable : adresse calculée par l'installateur, bouton « Site de <prénom> » selon l'interrupteur
{
  const U = 'https://script.google.com/macros/s/AKfycbTEST_site-de-l-enfant_0123456789/exec', A = 'https://leian.github.io/app/?s=AKfycbTEST_site-de-l-enfant_0123456789';
  ok(ctx.appli_(U, 'v2.77') === A && ctx.appli_(U, 'v2.100') === A && ctx.appli_(U, 'v2.76') === '' && ctx.appli_(U, '') === '' && ctx.appli_(U, 'v-test') === '' &&
    ctx.appli_('https://script.google.com/a/macros/ecole.fr/s/AKfycbTEST_site-de-l-enfant_0123456789/exec', 'v2.80') === '' && ctx.appli_('https://exemple.fr/?s=AKfycbTEST_site-de-l-enfant_0123456789', 'v2.80') === '',
    'adresse de l\'appli : seulement pour un site v2.77 ou plus récent, à une adresse script.google.com ordinaire');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright'); }
  const options = { args: ['--no-sandbox'] };
  if (process.env.CHROME) options.executablePath = process.env.CHROME;
  const browser = await playwright.chromium.launch(options).catch(() => playwright.chromium.launch({ ...options, executablePath: '/usr/bin/google-chrome' }));
  const site = (n, prenom, classe, version) => ({ n, id: 'script' + n, prenom, classe, url: U, urlParent: 'https://script.google.com/macros/s/PARENT/exec', version, derniere: version, appli: ctx.appli_(U, version), nouvelle: false, incomplet: false, versions: 3, maxVersions: 200, lienProjet: '' });
  const voir = async (mode, android, sites) => {
    const contexte = await browser.newContext({ userAgent: android ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36' : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1' });
    const page = await contexte.newPage();
    const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
    await contexte.route('**/*', r => {
      const u = r.request().url();
      if (u === 'https://installateur.test/') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (/soccaquiz\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(mode === null ? {} : { appli: mode }) });
      return r.fulfill({ status: 200, body: '' });
    });
    await page.addInitScript(etat => {
      const run = (ok) => new Proxy({}, { get: (_, nom) => nom === 'withSuccessHandler' ? f => run(f) : nom === 'withFailureHandler' ? () => run(ok) : () => setTimeout(() => ok && ok(nom === 'apiEtat' ? etat : {}), 0) });
      window.google = { script: { run: run(null) } };
    }, { installe: true, sites, classes: ctx.CLASSES || [], erreurGithub: '' });
    await page.goto('https://installateur.test/');
    await page.locator('a.lien-enfant').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    const vu = await page.evaluate(() => [].map.call(document.querySelectorAll('.site'), c => ({ titre: c.querySelector('.titre').textContent, bouton: c.querySelector('a.lien-enfant').textContent, lien: c.querySelector('a.lien-enfant').href, mail: (c.querySelector('.mail-enfant') || {}).dataset && c.querySelector('.mail-enfant').dataset.url, texte: c.textContent })));
    await contexte.close();
    return { vu, erreurs };
  };
  const deux = [site(0, 'Lana', 'CM1', 'v2.78'), site(1, '', 'CE2', 'v2.76'), site(2, 'Yan', 'adulte', 'v2.78')];
  let v = await voir('beta', true, deux);
  ok(v.vu.length === 3 && v.vu[0].titre === 'Lana' && /Envoyer le lien à Lana/.test(v.vu[0].texte) && /Envoyer le lien à mon enfant/.test(v.vu[1].texte) && v.vu[0].bouton === '▶ Site de Lana' && v.vu[1].bouton === '▶ Site de l\'enfant' && /Site n° 2/.test(v.vu[1].titre) && v.vu[2].bouton === '▶ Mes quiz' && v.vu[2].titre === 'Révisions de Yan' && !v.erreurs.length,
    'cartes : le prénom en titre (sans coche), « Site de <prénom> » et « Envoyer le lien à <prénom> » sur les boutons — ' + JSON.stringify(v.vu.map(x => [x.titre, x.bouton])) + v.erreurs.join(' | '));
  ok(v.vu[0].lien === A && v.vu[1].lien === U, 'bouton « Site de <prénom> » : l\'appli pour un site à jour (jamais l\'adresse Google directe), le lien habituel pour un site trop ancien');
  v = await voir('beta', false, deux);
  ok(v.vu[0].lien === A, 'iPhone aussi : le bouton ouvre l\'appli');
  v = await voir('on', false, deux);
  ok(v.vu[0].lien === A && v.vu[1].lien === U, '"appli": "on" : l\'appli pour tous les appareils');
  v = await voir('off', true, deux);
  const w = await voir(null, true, [site(0, 'Lana', 'CM1', 'v2.78')]);
  ok(v.vu[0].lien === U && w.vu[0].lien === A && /Site de Lana\s*: les quiz, sans compte/.test(w.vu[0].texte), '"appli": "off" : lien habituel ; réglage absent : l\'appli ; un seul site : l\'explication reprend « Site de Lana »');
  // première installation : étape 1 cachée si l'interrupteur est déjà activé, montrée sinon (ou si on ne sait pas)
  const premiere = async (api) => {
    const page = await browser.newPage();
    await page.route('**/*', r => r.request().url() === 'https://installateur.test/' ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : r.fulfill({ status: 200, body: '' }));
    await page.addInitScript(etat => {
      const run = (ok) => new Proxy({}, { get: (_, nom) => nom === 'withSuccessHandler' ? f => run(f) : nom === 'withFailureHandler' ? () => run(ok) : () => setTimeout(() => ok && ok(nom === 'apiEtat' ? etat : {}), 0) });
      window.google = { script: { run: run(null) } };
    }, { installe: false, sites: [], classes: ctx.CLASSES || [], erreurGithub: '', api });
    await page.goto('https://installateur.test/');
    await page.locator('#installer').waitFor({ state: 'visible', timeout: 5000 });
    const r = await page.evaluate(() => ({ e1: getComputedStyle(document.getElementById('e1')).display !== 'none', num: getComputedStyle(document.querySelector('#e2 .num')).display !== 'none' }));
    await page.close();
    return r;
  };
  const [pa, pb, pc] = [await premiere(true), await premiere(false), await premiere(null)];
  ok(!pa.e1 && !pa.num && pb.e1 && pb.num && pc.e1, 'page : carte « Active l\'API » cachée quand l\'interrupteur est déjà activé (une seule étape, sans numéro), affichée sinon — ' + JSON.stringify([pa, pb, pc]));
  // programme de la famille : carte « autorise ton site », attente, puis « C'est prêt » avec le lien du premier appareil
  {
    const page = await browser.newPage();
    const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
    await page.route('**/*', r => r.request().url() === 'https://installateur.test/' ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : r.fulfill({ status: 200, body: '' }));
    const fam = Object.assign(site(0, 'Lana', 'CM1', 'v3.0'), { famille: true, aAutoriser: true, lienProjet: 'https://script.google.com/home/projects/script9/edit', urlParent: 'https://app.soccaquiz.fr/parent/?s=AKfyX' });
    await page.addInitScript(etat => {
      let n = 0;
      const rep = nom => nom === 'apiEtat' ? etat : nom === 'apiAutorise' ? (++n < 2 ? { pret: false } : { pret: true, invitation: 'https://app.soccaquiz.fr/parent/?s=AKfyX#i=' + 'c'.repeat(64), urlParent: 'https://app.soccaquiz.fr/parent/?s=AKfyX' }) : {};
      const run = (ok) => new Proxy({}, { get: (_, nom) => nom === 'withSuccessHandler' ? f => run(f) : nom === 'withFailureHandler' ? () => run(ok) : () => setTimeout(() => ok && ok(rep(nom)), 0) });
      window.google = { script: { run: run(null) } };
    }, { installe: true, sites: [fam], classes: ctx.CLASSES || [], erreurGithub: '' });
    await page.goto('https://installateur.test/');
    await page.locator('.autoriser').waitFor({ timeout: 5000 });
    const avant = await page.evaluate(() => ({ lien: (document.querySelector('.autoriser a.btn') || {}).href, ajout: getComputedStyle(document.getElementById('ajout')).display }));
    await page.getByText("C'est prêt").waitFor({ timeout: 15000 }).catch(() => {});
    const apres = await page.evaluate(() => ({ prete: /C'est prêt/.test(document.body.textContent), invit: [].some.call(document.querySelectorAll('a.btn'), a => /#i=c{64}$/.test(a.href)), autoriser: !!document.querySelector('.autoriser') }));
    ok(avant.lien === fam.lienProjet && avant.ajout === 'none' && apres.prete && apres.invit && !apres.autoriser && !erreurs.length,
      'page, programme de la famille : « Ouvrir le programme » (éditeur), attente, puis « C\'est prêt » avec le lien de l\'espace parent ; pas de « Un autre site » — ' + JSON.stringify([avant, apres]) + erreurs.join(' | '));
    await page.close();
  }
  await browser.close();
}

console.log(echecs ? `[en ligne] ${echecs} échec(s)` : '[en ligne] tout est vert');
process.exit(echecs ? 1 : 0);
