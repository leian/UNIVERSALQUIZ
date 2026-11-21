/* =====================================================================
   SOCCAQUIZ (ex-Universal Quiz) — INSTALLATEUR EN LIGNE (100 % depuis un téléphone)
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0 — usage commercial interdit.
   ---------------------------------------------------------------------
   Ce petit site est publié UNE SEULE FOIS par l'éditeur (compte soccaquiz),
   avec « Exécuter en tant que : l'utilisateur qui accède à l'application ».
   Quand un ami l'ouvre, tout se passe donc dans SON compte Google :
     1. il crée son propre projet Apps Script par site (« SoccaQuiz », « SoccaQuiz – Léa »…) ;
     2. il y copie la dernière version du moteur, prise dans la Release GitHub ;
     3. il le publie deux fois (site de l'enfant, espace parent) et lui en donne les adresses.
   « Mettre à jour » refait 2 et 3 sur le même projet : les adresses ne changent pas.
   L'installateur n'utilise pas l'API Google Drive et ne lit aucun fichier de l'ami
   (seul le projet créé apparaît dans son Drive, comme tout projet Apps Script).
   Mise en place : voir en-ligne/LISEZMOI.md
   ===================================================================== */

const SOURCE_MOTEUR = 'https://github.com/leian/UNIVERSALQUIZ/releases/latest/download/universal-quiz.json';
const API_SCRIPT = 'https://script.googleapis.com/v1/projects';
const PAGE_API = 'https://script.google.com/home/usersettings';
const PLUSIEURS_COMPTES = 'Plusieurs comptes Google sont peut-être ouverts dans ce navigateur : ouvre ce lien dans une fenêtre de navigation privée, ou déconnecte les autres comptes.';

function doGet(e) {
  // autorisation donnée en décochant une case (écran de Google « granulaire ») : Google la redemande tout de suite,
  // au lieu de « Request had insufficient authentication scopes » au moment de publier ou de supprimer
  if (ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  // …?supprime=<scriptId> : retour de l'espace parent après « Supprimer » (ménage du Drive fait) → dernière étape ici
  const id = String((e && e.parameter && e.parameter.supprime) || '');
  let suppr = null;
  const cadre = String((e && e.parameter && e.parameter.cadre) || '') === '1';
  if (/^[\w-]{6,120}$/.test(id)) { const s = [lireSite_(0)].concat(autres_()).find(x => x && x.scriptId === id); if (s) suppr = { id, prenom: s.prenom || '', classe: s.classe || '', cadre }; }
  // …?d=v2.75 : dernière version vue par l'espace parent (voir apiEtat)
  const d = String((e && e.parameter && e.parameter.d) || '');
  const page = HtmlService.createHtmlOutput(pageHtml_(suppr, /^v?\d+(\.\d+){0,3}$/.test(d) ? d : ''));
  // suppression lancée depuis l'espace parent : il charge cette page dans un cadre invisible pour finir sans changer de page.
  // Sans danger : la fin automatique n'agit que sur un site qui ne répond déjà plus (voir apiRecommencer)
  if (suppr && cadre) page.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return page
    .setTitle('Installer SoccaQuiz')
    .setFaviconUrl('https://leian.github.io/UNIVERSALQUIZ/icone.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- plusieurs sites par compte ----------------
   Site n° 0 = le site principal, rangé comme avant dans les propriétés de la personne (scriptId, url…).
   Sites suivants (autre enfant, révisions d'un parent) : tableau JSON dans la propriété « autres ».
   Chaque site a son propre projet, son dossier Drive (« SoccaQuiz – Prénom ») et son tableau des résultats.
   La page désigne un site par { n, id } : id (scriptId) fait foi, le rang n peut avoir changé entre-temps. */
const CLES_SITE = ['scriptId', 'deploymentId', 'deploymentIdParent', 'url', 'urlParent', 'version', 'prenom', 'classe', 'classeAnnee', 'dossier', 'modele', 'invit', 'invitExp', 'invitH', 'cleInst'];
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
  const a = autres_(), props = PropertiesService.getUserProperties();
  if (n > 0) a.splice(n - 1, 1);
  else ecrireSite_(0, a.length ? a.shift() : {});   // site principal supprimé : le suivant prend sa place (il garde son dossier « SoccaQuiz – Prénom »)
  if (a.length) props.setProperty('autres', JSON.stringify(a)); else props.deleteProperty('autres');
  // plus aucun site : l'installateur ne garde plus rien sur cette personne (droit à l'effacement)
  if (!props.getProperty('scriptId') && !a.length) props.deleteAllProperties();
}
function nSite_(n) { n = parseInt(n, 10); return isFinite(n) && n > 0 ? n : 0; }
/* rang actuel du site désigné par la page ; refuse si le projet désigné n'est plus là (deux onglets ouverts…) */
function trouverSite_(ref) {
  const tous = [lireSite_(0)].concat(autres_());
  if (ref && typeof ref === 'object' && ref.id) {
    const n = tous.findIndex(s => s && s.scriptId === String(ref.id));
    if (n < 0) throw erreurFr_('Ce site a changé entre-temps (supprimé dans un autre onglet ?) : recharge la page.');
    return n;
  }
  const n = nSite_(ref && typeof ref === 'object' ? ref.n : ref);
  if (n > 0 && !tous[n]) throw erreurFr_('Ce site est introuvable : recharge la page.');
  return n;
}
function anneeScolaire_(d) { d = d || new Date(); return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; }
function nettoyerClasse_(c) { c = String(c || ''); return CLASSES.indexOf(c) >= 0 ? c : ''; }
function erreurFr_(m) { const e = new Error(m); e.fr = true; return e; }
/* a plus récente que b ? (v2.10 > v2.9 ; v2.1-test = v2.1 ; une version sans numéro n'est jamais « plus récente ») */
function plusRecente_(a, b) {
  const p = v => (String(v || '').match(/\d+/g) || []).map(Number), x = p(a), y = p(b);
  if (!x.length) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}

/* Adresse de l'appli installable pour un site de l'enfant (…/app/?s=<identifiant de son déploiement>), ou '' :
   le site doit avoir le « mode cadre » (v2.77 et suivantes), sinon l'appli attendrait 15 s avant d'ouvrir le site classique.
   La page ne s'en sert que si docs/soccaquiz.json l'autorise ("appli": "on", ou "beta" sur Android). */
const INSTALLATEUR_V = '21-11 F';   // repère affiché en bas de la page : changer à chaque modification à recoller
const VERSION_APPLI = 'v2.77', URL_APPLI = 'https://leian.github.io/app/?s=';
function appli_(url, version) {
  const m = String(url || '').match(/^https:\/\/script\.google\.com\/macros\/s\/(AKfy[\w-]{20,200})\/exec$/);
  return m && /\d/.test(String(version || '')) && !plusRecente_(VERSION_APPLI, version) ? URL_APPLI + m[1] : '';
}

/* Ce que la page doit afficher : sites déjà installés, nouvelle version ?
   Les sites sont toujours renvoyés, même si GitHub ne répond pas (derniere = ''). */
function apiEtat(indice) {
  let derniere = '', erreurGithub = '';
  // indice.d : dernière version vue par l'espace parent qui envoie ici (« Mettre à jour mon site depuis l'installateur ») ;
  // plus récente que notre mémoire de 10 min → on relit GitHub, pour ne jamais dire « c'est la dernière » à tort
  const vue = indice && /^v?\d+(\.\d+){0,3}$/.test(String(indice.d || '')) ? String(indice.d) : '';
  try { derniere = derniereVersion_(); if (vue && plusRecente_(vue, derniere)) derniere = moteur_().version; } catch (e) { erreurGithub = String(e.message || e); }
  const sites = [lireSite_(0)].concat(autres_()).map((s, n) => {
    if (!s || !s.scriptId) return null;
    // version réellement publiée (description des deux publications), plutôt que celle retenue ici :
    // l'espace parent affiche la version de son propre code, les deux pages disent donc la même chose
    const reelle = s.version ? versionPubliee_(s) : '';      // installation inachevée : reste « à terminer »
    if (reelle && reelle !== s.version) { s.version = reelle; try { ecrireSite_(n, s); } catch (e) {} }
    // nombre de versions gardées par le site (200 au plus chez Google, impossibles à supprimer par l'API)
    let versions = 0; try { versions = nbVersions_(s.scriptId); } catch (e) {}
    // programme de la famille (chantier « sans alerte ») : autorisé dans l'éditeur ? (le site répond seulement une fois autorisé)
    const fam = s.modele === 'famille', aAutoriser = fam && !!s.version && !siteAutorise_(s);
    return { n, id: s.scriptId, prenom: s.prenom || '', classe: s.classe || '', url: s.url || '', urlParent: fam ? lienParentFamille_(s) : s.urlParent || '', version: s.version || '', derniere, appli: appli_(s.url, s.version),
      famille: fam, aAutoriser, migration: !fam && !!s.version && !!MOTEUR_FAMILLE_,
      nouvelle: !!s.version && plusRecente_(derniere, s.version), incomplet: !s.version,
      versions, alerteVersions: versions >= ALERTE_VERSIONS, maxVersions: MAX_VERSIONS, lienProjet: lienProjet_(s.scriptId) };
  }).filter(Boolean);
  const p = sites.find(x => x.n === 0) || {};
  // aucun site encore : l'interrupteur « API Google Apps Script » est-il déjà activé (étape 1 du mail) ?
  // true → la page cache l'étape 1 ; false ou null (on ne sait pas) → elle la montre
  const api = sites.length ? true : apiActivee_();
  // champs du site principal à plat (pages et tests d'avant les sites multiples)
  return Object.assign({ installe: !!p.id, url: p.url || '', urlParent: p.urlParent || '', prenom: p.prenom || '', version: p.version || '', derniere,
    versions: p.versions || 0, alerteVersions: !!p.alerteVersions, maxVersions: MAX_VERSIONS, lienProjet: p.lienProjet || '' }, { sites, classes: CLASSES, erreurGithub, api });
}

/* Google ne donne pas l'état de l'interrupteur : on fait une lecture sans effet (projet qui n'existe pas).
   Interrupteur coupé → 403 « User has not enabled the Apps Script API » ; activé → 404 (ou autre erreur banale). */
function apiActivee_() {
  try { appel_('get', '/verification-interrupteur'); return true; }
  catch (e) {
    const m = String(e && e.message || e);
    if (/User has not enabled the Apps Script API/i.test(m)) return false;
    return e && e.code ? true : null;      // réponse de Google sans rapport avec l'interrupteur → activé ; pas de réponse → on ne sait pas
  }
}

/* Versions : Google en garde 200 au plus par projet, et son API ne sait pas en supprimer (seulement l'éditeur,
   « Historique du projet » → suppression en masse). Chaque mise à jour en crée 2 (enfant + parent) :
   l'installateur prévient dès 170 et bloque proprement avant d'atteindre la limite. */
const MAX_VERSIONS = 200, ALERTE_VERSIONS = 170;
/* la plus ancienne des versions publiées sur les deux adresses du site (« SoccaQuiz v2.75 – … » dans leur description) ;
   '' si l'API ne répond pas ou si la description est inconnue (on garde alors la version retenue) */
function versionPubliee_(s) {
  try {
    const r = appel_('get', '/' + s.scriptId + '/deployments?pageSize=50');
    const vs = (r.deployments || []).filter(d => d && (d.deploymentId === s.deploymentId || d.deploymentId === s.deploymentIdParent))
      .map(d => String((d.deploymentConfig && d.deploymentConfig.description) || '').match(/SoccaQuiz (v[\w.\-]+)/)).filter(Boolean).map(m => m[1]);
    return vs.length ? vs.reduce((a, b) => plusRecente_(a, b) ? b : a) : '';
  } catch (e) { return ''; }
}
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

/* Première installation (ou reprise d'une installation interrompue). */
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
    if (lireSite_(0).modele === 'famille') return { erreur: 'Pas besoin d\'un autre site : ajoute ton autre enfant dans ton espace parent, Réglages → « Ajouter un enfant ». Il aura ses propres quiz et résultats.' };
    const classe = nettoyerClasse_(d.classe), prenom = nettoyerPrenom_(d.prenom);
    const tous = [lireSite_(0)].concat(autres_()).filter(Boolean);
    let nom = 'SoccaQuiz – ' + (prenom || (classe === 'adulte' ? 'Mes révisions' : 'Site ' + (tous.length + 1))), k = 2;
    const pris = tous.map(x => x.dossier || 'SoccaQuiz');
    while (pris.indexOf(nom) >= 0) nom = nom.replace(/ \(\d+\)$/, '') + ' (' + (k++) + ')';
    const a = autres_();
    a.push({ prenom, classe, classeAnnee: classe ? String(anneeScolaire_()) : '', dossier: nom });
    PropertiesService.getUserProperties().setProperty('autres', JSON.stringify(a));
    const n = a.length;
    try { return publier_(false, n); }
    catch (e) {
      // rien de créé : on retire l'entrée. Projet déjà créé : on la garde (carte « Terminer l'installation »),
      // sinon son projet et une éventuelle publication publique seraient oubliés
      const b = autres_();
      if (b[n - 1] && !b[n - 1].scriptId) { b.splice(n - 1, 1); PropertiesService.getUserProperties().setProperty('autres', JSON.stringify(b)); }
      else e.commence = true;
      throw e;
    }
  });
}

/* Désactiver un site : ses deux publications sont supprimées (ses adresses ne répondent plus), puis l'installateur l'oublie,
   seulement si les deux suppressions ont réussi (ou n'avaient plus rien à supprimer). Sinon le site est gardé.
   Les quiz et les résultats (dossier Drive et Sheets) ne sont pas touchés : un nouveau site les reprend.
   Le projet Apps Script reste dans le Drive (l'API ne permet pas de le supprimer), sauf quand la suppression passe
   par l'espace parent du site : il s'y met lui-même à la corbeille, ce qui arrête aussi ses adresses.
   ref.auto : fin automatique au retour de l'espace parent (page ou cadre invisible, sans bouton). Garde-fou : elle n'agit
   que si le site ne répond plus (programme à la corbeille, donc supprimé par son parent) ; sinon { vivant } et la page
   demande une confirmation. Un lien piégé « ?supprime=… » ne peut donc rien supprimer.
   Plus aucun site : l'installateur retire l'autorisation que la personne lui avait donnée (désinstallation complète). */
function apiRecommencer(ref) {
  return avecVerrou_(() => {
    const n = trouverSite_(ref), s = lireSite_(n) || {};
    const auto = !!(ref && typeof ref === 'object' && ref.auto);
    if (auto) {
      let rep = siteRepond_(s);
      for (let k = 0; rep !== false && k < 3; k++) { Utilities.sleep(3000); rep = siteRepond_(s); }   // la corbeille peut mettre quelques secondes à couper le site
      if (rep !== false) return { vivant: true, n, prenom: s.prenom || '' };
    }
    const r = desactiver_(s);
    const corbeille = auto;              // vérifié : le site ne répond plus
    // programme à la corbeille : ses publications ne répondent plus, même si Google refuse de les supprimer
    if (!r.ok && !corbeille) { const t = traduire_(r.erreur); return { erreur: "Ce site n'a pas pu être désactivé : il est gardé, rien n'a changé. " + (t.message || t.erreur), detail: t.detail, n }; }
    compter_('suppression', s.version || '', sitesInstalles_());   // avant l'oubli : sans site, l'installateur ne garde plus rien
    oublierSite_(n);
    // adresses pour le ménage de la famille quand la suppression n'est pas passée par l'espace parent du site
    const restants = [lireSite_(0)].concat(autres_()).filter(x => x && x.urlParent).map(x => x.urlParent);
    const plusRien = ![lireSite_(0)].concat(autres_()).some(x => x && x.scriptId);
    let desinstalle = false;
    if (plusRien) try { ScriptApp.invalidateAuth(); desinstalle = true; } catch (e) {}
    return { ok: true, desactive: r.desactive, n, prenom: s.prenom || '', urlParent: s.urlParent || '', restants, corbeille, desinstalle };
  });
}
/* ---------------- compteurs anonymes (onglet Statistiques de la console) ----------------
   Pour connaître l'ampleur du déploiement sans rien savoir des familles : à chaque installation, mise à jour ou
   suppression d'un site, l'installateur envoie à la console un simple « +1 », avec le numéro de version.
   Aucun identifiant, aucun prénom, aucune adresse ; l'envoi part des serveurs de Google, pas de l'appareil.
   Sites installés avant les compteurs : la première fois, le nombre de sites déjà installés est envoyé une fois
   (« existant »), puis la propriété « stat » le note (effacée avec le reste quand il ne reste plus aucun site). */
function sitesInstalles_() { return [lireSite_(0)].concat(autres_()).filter(x => x && x.scriptId && x.version).length; }
function compter_(evenement, version, nbAvant) {
  try {
    const props = PropertiesService.getUserProperties(), evts = [];
    if (!props.getProperty('stat') && nbAvant > 0) evts.push({ e: 'existant', n: Math.min(nbAvant, 20) });
    evts.push({ e: evenement, v: /^v?[\w.\-]{1,15}$/.test(String(version)) ? String(version) : '' });
    const url = adresseStats_();
    if (!url) return;
    UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ type: 'stat', evts }), muteHttpExceptions: true, followRedirects: true });
    if (evenement !== 'suppression' || nbAvant > 1) props.setProperty('stat', '1');
  } catch (e) {}                               // un compteur ne doit jamais gêner l'installation
}
function adresseStats_() {
  const cache = CacheService.getScriptCache(), deja = cache.get('adresse-stats');
  if (deja != null) return deja;
  let url = '';
  try {
    const r = UrlFetchApp.fetch('https://leian.github.io/UNIVERSALQUIZ/soccaquiz.json', { muteHttpExceptions: true });
    const c = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : {};
    if (typeof c.propositions === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.propositions)) url = c.propositions;
  } catch (e) {}
  cache.put('adresse-stats', url, 21600);
  return url;
}

/* le site de l'enfant répond-il encore ? true : oui ; false : non (programme à la corbeille ou supprimé) ; null : on ne sait pas */
function siteRepond_(s) {
  if (!s || !s.url) return false;
  try {
    const r = UrlFetchApp.fetch(s.url + (s.url.indexOf('?') < 0 ? '?' : '&') + 'api=etat', { muteHttpExceptions: true, followRedirects: true });
    const c = r.getResponseCode();
    if (c === 200 && /SoccaQuiz|"v"\s*:\s*\d/.test(r.getContentText())) return true;
    return c === 200 || c >= 400 ? false : null;
  } catch (e) { return null; }
}
/* programme de la famille prêt = autorisé ET avec toutes ses autorisations : une case décochée (écran « granulaire »
   de Google) laisse le site répondre, mais avec l'erreur « drive.files.list » ; il faut alors refaire « autoriser » */
function siteAutorise_(s) {
  if (!s || !s.url) return false;
  try {
    const r = UrlFetchApp.fetch(s.url + (s.url.indexOf('?') < 0 ? '?' : '&') + 'api=etat', { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return false;
    const d = JSON.parse(r.getContentText());
    return !!(d && d.v && !d.erreur);
  } catch (e) { return false; }
}
function desactiver_(s) {
  let ok = true, nb = 0, erreur = null;
  let deps = [s.deploymentId, s.deploymentIdParent];
  if (s.modele === 'famille' && s.scriptId) {
    // toutes les publications du programme (pas seulement celles que l'installateur connaît), sauf la version de travail
    try { deps = (appel_('get', '/' + s.scriptId + '/deployments?pageSize=50').deployments || []).filter(d => d && d.deploymentConfig && d.deploymentConfig.versionNumber).map(d => d.deploymentId); }
    catch (e) { if (e.code !== 404) { ok = false; erreur = e; } else deps = []; }
  }
  deps.forEach(dep => {
    if (!s.scriptId || !dep) return;
    try { appel_('delete', '/' + s.scriptId + '/deployments/' + dep); nb++; }
    catch (e) { if (e.code === 404) nb++; else { ok = false; erreur = e; } }   // 404 : déjà supprimé, même résultat
  });
  // programme de la famille : il ne peut pas être mis à la corbeille (ni par lui-même, ni par l'installateur) ;
  // son code est vidé : il ne reste qu'un projet vide, sans adresse ni autorisation, que la famille peut jeter
  if (ok && s.modele === 'famille' && s.scriptId) try { appel_('put', '/' + s.scriptId + '/content', { files: CODE_VIDE_ }); } catch (e) {}
  return { ok, desactive: ok && nb > 0, erreur, vide: s.modele === 'famille' };
}
const CODE_VIDE_ = [
  { name: 'Code', type: 'SERVER_JS', source: '// Ce programme SoccaQuiz a été supprimé : il ne sert plus. Tu peux le mettre à la corbeille (script.google.com → ⋮ → Supprimer).\n' },
  { name: 'appsscript', type: 'JSON', source: '{\n  "timeZone": "Europe/Paris",\n  "runtimeVersion": "V8",\n  "exceptionLogging": "NONE"\n}' }
];


/* Mise à jour : même projet, mêmes adresses. */
function apiMettreAJour(ref) {
  return avecVerrou_(() => publier_(true, trouverSite_(ref)));
}

/* ---------------- le travail ---------------- */

function publier_(maj, n) {
  n = nSite_(n);
  const site = lireSite_(n) || {};
  const avant = sitesInstalles_(), versionAvant = site.version || '';   // pour les compteurs anonymes
  let id = site.scriptId;
  try {
    const moteur = moteur_();
    if (famille_(moteur)) {
      // site installé avant le programme de la famille : ses fichiers ont été créés par l'ancien programme, que le nouveau ne voit pas
      if (site.modele !== 'famille' && site.version) return { erreur: MIGRATION_, migration: true, n };
      if (n > 0 && !site.scriptId) throw erreurFr_('Ajoute ton autre enfant dans ton espace parent : Réglages → « Ajouter un enfant ».');
      return publierFamille_(maj, n, moteur, site, false);
    }
    const prenom = site.prenom || '';
    let dep = site.deploymentId;               // site de l'enfant
    let depP = site.deploymentIdParent;        // espace parent
    const dejaPublie = !!site.version && !!dep, avaitParent = !!depP;
    let nouveauSite = false, adresseChangee = false;

    if (id) {
      // seul « introuvable » (projet mis à la corbeille) fait recréer le projet ; toute autre erreur est expliquée
      try { appel_('get', '/' + id); }
      catch (e) { if (e.code === 404) id = null; else throw e; }
      if (!id) nouveauSite = !!site.url;     // un site déjà publié change d'adresses : il faudra le dire
    }
    if (!id) {
      id = appel_('post', '', { title: n ? site.dossier || 'SoccaQuiz' : 'SoccaQuiz' }).scriptId;
      ['deploymentId', 'deploymentIdParent', 'url', 'urlParent', 'version'].forEach(k => delete site[k]);
      site.scriptId = id;
      ecrireSite_(n, site);
      dep = depP = null;
    } else {
      // publications supprimées à la main : elles sont recréées à l'étape 1, chacune avec la bonne adresse de l'autre
      if (dep && !existe_(id, dep)) { dep = null; adresseChangee = dejaPublie; }
      if (depP && !existe_(id, depP)) depP = null;
      // place pour les versions de cette mise à jour (2, ou 4 s'il manque une publication) ?
      let nb = -1; try { nb = nbVersions_(id); } catch (e) {}
      if (nb >= 0 && nb + 2 + (dep ? 0 : 1) + (depP ? 0 : 1) > MAX_VERSIONS) return tropDeVersions_(id, nb, n);
    }

    // envoie le code d'un des deux espaces, en fait une version et la publie (sur sa publication existante, sinon une nouvelle)
    const urls = { urlEnfant: dep ? site.url || '' : '', urlParent: depP ? site.urlParent || '' : '' };
    const description = 'SoccaQuiz ' + moteur.version;
    const deployer = (espace, depId) => {
      appel_('put', '/' + id + '/content', { files: fichiers_(moteur, prenom, { espace, urlEnfant: urls.urlEnfant, urlParent: urls.urlParent, classe: site.classe, classeAnnee: site.classeAnnee, dossier: n ? site.dossier : '' }) });
      const version = appel_('post', '/' + id + '/versions', { description: description + ' (' + espace + ')' }).versionNumber;
      const config = { versionNumber: version, manifestFileName: 'appsscript', description: description + ' – ' + (espace === 'parent' ? 'espace parent' : 'site de l\'enfant') };
      return depId ? appel_('put', '/' + id + '/deployments/' + depId, { deploymentConfig: Object.assign({ scriptId: id }, config) })
        : appel_('post', '/' + id + '/deployments', config);
    };

    // 1. crée les publications qui manquent (leurs adresses ne sont connues qu'une fois créées), enregistrées aussitôt :
    //    une installation interrompue ne laisse jamais de publication que l'installateur ne connaît pas
    if (!dep) { const d = deployer('enfant', null); dep = d.deploymentId; urls.urlEnfant = urlSite_(d); Object.assign(site, { deploymentId: dep, url: urls.urlEnfant }); ecrireSite_(n, site); }
    if (!depP) { const d = deployer('parent', null); depP = d.deploymentId; urls.urlParent = urlSite_(d); Object.assign(site, { deploymentIdParent: depP, urlParent: urls.urlParent }); ecrireSite_(n, site); }
    // 2. publie les deux espaces, chacun connaissant l'adresse de l'autre ; le parent d'abord (l'enfant ne le voit pas)
    let dP, dE;
    try { dP = deployer('parent', depP); dE = deployer('enfant', dep); }
    catch (e) { e.relancer = true; throw e; }
    const url = urlSite_(dE), urlParent = urlSite_(dP);

    Object.assign(site, { deploymentId: dep, deploymentIdParent: depP, url, urlParent, version: moteur.version });
    ecrireSite_(n, site);
    compter_(versionAvant ? 'maj' : 'installation', moteur.version, avant);
    return { ok: true, n, id, prenom, classe: site.classe || '', url, urlParent, version: moteur.version, appli: appli_(url, moteur.version),
      maj: !!maj && dejaPublie && !nouveauSite, nouveauSite, adresseChangee: adresseChangee && !nouveauSite,
      nouveauParent: dejaPublie && !avaitParent && !nouveauSite };
  } catch (e) {
    if (e && typeof e === 'object' && !e.scriptId) { e.scriptId = id; e.n = n; }   // pour la carte « ménage » du bon site
    throw e;
  }
}

/* ---------------- programme de la famille (chantier « sans alerte ») ----------------
   Un seul programme pour toute la famille (tous les enfants), une seule publication (exécutée avec le compte du
   parent, ouverte sans compte) ; il ne demande que « fichiers créés par SoccaQuiz » + adresse e-mail : aucun écran
   d'alerte. Il est autorisé dans l'ÉDITEUR (fonction « autoriser » déjà choisie, écrans bleus) : l'installateur
   ouvre l'éditeur et attend que le site réponde. L'espace parent est servi par app.soccaquiz.fr/parent et protégé
   par des clés d'appareil : le premier appareil reçoit son lien d'invitation ici (code à usage unique, dont seule
   l'empreinte est écrite dans le programme, CONFIG.invitation). */
const DUREE_INVIT_ = 24 * 3600 * 1000;
const MIGRATION_ = 'Cette nouvelle version de SoccaQuiz change de fonctionnement (plus aucun écran d\'alerte de Google) : elle ne peut pas remplacer ce site. Supprime-le (Options avancées → Supprimer), puis installe la nouvelle version.';
let MOTEUR_FAMILLE_ = false;
function famille_(moteur) {
  const m = (moteur.fichiers || []).find(f => f.name === 'appsscript');
  MOTEUR_FAMILLE_ = !!(m && /auth\/drive\.file/.test(m.source) && !/auth\/drive"/.test(m.source));
  return MOTEUR_FAMILLE_;
}
function origineSite_() {          // app.soccaquiz.fr ; propriété ORIGINE du projet de l'installateur pour un essai (essai.soccaquiz.pages.dev)
  try { const o = PropertiesService.getScriptProperties().getProperty('ORIGINE'); if (/^https:\/\/[\w.-]+$/.test(o || '')) return o; } catch (e) {}
  return 'https://app.soccaquiz.fr';
}
function empreinte_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function aleatoire_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/[^0-9a-f]/gi, '').toLowerCase(); }
function idDeploiement_(s) { const m = String((s && s.url) || '').match(/\/macros\/s\/(AKfy[\w-]{1,200})\/exec$/); return m ? m[1] : ''; }
function lienParentFamille_(s) { const d = idDeploiement_(s); return d ? origineSite_() + '/parent/?s=' + d : ''; }
function lienInvitation_(s) {
  const d = idDeploiement_(s);
  return d && /^[0-9a-f]{40,80}$/.test(s.invit || '') && Date.now() < Number(s.invitExp || 0) ? origineSite_() + '/parent/?s=' + d + '#i=' + s.invit : '';
}
function publierFamille_(maj, n, moteur, site, nouvelleInvit) {
  const avant = sitesInstalles_(), versionAvant = site.version || '';
  let id = site.scriptId, dep = site.deploymentId, nouveauSite = false, adresseChangee = false;
  const dejaPublie = !!site.version && !!dep;
  try {
    if (id) {
      try { appel_('get', '/' + id); }
      catch (e) { if (e.code === 404) id = null; else throw e; }
      if (!id) nouveauSite = !!site.url;
    }
    if (!id) {
      id = appel_('post', '', { title: 'SoccaQuiz' }).scriptId;
      ['deploymentId', 'deploymentIdParent', 'url', 'urlParent', 'version', 'invitH'].forEach(k => delete site[k]);
      Object.assign(site, { scriptId: id, modele: 'famille' });
      ecrireSite_(n, site);
      dep = null;
    } else {
      if (dep && !existe_(id, dep)) { dep = null; adresseChangee = dejaPublie; }
      let nb = -1; try { nb = nbVersions_(id); } catch (e) {}
      if (nb >= 0 && nb + 1 + (dep ? 0 : 1) > MAX_VERSIONS) return tropDeVersions_(id, nb, n);
    }
    // code du premier appareil du parent : à l'installation, ou sur demande (« Ouvrir l'espace parent sur cet appareil »)
    // clé de l'installateur : il demandera lui-même au site un lien pour un nouvel appareil (sans nouvelle version)
    if (!/^[0-9a-f]{40,80}$/.test(site.cleInst || '')) { site.cleInst = aleatoire_(); ecrireSite_(n, site); }
    if (nouvelleInvit || !site.invitH) {
      const code = aleatoire_();
      Object.assign(site, { modele: 'famille', invit: code, invitExp: String(Date.now() + DUREE_INVIT_), invitH: empreinte_(code) });
      ecrireSite_(n, site);
    }
    const description = 'SoccaQuiz ' + moteur.version;
    const deployer = (depId, urlEnfant) => {
      appel_('put', '/' + id + '/content', { files: fichiers_(moteur, site.prenom || '', { espace: 'enfant', urlEnfant, urlParent: '', classe: site.classe, classeAnnee: site.classeAnnee, invitation: site.invitH, cleInstallateur: empreinte_(site.cleInst) }) });
      const version = appel_('post', '/' + id + '/versions', { description }).versionNumber;
      const config = { versionNumber: version, manifestFileName: 'appsscript', description };
      return depId ? appel_('put', '/' + id + '/deployments/' + depId, { deploymentConfig: Object.assign({ scriptId: id }, config) })
        : appel_('post', '/' + id + '/deployments', config);
    };
    // 1. la publication (son adresse n'est connue qu'une fois créée), enregistrée aussitôt ; 2. le code qui connaît son adresse
    if (!dep) { const d = deployer(null, ''); dep = d.deploymentId; Object.assign(site, { deploymentId: dep, url: urlSite_(d) }); ecrireSite_(n, site); }
    let d; try { d = deployer(dep, site.url); } catch (e) { e.relancer = true; throw e; }
    Object.assign(site, { deploymentId: dep, url: urlSite_(d), version: moteur.version });
    ecrireSite_(n, site);
    compter_(versionAvant ? 'maj' : 'installation', moteur.version, avant);
    const pret = siteAutorise_(site);              // pas encore autorisé dans l'éditeur (ou une case décochée) : le site ne répond pas normalement
    return { ok: true, famille: true, n, id, prenom: site.prenom || '', classe: site.classe || '', url: site.url, version: moteur.version, appli: appli_(site.url, moteur.version),
      maj: !!maj && dejaPublie && !nouveauSite, nouveauSite, adresseChangee: adresseChangee && !nouveauSite,
      pret, lienProjet: lienProjet_(id), urlParent: lienParentFamille_(site), invitation: pret && nouvelleInvit ? lienInvitation_(site) : '' };
  } catch (e) {
    if (e && typeof e === 'object' && !e.scriptId) { e.scriptId = id; e.n = n; }
    throw e;
  }
}
/* la page attend l'autorisation donnée dans l'éditeur : le site répond-il ? Alors lien du premier appareil. */
function apiAutorise(ref) {
  try {
    const n = trouverSite_(ref), s = lireSite_(n) || {};
    if (s.modele !== 'famille') return { erreur: 'Ce site n\'utilise pas cette étape.' };
    const pret = siteAutorise_(s);
    return { pret, n, invitation: pret ? lienInvitation_(s) : '', urlParent: lienParentFamille_(s), url: s.url || '', appli: appli_(s.url, s.version) };
  } catch (e) { return traduire_(e); }
}
/* « 🔒 Espace parent » dans l'installateur : le site fabrique un code à usage unique pour cet appareil (2 s, sans nouvelle
   version) ; l'installateur prouve qu'il est celui de la famille par sa clé (seule son empreinte est dans le programme) */
function apiLienParent(ref) {
  try {
    const n = trouverSite_(ref);
    let s = lireSite_(n) || {};
    if (s.modele !== 'famille') return { erreur: 'Ce site n\'utilise pas cette étape.' };
    let code = demanderCode_(s, 1);
    if (!code) {
      // site installé avant la clé de l'installateur : une mise à jour la lui donne ; Google met parfois quelques secondes
      // à servir la nouvelle version, d'où plusieurs essais (un code écrit dans le programme aurait le même délai)
      const r = publierFamille_(false, n, moteur_(), s, false);
      if (!r.ok) return r;
      if (!r.pret) return { erreur: 'Le site ne répond pas encore : autorise-le d\'abord (bouton « Ouvrir le programme »).', aAutoriser: true, lienProjet: r.lienProjet, n };
      s = lireSite_(n) || {};
      code = demanderCode_(s, 8);
    }
    if (code) return { ok: true, n, invitation: origineSite_() + '/parent/?s=' + idDeploiement_(s) + '#i=' + code, urlParent: lienParentFamille_(s) };
  } catch (e) { return traduire_(e); }
  return { erreur: 'Le site n\'a pas pu fabriquer le lien. Réessaie dans une minute.' };
}
function demanderCode_(s, essais) {
  if (!/^[0-9a-f]{40,80}$/.test(s.cleInst || '') || !s.url) return '';
  for (let i = 0; i < essais; i++) {
    if (i) Utilities.sleep(3000);
    try {
      const r = UrlFetchApp.fetch(s.url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ api: 'inviter-installateur', cle: s.cleInst }), muteHttpExceptions: true, followRedirects: true });
      const d = JSON.parse(r.getContentText());
      if (d && d.ok && /^[0-9a-f]{40,80}$/.test(d.code || '')) return d.code;
    } catch (e) {}
  }
  return '';
}
/* nouvel appareil du parent (téléphone changé, clé perdue…) : nouveau code, écrit dans le programme (une version de plus) */
function apiNouvelAppareil(ref) {
  return avecVerrou_(() => {
    const n = trouverSite_(ref), s = lireSite_(n) || {};
    if (s.modele !== 'famille') return { erreur: 'Ce site n\'utilise pas cette étape.' };
    const r = publierFamille_(false, n, moteur_(), s, true);
    if (!r.ok) return r;
    if (!r.pret) return { erreur: 'Le site ne répond pas encore : autorise-le d\'abord (bouton « Ouvrir le programme »).', aAutoriser: true, lienProjet: r.lienProjet, n };
    return { ok: true, n, invitation: r.invitation, urlParent: r.urlParent };
  });
}

function existe_(id, dep) {
  try { appel_('get', '/' + id + '/deployments/' + dep); return true; }
  catch (e) { if (e.code === 404) return false; throw e; }
}

/* fichiers du moteur, avec les réglages écrits dans Code.gs ; refuse de publier si un réglage n'a pas été trouvé
   (un « espace » resté vide ouvrirait les pages des parents à toute personne qui a le lien de l'enfant) */
function fichiers_(moteur, prenom, espace) {
  espace = espace || {};
  const propre = u => String(u || '').replace(/['\\\s]/g, '');
  const p = String(prenom).replace(/\\/g, '').replace(/'/g, '’');
  // le site saura quelle version il porte et où proposer la mise à jour
  const ici = String(ScriptApp.getService().getUrl() || '').replace(/'/g, '');
  const version = String(moteur.version).replace(/[^\w.\-]/g, '');
  const esp = espace.espace === 'parent' ? 'parent' : espace.espace === 'enfant' ? 'enfant' : '';
  const regler = (src, re, val, nom) => {
    if (!re.test(src)) throw erreurFr_('Le moteur publié sur GitHub ne contient pas le réglage « ' + nom + ' » : rien n\'a été publié. Préviens la personne qui t\'a envoyé le lien.');
    return src.replace(re, typeof val === 'function' ? val : () => val);
  };
  return moteur.fichiers.map(f => {
    if (f.name === 'Code') {
      let s = f.source;
      s = regler(s, /prenom: '[^'\n]*',/, "prenom: '" + p + "',", 'prenom');
      s = regler(s, /version: '[^'\n]*',/, "version: '" + version + "',", 'version');
      s = regler(s, /installateur: '[^'\n]*'/, "installateur: '" + ici + "'", 'installateur');
      s = regler(s, /espace: '[^'\n]*'/, "espace: '" + esp + "'", 'espace');
      s = regler(s, /urlEnfant: '[^'\n]*'/, "urlEnfant: '" + propre(espace.urlEnfant) + "'", 'urlEnfant');
      s = regler(s, /urlParent: '[^'\n]*'/, "urlParent: '" + propre(espace.urlParent) + "'", 'urlParent');
      s = regler(s, /classe: '[^'\n]*'/, "classe: '" + nettoyerClasse_(espace.classe) + "'", 'classe');
      s = regler(s, /classeAnnee: \d+/, 'classeAnnee: ' + (parseInt(espace.classeAnnee, 10) || 0), 'classeAnnee');
      if ('invitation' in espace) s = regler(s, /invitation: '[^'\n]*'/, "invitation: '" + String(espace.invitation || '').replace(/[^0-9a-f]/g, '') + "'", 'invitation');
      if ('cleInstallateur' in espace) s = regler(s, /cleInstallateur: '[^'\n]*'/, "cleInstallateur: '" + String(espace.cleInstallateur || '').replace(/[^0-9a-f]/g, '') + "'", 'cleInstallateur');
      s = regler(s, /nomDossier: '[^'\n]*'/, m => espace.dossier ? "nomDossier: '" + String(espace.dossier).replace(/['\\\n]/g, '') + "'" : m, 'nomDossier');
      if (esp && s.indexOf("espace: '" + esp + "'") < 0) throw erreurFr_('Réglage « espace » non écrit dans le site : rien n\'a été publié.');
      return { name: f.name, type: f.type, source: s };
    }
    return f.name === 'appsscript' && espace.espace && !('invitation' in espace) ? { name: f.name, type: f.type, source: manifeste_(f.source, espace.espace) } : f;
  });
}

/* l'espace parent n'est ouvert qu'au compte Google de la famille (« Seulement moi ») ; le site de l'enfant reste ouvert sans compte */
function manifeste_(source, espace) {
  const m = JSON.parse(source);
  // espace parent : exécuté avec le compte de la personne qui l'ouvre (le parent qui a installé, ou l'autre parent
  // invité depuis Réglages) ; l'accès réel est le partage Drive du dossier de l'enfant, vérifié par le site
  m.webapp = Object.assign({}, m.webapp, espace === 'parent' ? { executeAs: 'USER_ACCESSING', access: 'ANYONE' } : { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  return JSON.stringify(m, null, 2);
}

/* dernière version du moteur : fichier universal-quiz.json de la Release GitHub (son numéro est gardé 10 min en cache) */
function sourceMoteur_() {        // propriété SOURCE du projet de l'installateur : moteur d'une branche, pour un essai
  try { const u = PropertiesService.getScriptProperties().getProperty('SOURCE'); if (/^https:\/\/raw\.githubusercontent\.com\/leian\/UNIVERSALQUIZ\/[\w.\/-]+\.json$/.test(u || '')) return u; } catch (e) {}
  return SOURCE_MOTEUR;
}
function moteur_() {
  const r = UrlFetchApp.fetch(sourceMoteur_(), { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw erreurFr_('Impossible de récupérer le moteur sur GitHub (erreur ' + r.getResponseCode() + '). Réessaie dans quelques minutes.');
  let m = null; try { m = JSON.parse(r.getContentText('UTF-8')); } catch (e) {}
  if (!m || !Array.isArray(m.fichiers) || !m.fichiers.some(f => f.name === 'appsscript')) throw erreurFr_('Le moteur publié sur GitHub est incomplet.');
  try { CacheService.getScriptCache().put('derniere', String(m.version || ''), 600); CacheService.getScriptCache().put('famille', famille_(m) ? '1' : '0', 600); } catch (e) {}
  return m;
}
function derniereVersion_() {
  let v = null; try { v = CacheService.getScriptCache().get('derniere'); MOTEUR_FAMILLE_ = CacheService.getScriptCache().get('famille') === '1'; } catch (e) {}
  return v || moteur_().version;
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

/* une seule opération à la fois par personne (double appui, deux onglets) + erreurs lisibles.
   Aucun journal d'erreur n'est écrit (exceptionLogging: NONE) : l'éditeur ne reçoit rien. */
function avecVerrou_(f) {
  const verrou = LockService.getUserLock();
  if (!verrou.tryLock(1000)) return { erreur: 'Une installation est déjà en cours : patiente une minute puis recharge la page.' };
  try { return f(); }
  catch (e) { return traduire_(e); }
  finally { verrou.releaseLock(); }
}

/* messages de Google traduits ; le texte d'origine est gardé dans « detail » (affiché en petit) */
function traduire_(e) {
  const m = String(e && e.message || e);
  const suite = (e && e.relancer ? ' La mise à jour s\'est arrêtée en cours de route : clique à nouveau sur « Mettre à jour ».' : '') +
    (e && e.commence ? ' Le site a été commencé : clique sur « Terminer l\'installation » sur sa carte (recharge la page si elle n\'apparaît pas).' : '');
  const r = (texte, detail) => detail ? { erreur: texte + suite, detail } : { erreur: texte + suite };
  if (/User has not enabled the Apps Script API/i.test(m)) return { erreur: 'api', message: "L'interrupteur « API Google Apps Script » n'est pas encore activé dans ton compte." };
  if (/has not been used in project|SERVICE_DISABLED/i.test(m)) return r("L'installateur n'est pas complètement configuré par son éditeur (API Apps Script du projet Google Cloud). Préviens la personne qui t'a envoyé le lien.");
  if (/version/i.test(m) && /limit|200/i.test(m) && e && e.scriptId) return tropDeVersions_(e.scriptId, MAX_VERSIONS, e.n || 0);
  if (e && e.fr) return r(m);
  if (/quota|rate limit|too many requests/i.test(m) || (e && e.code === 429)) return r('Google limite le nombre d\'opérations par jour : réessaie demain.', m);
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|invalid authentication credentials/i.test(m) || (e && e.code === 401)) return r('Une autorisation manque : recharge la page et accepte toutes les autorisations demandées par Google.', m);
  if (/permission|PERMISSION_DENIED|forbidden/i.test(m) || (e && e.code === 403)) return r('Google refuse l\'accès au programme de ce site. ' + PLUSIEURS_COMPTES, m);
  if (e && e.code) return r('Google a répondu par une erreur inattendue. Réessaie dans quelques minutes.', m);
  return r(m);
}

function nettoyerPrenom_(s) {
  return String(s || '').trim().slice(0, 40).replace(/[<>"`\\&$\r\n]/g, '');
}

/* ---------------- la page (mobile d'abord) ---------------- */
function pageHtml_(suppr, vue) {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><base target="_top">' +
  '<style>' +
  ':root{--bg:#fff8ef;--card:#fff;--ink:#2a1f1a;--soft:#7a6658;--line:#eadfce;--accent:#c8102e;--ok:#15803d;--ko:#b91c1c}' +
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
  'main{max-width:560px;margin:0 auto;padding:20px 16px 40px;position:relative}' +
  '.lien-aide{position:absolute;top:16px;right:12px;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;border:2px solid var(--line);background:var(--card);color:var(--accent);font:700 1.2rem system-ui,sans-serif;text-decoration:none}.lien-aide:hover{border-color:var(--accent)}' +
  'h1{font-size:1.6rem;text-align:center;margin:.2em 0}' +
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
  /* effet de bascule : on voit tout de suite qu'on a bien touché un bouton (comme sur le site) */
  '.btn,button{transition:scale .12s ease,filter .12s ease;-webkit-tap-highlight-color:transparent}' +
  '.btn:active:not(:disabled),button:active:not(:disabled),.appuye{scale:.95;filter:brightness(.92);transition-duration:.04s}' +
  '@media (prefers-reduced-motion:reduce){.btn:active:not(:disabled),button:active:not(:disabled),.appuye{scale:none;filter:brightness(.85)}}' +
  '</style></head><body><main>' +
  '<a class="lien-aide" href="https://soccaquiz.fr/aide.html#installer" target="_blank" rel="noopener" title="Aide" aria-label="Aide">?</a>' +
  '<h1 class="marque"><img src="https://leian.github.io/UNIVERSALQUIZ/icone-96.png" width="56" height="56" alt=""><span>Socca<em>Quiz</em></span></h1><p class="intro" id="intro">Crée le site de quiz de ton enfant, dans ton propre compte Google. Gratuit, environ 5 minutes.</p>' +
  '<div id="chargement" class="petit" style="text-align:center">Chargement…</div>' +

  '<div id="nouveau" class="cache">' +
  '<section class="etape" id="e1"><h2><span class="num">1</span> Active l\'API Apps Script</h2>' +
  '<div id="e1-alerte"></div><div id="e1-afaire"><p>Une seule fois : clique sur le bouton, puis mets l\'interrupteur <b>« API Google Apps Script »</b> sur <b>Activé</b>.</p>' +
  '<a class="btn" href="' + PAGE_API + '" target="_blank" rel="noopener">Ouvrir la page Google</a>' +
  '<div class="retour"><b>↩️ Ensuite, tu vas revenir sur le mail : c\'est normal.</b> Une fois l\'interrupteur activé, la flèche retour ← te ramène au mail d\'invitation, pas ici. Dans le mail, fais l\'<b>étape 2</b> : clique à nouveau sur « Installer SoccaQuiz ».<br><span class="petit">Sur ordinateur, la page Google s\'ouvre dans un autre onglet : reviens simplement sur celui-ci.</span></div>' +
  '<p class="petit" style="margin:6px 0 0">Déjà fait ? Passe directement à l\'étape 2.</p>' +
  '<p class="petit" style="margin:6px 0 0">Plusieurs comptes Google sur cet appareil ? Vérifie en haut à droite de la page Google que c\'est bien le compte qui recevra le site.</p></div></section>' +
  '<section class="etape" id="e2"><h2><span class="num">2</span> Installe le site</h2>' +
  '<label for="prenom">Prénom de l\'enfant (facultatif)</label><input id="prenom" maxlength="40" autocomplete="off" placeholder="ex. Tom">' +
  '<label for="classe">Classe (facultatif : le site s\'habille selon l\'âge)</label>' + choixClasse_('classe') +
  '<button class="btn" id="installer" type="button">✨ Installer mon site</button></section>' +
  '</div>' +

  '<div id="suppression"></div>' +
  '<div id="deja" class="cache"><div id="tout-maj"></div><div id="sites"></div>' +
  '<section class="etape" id="ajout"><h2>➕ Un autre site</h2>' +
  '<p class="petit" style="margin:0 0 6px">Un site par enfant, ou un site pour tes propres révisions : chacun a ses quiz, ses résultats et son adresse.</p>' +
  '<details id="ajout-form"><summary class="btn leger">Créer un autre site</summary>' +
  '<label for="prenom2">Prénom</label><input id="prenom2" maxlength="40" autocomplete="off" placeholder="ex. Léa">' +
  '<label for="classe2">Classe</label>' + choixClasse_('classe2') +
  '<button class="btn" id="ajouter-site" type="button">✨ Créer ce site</button></details></section></div>' +

  '<div id="resultat" aria-live="polite"></div>' +
  '<p class="petit" style="text-align:center;margin-top:24px">' +
  '<a href="https://soccaquiz.fr/confidentialite.html" target="_blank" rel="noopener">Confidentialité</a> · Licence PolyForm Noncommercial — usage commercial interdit. <span style="opacity:.6">Installateur ' + INSTALLATEUR_V + '</span></p>' +
  '</main><script>window.__SUPPR = ' + JSON.stringify(suppr || null).replace(/</g, '\\u003c') + ';\nwindow.__VUE = ' + JSON.stringify(vue || '') + ';\n' + BASCULE_ + '\n' + scriptPage_() + '</script></body></html>';
}

/* liste des classes (le choix « adulte » = site pour les révisions d'un parent) */
function choixClasse_(id) {
  const groupes = [['Maternelle', 0, 3], ['Élémentaire', 3, 8], ['Collège', 8, 12], ['Lycée', 12, 15]];
  return '<select id="' + id + '"><option value="">— Choisir —</option>' +
    groupes.map(g => '<optgroup label="' + g[0] + '">' + CLASSES.slice(g[1], g[2]).map(c => '<option>' + c + '</option>').join('') + '</optgroup>').join('') +
    '<optgroup label="Adulte"><option value="adulte">Pour moi (révisions d\'un adulte)</option></optgroup></select>';
}

/* sur téléphone, :active n'apparaît pas toujours pendant un toucher bref : classe « appuye » posée le temps du toucher */
const BASCULE_ = '(function(){var el=null,t=0;' +
  'function lacher(){var e=el;el=null;if(e){clearTimeout(t);t=setTimeout(function(){e.classList.remove("appuye");},110);}}' +
  'document.addEventListener("pointerdown",function(ev){var b=ev.target.closest&&ev.target.closest(".btn,button");' +
  'if(!b||b.disabled)return;if(el&&el!==b)el.classList.remove("appuye");el=b;b.classList.add("appuye");},{passive:true});' +
  '["pointerup","pointercancel","dragstart"].forEach(function(x){document.addEventListener(x,lacher,{passive:true});});' +
  'document.addEventListener("scroll",function(){if(el){el.classList.remove("appuye");el=null;}},{passive:true,capture:true});})();';

function scriptPage_() {
  return '(' + String(function () {
    var $ = function (id) { return document.getElementById(id); };
    var h = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
    var res = $('resultat');
    // première installation : l'autorisation à donner une seule fois, en ouvrant le site
    var AUTORISER = '<div class="ok"><p><b>Dernière étape, une seule fois :</b> clique sur « ▶ Site de l\'enfant ». Google demande d\'autoriser « SoccaQuiz » :</p>' +
      '<ol><li>« Examiner les autorisations », puis choisis ton compte ;</li>' +
      '<li>« Google n\'a pas validé cette application » : clique sur <b>Paramètres avancés</b>, puis <b>Accéder à SoccaQuiz (non sécurisé)</b> ;</li>' +
      '<li>coche <b>Tout sélectionner</b>, puis <b>Continuer</b>.</li></ol>' +
      '<p class="petit" style="margin:0">Ce site t\'appartient : il ne se sert que de son dossier « SoccaQuiz » et de son tableau des résultats, dans ton Drive. Google affiche un accès à tout le Drive, parce que le site doit lire les quiz que tu déposes toi-même dans son dossier : il ne lit que ce dossier. Une fois dessus, mets-le en favori.</p>' +
      '<p style="margin:8px 0 0">Ensuite, pour <b>ajouter des quiz et suivre les résultats</b>, utilise « 🔒 Espace parent » (mets-le aussi en favori). Ton enfant, lui, n\'utilise que le lien « Site de l\'enfant ».</p></div>';
    // programme de la famille : autorisation dans l'éditeur (écrans bleus seulement), la page attend que le site réponde
    function carteAutoriser(r) {
      return '<div class="ok autoriser"><p style="margin:0 0 6px"><b>Dernière étape, une seule fois : autorise ton site</b> (1 minute).</p>' +
        '<ol style="margin:0 0 8px;padding-left:20px"><li>Clique sur le bouton : le programme « SoccaQuiz » s\'ouvre dans un nouvel onglet.<br><a class="btn" href="' + h(r.lienProjet) + '" target="_blank" rel="noopener">Ouvrir le programme</a></li>' +
        '<li>En haut, clique sur <b>▷ Exécuter</b> (la fonction « autoriser » est déjà choisie).</li>' +
        '<li>Clique sur <b>Examiner les autorisations</b>, choisis ton compte, coche <b>Tout sélectionner</b>, puis clique sur <b>Continuer</b>.</li>' +
        '<li>Reviens sur cet onglet : il se met à jour tout seul.</li></ol>' +
        '<p class="petit" style="margin:0 0 6px">SoccaQuiz ne demande que l\'accès aux fichiers qu\'il crée lui-même dans ton Drive (son dossier et ses tableaux) et ton adresse e-mail : Google n\'affiche aucune alerte. Ne modifie rien dans le programme.</p>' +
        '<p class="petit attente" style="margin:0">⏳ En attente de l\'autorisation…</p></div>';
    }
    function cartePrete(r, s) {
      return '<div class="ok"><p style="margin:0 0 8px"><b>🎉 C\'est prêt !</b></p>' +
        (r.invitation ? '<p style="margin:0 0 6px"><a class="btn" href="' + h(r.invitation) + '" target="_blank" rel="noopener">🔒 Ouvrir mon espace parent</a></p>' +
          '<p class="petit" style="margin:0 0 8px">Ajouter des quiz, suivre les résultats, ajouter un autre enfant. Ce bouton ouvre ton espace parent <b>sur cet appareil</b>, une seule fois, sans compte Google ensuite : ajoute-le à ton écran d\'accueil. Pour un autre appareil : « Ouvrir l\'espace parent sur un autre appareil », plus bas.</p>' : '') +
        '<p style="margin:0">Ensuite, envoie son lien à ' + h((s && s.prenom) || 'ton enfant') + ' (bouton ✉️) : son site s\'ouvre sans compte.</p></div>';
    }
    // onglet ouvert au clic sur « 🔒 Espace parent », le temps que le lien arrive : même allure que l'écran de chargement de l'espace parent
    var PAGE_OUVERTURE = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SoccaQuiz – Espace parent</title>' +
      '<style>html,body{margin:0;height:100%;background:#fff8ef;overflow:hidden}' +
      'body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;color:#2b2350;font:600 18px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      'img{width:120px;height:120px;border-radius:26px;animation:battre 1.4s ease-in-out infinite}@keyframes battre{50%{transform:scale(1.06)}}</style></head>' +
      '<body><img src="https:\/\/app.soccaquiz.fr/icone-192.png" alt=""><span>Chargement de l\'espace parent</span></body></html>';
    var ATTENTES = {};
    function attendreAutorisation(s) {
      if (ATTENTES[s.id]) return;
      var debut = Date.now();
      ATTENTES[s.id] = setInterval(function () {
        if (Date.now() - debut > 20 * 60 * 1000) { clearInterval(ATTENTES[s.id]); delete ATTENTES[s.id]; var a = document.querySelector('.site[data-id="' + s.id + '"] .attente'); if (a) a.innerHTML = 'Toujours rien ? Recharge cette page une fois l\'autorisation donnée.'; return; }
        google.script.run.withSuccessHandler(function (r) {
          if (!r || !r.pret || !ATTENTES[s.id]) return;
          clearInterval(ATTENTES[s.id]); delete ATTENTES[s.id];
          s.aAutoriser = false; s.urlParent = r.urlParent || s.urlParent;
          afficherSites();
          zoneMsg(s.n).innerHTML = cartePrete(r, s);
          var c = carte(s.n); if (c) { c.querySelector('h2 .titre').textContent = '🎉 ' + titreSite(s) + ' : prêt !'; c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        }).apiAutorise({ n: s.n, id: s.id });
      }, 5000);
    }
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
      var url = lienEnfant(a.dataset.url, a.dataset.appli);
      copier(url);
      try { window.open(mailEnfant(url), '_blank'); } catch (e) {}
      var info = a.parentNode.querySelector('.info-mail');
      if (!info) { info = document.createElement('p'); info.className = 'petit info-mail'; a.parentNode.appendChild(info); }
      info.innerHTML = '✅ Lien copié. Ta messagerie ne s\'est pas ouverte ? <a href="' + h(gmailEnfant(url)) + '" target="_blank" rel="noopener">Écrire le mail dans Gmail</a>, ou colle le lien dans un message.';
    });
    var ETAT = { sites: [] };
    var PLUSIEURS = 'Plusieurs comptes Google sont peut-être ouverts dans ce navigateur : ouvre ce lien dans une fenêtre de navigation privée, ou déconnecte les autres comptes.';
    function carte(n) { return document.querySelector('.site[data-n="' + n + '"]'); }
    function zoneMsg(n) { var c = n != null && carte(n); return c ? c.querySelector('.msg') : res; }
    function ref(s) { return { n: s.n, id: s.id }; }
    // échec de l'appel lui-même (google.script.run) : le plus souvent, plusieurs comptes Google ouverts
    function echec(e) {
      var m = String((e && e.message) || e || '');
      return /PERMISSION|autoris|authoriz/i.test(m) ? { erreur: PLUSIEURS, detail: m } : { erreur: m || 'La page n\'a pas pu joindre Google. Recharge-la.' };
    }
    function erreur(r, n) {
      if (r && r.erreur === 'versions') { zoneMsg(r.n != null ? r.n : n || 0).innerHTML = carteMenage(r, true); return; }
      if (r && r.erreur === 'api') {
        $('e1-alerte').innerHTML = '<div class="ko" style="margin-bottom:8px">' + h(r.message) + ' Fais cette étape, puis reviens et clique à nouveau sur « Installer mon site » (Google peut demander une minute).</div>';
        afficherNouveau(true);
      } else {
        zoneMsg(n).innerHTML = '<div class="ko">😕 ' + h((r && (r.erreur || r.message)) || r) + (r && r.detail ? '<br><span class="petit">' + h(r.detail) + '</span>' : '') + '</div>';
      }
    }
    // fn : apiInstaller (premier site), apiAjouterSite, apiMettreAJour (n = numéro du site)
    // fini (facultatif) : appelé à la fin, avec true si tout s'est bien passé (« Tout mettre à jour »)
    function lancer(fn, arg, bouton, n, fini) {
      var enPlace = fn === 'apiMettreAJour';          // une mise à jour s'affiche dans la carte du site, pas en dessous
      var zone = enPlace ? zoneMsg(n) : res;
      bouton.disabled = true; res.innerHTML = '';
      zone.innerHTML = '<p class="petit">' + (enPlace ? 'Mise à jour' : 'Installation') + ' en cours… (environ 30 secondes, ne ferme pas la page)</p>';
      var appel = google.script.run
        .withSuccessHandler(function (r) {
          bouton.disabled = false;
          if (!r || r.erreur) { zone.innerHTML = ''; if (fn === 'apiAjouterSite' && r && /Terminer/.test(r.erreur || '')) charger(); erreur(r, enPlace ? n : null); if (fini) fini(false); return; }
          zone.innerHTML = ''; res.innerHTML = '';
          var s = { n: r.n || 0, id: r.id, prenom: r.prenom || '', classe: r.classe || '', url: r.url, urlParent: r.urlParent, version: r.version, derniere: r.version, nouvelle: false, appli: r.appli || '',
            famille: !!r.famille, aAutoriser: !!r.famille && !r.pret, lienProjet: r.lienProjet || '' };
          var i = -1; ETAT.sites.forEach(function (x, k) { if (x.n === s.n) i = k; });
          if (i >= 0) ETAT.sites[i] = s; else ETAT.sites.push(s);
          afficherSites();
          var NOUVEAU_LIEN = ' Renvoie le nouveau lien à ton enfant (bouton ✉️) et remplace vos favoris : l\'ancien ne fonctionne plus.';
          if (s.famille) {
            zoneMsg(s.n).innerHTML = (r.nouveauSite ? '<div class="ko" style="margin-bottom:10px"><b>Le programme de ce site avait disparu</b> : un <b>nouveau site</b> a été créé, à une nouvelle adresse.' + NOUVEAU_LIEN + '</div>' : '') +
              (!r.pret ? carteAutoriser(r) : r.maj ? '<div class="ok"><p style="margin:0">Version ' + h(r.version || '') + ' installée. ' + (r.adresseChangee ? '<b>La publication du site avait été supprimée : elle a été recréée, à une nouvelle adresse.</b>' + NOUVEAU_LIEN : 'L\'adresse du site ne change pas.') + '</p></div>' : cartePrete(r, s));
            if (!r.pret) attendreAutorisation(s);
            var c0 = carte(s.n); if (c0) { if (fn !== 'apiInstaller') c0.scrollIntoView({ behavior: 'smooth', block: 'start' }); c0.querySelector('h2 .titre').textContent = r.maj ? '🎉 ' + titreSite(s) + ' : à jour' : r.pret ? '🎉 ' + titreSite(s) + ' : prêt !' : titreSite(s) + ' : presque prêt'; }
            if (fini) fini(true);
            return;
          }
          zoneMsg(s.n).innerHTML = r.nouveauSite ? '<div class="ko" style="margin-bottom:10px"><b>Le programme de ce site avait disparu</b> (mis à la corbeille ?) : un <b>nouveau site</b> a été créé, à de nouvelles adresses. Ses quiz et ses résultats sont repris.' + NOUVEAU_LIEN + '</div>' + AUTORISER
            : r.maj ? '<div class="ok"><p style="margin:0">Version ' + h(r.version || '') + ' installée. ' + (r.adresseChangee ? '<b>La publication du site de l\'enfant avait été supprimée : elle a été recréée, à une nouvelle adresse.</b>' + NOUVEAU_LIEN : 'L\'adresse du site ne change pas.') + '</p>' +
              (r.nouveauParent ? '<p style="margin:8px 0 0"><b>Nouveau : ton espace parent.</b> « Ajouter un quiz » et le suivi des résultats ne sont plus accessibles depuis le lien de ton enfant. Ils sont dans « 🔒 Espace parent », qui ne s\'ouvre qu\'avec ton compte Google : mets-le en favori.</p>' : '') + '</div>' : AUTORISER;
          var c = carte(s.n); if (c && fn !== 'apiInstaller') c.scrollIntoView({ behavior: 'smooth', block: 'start' });
          carte(s.n).querySelector('h2 .titre').textContent = r.maj ? '🎉 ' + titreSite(s) + ' : à jour' : '🎉 ' + titreSite(s) + ' : créé !';
          if (fini) fini(true);
        })
        .withFailureHandler(function (e) { bouton.disabled = false; zone.innerHTML = ''; erreur(echec(e), n); if (fini) fini(false); });
      if (fn === 'apiInstaller') appel.apiInstaller(arg.prenom, arg.classe); else appel[fn](arg);
    }
    // Ménage des versions : Google en garde 200 au plus par site et seul l'éditeur sait les supprimer
    function carteMenage(e, bloque) {
      return '<div class="' + (bloque ? 'ko' : 'maj') + '" style="margin-bottom:10px"><p style="margin:0 0 6px"><b>🧹 Petit ménage à faire (2 minutes, plus simple sur ordinateur)</b></p>' +
        '<p style="margin:0 0 6px">Ce site garde une copie de chaque mise à jour : il en a <b>' + h(e.versions) + ' sur ' + h(e.maxVersions || 200) + '</b> au maximum autorisé par Google. ' +
        (bloque ? 'Il n\'y a plus de place pour la mise à jour : fais ce ménage, puis clique à nouveau sur « Mettre à jour ».' : 'Au-delà, les mises à jour ne passeront plus.') + '</p>' +
        '<ol style="margin:0 0 6px;padding-left:20px"><li>Ouvre le programme du site : <a class="btn leger" href="' + h(e.lienProjet) + '" target="_blank" rel="noopener">Ouvrir le programme SoccaQuiz</a></li>' +
        '<li>Dans la barre de gauche, clique sur l\'horloge <b>« Historique du projet »</b>.</li>' +
        '<li>En bas à droite, clique sur la corbeille <b>« Supprimer des versions en masse »</b>.</li>' +
        '<li>Coche <b>tout</b>, puis <b>Supprimer</b> et confirme. Les versions utilisées par le site ne sont pas proposées : il continue de fonctionner.</li>' +
        '<li>Reviens ici et recharge la page.</li></ol>' +
        '<p class="petit" style="margin:0">Ne modifie rien d\'autre dans le programme.</p></div>';
    }
    function titreSite(s) { return s.classe === 'adulte' ? (s.prenom ? 'Révisions de ' + s.prenom : 'Mes révisions') : s.prenom ? 'Site de ' + s.prenom : (s.n ? 'Site n° ' + (s.n + 1) : 'Ton site est prêt'); }
    // carte d'un site installé : le prénom en titre, « Site de <prénom> » sur le bouton (pas deux fois la même chose)
    function titreCarte(s) { return s.classe !== 'adulte' && s.prenom ? s.prenom : titreSite(s); }
    function nomSite(s) { return s.classe === 'adulte' ? 'Mes quiz' : s.prenom ? 'Site de ' + s.prenom : 'Site de l\'enfant'; }
    /* Appli installable : le bouton et le lien envoyé à l'enfant ouvrent le site dans l'appli, jamais l'adresse Google
       directe (celle qui affiche le bandeau Google), sauf si soccaquiz.json coupe l'appli ("appli": "off"). */
    var MODE_APPLI = '';
    function lienEnfant(classique, appli) { return appli && MODE_APPLI !== 'off' ? appli : classique; }
    fetch('https://leian.github.io/UNIVERSALQUIZ/soccaquiz.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (c) {
      MODE_APPLI = String((c && c.appli) || '');
      [].forEach.call(document.querySelectorAll('a.lien-enfant'), function (a) { a.href = lienEnfant(a.dataset.classique, a.dataset.appli); });
    }).catch(function () {});
    function carteFamille(s) {
      var bas = !s.nouvelle ? '<p class="petit">Version ' + h(s.version || '?') + (s.derniere ? ' : c\'est la dernière.' : '.') + '</p>'
        : '<div class="maj"><p style="margin:0">🔄 <b>Nouvelle version disponible : ' + h(s.derniere) + '</b>' + (s.version ? ' (tu as la ' + h(s.version) + ')' : '') + '</p><button class="btn" data-action="maj" type="button">🔄 Mettre à jour</button>' +
          '<p class="petit" style="margin:6px 0 0">Les adresses, les quiz et les résultats ne changent pas.</p></div>';
      return '<section class="etape site" data-n="' + s.n + '" data-id="' + h(s.id) + '"><h2><span class="titre">' + h(s.prenom ? 'SoccaQuiz de ' + s.prenom : 'Ton SoccaQuiz') + '</span></h2>' +
        '<div class="msg">' + (s.aAutoriser ? carteAutoriser(s) : s.alerteVersions ? carteMenage(s, false) : '') + '</div>' +
        '<div class="actions"><a class="btn lien-enfant" href="' + h(lienEnfant(s.url, s.appli)) + '" data-classique="' + h(s.url) + '" data-appli="' + h(s.appli || '') + '">▶ ' + h(nomSite(s)) + '</a>' +
        (s.urlParent ? '<a class="btn leger" href="' + h(s.urlParent) + '" target="_blank" rel="noopener" data-action="parent">🔒 Espace parent</a>' : '') +
        '<a class="btn leger mail-enfant" href="#" data-url="' + h(s.url) + '" data-appli="' + h(s.appli || '') + '">✉️ Envoyer le lien à ' + h(s.prenom || 'mon enfant') + '</a></div>' +
        '<p class="petit" style="margin:4px 0 8px">Un autre enfant ? : ajoute-le dans ton espace parent (Réglages → « Ajouter un enfant »)</p>' +
        bas +
        '<details class="avance"><summary>Options avancées</summary>' +
        '<p class="petit"><a href="#" data-action="appareil">📱 Ouvrir l\'espace parent sur un autre appareil</a> (nouveau téléphone, espace parent qui ne s\'ouvre plus…)</p>' +
        '<p class="petit"><a href="#" data-action="reinstaller">Réinstaller la dernière version</a> (si le site fonctionne mal)</p>' +
        '<p class="petit"><a href="#" data-action="recommencer">🗑️ Supprimer SoccaQuiz</a></p>' +
        '<div class="confirmer cache ko"><p style="margin:0 0 6px"><b>Supprimer SoccaQuiz</b> : dans ton espace parent, Réglages → « Supprimer le site de … », pour chaque enfant ; le dernier termine ici tout seul (quiz et résultats à la corbeille du Drive, sauf si tu choisis de les garder).</p>' +
        (s.urlParent ? '<p style="margin:0 0 8px"><a class="btn" href="' + h(s.urlParent) + '&supprimer=1" target="_blank" rel="noopener">Continuer dans l\'espace parent</a> <button class="btn leger" data-action="non-recommencer" type="button">Annuler</button></p>' : '') +
        '<p class="petit" style="margin:0">L\'espace parent ne s\'ouvre plus ? <a href="#" data-action="oui-recommencer">Désactiver le site directement</a> (les quiz et les résultats restent alors dans ton Drive).</p></div>' +
        '</details></section>';
    }
    function carteSite(s, seul) {
      if (s.famille) return carteFamille(s);
      var adulte = s.classe === 'adulte';
      if (s.incomplet) return '<section class="etape site" data-n="' + s.n + '" data-id="' + h(s.id) + '"><h2><span class="titre">⚠️ ' + h(titreSite(s)) + ' : installation interrompue</span></h2>' +
        '<div class="msg"></div><p style="margin:0">L\'installation de ce site s\'est arrêtée avant la fin. Clique sur le bouton pour la terminer : rien n\'est recréé en double.</p>' +
        '<button class="btn" data-action="maj" type="button">✨ Terminer l\'installation</button>' +
        '<details class="avance"><summary>Options avancées</summary><p class="petit"><a href="#" data-action="recommencer">Abandonner ce site</a></p>' +
        '<div class="confirmer cache ko"><p>Ses publications éventuelles seront désactivées et l\'installateur l\'oubliera.</p><button class="btn" data-action="oui-recommencer" type="button">Oui, abandonner</button> <button class="btn leger" data-action="non-recommencer" type="button">Annuler</button></div></details></section>';
      return '<section class="etape site" data-n="' + s.n + '" data-id="' + h(s.id) + '"><h2><span class="titre">' + h(titreCarte(s)) + '</span>' + '</h2>'   /* pas de classe ici : elle se change dans l'espace parent, que l'installateur ne voit pas */ +
        '<div class="msg">' + (s.alerteVersions ? carteMenage(s, false) : '') + '</div>' +
        '<div class="actions"><a class="btn lien-enfant" href="' + h(lienEnfant(s.url, s.appli)) + '" data-classique="' + h(s.url) + '" data-appli="' + h(s.appli || '') + '">▶ ' + h(nomSite(s)) + '</a>' +
        (s.urlParent ? '<a class="btn leger" href="' + h(s.urlParent) + '">🔒 Espace parent</a>' : '') +
        (adulte ? '' : '<a class="btn leger mail-enfant" href="#" data-url="' + h(s.url) + '" data-appli="' + h(s.appli || '') + '">✉️ Envoyer le lien à ' + h(s.prenom || 'mon enfant') + '</a>') + '</div>' +
        (seul && s.urlParent ? '<p class="petit" style="margin:4px 0 8px"><b>' + h(nomSite(s)) + '</b> : les quiz, sans compte, c\'est le lien à lui envoyer. <b>Espace parent</b> : ajouter des quiz, suivre les résultats ; il ne s\'ouvre qu\'avec ton compte Google.</p>' : '') +
        (s.migration && s.nouvelle ? '<div class="maj"><p style="margin:0">🔄 <b>Nouvelle version ' + h(s.derniere) + '</b> : elle change de fonctionnement (plus aucun écran d\'alerte de Google) et ne peut pas remplacer ce site. Pour l\'avoir : supprime ce site (Options avancées → Supprimer), puis installe la nouvelle version.</p></div>'
          : !s.nouvelle ? '<p class="petit">Version ' + h(s.version || '?') + (s.derniere ? ' : c\'est la dernière.' : '.') + '</p>'
          : '<div class="maj"><p style="margin:0">🔄 <b>Nouvelle version disponible : ' + h(s.derniere) + '</b>' + (s.version ? ' (tu as la ' + h(s.version) + ')' : '') + '</p><button class="btn" data-action="maj" type="button">🔄 Mettre à jour ce site</button>' +
            '<p class="petit" style="margin:6px 0 0">Son adresse, ses quiz et ses résultats ne changent pas.</p></div>') +
        '<details class="avance"><summary>Options avancées</summary>' +
        '<p class="petit"><a href="#" data-action="reinstaller">Réinstaller la dernière version</a> (si ce site fonctionne mal)</p>' +
        '<p class="petit"><a href="#" data-action="recommencer">🗑️ Supprimer ' + h(s.prenom || 'ce site') + '</a></p>' +
        '<div class="confirmer cache ko"><p style="margin:0 0 6px"><b>Supprimer ' + h(s.prenom || 'ce site') + ', et seulement ' + (s.prenom ? 'lui' : 'ce site') + '</b> : son site et son espace parent seront désactivés (liens et favoris ne marcheront plus), il sera retiré de la famille' + (s.urlParent ? ', et ses quiz et résultats iront dans la corbeille du Drive, sauf si tu choisis de les garder à l\'étape suivante.' : '. Ses quiz et résultats restent dans ton Drive.') + '</p>' +
        (s.urlParent ? '<p style="margin:0 0 8px"><a class="btn" href="' + h(s.urlParent) + '?supprimer=1" target="_top">Continuer dans son espace parent</a> <button class="btn leger" data-action="non-recommencer" type="button">Annuler</button></p>' +
          '<p class="petit" style="margin:0">Son espace parent ne s\'ouvre plus ? <a href="#" data-action="oui-recommencer">Le désactiver directement</a> (ses quiz et résultats restent alors dans ton Drive).</p>'
          : '<button class="btn" data-action="oui-recommencer" type="button">Oui, supprimer ce site</button> <button class="btn leger" data-action="non-recommencer" type="button">Annuler</button>') + '</div>' +
        '</details></section>';
    }
    function afficherSites() {
      $('nouveau').style.display = 'none'; $('deja').style.display = 'block';
      $('intro').textContent = ETAT.sites.length > 1 ? 'Tes sites de quiz, dans ton propre compte Google.' : 'Ton site de quiz, dans ton propre compte Google.';
      $('sites').innerHTML = ETAT.sites.map(function (s) { return carteSite(s, ETAT.sites.length === 1); }).join('');
      ETAT.sites.forEach(function (s) { if (s.famille && s.aAutoriser) attendreAutorisation(s); });
      $('ajout').style.display = ETAT.sites.some(function (s) { return s.famille; }) ? 'none' : '';
      afficherToutMaj();
    }
    // plusieurs sites à mettre à jour : un seul bouton, les sites passent l'un après l'autre
    var MAJ_EN_COURS = false;
    function aMettreAJour() { return ETAT.sites.filter(function (s) { return s.nouvelle && !s.migration && !(s.versions >= s.maxVersions - 2); }); }
    function afficherToutMaj() {
      if (MAJ_EN_COURS) return;
      var l = aMettreAJour();
      $('tout-maj').innerHTML = l.length < 2 ? '' : '<div class="maj" style="margin-bottom:12px"><p style="margin:0 0 8px">🔄 <b>' + l.length + ' sites ont une nouvelle version</b> (' + h(l.map(titreSite).join(', ')) + ').</p>' +
        '<button class="btn" id="tout-maj-btn" type="button">🔄 Tout mettre à jour</button></div>';
      if (l.length >= 2) $('tout-maj-btn').onclick = toutMettreAJour;
    }
    function toutMettreAJour() {
      var l = aMettreAJour(), i = 0, rates = [], b = $('tout-maj-btn');
      MAJ_EN_COURS = true; b.disabled = true;
      var info = function (t) { var p = $('tout-maj').querySelector('p'); if (p) p.innerHTML = t; };
      (function suivant(ok) {
        if (ok === false) rates.push(titreSite(l[i - 1]));
        if (i >= l.length) {
          MAJ_EN_COURS = false;
          $('tout-maj').innerHTML = rates.length ? '<div class="ko" style="margin-bottom:12px">Mise à jour terminée, sauf pour : ' + h(rates.join(', ')) + '. Le message est dans la carte du site : clique à nouveau sur « Mettre à jour ce site ».</div>'
            : '<div class="ok" style="margin-bottom:12px">✅ <b>Tous les sites sont à jour.</b> Leurs adresses ne changent pas.</div>';
          return;
        }
        var s = l[i++], c = carte(s.n), bs = c && c.querySelector('[data-action="maj"]');
        info('🔄 Mise à jour ' + i + ' sur ' + l.length + ' : <b>' + h(titreSite(s)) + '</b>… (environ 30 secondes par site, ne ferme pas la page)');
        lancer('apiMettreAJour', { n: s.n, id: s.id }, bs || b, s.n, suivant);
      })();
    }
    // apiKo : l'installation vient d'échouer parce que l'interrupteur n'est pas activé → l'étape 1 est mise en avant
    // apiOk : l'interrupteur est déjà activé (fait depuis le mail) → l'étape 1 est cachée, il ne reste qu'une étape
    function afficherNouveau(apiKo, apiOk) {
      var sansE1 = !!apiOk && !apiKo;
      $('nouveau').style.display = 'block';
      $('e1').style.display = sansE1 ? 'none' : '';
      $('e2').querySelector('.num').style.display = sansE1 ? 'none' : '';
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
      var c = b.closest('.site'), n = +c.dataset.n, a = b.dataset.action, cible = { n: n, id: c.dataset.id };
      ev.preventDefault();
      if (a === 'maj' || a === 'reinstaller') lancer('apiMettreAJour', cible, b, n);
      else if (a === 'parent') {
        // ouvrir l'espace parent sur CET appareil : un lien à usage unique, fabriqué à la demande (la fenêtre s'ouvre tout de suite,
        // sinon le navigateur bloquerait l'ouverture qui arrive après la réponse du serveur)
        var w = null; try { w = window.open('', '_blank'); } catch (er) {}
        if (w) try { w.document.write(PAGE_OUVERTURE); w.document.close(); } catch (er) {}
        google.script.run.withSuccessHandler(function (r) {
          if (!r || r.erreur || !r.invitation) { if (w) w.close(); return erreur(r || { erreur: 'Le lien n\'a pas pu être fabriqué.' }, n); }
          if (w) w.location.href = r.invitation;
          else zoneMsg(n).innerHTML = '<div class="ok"><a class="btn" href="' + h(r.invitation) + '" target="_blank" rel="noopener">🔒 Ouvrir mon espace parent</a></div>';
        }).withFailureHandler(function (e) { if (w) w.close(); erreur(echec(e), n); }).apiLienParent(cible);
      }
      else if (a === 'appareil') {
        var z = zoneMsg(n); z.innerHTML = '<p class="petit">Préparation du lien… (environ 15 secondes)</p>';
        google.script.run.withSuccessHandler(function (r) {
          if (!r || r.erreur) { z.innerHTML = ''; return erreur(r, n); }
          z.innerHTML = '<div class="ok"><p style="margin:0 0 6px"><b>Lien pour ouvrir ton espace parent sur un appareil</b> (une seule fois, valable 24 h) :</p>' +
            '<p style="margin:0 0 6px"><a class="btn" href="' + h(r.invitation) + '" target="_blank" rel="noopener">🔒 Ouvrir sur cet appareil</a></p>' +
            '<p class="petit" style="margin:0">Pour un autre appareil, copie ce lien et ouvre-le dessus, dans son navigateur (Chrome, Safari) : <span style="word-break:break-all">' + h(r.invitation) + '</span></p></div>';
          c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }).withFailureHandler(function (e) { z.innerHTML = ''; erreur(echec(e), n); }).apiLienParent(cible);
      }
      else if (a === 'recommencer') c.querySelector('.confirmer').style.display = 'block';
      else if (a === 'non-recommencer') c.querySelector('.confirmer').style.display = 'none';
      else if (a === 'oui-recommencer') supprimer(cible, b, n, false);
    });
    // supprimer un site : dernière étape (désactivation et oubli) ; parSite : le ménage du Drive a déjà été fait par son espace parent
    function supprimer(cible, b, n, parSite) {
      if (b) b.disabled = true;
      google.script.run.withSuccessHandler(function (r) {
        if (b) b.disabled = false;
        if (r && r.vivant) { prevenir({ etat: 'vivant' }); return confirmerFin(); }   // le site répond encore : on demande confirmation
        if (!r || r.erreur) { prevenir({ etat: 'erreur' }); if (parSite) { $('suppression').innerHTML = ''; charger(); } return erreur(r, n); }   // non désactivé : le site est gardé, rien n'a changé
        prevenir({ etat: 'ok', desinstalle: !!r.desinstalle });
        $('suppression').innerHTML = ''; $('chargement').style.display = 'none';
        var qui = r.prenom || 'Le site';
        var famille = !parSite && r.urlParent && (r.restants || []).length
          ? '<p style="margin:6px 0 0">Il apparaît peut-être encore dans la famille de tes autres sites : <a class="btn leger" href="' + h(r.restants[0]) + '?oublier=' + encodeURIComponent(r.urlParent) + '" target="_top">Le retirer de la famille</a></p>' : '';
        res.innerHTML = '<div class="ok"><p style="margin:0 0 6px"><b>✅ ' + h(qui) + ' est supprimé</b> : son site et son espace parent sont désactivés' + (r.corbeille ? ', son programme est dans la corbeille du Drive' : '') + ', l\'installateur ne garde plus rien sur lui.' + (parSite ? '' : ' Ses quiz et ses résultats restent dans ton Drive.') + '</p>' + famille +
          (r.corbeille ? '' : '<p class="petit" style="margin:6px 0 0">Il reste son programme « SoccaQuiz » sur <a href="https://script.google.com/home" target="_blank" rel="noopener">script.google.com</a> : tu peux le mettre à la corbeille (⋮ → Supprimer), il ne sert plus.</p>') +
          (r.desinstalle ? '<p style="margin:8px 0 0"><b>SoccaQuiz est entièrement désinstallé</b> : il n\'a plus aucun accès à ton compte Google.</p><p class="petit" style="margin:6px 0 0">Pour ne plus rien garder du tout (facultatif) : vide la <a href="https://drive.google.com/drive/trash" target="_blank" rel="noopener">corbeille du Drive</a> (sinon Google l\'efface dans 30 jours) ; si tu avais créé une clé Gemini, supprime-la sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a> ; remets l\'interrupteur « API Google Apps Script » sur Désactivé (<a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">page Google</a>).</p>' : '') + '</div>';
        if (r.desinstalle) { $('deja').classList.add('cache'); $('nouveau').classList.add('cache'); return; }   // accès retiré : plus d'appel possible
        charger();                                         // liste relue : les autres sites restent tels quels
      }).withFailureHandler(function (e) { if (b) b.disabled = false; prevenir({ etat: 'erreur' }); if (parSite) { $('suppression').innerHTML = ''; charger(); } erreur(echec(e), n); }).apiRecommencer(cible);
    }
    var S = window.__SUPPR;
    // page chargée dans le cadre invisible de l'espace parent : on lui dit comment ça s'est terminé (rien de confidentiel)
    function prevenir(m) {
      if (!S || !S.cadre) return;
      m.uq = 'suppr'; m.id = S.id;
      try { var w = window; while (w !== w.parent) { w = w.parent; w.postMessage(m, '*'); } } catch (e) {}
    }
    // le site répond encore (suppression pas passée par son espace parent, ou lien venu d'ailleurs) : confirmation demandée
    function confirmerFin() {
      $('chargement').style.display = 'none';
      $('suppression').innerHTML = '<section class="etape active"><h2>🗑️ Supprimer ' + h(S.prenom || 'ce site') + ' ?</h2>' +
        '<p style="margin:0 0 8px">Son site répond encore. Pour le désactiver et effacer ce que l\'installateur garde sur lui, confirme. Les autres sites ne sont pas touchés.</p>' +
        '<button class="btn" id="suppr-fin" type="button">Terminer la suppression</button> <a class="btn leger" href="#" id="suppr-annuler">Pas maintenant</a></section>';
      $('suppr-fin').onclick = function () { supprimer({ id: S.id }, $('suppr-fin'), null, true); };
      $('suppr-annuler').onclick = function (ev) { ev.preventDefault(); $('suppression').innerHTML = ''; charger(); };
    }
    if (S) {
      // retour de l'espace parent : la suppression a été confirmée là-bas, on termine tout de suite, sans autre bouton
      $('suppression').innerHTML = '<section class="etape active"><h2>🗑️ Suppression de ' + h(S.prenom || 'ce site') + '</h2>' +
        '<p class="petit" style="margin:0">Dernière étape en cours : désactivation de son site et de son espace parent… (quelques secondes)</p></section>';
      supprimer({ id: S.id, auto: true }, null, null, true);
    }
    function charger() {
      google.script.run
        .withSuccessHandler(function (e) {
          $('chargement').style.display = 'none';
          if (!e || e.erreur) { afficherNouveau(false); return erreur(e); }
          ETAT.sites = e.sites || [];
          if (ETAT.sites.length) afficherSites();
          if (!e.installe) afficherNouveau(false, e.api === true);
          if (e.erreurGithub) res.innerHTML = '<div class="ko">GitHub ne répond pas : impossible de vérifier ou d\'installer une nouvelle version pour l\'instant. Tes sites fonctionnent normalement ; réessaie dans quelques minutes.<br><span class="petit">' + h(e.erreurGithub) + '</span></div>';
        })
        .withFailureHandler(function (e) { $('chargement').style.display = 'none'; erreur(echec(e)); })
        .apiEtat({ d: window.__VUE || '' });
    }
    if (!window.__SUPPR) charger();                    // retour de suppression : la liste est lue une fois la suppression finie
  }) + ')();';
}
