/* =====================================================================
   UNIVERSAL QUIZ — INSTALLATEUR EN LIGNE (100 % depuis un téléphone)
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0 — usage commercial interdit.
   ---------------------------------------------------------------------
   Ce petit site est publié UNE SEULE FOIS par l'éditeur (compte soccaquiz),
   avec « Exécuter en tant que : l'utilisateur qui accède à l'application ».
   Quand un ami l'ouvre, tout se passe donc dans SON compte Google :
     1. il crée son propre projet Apps Script « SoccaQuiz » ;
     2. il y copie la dernière version du moteur, prise dans la Release GitHub ;
     3. il le publie en site web et lui en donne l'adresse.
   « Mettre à jour » refait 2 et 3 sur le même projet : l'adresse ne change pas.
   L'installateur ne touche ni au Drive ni aux fichiers de l'ami.
   Mise en place : voir en-ligne/LISEZMOI.md
   ===================================================================== */

const SOURCE_MOTEUR = 'https://github.com/leian/UNIVERSALQUIZ/releases/latest/download/universal-quiz.json';
const API_SCRIPT = 'https://script.googleapis.com/v1/projects';
const PAGE_API = 'https://script.google.com/home/usersettings';

function doGet(e) {
  // …/exec?recommencer=1 : oublie l'installation précédente de la personne connectée
  // (pour refaire un test complet ; son ancien site n'est ni modifié ni supprimé)
  if (e && e.parameter && e.parameter.recommencer === '1') PropertiesService.getUserProperties().deleteAllProperties();
  return HtmlService.createHtmlOutput(pageHtml_())
    .setTitle('Installer SoccaQuiz')
    .setFaviconUrl('https://leian.github.io/UNIVERSALQUIZ/icone.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- appelé par la page ---------------- */

/* ---------------- plusieurs sites par compte ----------------
   Site n° 0 = le site principal, rangé comme avant dans les propriétés de la personne (scriptId, url…).
   Sites suivants (autre enfant, révisions d'un parent) : tableau JSON dans la propriété « autres ».
   Chaque site a son propre projet, son dossier Drive (« SoccaQuiz – Prénom ») et son tableau des résultats. */
const CLES_SITE = ['scriptId', 'deploymentId', 'deploymentIdParent', 'url', 'urlParent', 'version', 'prenom', 'classe', 'classeAnnee', 'dossier'];
const CLASSES = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', '2de', '1re', 'Tle', 'adulte'];
function autres_() { try { return JSON.parse(PropertiesService.getUserProperties().getProperty('autres') || '[]'); } catch (e) { return []; } }
function lireSite_(n) {
  if (n > 0) return autres_()[n - 1] || null;
  const p = PropertiesService.getUserProperties().getProperties(), s = {};
  CLES_SITE.forEach(k => { if (p[k]) s[k] = p[k]; });
  return s;
}
function ecrireSite_(n, s) {
  const props = PropertiesService.getUserProperties();
  if (n > 0) { const a = autres_(); a[n - 1] = s; props.setProperty('autres', JSON.stringify(a)); return; }
  CLES_SITE.forEach(k => { if (s[k] != null && s[k] !== '') props.setProperty(k, String(s[k])); else props.deleteProperty(k); });
}
function oublierSite_(n) {
  if (n > 0) { const a = autres_(); a.splice(n - 1, 1); PropertiesService.getUserProperties().setProperty('autres', JSON.stringify(a)); }
  else ecrireSite_(0, {});
}
function nSite_(n) { n = parseInt(n, 10); return isFinite(n) && n > 0 ? n : 0; }
function anneeScolaire_(d) { d = d || new Date(); return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; }
function nettoyerClasse_(c) { c = String(c || ''); return CLASSES.indexOf(c) >= 0 ? c : ''; }

/* Ce que la page doit afficher : sites déjà installés, nouvelle version ? */
function apiEtat() {
  let derniere = '';
  try { derniere = moteur_().version; } catch (e) { return { erreur: e.message }; }
  const sites = [lireSite_(0)].concat(autres_()).map((s, n) => {
    if (!s || !s.scriptId) return null;
    // nombre de versions gardées par le site (200 au plus chez Google, impossibles à supprimer par l'API)
    let versions = 0; try { versions = nbVersions_(s.scriptId); } catch (e) {}
    return { n, prenom: s.prenom || '', classe: s.classe || '', url: s.url || '', urlParent: s.urlParent || '', version: s.version || '', derniere,
      versions, alerteVersions: versions >= ALERTE_VERSIONS, maxVersions: MAX_VERSIONS, lienProjet: lienProjet_(s.scriptId) };
  }).filter(Boolean);
  const p = sites.find(x => x.n === 0) || {};
  // champs du site principal à plat (pages et tests d'avant les sites multiples)
  return Object.assign({ installe: !!p.url, url: p.url || '', urlParent: p.urlParent || '', prenom: p.prenom || '', version: p.version || '', derniere,
    versions: p.versions || 0, alerteVersions: !!p.alerteVersions, maxVersions: MAX_VERSIONS, lienProjet: p.lienProjet || '' }, { sites, classes: CLASSES });
}

/* Versions : Google en garde 200 au plus par projet, et son API ne sait pas en supprimer (seulement l'éditeur,
   « Historique du projet » → suppression en masse). Chaque mise à jour en crée 2 (enfant + parent) :
   l'installateur prévient dès 170 et bloque proprement avant d'atteindre la limite. */
const MAX_VERSIONS = 200, ALERTE_VERSIONS = 170;
function nbVersions_(id) {
  let n = 0, page = '';
  do {
    const r = appel_('get', '/' + id + '/versions?pageSize=50' + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
    n += (r.versions || []).length; page = r.nextPageToken || '';
  } while (page);
  return n;
}
function lienProjet_(id) { return 'https://script.google.com/home/projects/' + encodeURIComponent(id) + '/edit'; }
function tropDeVersions_(id, n, site) { return { erreur: 'versions', versions: n, maxVersions: MAX_VERSIONS, lienProjet: lienProjet_(id), n: site || 0 }; }
/* Remarque : on ne peut pas savoir à l'avance si l'interrupteur « API Google Apps Script » est activé
   (Google répond « introuvable » avant de vérifier l'interrupteur). C'est l'installation qui le dit. */

/* Première installation (ou réinstallation si le projet a disparu). */
function apiInstaller(prenom, classe) {
  return avecVerrou_(() => {
    const s = lireSite_(0);
    if (!s.scriptId) {
      s.prenom = nettoyerPrenom_(prenom);
      const c = nettoyerClasse_(classe); if (c) { s.classe = c; s.classeAnnee = String(anneeScolaire_()); }
      ecrireSite_(0, s);
    }
    return publier_(false, 0);
  });
}

/* Un site de plus dans le même compte : autre enfant, ou révisions d'un parent (classe « adulte »).
   Il a son propre dossier Drive, donc ses propres quiz et résultats. */
function apiAjouterSite(d) {
  return avecVerrou_(() => {
    d = d || {};
    const classe = nettoyerClasse_(d.classe), prenom = nettoyerPrenom_(d.prenom);
    const tous = [lireSite_(0)].concat(autres_()).filter(Boolean);
    let nom = 'SoccaQuiz – ' + (prenom || (classe === 'adulte' ? 'Mes révisions' : 'Site ' + (tous.length + 1))), k = 2;
    const pris = tous.map(x => x.dossier || 'SoccaQuiz');
    while (pris.indexOf(nom) >= 0) nom = nom.replace(/ \(\d+\)$/, '') + ' (' + (k++) + ')';
    const a = autres_();
    a.push({ prenom, classe, classeAnnee: classe ? String(anneeScolaire_()) : '', dossier: nom });
    PropertiesService.getUserProperties().setProperty('autres', JSON.stringify(a));
    const r = publier_(false, a.length);
    if (r && r.erreur) { const b = autres_(); if (b[a.length - 1] && !b[a.length - 1].url) { b.splice(a.length - 1, 1); PropertiesService.getUserProperties().setProperty('autres', JSON.stringify(b)); } }
    return r;
  });
}

/* Tout recommencer : l'ancien site est désactivé (son déploiement est supprimé : son adresse ne répond plus),
   puis l'installateur l'oublie. La prochaine installation créera un nouveau site, à une nouvelle adresse.
   Les quiz et les résultats (dossier Drive et Sheets) ne sont pas touchés : le nouveau site les reprend.
   Le projet Apps Script de l'ancien site reste dans le Drive (l'API ne permet pas de le supprimer). */
function apiRecommencer(n) {
  n = nSite_(n);
  const s = lireSite_(n) || {}, id = s.scriptId;
  let desactive = false;
  [s.deploymentId, s.deploymentIdParent].forEach(dep => {
    if (!id || !dep) return;
    try { appel_('delete', '/' + id + '/deployments/' + dep); desactive = true; }
    catch (e) { if (e.code === 404) desactive = true; }      // déjà supprimé : même résultat
  });
  oublierSite_(n);
  return { ok: true, desactive, n };
}

/* Mise à jour : même projet, même adresse. */
function apiMettreAJour(n) {
  return avecVerrou_(() => publier_(true, nSite_(n)));
}

/* ---------------- le travail ---------------- */

function publier_(maj, n) {
  n = nSite_(n);
  const site = lireSite_(n) || {};
  const moteur = moteur_();
  const prenom = site.prenom || '';
  let id = site.scriptId;
  let dep = site.deploymentId;               // site de l'enfant
  let depP = site.deploymentIdParent;        // espace parent
  const avait = !!dep, avaitParent = !!depP;

  if (id) {
    try { appel_('get', '/' + id); }
    catch (e) { if (e.code === 404 || e.code === 403 && !/Apps Script API/i.test(e.message)) { id = null; } else throw e; }
  }
  if (!id) {
    id = appel_('post', '', { title: n ? site.dossier || 'SoccaQuiz' : 'SoccaQuiz' }).scriptId;
    site.scriptId = id; delete site.deploymentId; delete site.deploymentIdParent;
    ecrireSite_(n, site);
    dep = depP = null;
  } else {
    // place pour les versions de cette mise à jour (2, ou 4 s'il manque une publication) ?
    let nb = -1; try { nb = nbVersions_(id); } catch (e) {}
    if (nb >= 0 && nb + 2 + (dep ? 0 : 1) + (depP ? 0 : 1) > MAX_VERSIONS) return tropDeVersions_(id, nb, n);
  }

  // envoie le code d'un des deux espaces, en fait une version et la publie (sur sa publication existante si possible)
  const urls = { urlEnfant: dep ? site.url || '' : '', urlParent: depP ? site.urlParent || '' : '' };
  const description = 'SoccaQuiz ' + moteur.version;
  function deployer(espace, depId) {
    appel_('put', '/' + id + '/content', { files: fichiers_(moteur, prenom, { espace, urlEnfant: urls.urlEnfant, urlParent: urls.urlParent, classe: site.classe, classeAnnee: site.classeAnnee, dossier: n ? site.dossier : '' }) });
    const version = appel_('post', '/' + id + '/versions', { description: description + ' (' + espace + ')' }).versionNumber;
    const config = { versionNumber: version, manifestFileName: 'appsscript', description: description + ' – ' + (espace === 'parent' ? 'espace parent' : 'site de l\'enfant') };
    let d = null;
    if (depId) {
      try { d = appel_('put', '/' + id + '/deployments/' + depId, { deploymentConfig: Object.assign({ scriptId: id }, config) }); }
      catch (e) { if (e.code !== 404) throw e; }
    }
    return d || appel_('post', '/' + id + '/deployments', config);
  }

  // 1. crée les publications qui manquent : leurs adresses ne sont connues qu'une fois créées
  if (!dep) { const d = deployer('enfant', null); dep = d.deploymentId; urls.urlEnfant = urlSite_(d); }
  if (!depP) { const d = deployer('parent', null); depP = d.deploymentId; urls.urlParent = urlSite_(d); }
  // 2. publie les deux espaces, chacun connaissant l'adresse de l'autre
  const dE = deployer('enfant', dep), dP = deployer('parent', depP);
  const url = urlSite_(dE), urlParent = urlSite_(dP);

  Object.assign(site, { deploymentId: dE.deploymentId, deploymentIdParent: dP.deploymentId, url, urlParent, version: moteur.version });
  ecrireSite_(n, site);
  return { ok: true, n, prenom, classe: site.classe || '', url, urlParent, version: moteur.version, maj: !!maj && avait, nouveauParent: avait && !avaitParent };
}

/* fichiers du moteur, avec le prénom écrit dans les réglages de Code.gs */
function fichiers_(moteur, prenom, espace) {
  espace = espace || {};
  const propre = u => String(u || '').replace(/['\\\s]/g, '');
  const p = String(prenom).replace(/\\/g, '').replace(/'/g, '’');
  // le site saura quelle version il porte et où proposer la mise à jour
  const ici = String(ScriptApp.getService().getUrl() || '').replace(/'/g, '');
  const version = String(moteur.version).replace(/[^\w.\-]/g, '');
  return moteur.fichiers.map(f => f.name === 'Code'
    ? { name: f.name, type: f.type, source: f.source
        .replace(/prenom: '[^'\n]*',/, "prenom: '" + p + "',")
        .replace(/version: '[^'\n]*',/, "version: '" + version + "',")
        .replace(/installateur: '[^'\n]*'/, "installateur: '" + ici + "'")
        .replace(/espace: '[^'\n]*'/, "espace: '" + (espace.espace === 'parent' ? 'parent' : espace.espace === 'enfant' ? 'enfant' : '') + "'")
        .replace(/urlEnfant: '[^'\n]*'/, "urlEnfant: '" + propre(espace.urlEnfant) + "'")
        .replace(/urlParent: '[^'\n]*'/, "urlParent: '" + propre(espace.urlParent) + "'")
        .replace(/classe: '[^'\n]*'/, "classe: '" + nettoyerClasse_(espace.classe) + "'")
        .replace(/classeAnnee: \d+/, 'classeAnnee: ' + (parseInt(espace.classeAnnee, 10) || 0))
        .replace(/nomDossier: '[^'\n]*'/, m => espace.dossier ? "nomDossier: '" + String(espace.dossier).replace(/['\\\n]/g, '') + "'" : m) }
    : f.name === 'appsscript' && espace.espace ? { name: f.name, type: f.type, source: manifeste_(f.source, espace.espace) }
    : f);
}

/* l'espace parent n'est ouvert qu'au compte Google de la famille (« Seulement moi ») ; le site de l'enfant reste ouvert sans compte */
function manifeste_(source, espace) {
  const m = JSON.parse(source);
  m.webapp = Object.assign({}, m.webapp, { executeAs: 'USER_DEPLOYING', access: espace === 'parent' ? 'MYSELF' : 'ANYONE_ANONYMOUS' });
  return JSON.stringify(m, null, 2);
}

/* dernière version du moteur : fichier universal-quiz.json de la Release GitHub */
function moteur_() {
  const r = UrlFetchApp.fetch(SOURCE_MOTEUR, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('Impossible de récupérer le moteur sur GitHub (erreur ' + r.getResponseCode() + '). Réessaie dans quelques minutes.');
  const m = JSON.parse(r.getContentText('UTF-8'));
  if (!m || !Array.isArray(m.fichiers) || !m.fichiers.some(f => f.name === 'appsscript')) throw new Error('Le moteur publié sur GitHub est incomplet.');
  return m;
}

function urlSite_(d) {
  const e = (d.entryPoints || []).find(x => x.entryPointType === 'WEB_APP');
  return (e && e.webApp && e.webApp.url) || 'https://script.google.com/macros/s/' + d.deploymentId + '/exec';
}

/* appel à l'API Apps Script, au nom de la personne connectée */
function appel_(methode, chemin, corps) {
  const options = {
    method: methode,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (corps) { options.contentType = 'application/json'; options.payload = JSON.stringify(corps); }
  const r = UrlFetchApp.fetch(API_SCRIPT + chemin, options);
  const code = r.getResponseCode();
  let d = {};
  try { d = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
  if (code >= 300) {
    const e = new Error((d.error && d.error.message) || ('Erreur ' + code));
    e.code = code;
    throw e;
  }
  return d;
}

/* une seule installation à la fois par personne (double appui sur le bouton) + erreurs lisibles */
function avecVerrou_(f) {
  const verrou = LockService.getUserLock();
  if (!verrou.tryLock(1000)) return { erreur: 'Une installation est déjà en cours : patiente une minute puis recharge la page.' };
  try { return f(); }
  catch (e) { console.error(e); return traduire_(e); }
  finally { verrou.releaseLock(); }
}

function traduire_(e) {
  const m = String(e && e.message || e);
  if (/User has not enabled the Apps Script API/i.test(m)) return { erreur: 'api', message: "L'interrupteur « API Google Apps Script » n'est pas encore activé dans ton compte." };
  if (/has not been used in project|SERVICE_DISABLED/i.test(m)) return { erreur: "L'installateur n'est pas complètement configuré par son éditeur (API Apps Script du projet Google Cloud). Préviens la personne qui t'a envoyé le lien." };
  if (/version/i.test(m) && /limit|200/i.test(m)) { const id = PropertiesService.getUserProperties().getProperty('scriptId'); if (id) return tropDeVersions_(id, MAX_VERSIONS, 0); }
  return { erreur: m };
}

function nettoyerPrenom_(s) {
  return String(s || '').trim().slice(0, 40).replace(/[<>"`\\&$\r\n]/g, '');
}

/* ---------------- la page (mobile d'abord) ---------------- */
function pageHtml_() {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><base target="_top">' +
  '<style>' +
  ':root{--bg:#fff8ef;--card:#fff;--ink:#2a1f1a;--soft:#7a6658;--line:#eadfce;--accent:#c8102e;--ok:#15803d;--ko:#b91c1c}' +
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
  'main{max-width:560px;margin:0 auto;padding:20px 16px 40px}h1{font-size:1.6rem;text-align:center;margin:.2em 0}' +
  '.intro{text-align:center;color:var(--soft);margin:0 0 16px}' +
  '.etape{background:var(--card);border:2px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0}' +
  '.etape.active{border-color:var(--accent)}.etape h2{font-size:1.05rem;margin:0 0 6px;display:flex;gap:10px;align-items:center}' +
  '.num{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-size:.95rem;flex:none}' +
  '.btn{display:inline-block;font:600 1rem system-ui,sans-serif;border:none;border-radius:999px;padding:12px 20px;cursor:pointer;background:var(--accent);color:#fff;text-decoration:none;margin-top:6px}' +
  '.btn.leger{background:var(--card);color:var(--ink);border:2px solid var(--line)}.btn:disabled{opacity:.6}' +
  'input,select{font:inherit;width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;margin:6px 0;background:#fff;color:var(--ink)}summary.btn{list-style:none}summary.btn::-webkit-details-marker{display:none}.site h2 .cl{font-size:.85rem;font-weight:500;color:var(--soft)}' +
  '.petit{font-size:.9rem;color:var(--soft)}.ok{border-left:5px solid var(--ok);padding:10px 14px;background:#ecfdf3;border-radius:10px}' +
  '.ko{border-left:5px solid var(--ko);padding:10px 14px;background:#fef2f2;border-radius:10px}.cache{display:none}' +
  '.actions{display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin:8px 0}.maj{background:#eff6ff;border:2px solid #bfdbfe;border-radius:12px;padding:10px 14px;margin:10px 0}' +
  '.retour{margin:12px 0 0;padding:10px 14px;background:#ecfdf3;border-left:5px solid var(--ok);border-radius:10px;font-size:.95rem}.marque{display:flex;align-items:center;justify-content:center;gap:12px}.marque img{border-radius:13px}.marque em{font-style:normal;color:#b3001b}details.avance{margin-top:14px}details.avance summary{cursor:pointer;color:var(--soft);font-size:.9rem}details.avance a{color:var(--soft)}' +
  '</style></head><body><main>' +
  '<h1 class="marque"><img src="https://leian.github.io/UNIVERSALQUIZ/icone-96.png" width="56" height="56" alt=""><span>Socca<em>Quiz</em></span></h1><p class="intro" id="intro">Crée le site de quiz de ton enfant, dans ton propre compte Google. Gratuit, environ 5 minutes.</p>' +
  '<div id="chargement" class="petit" style="text-align:center">Chargement…</div>' +

  '<div id="nouveau" class="cache">' +
  '<section class="etape" id="e1"><h2><span class="num">1</span> Active l\'API Apps Script</h2>' +
  '<div id="e1-alerte"></div><div id="e1-afaire"><p>Une seule fois : touche le bouton, puis mets l\'interrupteur <b>« API Google Apps Script »</b> sur <b>Activé</b>.</p>' +
  '<a class="btn" href="' + PAGE_API + '" target="_blank" rel="noopener">Ouvrir la page Google</a>' +
  '<div class="retour"><b>↩️ Ensuite, tu vas revenir sur le mail : c\'est normal.</b> Une fois l\'interrupteur activé, la flèche retour ← te ramène au mail d\'invitation, pas ici. Dans le mail, fais l\'<b>étape 2</b> : touche à nouveau « Installer SoccaQuiz ».<br><span class="petit">Sur ordinateur, la page Google s\'ouvre dans un autre onglet : reviens simplement sur celui-ci.</span></div>' +
  '<p class="petit" style="margin:6px 0 0">Déjà fait ? Passe directement à l\'étape 2.</p></div></section>' +
  '<section class="etape" id="e2"><h2><span class="num">2</span> Installe le site</h2>' +
  '<label for="prenom">Prénom de l\'enfant (facultatif)</label><input id="prenom" maxlength="40" autocomplete="off" placeholder="ex. Tom">' +
  '<label for="classe">Classe (facultatif : le site s\'habille selon l\'âge)</label>' + choixClasse_('classe') +
  '<button class="btn" id="installer" type="button">✨ Installer mon site</button></section>' +
  '</div>' +

  '<div id="deja" class="cache"><div id="sites"></div>' +
  '<section class="etape" id="ajout"><h2>➕ Un autre site</h2>' +
  '<p class="petit" style="margin:0 0 6px">Un site par enfant, ou un site pour tes propres révisions : chacun a ses quiz, ses résultats et son adresse.</p>' +
  '<details id="ajout-form"><summary class="btn leger">Créer un autre site</summary>' +
  '<label for="prenom2">Prénom</label><input id="prenom2" maxlength="40" autocomplete="off" placeholder="ex. Léa">' +
  '<label for="classe2">Classe</label>' + choixClasse_('classe2') +
  '<button class="btn" id="ajouter-site" type="button">✨ Créer ce site</button></details></section></div>' +

  '<div id="resultat" aria-live="polite"></div>' +
  '<p class="petit" style="text-align:center;margin-top:24px">Tes quiz et les résultats restent dans ton compte : personne d\'autre ne les voit.<br>Licence PolyForm Noncommercial — usage commercial interdit.</p>' +
  '</main><script>' + scriptPage_() + '</script></body></html>';
}

/* liste des classes (le choix « adulte » = site pour les révisions d'un parent) */
function choixClasse_(id) {
  const groupes = [['Maternelle', 0, 3], ['Élémentaire', 3, 8], ['Collège', 8, 12], ['Lycée', 12, 15]];
  return '<select id="' + id + '"><option value="">— Choisir —</option>' +
    groupes.map(g => '<optgroup label="' + g[0] + '">' + CLASSES.slice(g[1], g[2]).map(c => '<option>' + c + '</option>').join('') + '</optgroup>').join('') +
    '<optgroup label="Adulte"><option value="adulte">Pour moi (révisions d\'un adulte)</option></optgroup></select>';
}

function scriptPage_() {
  return '(' + String(function () {
    var $ = function (id) { return document.getElementById(id); };
    var h = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
    var res = $('resultat');
    // première installation : l'autorisation à donner une seule fois, en ouvrant le site
    var AUTORISER = '<div class="ok"><p><b>Dernière étape, une seule fois :</b> touche « ▶ Site de l\'enfant ». Google demande d\'autoriser « SoccaQuiz » :</p>' +
      '<ol><li>« Examiner les autorisations », puis choisis ton compte ;</li>' +
      '<li>« Google n\'a pas validé cette application » : touche <b>Paramètres avancés</b>, puis <b>Accéder à SoccaQuiz (non sécurisé)</b> ;</li>' +
      '<li>coche <b>Tout sélectionner</b>, puis <b>Continuer</b>.</li></ol>' +
      '<p class="petit" style="margin:0">Ce site t\'appartient : il ne se sert que de son dossier « SoccaQuiz » et de son tableau des résultats, dans ton Drive. Une fois dessus, mets-le en favori.</p>' +
      '<p style="margin:8px 0 0">Ensuite, pour <b>ajouter des quiz et suivre les résultats</b>, utilise « 🔒 Espace parent » (mets-le aussi en favori). Ton enfant, lui, n\'utilise que le lien « Site de l\'enfant ».</p></div>';
    // le lien est mis dans le mail et copié en plus. La page est dans un cadre de Google : on ouvre la messagerie
    // dans une nouvelle fenêtre (un mailto: direct y est bloqué), et on propose Gmail en ligne si rien ne s'ouvre
    var OBJET_ENFANT = 'Ton site de quiz pour réviser';
    function texteEnfant(url) { return 'Coucou !\n\nVoici ton site de quiz pour réviser tes leçons :\n' + url + '\n\nMets-le en favori pour le retrouver facilement.\n\nBonnes révisions !'; }
    function mailEnfant(url) { return 'mailto:?subject=' + encodeURIComponent(OBJET_ENFANT) + '&body=' + encodeURIComponent(texteEnfant(url)); }
    function gmailEnfant(url) { return 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(OBJET_ENFANT) + '&body=' + encodeURIComponent(texteEnfant(url)); }
    function copier(t) {
      try { navigator.clipboard.writeText(t); return; } catch (e) {}
      var x = document.createElement('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0';
      document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove();
    }
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('#mail-enfant, .mail-enfant');
      if (!a || !a.dataset.url) return;
      ev.preventDefault();
      var url = a.dataset.url;
      copier(url);
      try { window.open(mailEnfant(url), '_blank'); } catch (e) {}
      var info = a.parentNode.querySelector('.info-mail');
      if (!info) { info = document.createElement('p'); info.className = 'petit info-mail'; a.parentNode.appendChild(info); }
      info.innerHTML = '✅ Lien copié. Ta messagerie ne s\'est pas ouverte ? <a href="' + h(gmailEnfant(url)) + '" target="_blank" rel="noopener">Écrire le mail dans Gmail</a>, ou colle le lien dans un message.';
    });
    var ETAT = { sites: [] };
    function carte(n) { return document.querySelector('.site[data-n="' + n + '"]'); }
    function zoneMsg(n) { var c = carte(n); return c ? c.querySelector('.msg') : res; }
    function erreur(r, n) {
      if (r && r.erreur === 'versions') { zoneMsg(r.n != null ? r.n : n || 0).innerHTML = carteMenage(r, true); return; }
      if (r && r.erreur === 'api') {
        $('e1-alerte').innerHTML = '<div class="ko" style="margin-bottom:8px">' + h(r.message) + ' Fais cette étape, puis reviens et touche à nouveau « Installer mon site » (Google peut demander une minute).</div>';
        afficherNouveau(true);
      } else {
        res.innerHTML = '<div class="ko">😕 ' + h((r && (r.erreur || r.message)) || r) + '</div>';
      }
    }
    // fn : apiInstaller (premier site), apiAjouterSite, apiMettreAJour (n = numéro du site)
    function lancer(fn, arg, bouton, n) {
      var enPlace = fn === 'apiMettreAJour';          // une mise à jour s'affiche dans la carte du site, pas en dessous
      var zone = enPlace ? zoneMsg(n) : res;
      bouton.disabled = true; res.innerHTML = '';
      zone.innerHTML = '<p class="petit">' + (enPlace ? 'Mise à jour' : 'Installation') + ' en cours… (environ 30 secondes, ne ferme pas la page)</p>';
      var appel = google.script.run
        .withSuccessHandler(function (r) {
          bouton.disabled = false;
          if (!r || r.erreur) { zone.innerHTML = ''; return erreur(r, n); }
          zone.innerHTML = ''; res.innerHTML = '';
          var s = { n: r.n || 0, prenom: r.prenom || '', classe: r.classe || '', url: r.url, urlParent: r.urlParent, version: r.version, derniere: r.version };
          var i = -1; ETAT.sites.forEach(function (x, k) { if (x.n === s.n) i = k; });
          if (i >= 0) ETAT.sites[i] = s; else ETAT.sites.push(s);
          afficherSites();
          zoneMsg(s.n).innerHTML = r.maj ? '<div class="ok"><p style="margin:0">Version ' + h(r.version || '') + ' installée. L\'adresse du site ne change pas.</p>' +
              (r.nouveauParent ? '<p style="margin:8px 0 0"><b>Nouveau : ton espace parent.</b> « Ajouter un quiz » et le suivi des résultats ne sont plus accessibles depuis le lien de ton enfant. Ils sont dans « 🔒 Espace parent », qui ne s\'ouvre qu\'avec ton compte Google : mets-le en favori.</p>' : '') + '</div>' : AUTORISER;
          var c = carte(s.n); if (c && fn !== 'apiInstaller') c.scrollIntoView({ behavior: 'smooth', block: 'start' });
          carte(s.n).querySelector('h2 .titre').textContent = r.maj ? '🎉 ' + titreSite(s) + ' : à jour' : '🎉 ' + titreSite(s) + ' : créé !';
        })
        .withFailureHandler(function (e) { bouton.disabled = false; zone.innerHTML = ''; erreur(e && e.message, n); });
      if (fn === 'apiInstaller') appel.apiInstaller(arg.prenom, arg.classe); else appel[fn](arg);
    }
    // Ménage des versions : Google en garde 200 au plus par site et seul l'éditeur sait les supprimer
    function carteMenage(e, bloque) {
      return '<div class="' + (bloque ? 'ko' : 'maj') + '" style="margin-bottom:10px"><p style="margin:0 0 6px"><b>🧹 Petit ménage à faire (2 minutes, plus simple sur ordinateur)</b></p>' +
        '<p style="margin:0 0 6px">Ce site garde une copie de chaque mise à jour : il en a <b>' + h(e.versions) + ' sur ' + h(e.maxVersions || 200) + '</b> au maximum autorisé par Google. ' +
        (bloque ? 'Il n\'y a plus de place pour la mise à jour : fais ce ménage, puis touche à nouveau « Mettre à jour ».' : 'Au-delà, les mises à jour ne passeront plus.') + '</p>' +
        '<ol style="margin:0 0 6px;padding-left:20px"><li>Ouvre le programme du site : <a class="btn leger" href="' + h(e.lienProjet) + '" target="_blank" rel="noopener">Ouvrir le programme SoccaQuiz</a></li>' +
        '<li>Dans la barre de gauche, clique sur l\'horloge <b>« Historique du projet »</b>.</li>' +
        '<li>En bas à droite, clique sur la corbeille <b>« Supprimer des versions en masse »</b>.</li>' +
        '<li>Coche <b>tout</b>, puis <b>Supprimer</b> et confirme. Les versions utilisées par le site ne sont pas proposées : il continue de fonctionner.</li>' +
        '<li>Reviens ici et recharge la page.</li></ol>' +
        '<p class="petit" style="margin:0">Ne modifie rien d\'autre dans le programme.</p></div>';
    }
    function titreSite(s) { return s.classe === 'adulte' ? (s.prenom ? 'Révisions de ' + s.prenom : 'Mes révisions') : s.prenom ? 'Site de ' + s.prenom : (s.n ? 'Site n° ' + (s.n + 1) : 'Ton site est prêt'); }
    function carteSite(s, seul) {
      var adulte = s.classe === 'adulte', aJour = !s.derniere || s.version === s.derniere;
      return '<section class="etape site" data-n="' + s.n + '"><h2><span class="titre">✅ ' + h(titreSite(s)) + '</span>' + (s.classe && !adulte ? ' <span class="cl">' + h(s.classe) + '</span>' : '') + '</h2>' +
        '<div class="msg">' + (s.alerteVersions ? carteMenage(s, false) : '') + '</div>' +
        '<div class="actions"><a class="btn" href="' + h(s.url) + '">▶ ' + (adulte ? 'Mes quiz' : 'Site de l\'enfant') + '</a>' +
        (s.urlParent ? '<a class="btn leger" href="' + h(s.urlParent) + '">🔒 Espace parent</a>' : '') +
        (adulte ? '' : '<a class="btn leger mail-enfant" href="#" data-url="' + h(s.url) + '">✉️ Envoyer le lien à mon enfant</a>') + '</div>' +
        (seul && s.urlParent ? '<p class="petit" style="margin:4px 0 8px"><b>Site de l\'enfant</b> : les quiz, sans compte, c\'est le lien à lui envoyer. <b>Espace parent</b> : ajouter des quiz, suivre les résultats ; il ne s\'ouvre qu\'avec ton compte Google.</p>' : '') +
        (aJour ? '<p class="petit">Version ' + h(s.version || '?') + ' : c\'est la dernière.</p>'
          : '<div class="maj"><p style="margin:0">🔄 <b>Nouvelle version disponible : ' + h(s.derniere) + '</b>' + (s.version ? ' (tu as la ' + h(s.version) + ')' : '') + '</p><button class="btn" data-action="maj" type="button">🔄 Mettre à jour ce site</button>' +
            '<p class="petit" style="margin:6px 0 0">Son adresse, ses quiz et ses résultats ne changent pas.</p></div>') +
        '<details class="avance"><summary>Options avancées</summary>' +
        '<p class="petit"><a href="#" data-action="reinstaller">Réinstaller la dernière version</a> (si ce site fonctionne mal)</p>' +
        '<p class="petit"><a href="#" data-action="recommencer">' + (s.n ? 'Supprimer ce site' : 'Repartir de zéro (créer un nouveau site)') + '</a></p>' +
        '<div class="confirmer cache ko"><p><b>Ce site sera désactivé :</b> son adresse ne fonctionnera plus, y compris le lien envoyé et les favoris.' + (s.n ? '' : ' Tu pourras ensuite installer un <b>nouveau site, qui aura une nouvelle adresse</b>.') + '</p><p><b>Ses quiz et ses résultats sont conservés</b> dans ton Drive' + (s.n ? '.' : ' : le nouveau site les reprendra automatiquement.') + '</p>' +
        '<button class="btn" data-action="oui-recommencer" type="button">Oui, désactiver ce site</button> <button class="btn leger" data-action="non-recommencer" type="button">Annuler</button></div>' +
        '</details></section>';
    }
    function afficherSites() {
      $('nouveau').style.display = 'none'; $('deja').style.display = 'block';
      $('intro').textContent = ETAT.sites.length > 1 ? 'Tes sites de quiz, dans ton propre compte Google.' : 'Ton site de quiz, dans ton propre compte Google.';
      $('sites').innerHTML = ETAT.sites.map(function (s) { return carteSite(s, ETAT.sites.length === 1); }).join('');
    }
    // apiKo : l'installation vient d'échouer parce que l'interrupteur n'est pas activé → l'étape 1 est mise en avant
    function afficherNouveau(apiKo) {
      $('nouveau').style.display = 'block';
      $('e1').className = 'etape' + (apiKo ? ' active' : '');
      $('e2').className = 'etape' + (apiKo ? '' : ' active');
      if (apiKo) $('e1').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('installer').onclick = function () { lancer('apiInstaller', { prenom: $('prenom').value, classe: $('classe').value }, $('installer'), 0); };
    $('ajouter-site').onclick = function () {
      if (!$('prenom2').value.trim() && $('classe2').value !== 'adulte') { res.innerHTML = '<div class="ko">Indique le prénom de l\'enfant (ou choisis « Pour moi » dans la classe).</div>'; return; }
      lancer('apiAjouterSite', { prenom: $('prenom2').value, classe: $('classe2').value }, $('ajouter-site'));
      $('ajout-form').open = false; $('prenom2').value = '';
    };
    $('sites').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-action]'); if (!b) return;
      var c = b.closest('.site'), n = +c.dataset.n, a = b.dataset.action;
      ev.preventDefault();
      if (a === 'maj' || a === 'reinstaller') lancer('apiMettreAJour', n, b, n);
      else if (a === 'recommencer') c.querySelector('.confirmer').style.display = 'block';
      else if (a === 'non-recommencer') c.querySelector('.confirmer').style.display = 'none';
      else if (a === 'oui-recommencer') google.script.run.withSuccessHandler(function (r) {
        ETAT.sites = ETAT.sites.filter(function (x) { return x.n !== n; }).map(function (x) { return x.n > n && n > 0 ? Object.assign({}, x, { n: x.n - 1 }) : x; });
        var principal = ETAT.sites.some(function (x) { return x.n === 0; });
        if (ETAT.sites.length) afficherSites(); else $('deja').style.display = 'none';
        if (!principal) { afficherNouveau(false); $('intro').textContent = 'Crée le site de quiz de ton enfant, dans ton propre compte Google. Gratuit, environ 5 minutes.'; }
        res.innerHTML = '<div class="ok"><p style="margin:0 0 6px"><b>' + (r && r.desactive ? '✅ Le site est désactivé : son adresse ne fonctionne plus.' : '✅ C\'est fait.') + '</b> Ses quiz et ses résultats sont conservés.</p>' +
          '<p class="petit" style="margin:0">Il reste son programme « SoccaQuiz » sur <a href="https://script.google.com/home" target="_blank" rel="noopener">script.google.com</a> : tu peux le mettre à la corbeille (⋮ → Supprimer), il ne sert plus.' + (principal ? '' : ' Installe maintenant ton nouveau site ci-dessus.') + '</p></div>';
      }).withFailureHandler(function (e) { erreur(e && e.message, n); }).apiRecommencer(n);
    });
    google.script.run
      .withSuccessHandler(function (e) {
        $('chargement').style.display = 'none';
        if (e && e.erreur) { $('nouveau').style.display = 'block'; return erreur(e); }
        ETAT.sites = e.sites || [];
        if (ETAT.sites.length) afficherSites();
        if (!e.installe) afficherNouveau(false);
      })
      .withFailureHandler(function (e) { $('chargement').style.display = 'none'; erreur(e && e.message); })
      .apiEtat();
  }) + ')();';
}
