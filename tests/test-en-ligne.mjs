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

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.UQ_CHARGE && spawnSync(process.execPath, [join(RACINE, 'outils', 'fabriquer-charge.mjs')], { stdio: 'inherit', env: { ...process.env, TAG: 'v-test' } }).status !== 0) process.exit(1);
let CHARGE = readFileSync(process.env.UQ_CHARGE || join(RACINE, 'dist', 'universal-quiz.json'), 'utf8');
if (process.env.UQ_CHARGE) CHARGE = JSON.stringify(Object.assign(JSON.parse(CHARGE), { version: 'v-test' }));

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
  if (quoi === 'deployments' && methode === 'GET' && sous) return sous in p.deploiements ? reponse(200, web(sous)) : reponse(404, { error: { code: 404, message: 'not found' } });
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

const cache = {};
const ctx = {
  console: { log: console.log, warn: console.warn, error: () => {} },   // les erreurs attendues ne polluent pas la sortie
  UrlFetchApp: { fetch: (url, o = {}) => /github\.com/.test(url) ? (github ? reponse(200, CHARGE) : reponse(503, 'indisponible')) : fausseApi(url, o) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
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
ok(!e.installe && e.derniere === 'v-test' && !e.sites.length, 'état initial : rien d\'installé, dernière version lue sur GitHub');

// 2. interrupteur non activé
let r = ctx.apiInstaller('Zoé');
ok(r.erreur === 'api' && !Object.keys(projets).length, 'API Apps Script non activée → message « active l\'interrupteur », rien de créé');

// 3. installation
apiActivee = true;
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
userProps.version = 'v0.9'; cache.derniere = 'v1.0';
ok(ctx.apiEtat().sites[0].nouvelle, 'nouvelle version proposée seulement si elle est plus grande');
cache.derniere = 'v0.8';
ok(!ctx.apiEtat().sites[0].nouvelle, 'version plus ancienne marquée « dernière » sur GitHub : pas proposée');
delete cache.derniere; userProps.version = 'v-test';

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
ok(/touche à nouveau « Mettre à jour »/.test(r.erreur), 'mise à jour arrêtée entre les deux espaces : il est dit de la relancer');
const t = ctx.traduire_(Object.assign(new Error('Script has reached the version limit of 200'), { scriptId: 'scriptX', n: 2 }));
ok(t.erreur === 'versions' && t.n === 2 && /scriptX/.test(t.lienProjet), 'limite des versions : carte « ménage » sur le bon site, lien vers le bon projet');

// 5. installation interrompue entre les deux publications : rien n'est créé en double
const avantInterruption = Object.keys(projets).length;
compte = 0;
panne = (m, u) => m === 'POST' && /deployments$/.test(u) && ++compte === 2 ? reponse(500, { error: { code: 500, message: 'Internal error' } }) : null;
let r2 = ctx.apiAjouterSite({ prenom: 'Paul', classe: 'CP' });
panne = null;
let aP = JSON.parse(userProps.autres)[0];
ok(r2.erreur && /Terminer l'installation/.test(r2.erreur) && aP && aP.scriptId && aP.deploymentId && !aP.deploymentIdParent && !aP.version, 'installation interrompue : le site et sa publication enfant sont enregistrés aussitôt');
e = ctx.apiEtat();
ok(e.sites.length === 2 && e.sites[1].incomplet && e.sites[1].id === aP.scriptId, 'état : site interrompu affiché « à terminer »');
r2 = ctx.apiMettreAJour({ n: 1, id: aP.scriptId });
aP = JSON.parse(userProps.autres)[0];
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
ok(r.erreur && /n'a pas pu être désactivé/.test(r.erreur) && JSON.parse(userProps.autres).length === 1, 'désactivation en échec : le site n\'est pas oublié');
r = ctx.apiRecommencer({ n: 1, id: aP.scriptId });
ok(r.ok && r.desactive && JSON.parse(userProps.autres).length === 0 && !Object.keys(projets[aP.scriptId].deploiements).length, 'désactivation réussie : publications supprimées, site oublié');

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
const bonneCharge = CHARGE, versionsAvant = projets[userProps.scriptId].versions;
CHARGE = JSON.stringify(Object.assign(JSON.parse(bonneCharge), { fichiers: JSON.parse(bonneCharge).fichiers.map(f => f.name === 'Code' ? Object.assign({}, f, { source: f.source.replace(/espace: '[^'\n]*'/, 'zone: \'\'') }) : f) }));
journal.length = 0;
r = ctx.apiMettreAJour();
CHARGE = bonneCharge;
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
const a1 = JSON.parse(userProps.autres)[0], codeLea = projets[a1.scriptId].contenu.find(f => f.name === 'Code').source;
ok(r2.ok && r2.n === 1 && Object.keys(projets).length === avantAjout + 1 && projets[a1.scriptId].titre === 'SoccaQuiz – Léa' && /nomDossier: 'SoccaQuiz – Léa',/.test(codeLea) && /classe: '6e',/.test(codeLea) && /prenom: 'Léa',/.test(codeLea)
  && userProps.scriptId === principal.id && r2.url !== principal.url, 'autre site : nouveau projet « SoccaQuiz – Léa », son propre dossier, sa classe ; le site principal est intact');
let r3 = ctx.apiAjouterSite({ prenom: '', classe: 'adulte' });
const a2 = JSON.parse(userProps.autres)[1];
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
ok(r.ok && r.n === 1 && JSON.parse(userProps.autres).length === 0 && userProps.scriptId === principal.id, 'onglet pas rechargé : c\'est bien le site désigné qui est supprimé, pas un autre');

// 9. effacer toutes les données de l'installateur : sites désactivés, puis tout effacé
r3 = ctx.apiAjouterSite({ prenom: 'Léo', classe: 'CM1' });
const deps = [userProps.deploymentId, JSON.parse(userProps.autres)[0].deploymentId];
r = ctx.apiEffacerTout();
ok(r.ok && !r.restes.length && !Object.keys(userProps).length && !(deps[0] in projets[principal.id].deploiements) && !(deps[1] in projets[r3.id].deploiements), 'tout effacer : chaque site désactivé, puis toutes les propriétés effacées');
ctx.doGet({ parameter: { recommencer: '1' } });
ok(!ctx.apiEtat().installe && Object.keys(projets).length > 0, '?recommencer=1 n\'existe plus (aucun effet)');

// 10. la page : HTML complet et script valide ; pas de journal d'erreur chez l'éditeur
const html = ctx.doGet({ parameter: {} }).html;
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';
let syntaxe = true; try { new vm.Script(script); } catch (err) { syntaxe = false; console.log(err); }
ok(/Installer mon site/.test(html) && /usersettings/.test(html) && syntaxe && !/<\/script/i.test(script), 'page de l\'installateur : contenu et script valides');
ok(/Effacer toutes mes données de l\\?'installateur/.test(html) && /apiEffacerTout/.test(html) && /ne le partage qu\\?'avec lui/.test(html), 'page : bouton « Effacer toutes mes données », pied de page exact');
const source = readFileSync(join(RACINE, 'en-ligne', 'Code.gs'), 'utf8');
ok(!/console\.(error|log)/.test(source) && !/recommencer === '1'/.test(source) && JSON.parse(readFileSync(join(RACINE, 'en-ligne', 'appsscript.json'), 'utf8')).exceptionLogging === 'NONE', 'aucun journal d\'erreur envoyé à l\'éditeur (exceptionLogging NONE, pas de console)');

console.log(echecs ? `[en ligne] ${echecs} échec(s)` : '[en ligne] tout est vert');
process.exit(echecs ? 1 : 0);
