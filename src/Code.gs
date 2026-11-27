/* =====================================================================
   SOCCAQUIZ (ex-Universal Quiz) — version Google Apps Script
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0 — usage commercial interdit :
   https://polyformproject.org/licenses/noncommercial/1.0.0
   ---------------------------------------------------------------------
   👉 Tu es ici pour autoriser ton site ? En haut, la fonction « autoriser » est déjà choisie :
      clique sur « ▷ Exécuter », puis « Examiner les autorisations », coche « Tout sélectionner »
      et « Continuer ». Ne modifie rien d'autre dans ce programme.

   Le programme de la famille (un seul pour tous les enfants), installé par l'installateur en ligne :
     • une seule publication, exécutée avec le compte du parent, ouverte sans compte ;
     • il ne demande que deux autorisations : les fichiers qu'il crée lui-même dans le Drive
       et l'adresse e-mail du compte ; il ne se connecte à aucun service extérieur ;
     • les pages (site de l'enfant, espace parent) sont servies par app.soccaquiz.fr : ce programme
       ne fait que lire et écrire les données (API) ; l'espace parent n'est ouvert qu'aux appareils
       qui ont une clé (lien d'invitation à usage unique).

   Où sont les choses : pour chaque enfant, un dossier Drive « SoccaQuiz » (ou « SoccaQuiz – prénom »)
   avec les Google Sheets « SoccaQuiz – Quiz » (les quiz) et « SoccaQuiz – Résultats ». Le moteur des
   quiz et les pages sont dans ce projet (dossier lib/).
   ===================================================================== */

/* Première fonction du fichier, donc déjà choisie dans l'éditeur : l'installateur l'ouvre ici, le parent clique
   sur « ▷ Exécuter » et accepte les autorisations (écrans bleus de Google, une seule fois). Elle prépare aussi le
   dossier et les tableaux, et note l'adresse du parent qui a installé. */
function autoriser() {
  // Google laisse décocher chaque autorisation : s'il en manque une (souvent « fichiers créés par cette appli »),
  // il réaffiche l'écran d'autorisation au lieu d'échouer plus loin (« You do not have permission to call drive.files.list »)
  if (ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  proprio_();
  installer_();
  console.log("C'est fait : SoccaQuiz peut maintenant fonctionner. Tu peux fermer cet onglet et revenir à l'installateur.");
}

/* ---------------- RÉGLAGES (à adapter) ---------------- */
const CONFIG = {
  prenom: '',                     // prénom de l'enfant (tableau de bord, encouragements) ; vide = « mon enfant »
  nomDossier: 'SoccaQuiz',        // nom du dossier créé dans ton Google Drive
  dureeCacheCatalogue: 60,        // secondes : délai max avant qu'un nouveau quiz apparaisse dans la liste
  version: '',                    // rempli par l'installateur en ligne (ex. v2.0)
  installateur: '',               // adresse de l'installateur en ligne, pour proposer les mises à jour
  espace: '',                     // rempli par l'installateur : 'enfant' ou 'parent' ('' = site installé à la main : tout est ouvert)
  urlEnfant: '',                  // adresse du site de l'enfant (rempli par l'installateur)
  urlParent: '',                  // adresse de l'espace parent (rempli par l'installateur)
  classe: '',                     // classe de l'enfant à l'installation (PS … Tle, ou 'adulte') ; ensuite : Espace parent → Réglages
  classeAnnee: 0,                 // année scolaire de cette classe (2026 = année 2026-2027)
  invitation: '',                 // empreinte (SHA-256) du code du premier appareil du parent, écrite par l'installateur
  cleInstallateur: ''             // empreinte de la clé de l'installateur (lien d'un nouvel appareil demandé depuis l'installateur)
};
/* ---------------- ENFANTS : un seul programme pour toute la famille ----------------
   Un programme (une autorisation, une adresse) sert tous les enfants. L'enfant courant est choisi au début de
   chaque demande : paramètre « e » de l'adresse (…/exec?e=<id>), corps de l'appel de l'appli, ou apiPourEnfant() pour
   les pages servies par Google. Les réglages propres à un enfant (CLES_ENFANT_) et la mémoire du serveur (cache_)
   sont alors rangés sous « <id>| » ; le premier enfant garde les clés sans préfixe (sites d'avant, un seul
   enfant : rien ne change). CONFIG (prénom, dossier, adresses, classe) est ajusté à l'enfant courant. */
const CLES_ENFANT_ = ['DOSSIER', 'RESULTATS', 'EXEMPLE', 'CLASSE', 'CLASSE_ANNEE', 'GENRE', 'MASCOTTE', 'RAZ', 'SAISON_OFF', 'PARPARTIE'];
const CHAMPS_ENFANT_ = ['prenom', 'nomDossier', 'urlEnfant', 'urlParent', 'classe', 'classeAnnee'];
let ENFANT_ = null, PREMIER_CFG_ = null;
function enfants_() {
  const p = PropertiesService.getScriptProperties();
  let l = null;
  try { l = JSON.parse(p.getProperty('ENFANTS') || 'null'); } catch (e) { l = null; }
  if (!Array.isArray(l) || !l.length || !l.every(x => x && /^[a-z0-9]{1,12}$/.test(String(x.id)))) {
    l = [{ id: 'a', prenom: String((PREMIER_CFG_ || CONFIG).prenom || '') }];
    p.setProperty('ENFANTS', JSON.stringify(l));
  }
  return l;
}
/* couleur fixe de chaque enfant (rang dans COULEURS_ENFANTS du tableau de bord, 8 couleurs) : donnée une fois,
   gardée même si un autre enfant est supprimé ; un nouvel enfant prend la première couleur libre */
const NB_COULEURS_ = 8;
function couleursEnfants_(l) {
  let change = false;
  l.forEach(x => {
    if (Number.isInteger(x.c) && x.c >= 0 && x.c < NB_COULEURS_) return;
    const n = Array.from({ length: NB_COULEURS_ }, (v, i) => l.filter(y => y.c === i).length), min = Math.min.apply(null, n);
    x.c = n.indexOf(min); change = true;
  });
  if (change) ecrireEnfants_(l);
  return l;
}
function ecrireEnfants_(l) { PropertiesService.getScriptProperties().setProperty('ENFANTS', JSON.stringify(l)); }
function enfantId_() { return ENFANT_ || choisirEnfant_(''); }
function estPremier_() { return enfantId_() === enfants_()[0].id; }
const avecE_ = (url, id) => url ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'e=' + encodeURIComponent(id) : '';
/* réglages du premier enfant (ceux écrits dans CONFIG par l'installateur), même pendant qu'un autre est choisi */
function cfgPremier_() { return PREMIER_CFG_ || CONFIG; }
function choisirEnfant_(id) {
  const l = enfants_(), x = l.find(y => y.id === String(id || '')) || l[0];
  if (ENFANT_ !== x.id) { INST_ = null; LIGNES_ = null; }
  ENFANT_ = x.id;
  if (x.id === l[0].id) {
    if (PREMIER_CFG_) { Object.assign(CONFIG, PREMIER_CFG_); PREMIER_CFG_ = null; }
    if (x.force || (!CONFIG.prenom && x.prenom)) CONFIG.prenom = x.prenom;     // force : premier enfant remplacé par le suivant
  } else {
    if (!PREMIER_CFG_) { PREMIER_CFG_ = {}; CHAMPS_ENFANT_.forEach(k => { PREMIER_CFG_[k] = CONFIG[k]; }); }
    Object.assign(CONFIG, {
      prenom: x.prenom, nomDossier: 'SoccaQuiz – ' + x.prenom,
      urlEnfant: avecE_(PREMIER_CFG_.urlEnfant, x.id), urlParent: avecE_(PREMIER_CFG_.urlParent, x.id),
      classe: '', classeAnnee: 0
    });
  }
  return ENFANT_;
}
/* fait quelque chose pour un autre enfant, puis revient à l'enfant courant */
function pourEnfant_(id, fn) {
  const avant = enfantId_(), inst = INST_, lignes = LIGNES_;
  choisirEnfant_(id);
  try { return fn(); } finally { choisirEnfant_(avant); INST_ = inst; LIGNES_ = lignes; }
}
function cleEnfant_(k) { return CLES_ENFANT_.indexOf(k) >= 0 && !estPremier_() ? enfantId_() + '|' + k : k; }
/* propriétés du script vues depuis l'enfant courant */
function props_() {
  const p = PropertiesService.getScriptProperties();
  const o = {
    getProperty: k => p.getProperty(cleEnfant_(k)),
    setProperty: (k, v) => { p.setProperty(cleEnfant_(k), v); return o; },
    deleteProperty: k => { p.deleteProperty(cleEnfant_(k)); return o; },
    setProperties: t => { const x = {}; Object.keys(t).forEach(k => { x[cleEnfant_(k)] = t[k]; }); p.setProperties(x); return o; },
    getProperties: () => p.getProperties(),
    deleteAllProperties: () => { p.deleteAllProperties(); return o; }
  };
  return o;
}
/* mémoire du serveur (CacheService) de l'enfant courant */
function cache_() {
  const c = CacheService.getScriptCache(), pre = estPremier_() ? '' : enfantId_() + '|';
  const avec = k => pre + k, liste = l => (l || []).map(avec);
  return {
    get: k => c.get(avec(k)),
    put: (k, v, d) => c.put(avec(k), v, d),
    remove: k => c.remove(avec(k)),
    removeAll: l => c.removeAll(liste(l)),
    getAll: l => { const r = c.getAll(liste(l)) || {}, o = {}; (l || []).forEach(k => { if (r[avec(k)] != null) o[k] = r[avec(k)]; }); return o; },
    putAll: (t, d) => { const x = {}; Object.keys(t).forEach(k => { x[avec(k)] = t[k]; }); c.putAll(x, d); }
  };
}
/* site publié par l'installateur (adresses connues), quel que soit l'enfant choisi */
function siteInstalle_() { const c = cfgPremier_(); return URL_SITE_.test(c.urlParent || '') || URL_SITE_.test(c.urlEnfant || ''); }   // programme de la famille : une seule adresse (urlEnfant)
/* appels des pages servies par Google pour un autre enfant que le premier (pont.html) */
// (fonction publique : Google interdit aux pages d'appeler une fonction dont le nom finit par « _ »)
function apiPourEnfant(enfant, nom, args) {
  nom = String(nom || '');
  if (!/^api[A-Z]\w{1,40}$/.test(nom) || nom === 'apiPourEnfant' || typeof globalThis[nom] !== 'function') return { __status: 400, erreur: 'Action inconnue.' };
  choisirEnfant_(enfant);
  return globalThis[nom].apply(null, Array.isArray(args) ? args : []);
}
/* retirer un enfant du programme : ses réglages sont effacés (son dossier, lui, n'est pas touché ici).
   Le premier enfant retiré, le suivant prend sa place (ses réglages passent sans préfixe) : l'adresse sans « e » reste valable. */
function retirerEnfant_(id) {
  const p = PropertiesService.getScriptProperties(), l = enfants_(), i = l.findIndex(x => x.id === id);
  if (i < 0 || l.length < 2) return false;
  if (i === 0) {
    const n = l[1];
    CLES_ENFANT_.forEach(k => { const v = p.getProperty(n.id + '|' + k); if (v != null) p.setProperty(k, v); else p.deleteProperty(k); p.deleteProperty(n.id + '|' + k); });
    n.force = 1;
  } else CLES_ENFANT_.forEach(k => p.deleteProperty(id + '|' + k));
  l.splice(i, 1);
  ecrireEnfants_(l);
  return true;
}
/* ajouter un enfant (espace parent, parent qui a installé) : même programme, nouveau dossier et nouveaux tableaux */
function apiAjouterEnfant(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut ajouter un enfant.' };
  d = d || {};
  const prenom = String(d.prenom || '').replace(/[<>"`\\&$|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!prenom) return { erreur: 'Écris le prénom de l\'enfant.' };
  const l = enfants_();
  if (l.length >= 12) return { erreur: 'Douze enfants au plus.' };
  if (l.some(x => String(x.prenom).toLowerCase() === prenom.toLowerCase())) return { erreur: prenom + ' est déjà dans la liste.' };
  let id;
  do { id = Utilities.getUuid().replace(/[^a-z0-9]/g, '').slice(0, 6); } while (!id || l.some(x => x.id === id));
  couleursEnfants_(l);
  l.push({ id, prenom });
  couleursEnfants_(l);
  return pourEnfant_(id, () => {
    if (d.classe) apiClasse({ classe: d.classe });
    installer_();
    const x = enfants_().find(y => y.id === id) || {};
    return { ok: true, id, prenom, classe: classe_(), couleur: Number.isInteger(x.c) ? x.c : null, parent: urlParentIci_(id), enfant: urlAppli_() || CONFIG.urlEnfant };
  });
}
/* renommer l'enfant affiché : prénom de la liste (et, pour le premier, celui des réglages) ; son dossier garde son nom */
function apiRenommerEnfant(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut renommer un enfant.' };
  const prenom = String((d && d.prenom) || '').replace(/[<>"`\\&$|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!prenom) return { erreur: 'Écris le prénom.' };
  const l = enfants_(), id = enfantId_(), x = l.find(y => y.id === id);
  if (!x) return { erreur: 'Enfant introuvable.' };
  if (l.some(y => y.id !== id && String(y.prenom).toLowerCase() === prenom.toLowerCase())) return { erreur: prenom + ' est déjà dans la liste.' };
  x.prenom = prenom;
  if (x.id === l[0].id) x.force = 1;            // le premier enfant prend ce prénom à la place de celui des réglages d'installation
  ecrireEnfants_(l);
  CONFIG.prenom = prenom;
  try { const c = cache_(); c.removeAll(['catalogue', 'liste', 'famille']); } catch (e) {}
  return { ok: true, prenom };
}
const ICONE_SITE = 'https://leian.github.io/UNIVERSALQUIZ/icone.png';
const POLICES = 'https://leian.github.io/UNIVERSALQUIZ/polices/polices.css';
// Appli installable (dossier appli/, publiée sur leian.github.io/app/) : elle affiche le site de l'enfant dans un cadre
// et l'ouvre avec …/exec?cadre=1. Sans ce paramètre, rien ne change. Le mode cadre ne sert qu'à la navigation
// (pont.html) : jamais à changer un style, un texte ou une fonction — une seule interface pour le lien et pour l'appli.
const ORIGINE_APPLI = 'https://leian.github.io';
let CADRE_ = false;                    // remis à zéro dans doGet
let CLASSIQUE_ = false;                // …?classique=1 : site affiché hors de l'appli (secours, interrupteur "off")
/* adresse de l'appli pour le site de l'enfant : …/app/?s=<identifiant de son déploiement> ('' si inconnue) */
function urlAppliBase_() {
  const m = String(cfgPremier_().urlEnfant || '').match(/^https:\/\/script\.google\.com\/macros\/s\/(AKfy[\w-]{20,200})\/exec$/);
  return m ? ORIGINE_APPLI + '/app/?s=' + m[1] : '';
}
// pour un autre enfant que le premier, l'appli ouvre le site avec …?e=<id> (paramètre q de l'appli)
function urlAppli_() {
  const b = urlAppliBase_();
  return b && !estPremier_() ? b + '&q=' + encodeURIComponent('e=' + enfantId_()) : b;
}
/* Le bandeau « Cette application a été créée par un utilisateur de Google Apps Script » n'est affiché par Google
   que lorsque l'adresse script.google.com du site est ouverte directement ; dans le cadre de l'appli, il n'y est pas.
   Le site de l'enfant ouvert directement (favori, ancien lien, lien partagé…) ne montre donc jamais ses pages : il
   renvoie tout de suite vers l'appli, à la même page. Si le navigateur refuse ce renvoi automatique (Google ne
   l'autorise qu'après un toucher), un seul grand bouton « Ouvrir SoccaQuiz » s'affiche.
   Exception : …?classique=1 (secours choisi dans l'appli, ou interrupteur "appli": "off"). */
/* paramètres de la page demandée, sans ceux de l'appli : rouvre la même page dans l'appli (…/app/?s=…&q=…) */
let REQUETE_ = '';
function requete_(p) {
  return Object.keys(p || {}).filter(k => ['cadre', 'classique', 'appli'].indexOf(k) < 0 && p[k] !== '')
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(p[k])).join('&');
}
function versAppli_(p) {
  const appli = urlAppliBase_();      // le paramètre e de l'enfant est déjà dans la requête
  if (!estEnfant_() || CADRE_ || CLASSIQUE_ || !appli) return null;
  const q = requete_(p);
  const cible = appli + (q ? '&q=' + encodeURIComponent(q) : '');
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return HtmlService.createHtmlOutput(
    '<style>html,body{margin:0;height:100%;background:#fff8ef}body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font:600 18px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#2b2350;text-align:center;padding:24px;box-sizing:border-box}' +
    'img{width:110px;height:110px;border-radius:24px}a{color:#fff;background:#a9010d;border-radius:999px;padding:14px 28px;text-decoration:none;font-size:20px}#msg{min-height:1.4em}</style>' +
    '<img src="' + h(ORIGINE_APPLI + '/app/icone-192.png') + '" alt="">' +
    '<a id="ouvrir" href="' + h(cible) + '" target="_top">Ouvrir SoccaQuiz</a><span id="msg"></span>' +
    '<script>(function () { var c = ' + jsonScript_(cible) + ';' +
    ' try { window.top.location.replace(c); } catch (e) {}' +
    ' setTimeout(function () { document.getElementById("msg").textContent = "Touche le bouton pour ouvrir tes quiz."; }, 1200); })();</script>')
    .setTitle('SoccaQuiz').setFaviconUrl(ICONE_SITE).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
/* autorise l'affichage dans le cadre de l'appli ; jamais pour l'espace parent (connexion Google, clickjacking) */
function cadre_(sortie) {
  return CADRE_ ? sortie.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) : sortie;
}
/* pages sans pont.html (erreur, « espace parent ») : préviennent quand même l'appli que la page est affichée */
function signalCadre_() {
  return CADRE_ ? '<script>try { window.top.postMessage({ uq: "pret" }, ' + JSON.stringify(ORIGINE_APPLI) + '); } catch (e) {}</script>' : '';
}
/* ------------------------------------------------------ */

const NOM_SHEETS = 'SoccaQuiz – Résultats';
// anciens noms (avant le passage à SoccaQuiz) : un site réinstallé retrouve ainsi ses quiz et ses résultats
const ANCIEN_DOSSIER = 'Universal Quiz', ANCIEN_SHEETS = 'Universal Quiz – Résultats';
// mode (ajouté en v2.49) : normal, erreurs (« refaire mes erreurs »), duel (défi en famille), revision ; vide = normal
const COLONNES = ['id', 'date', 'joueur', 'quiz', 'titre', 'matiere', 'score', 'total', 'duree', 'dateLocale', 'appareil', 'cats', 'questions', 'mode'];
const PAGES = { 'index': 'lib/page-index', 'tableau-de-bord': 'lib/page-tableau-de-bord', 'ajouter': 'lib/page-ajouter' };
// pages et actions réservées à l'espace parent
const PAGES_PARENT = ['tableau-de-bord', 'ajouter'];
// un appareil de parent reconnu par sa clé (PARENT_) agit comme l'espace parent, même sur l'adresse de l'enfant
function estEnfant_() { return CONFIG.espace === 'enfant' && !PARENT_; }
function refusEnfant_() { return { __status: 403, erreur: 'Réservé à l\'espace parent.' }; }
/* Deux parents : l'espace parent s'exécute avec le compte de la personne qui l'ouvre (installateur : USER_ACCESSING,
   tout compte Google). Ce qui donne accès, c'est le partage Drive du dossier de l'enfant. Les propriétés du script
   (clé Gemini, classe…) et le cache ne passent pas par Drive : chaque action vérifie donc d'abord que le visiteur
   est le parent qui a installé le site (il peut ouvrir le programme dans son Drive) ou qu'il a accès au dossier. */
let PROPRIO_ = null, ACCES_ = null, DEMANDE_SUPPR_ = false;
function estProprietaire_() {
  if (PARENT_) return PARENT_.role === 'proprio';
  if (PROPRIO_ === null) try {
    const moi = String(Session.getActiveUser().getEmail() || '').toLowerCase(), proprio = proprio_();
    PROPRIO_ = CONFIG.espace !== 'parent' || (!!moi && moi === proprio);
  } catch (e) { PROPRIO_ = false; }
  return PROPRIO_;
}
/* adresse du parent qui a installé : notée quand le programme s'exécute avec son compte (éditeur, site de l'enfant) */
function proprio_() {
  const props = props_();
  let p = props.getProperty('PROPRIO');
  if (!p && CONFIG.espace !== 'parent') try { p = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); if (p) props.setProperty('PROPRIO', p); } catch (e) {}
  return p || '';
}
function accesParent_() {
  if (PARENT_) return true;
  if (ACCES_ === null) ACCES_ = CONFIG.espace !== 'parent' || estProprietaire_() || !!ouvrirDossier_(props_().getProperty('DOSSIER'));
  return ACCES_;
}
function interdit_() { return estEnfant_() || !accesParent_(); }
const PAS_PARTAGE = 'Cet espace parent ne t\'est pas partagé. Demande au parent qui a installé SoccaQuiz de t\'inviter (Espace parent → Réglages → Autre parent), puis ouvre le lien avec le compte Google invité.';
function urlIci_() {
  return (estEnfant_() ? CONFIG.urlEnfant : CONFIG.espace === 'parent' ? CONFIG.urlParent : '') || (estPremier_() ? ScriptApp.getService().getUrl() : avecE_(ScriptApp.getService().getUrl(), enfantId_())) || '';
}
const COMMUN = {
  'moteur-quiz.css': 'lib/moteur-quiz-css',
  'themes.css': 'lib/themes-css',
  'suivi.js': 'lib/suivi-js',
  'recompenses.js': 'lib/recompenses-js',
  'moteur-quiz.js': 'lib/moteur-quiz-js',
  'animations.js': 'lib/animations-js',
  'dessins.js': 'lib/dessins-js',
  'badges.js': 'lib/badges-js'
};
const MATIERES = {
  francais:   { nom: 'Français',   emo: '📖', c: 'var(--fr)' },
  maths:      { nom: 'Maths',      emo: '➕', c: 'var(--math)' },
  sciences:   { nom: 'Sciences',   emo: '🔬', c: 'var(--sci)' },
  anglais:    { nom: 'Anglais',    emo: '🇬🇧', c: 'var(--en)' },
  histoire:   { nom: 'Histoire',   emo: '🏰', c: 'var(--hist)' },
  geographie: { nom: 'Géographie', emo: '🌍', c: 'var(--geo)' },
  musique:    { nom: 'Musique',    emo: '🎵', c: 'var(--mus)' },
  autre:      { nom: 'Autres',     emo: '⭐', c: 'var(--autre)' }
};

/* =====================================================================
   POINT D'ENTRÉE WEB
   ===================================================================== */
function doGet(e) {
  const p = (e && e.parameter) || {};
  CHRONO_ = { t0: Date.now(), t: Date.now(), etapes: [] };
  CHRONO_DEMANDE_ = p.chrono === '1' || p.chrono === '0' ? p.chrono : '';
  SAISON_FORCEE = SAISONS.indexOf(p.saison) >= 0 ? p.saison : '';
  CLES_PAGE_ = null;     // …/exec?saison=noel : aperçu d'une saison
  INST_ = null; LIGNES_ = null; PROPRIO_ = null; ACCES_ = null; DEMANDE_SUPPR_ = false; PARENT_ = null;
  choisirEnfant_(p.e);
  CADRE_ = p.cadre === '1' && CONFIG.espace !== 'parent';
  CLASSIQUE_ = p.classique === '1';
  REQUETE_ = requete_(p);
  const page = nettoyerNom_(p.page || 'index');
  if (p.api) return reponseJson_(apiGet_(p));     // appli servie hors de Google : données seulement, jamais de page
  try {
    const renvoi = versAppli_(p);
    if (renvoi) return renvoi;
    if (estEnfant_() && PAGES_PARENT.indexOf(page) >= 0) return pageEspaceParent_();
    if (!accesParent_()) return pageErreur_('Espace non partagé', PAS_PARTAGE);
    // …?oublier=<espace parent d'un site supprimé> : lien donné par l'installateur après une suppression faite sans passer par ce site
    if (p.oublier && !estEnfant_() && estProprietaire_() && URL_SITE_.test(String(p.oublier)) && p.oublier !== CONFIG.urlParent) try { ecrireFamille_(f => { f.sites = f.sites.filter(x => x.parent !== p.oublier); }); } catch (e) {}
    else if (p.oublier && !estEnfant_() && estProprietaire_()) try { apiFamilleRetirer({ parent: String(p.oublier) }); } catch (e) {}
    DEMANDE_SUPPR_ = !!p.supprimer;
    const inst = installer_();
    chrono_('ouverture');
    try { inscrireFamille_(inst); } catch (err) { console.error(err); }   // jamais bloquant
    chrono_('famille');
    let html;
    // dans l'espace parent, l'accueil est le tableau de bord des parents (pas la page de l'enfant)
    const pageServie = CONFIG.espace === 'parent' && page === 'index' ? 'tableau-de-bord' : page;
    if (PAGES[pageServie]) {
      html = lib_(PAGES[pageServie], true);
    } else if (page === 'revisions' || page === 'defi') {
      html = pageRevision_(page);
      if (!html) return pageErreur_('Rien à revoir pour l\'instant', 'Bravo ! Aucune question n\'attend d\'être revue. Reviens après avoir joué quelques quiz.');
    } else {
      html = quizEnCache_(inst, page);
      if (html == null) return pageErreur_('Quiz introuvable', 'Aucun fichier « ' + page + '.html » dans le dossier Drive « ' + inst.dossier.getName() + ' ».');
    }
    chrono_('page');
    return servir_(assembler_(html, page, inst));
  } catch (err) {
    console.error(err);
    return pageErreur_('Oups, une erreur', String(err && err.message || err));
  }
}

/* =====================================================================
   API JSON POUR L'APPLI SERVIE HORS DE GOOGLE (plan « site de l'enfant hors de Google »)
   GET  …/exec?api=etat             → réglages de l'accueil (__UQ), catalogue des quiz, matières
   GET  …/exec?api=quiz&page=<nom>  → contenu d'un quiz (ou des pages revisions / defi) et maîtrise de ce quiz
   POST …/exec, texte {"api":"enregistrer","d":"<partie>"} ou {"api":"signaler","d":{…}}
   Réservée au site de l'enfant (ou à un site installé à la main) : l'espace parent reste servi par Google.
   Elle donne exactement ce que reçoivent aujourd'hui les pages du site de l'enfant, avec les mêmes contrôles,
   et aucune action des parents. API_V augmente à chaque changement : l'appli sait parler aux anciennes versions.
   ===================================================================== */
const API_V = 1;
function reponseJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
/* l'appli demande un enfant précis (?e=, ou attendu= : celui qu'elle affichait sans ?e=) qui n'est plus dans la
   famille : il a été supprimé. Sans ce contrôle, choisirEnfant_ prendrait le premier enfant et l'icône restée sur
   l'appareil montrerait le site d'un autre enfant. Les identifiants ne sont jamais réutilisés. */
function enfantSupprime_(p) {
  const l = enfants_();
  return ['e', 'attendu'].some(k => {
    const id = String((p && p[k]) || '');
    return /^[a-z0-9]{1,12}$/.test(id) && !l.some(x => x.id === id);
  });
}
function apiGet_(p) {
  if (CONFIG.espace === 'parent') return { v: API_V, erreur: 'Réservé au site de l\'enfant.' };
  if (enfantSupprime_(p)) return { v: API_V, supprime: true };
  try {
    const inst = installer_();
    if (p.api === 'etat') {
      const cat = catalogue_(inst.dossier);
      return { v: API_V, version: CONFIG.version, prenom: CONFIG.prenom || '', enfant: enfantId_(), polices: POLICES, reglages: reglagesPage_('index', inst, cat), quiz: cat.QUIZ, matieres: MATIERES };
    }
    if (p.api === 'quiz') {
      const page = nettoyerNom_(p.page || '');
      CLES_PAGE_ = null;
      const html = page === 'revisions' || page === 'defi' ? pageRevision_(page) : PAGES[page] ? null : quizEnCache_(inst, page);
      if (!html) return { v: API_V, erreur: 'Quiz introuvable.' };
      let maitrise = null;
      try { maitrise = maitrisePour_(page, CLES_PAGE_); } catch (e) {}
      return { v: API_V, page, html, maitrise };
    }
    return { v: API_V, erreur: 'Demande inconnue.' };
  } catch (e) {
    console.error(e);
    return { v: API_V, erreur: String(e && e.message || e) };
  }
}
function doPost(e) {
  let o = null;
  try { o = JSON.parse(e && e.postData && e.postData.contents || 'null'); } catch (err) {}
  if (!o || typeof o !== 'object') return reponseJson_({ v: API_V, __status: 400, erreur: 'Demande illisible.' });
  if (CONFIG.espace === 'parent' && o.api !== 'appairer' && o.api !== 'parent') return reponseJson_({ v: API_V, erreur: 'Réservé au site de l\'enfant.' });
  PARENT_ = null; PROPRIO_ = null; ACCES_ = null; INST_ = null; LIGNES_ = null;
  choisirEnfant_(o.e || (e && e.parameter && e.parameter.e));
  if (o.api === 'appairer') return reponseJson_(Object.assign({ v: API_V }, appairer_(o.code, o.nom)));
  if (o.api === 'inviter-installateur') return reponseJson_(Object.assign({ v: API_V }, inviterParInstallateur_(o.cle)));
  if (o.api === 'parent') return reponseJson_(Object.assign({ v: API_V }, actionParent_(o)));
  if ((o.api === 'enregistrer' || o.api === 'signaler') && enfantSupprime_(o)) return reponseJson_({ v: API_V, supprime: true });   // jamais chez un autre enfant
  try {
    if (o.api === 'enregistrer') return reponseJson_(Object.assign({ v: API_V }, apiEnregistrer(typeof o.d === 'string' ? o.d : JSON.stringify(o.d || {}))));
    if (o.api === 'signaler') return reponseJson_(Object.assign({ v: API_V }, apiSignaler(o.d && typeof o.d === 'object' ? o.d : {})));
  } catch (err) {
    console.error(err);
    return reponseJson_({ v: API_V, __status: 500, erreur: String(err && err.message || err) });
  }
  return reponseJson_({ v: API_V, __status: 400, erreur: 'Demande inconnue.' });
}

/* Fonction à lancer une fois depuis l'éditeur (bouton ▶ Exécuter) :
   crée le dossier Drive, le Sheets des résultats et un quiz d'exemple. */
function installer() {
  const inst = installer_();
  const url = ScriptApp.getService().getUrl();
  console.log('✅ Dossier des quiz : ' + inst.dossier.getUrl());
  console.log('✅ Résultats       : ' + inst.ss.getUrl());
  console.log(url ? '🌐 Adresse du site : ' + url : 'ℹ️ Il reste à déployer : bouton « Déployer » → « Nouveau déploiement » → « Application web ».');
  // les adresses du Drive ne sont jamais renvoyées au site de l'enfant (le journal ci-dessus n'est visible que dans l'éditeur)
  return estEnfant_() ? { ok: true } : { dossier: inst.dossier.getUrl(), resultats: inst.ss.getUrl(), site: url };
}

/* Petit bilan, à lancer depuis l'éditeur en cas de doute. */
function diagnostic() {
  const inst = installer_();
  if (!estEnfant_()) viderCatalogue_();   // depuis le site de l'enfant : pas de vidage du cache à répétition
  const cat = catalogue_(inst.dossier);
  console.log('Dossier : ' + inst.dossier.getName() + ' — ' + inst.dossier.getUrl());
  console.log(cat.QUIZ.length + ' quiz');
  cat.QUIZ.forEach(q => console.log('  • ' + q.fichier + ' → « ' + q.titre + ' » (' + q.matiere + ')'));
  console.log('Résultats : ' + Math.max(0, inst.ss.getSheets()[0].getLastRow() - 1) + ' partie(s) — ' + inst.ss.getUrl());
  console.log('Site : ' + (ScriptApp.getService().getUrl() || 'pas encore déployé'));
}

/* =====================================================================
   INSTALLATION (automatique et idempotente)
   ===================================================================== */
let INST_ = null, LIGNES_ = null;      // gardés le temps d'une exécution (remis à zéro dans doGet)
function installer_() {
  const props = props_(), idD = props.getProperty('DOSSIER'), idS = props.getProperty('RESULTATS'), cle = idD + '|' + idS;
  if (INST_ && INST_.cle === cle) return INST_.r;
  // espace parent : seul un visiteur qui a accès au dossier passe (les données en cache ne passent pas par Drive)
  if (CONFIG.espace === 'parent' && !accesParent_()) throw new Error(PAS_PARTAGE);
  const cache = cache_();
  let r;
  if (idD && idS && cache.get('inst') === cle) {
    // vérifiés il y a moins de 10 minutes : ouverts seulement si la page en a besoin (souvent, tout vient du cache)
    let d = null, s = null;
    r = {
      get dossier() { return d || (d = DRV_.getFolderById(idD)); },
      get ss() { return s || (s = TAB_.openById(idS)); }
    };
  } else {
    r = installer0_();
  }
  const cle2 = props.getProperty('DOSSIER') + '|' + props.getProperty('RESULTATS');
  if (cle2 !== cle || cache.get('inst') !== cle2) try { cache.put('inst', cle2, 600); } catch (e) {}
  INST_ = { r, cle: cle2 };
  return r;
}
function installer0_() {
  const props = props_();
  let dossier = ouvrirDossier_(props.getProperty('DOSSIER'));
  let ss = ouvrirSheets_(props.getProperty('RESULTATS'));
  if (dossier && ss) return { dossier, ss };
  // l'autre parent (ou un inconnu) ne crée jamais rien : il ne ferait que changer les adresses enregistrées
  if (CONFIG.espace === 'parent' && !estProprietaire_()) throw new Error(PAS_PARTAGE);

  const verrou = LockService.getScriptLock();
  verrou.waitLock(30000);
  try {
    dossier = ouvrirDossier_(props.getProperty('DOSSIER'));
    if (!dossier) {
      const premier = it => { while (it.hasNext()) { const x = it.next(); if (!x.isTrashed()) return x; } return null; };   // jamais un dossier de la corbeille
      // l'ancien dossier « Universal Quiz » n'est repris que par le site principal (les autres sites ont leur propre dossier)
      dossier = premier(DRV_.getRootFolder().getFoldersByName(CONFIG.nomDossier))
        || (CONFIG.nomDossier === 'SoccaQuiz' && premier(DRV_.getRootFolder().getFoldersByName(ANCIEN_DOSSIER)))
        || DRV_.createFolder(CONFIG.nomDossier);
      props.setProperty('DOSSIER', dossier.getId());
    }
    ss = ouvrirSheets_(props.getProperty('RESULTATS'));
    if (!ss) {
      const f = trouverFichier_(dossier, NOM_SHEETS) || trouverFichier_(dossier, ANCIEN_SHEETS);
      ss = f ? TAB_.open(f) : creerSheets_(dossier);
      props.setProperty('RESULTATS', ss.getId());
    }
    // un quiz d'exemple dans un dossier tout neuf (après le tableau des résultats : celui des quiz est créé à cette occasion)
    if (!props.getProperty('EXEMPLE')) {
      if (!contientHtml_(dossier)) dossier.createFile('quiz_exemple_capitales.html', lib_('lib/exemple-quiz', false), MimeType.HTML);
      props.setProperty('EXEMPLE', '1');
    }
  } finally {
    verrou.releaseLock();
  }
  return { dossier, ss };
}

function ouvrirDossier_(id) {
  if (!id) return null;
  try { const d = DRV_.getFolderById(id); return d.isTrashed() ? null : d; } catch (e) { return null; }
}
function ouvrirSheets_(id) {
  if (!id) return null;
  try { if (DRV_.getFileById(id).isTrashed()) return null; return TAB_.openById(id); } catch (e) { return null; }
}
function contientHtml_(dossier) {
  const it = dossier.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/\.html?$/i.test(f.getName()) && !f.isTrashed()) return true; }
  return false;
}
function creerSheets_(dossier) {
  const ss = TAB_.create(NOM_SHEETS, dossier.getId());
  const sh = ss.getSheets()[0];
  sh.setName('Parties');
  sh.getRange(1, 1, 1, COLONNES.length).setValues([COLONNES]).setFontWeight('bold');
  sh.getRange(1, 1, sh.getMaxRows(), COLONNES.length).setNumberFormat('@');   // texte brut : pas de conversion automatique des dates
  sh.setFrozenRows(1);
  return ss;
}

/* =====================================================================
   ASSEMBLAGE D'UNE PAGE
   Les fichiers « commun/… » sont insérés directement dans la page
   (Apps Script ne sert pas de fichiers séparés), puis on ajoute
   le « pont » qui relie la page à Google (résultats, liens).
   ===================================================================== */
/* réglages d'une page (__UQ) : posés dans la page servie par Google, ou renvoyés en JSON à l'appli (?api=etat) */
function reglagesPage_(page, inst, cat) {
  // scores de toutes les parties, posés dans la page : l'accueil et les badges n'ont plus à les demander au serveur
  const avecResultats = page !== 'ajouter' && page !== 'tableau-de-bord' && !(CONFIG.espace === 'parent' && page === 'index');
  let resultats = null;
  if (avecResultats) try { resultats = listeResumee_(); } catch (e) { resultats = null; }
  chrono_('resultats');
  const cfg = {
    url: urlIci_(),
    espace: PARENT_ ? 'parent' : CONFIG.espace,      // appareil de parent reconnu : pages des parents
    urlEnfant: CONFIG.urlEnfant,
    urlParent: urlParentIci_(),
    urlEnfantBase: cfgPremier_().urlEnfant,      // adresse Google du site, sans l'enfant (liens vers l'appli)
    appliBase: urlAppliBase_(),
    enfant: estPremier_() ? '' : enfantId_(),
    page: page,
    chemin: '/' + page + '.html',
    liens: cat.liens,
    version: CONFIG.version,
    installateur: CONFIG.installateur,
    pagesParent: PAGES_PARENT,
    classe: classe_(),
    classes: CLASSES,
    parPartie: parPartie_(),
    parPartieChoix: PAR_PARTIE_,
    revisions: (page === 'index' && CONFIG.espace !== 'parent') ? (() => { try { const r = revisions_(); return { n: r.aRevoir.length, defi: r.defi.length, mois: r.moisDefi, nouveau: r.nouveauDefi }; } catch (e) { return null; } })() : null,
    maitrise: page === 'ajouter' ? null : (() => { try { return maitrisePour_(CONFIG.espace === 'parent' && page === 'index' ? 'tableau-de-bord' : page, CLES_PAGE_); } catch (e) { return null; } })(),
    saison: saison_(),
    saisonDuJour: saisonDe_(),
    saisonActive: props_().getProperty('SAISON_OFF') !== '1',
    mascotte: mascotte_(),
    mascottes: MASCOTTES_LYCEE,
    genre: genreReglage_(),                 // réglage du parent : auto, f, m, n
    genreAuto: genreDuPrenom_(CONFIG.prenom), // ce que donne le prénom (affiché à côté de « Automatique »)
    genreEffectif: genre_(),
    genreDevine: genreDuPrenom_(CONFIG.prenom),
    genresDessines: GENRES_DESSINES,
    raz: props_().getProperty('RAZ') || ''    // remise à zéro de la mémoire des appareils (pont.html)
  };
  cfg.theme = themeDe_(cfg.classe);
  // allure : seulement si les dessins existent pour ce thème (sinon la socca de toujours)
  cfg.genresDispo = ['f', 'm'].filter(g => genreDessine_(cfg.theme, g));
  if (!genreDessine_(cfg.theme, cfg.genreEffectif)) cfg.genreEffectif = 'n';
  if (!genreDessine_(cfg.theme, cfg.genreAuto)) cfg.genreAuto = 'n';
  cfg.genresSaisons = cfg.genreEffectif === 'n' ? [] : SAISONS_GENRE[cfg.genreEffectif];
  // postures du collège : seulement celles dont le dessin animé est déposé (rien tant que la liste est vide)
  if (cfg.theme === 'college') cfg.poses = { n: POSES_DESSINEES.n, f: POSES_DESSINEES.f, m: POSES_DESSINEES.m, allure: cfg.genreEffectif };
  if (resultats) cfg.resultats = resultats;
  chrono_('revisions et maitrise');
  // adresse de l'appli de l'enfant : liens « site de l'enfant » de l'espace parent, retour du site ouvert hors de l'appli (pont.html)
  if (urlAppli_()) cfg.appli = urlAppli_();
  if (CLASSIQUE_) cfg.classique = true;
  if (CADRE_) cfg.q = REQUETE_;                // page en cours, pour la rouvrir dans l'appli si besoin
  if (CADRE_) cfg.cadre = ORIGINE_APPLI;      // ouvert par l'appli installée : pont.html garde les liens dans l'appli
  // la clé Gemini n'est donnée qu'à la page « Ajouter un quiz », jamais aux quiz que joue l'enfant
  if (CONFIG.espace === 'parent' || !CONFIG.espace && page === 'tableau-de-bord') cfg.geminiOk = !!cleGemini_();
  if (page === 'ajouter' && !estEnfant_()) cfg.gemini = cleGemini_();
  // espace parent : les autres enfants de la famille (sélecteur en haut, « ajouter aussi pour… »)
  if (!estEnfant_() && ['index', 'tableau-de-bord'].indexOf(page) >= 0 && siteInstalle_()) {
    cfg.proprio = estProprietaire_();
    if (DEMANDE_SUPPR_) cfg.demandeSuppression = true;    // ouvert par l'installateur (« Supprimer … ») : Réglages → Supprimer
    if (cfg.proprio) try { cfg.parents = parentsDe_(lireFamille_()); cfg.liensParent = liensParent_(); } catch (e) { cfg.parents = []; }
  }
  if (!estEnfant_() && ['index', 'tableau-de-bord'].indexOf(page) >= 0) {
    cfg.razMot = CONFIG.prenom || 'zéro';         // mot à taper pour confirmer une remise à zéro
    try { cfg.dossierUrl = inst.dossier.getUrl(); } catch (e) {}   // Réglages → « Ouvrir le dossier Drive »
  }
  if (!estEnfant_() && ['index', 'tableau-de-bord', 'ajouter'].indexOf(page) >= 0) try { cfg.famille = familleListe_().map(x => ({ prenom: x.prenom, classe: x.classe, parent: x.parent, ici: x.ici, couleur: x.couleur })); } catch (e) { cfg.famille = []; }
  // la configuration est posée dans sa propre balise : Apps Script peut retirer les commentaires des fichiers,
  // on ne s'appuie donc sur aucun marqueur à remplacer dans pont.html
  return cfg;
}

function assembler_(html, page, inst) {
  const cat = catalogue_(inst.dossier);
  chrono_('catalogue');
  const aBadges = /src=["']commun\/badges\.js["']/i.test(html);
  const aAnimations = /src=["']commun\/animations\.js["']/i.test(html);
  const aDessins = /src=["']commun\/dessins\.js["']/i.test(html);

  html = html.replace(/<link\b[^>]*href=["']commun\/([\w.-]+\.css)["'][^>]*>/gi, (m, f) =>
    COMMUN[f] ? lib_(COMMUN[f], true) : '<!-- ' + f + ' introuvable -->');      // déjà entouré de <style>

  html = html.replace(/<script\b[^>]*src=["']commun\/([\w.-]+\.js)["'][^>]*>\s*<\/script>/gi, (m, f) => {
    if (f === 'catalogue.js') return '';                       // remplacé par le catalogue automatique (dans l'en-tête)
    if (!COMMUN[f]) return '<!-- ' + f + ' introuvable -->';
    let s = lib_(COMMUN[f], true);                     // déjà entouré de <script>
    if (f === 'moteur-quiz.js' && !aBadges) s += '\n' + lib_(COMMUN['badges.js'], true);
    if (f === 'moteur-quiz.js' && !aAnimations) s += '\n' + lib_(COMMUN['animations.js'], true);
    if (f === 'moteur-quiz.js' && !aDessins) s = lib_(COMMUN['dessins.js'], true) + '\n' + s;   // avant le moteur : catalogue des dessins   // quiz déjà déposés : ajouté sans les modifier
    return s;
  });

  chrono_('moteur');
  const cfg = reglagesPage_(page, inst, cat);
  chrono_('reglages');
  if (CHRONO_) cfg.chrono = { etapes: CHRONO_.etapes, total: Date.now() - CHRONO_.t0, demande: CHRONO_DEMANDE_ };
  const pont = '<script>window.__UQ = ' + jsonScript_(cfg) + ';</script>\n' + lib_('lib/pont', false);
  const catalogueJs = 'var QUIZ = ' + jsonScript_(cat.QUIZ) + ';\nvar MATIERES = ' + jsonScript_(MATIERES) + ';';
  const tete = '\n<base target="_top">\n' + pont + '\n<script>\n' + catalogueJs + '\n</script>\n';

  // thème d'âge : posé sur <html>, styles ajoutés en fin d'en-tête pour passer après ceux de la page
  // polices (Fredoka, Nunito, Andika) servies par GitHub Pages : aucune requête vers Google Fonts depuis le site de l'enfant
  const styleTheme = '<link rel="stylesheet" href="' + POLICES + '">\n' + lib_(COMMUN['themes.css'], false);
  html = html.replace(/<html\b/i, '<html data-theme="' + cfg.theme + '"' + (cfg.theme === 'lycee' ? ' data-mascotte="' + cfg.mascotte + '"' : '') + (cfg.genreEffectif !== 'n' ? ' data-genre="' + cfg.genreEffectif + '"' + (cfg.genresSaisons.indexOf(cfg.saison) >= 0 ? ' data-genre-saison="' + cfg.genreEffectif + '"' : '') : '') + (cfg.saison ? ' data-saison="' + cfg.saison + '"' : ''));
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, styleTheme + '\n</head>') : styleTheme + html;
  return /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, m => m + tete)
    : tete + html;
}

function servir_(html) {
  const t = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  return cadre_(HtmlService.createHtmlOutput(html)
    .setTitle(texte_(t || 'Quiz'))
    .setFaviconUrl(ICONE_SITE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1'));
}

/* page affichée dans le site de l'enfant quand on demande une page des parents */
function pageEspaceParent_() {
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return cadre_(HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;border:2px solid #eadfce;border-radius:16px;background:#fff;color:#2a1f1a">' +
    '<h2 style="margin-top:0">🔒 Espace parent</h2>' +
    '<p>Cette page est réservée aux parents. Elle s\'ouvre avec le lien « Espace parent », en étant connecté au compte Google du parent.</p>' +
    (CONFIG.urlParent ? '<p><a href="' + h(CONFIG.urlParent) + '" target="_top" style="display:inline-block;background:#c8102e;color:#fff;border-radius:999px;padding:10px 18px;text-decoration:none;font-weight:600">🔒 Ouvrir l\'espace parent</a></p>' : '') +
    (CONFIG.urlEnfant ? '<p><a href="' + h(urlAppli_() || CONFIG.urlEnfant) + '" target="_top">← Revenir aux quiz</a></p>' : '') + '</div>' + signalCadre_())
    .setTitle('Espace parent').setFaviconUrl(ICONE_SITE).addMetaTag('viewport', 'width=device-width, initial-scale=1'));
}

function pageErreur_(titre, message) {
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const accueil = (estEnfant_() && urlAppli_()) || urlIci_();
  return cadre_(HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px">' +
    '<h2 style="margin-top:0">😕 ' + h(titre) + '</h2><p>' + h(message) + '</p>' +
    (accueil ? '<p><a href="' + h(accueil) + '" target="_top">📚 Revenir à mes quiz</a></p>' : '') + '</div>' + signalCadre_())
    .setTitle(titre).addMetaTag('viewport', 'width=device-width, initial-scale=1'));
}

/* lecture d'un fichier du projet (lib/…) ; {{PRENOM}} y est remplacé par le prénom des réglages.
   Apps Script refuse un fichier .html qui n'est pas du HTML valide : construire.mjs entoure donc
   chaque fichier .js de <script>…</script> et chaque .css de <style>…</style>. */
const LIB_CACHE_ = {};
function lib_(nom, avecPrenom) {
  if (!(nom in LIB_CACHE_)) LIB_CACHE_[nom] = HtmlService.createHtmlOutputFromFile(nom).getContent();
  const s = LIB_CACHE_[nom];
  if (!avecPrenom) return s;
  const prenom = String(CONFIG.prenom || '').trim().replace(/'/g, '’').replace(/[<>"`\\&$]/g, '');
  if (prenom) return s.split('{{PRENOM}}').join(prenom);
  // sans prénom : « mon enfant » dans l'espace parent, rien côté enfant (« Salut ! » plutôt que « Salut mon enfant ! »)
  return nom === PAGES['tableau-de-bord'] ? s.split('{{PRENOM}}').join('mon enfant') : s.replace(/[ ,\u00a0]*\{\{PRENOM\}\}/g, '');
}

/* =====================================================================
   CATALOGUE AUTOMATIQUE
   Chaque .html du dossier = un quiz.
   Titre, matière et icône sont lus dans MoteurQuiz.lancer({ … }).
   Un fichier catalogue.js (format du dépôt GitHub) déposé dans le
   dossier, s'il existe, fournit les descriptions et badges exacts.
   ===================================================================== */
function catalogue_(dossier) {
  const cache = cache_();
  const enCache = cache.get('catalogue');
  if (enCache) return JSON.parse(enCache);

  const props = props_();
  const toutes = props.getProperties();
  const aEcrire = {};
  const QUIZ = [];
  let surcharges = { Q: {} };

  const it = dossier.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const nom = f.getName();
    if (f.isTrashed()) continue;
    if (nom === 'catalogue.js') { surcharges = lireSurcharges_(f) || surcharges; continue; }
    if (/\.html?$/i.test(nom)) {
      const cle = 'm_' + f.getId(), maj = f.getLastUpdated().getTime();
      let meta = null;
      try { meta = JSON.parse(toutes[cle] || 'null'); } catch (e) {}
      if (!meta || meta.u !== maj || meta.n !== nom || meta.v !== META_V) {
        meta = Object.assign({ u: maj, n: nom }, lireMeta_(f.getBlob().getDataAsString('UTF-8'), nom, f.getDateCreated()));
        aEcrire[cle] = JSON.stringify(meta);
      }
      QUIZ.push(Object.assign({ titre: meta.titre, matiere: meta.matiere, fichier: nom, description: meta.description, date: meta.date, badge: meta.badge }, meta.nq ? { nq: meta.nq } : {}, meta.pool ? { pool: meta.pool } : {}, meta.biblio ? { biblio: meta.biblio } : {}, meta.biblio && meta.biblioV ? { biblioV: meta.biblioV } : {}));
    }
  }

  // les descriptions du catalogue.js (s'il existe) l'emportent
  QUIZ.forEach(q => { const s = surcharges.Q[q.fichier]; if (s) Object.assign(q, s, { fichier: q.fichier }); });

  if (Object.keys(aEcrire).length) props.setProperties(aEcrire);
  // fichiers supprimés ou renommés : leurs entrées m_… sont retirées des propriétés (limite de 500 Ko) ;
  // p_… : marques de partage des anciens contrôles PDF (fonction retirée en v2.71)
  const vus = {}; QUIZ.forEach(x => { vus[x.fichier] = 1; });
  try {
    Object.keys(toutes).forEach(k => {
      if (aEcrire[k]) return;
      if (/^m_/.test(k)) { let m = null; try { m = JSON.parse(toutes[k]); } catch (e) {} if (!m || !vus[m.n]) props.deleteProperty(k); }
      else if (/^p_/.test(k)) props.deleteProperty(k);
    });
  } catch (e) {}
  const cat = { QUIZ };
  try { cache.put('catalogue', JSON.stringify(cat), CONFIG.dureeCacheCatalogue); } catch (e) {}
  return cat;
}

const META_V = 4;                       // à augmenter quand lireMeta_ lit un nouveau champ : les quiz déjà lus sont relus
function lireMeta_(html, nom, cree) {
  const i = html.lastIndexOf('MoteurQuiz.lancer');
  const bloc = i >= 0 ? html.slice(i) : html;
  const champ = k => {
    const m = bloc.match(new RegExp('\\b' + k + '["\']?\\s*:\\s*(["\'`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1'));
    return m ? m[2].replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\[nt]/g, ' ').replace(/\\(["'`\\/])/g, '$1') : '';
  };
  const titreBalise = texte_((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/^Quiz\s*[–-]\s*/i, '');
  const titre = texte_(champ('titre')) || titreBalise || joli_(nom.replace(/\.html?$/i, ''));
  const matiere = (champ('matiere') || 'autre').toLowerCase();
  const sous = texte_(champ('sousTitre').split(/<br\s*\/?>/i)[0]);
  // nombre de questions d'une partie (coin de la carte du quiz) : celui du quiz (nbQuestions, 20 par défaut),
  // au plus le nombre de questions écrites (« Pool : N questions ») ; le thème d'âge peut encore le réduire (index.html)
  const pool = +((html.match(/Pool\s*:\s*(\d+)\s*questions/i) || [])[1] || 0);
  const parPartie = +((bloc.match(/\bnbQuestions["']?\s*:\s*(\d+)/) || [])[1] || 0);
  const nq = pool ? Math.min(parPartie || 20, pool) : parPartie;
  return {
    titre: titre.slice(0, 120),
    matiere: MATIERES[matiere] ? matiere : 'autre',
    badge: (/^(⭐|🌟|✨)?$/u.test(champ('badge')) && champ('icone')) || champ('badge') || '',
    description: sous.slice(0, 200),
    nq: nq > 0 && nq < 1000 ? nq : 0,
    pool: pool > 0 && pool < 1000 ? pool : 0,      // questions écrites : plafond quand le parent choisit plus de questions par partie
    v: META_V,
    date: dateDepuisNom_(nom) || jour_(cree),
    biblio: /^[a-z0-9-]{1,80}$/.test(champ('biblio')) ? champ('biblio') : '',   // quiz ajouté depuis la bibliothèque : son identifiant
    biblioV: /^\d{1,6}$/.test(champ('biblioV')) ? champ('biblioV') : ''           // … et sa version
  };
}

function lireSurcharges_(f) {
  // le fichier n'est jamais exécuté : on lit seulement le tableau QUIZ, écrit comme des données
  try {
    const code = f.getBlob().getDataAsString('UTF-8');
    const tableau = nom => {
      const i = code.search(new RegExp('\\b' + nom + '\\s*=\\s*\\['));
      return i < 0 ? [] : JSON.parse(litteralVersJson_(code, code.indexOf('[', i)));
    };
    const r = { Q: tableau('QUIZ') };
    const parFichier = l => (Array.isArray(l) ? l : []).reduce((o, x) => { if (x && x.fichier) o[String(x.fichier).split('/').pop()] = x; return o; }, {});
    return { Q: parFichier(r.Q) };
  } catch (e) {
    console.warn('catalogue.js illisible : ' + e.message);
    return null;
  }
}

/* le fichier d'un quiz d'après le nom de page (nettoyé par nettoyerNom_) : « quiz (1).html », « l'eau.html », « x.htm » */
/* littéral JavaScript (tableau d'objets) → JSON, lu caractère par caractère : chaînes '…' "…" `…` avec leurs
   échappements (« L'eau », « niveau: facile », « CM1 // CE2 » restent du texte), commentaires retirés,
   clés sans guillemets, virgules finales. Rien n'est exécuté. */
function litteralVersJson_(code, deb) {
  let out = '', prof = 0, j = deb;
  const finVirgule = () => { out = out.replace(/,\s*$/, ''); };
  for (; j < code.length; j++) {
    const c = code[j];
    if (c === '"' || c === "'" || c === '`') {
      let v = '', k = j + 1;
      for (; k < code.length && code[k] !== c; k++) {
        if (code[k] === '\\') {
          const e = code[++k];
          if (e === 'u') { v += String.fromCharCode(parseInt(code.substr(k + 1, 4), 16)); k += 4; }
          else v += ({ n: '\n', t: '\t', r: '' })[e] !== undefined ? ({ n: '\n', t: '\t', r: '' })[e] : e;
        } else v += code[k];
      }
      out += JSON.stringify(v); j = k; continue;
    }
    if (c === '/' && code[j + 1] === '/') { while (j < code.length && code[j] !== '\n') j++; continue; }
    if (c === '/' && code[j + 1] === '*') { j = code.indexOf('*/', j + 2); if (j < 0) break; j++; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let k = j; while (k < code.length && /[\w$]/.test(code[k])) k++;
      const mot = code.slice(j, k), apres = code.slice(k).match(/^\s*:/);
      out += apres ? JSON.stringify(mot) : mot; j = k - 1; continue;
    }
    if (c === '[' || c === '{') prof++;
    if (c === ']' || c === '}') { finVirgule(); prof--; out += c; if (prof === 0) return out; continue; }
    out += c;
  }
  throw new Error('tableau non fermé');
}
function trouverQuiz_(dossier, page) {
  const f = trouverFichier_(dossier, page + '.html');
  if (f) return f;
  const it = dossier.getFiles();
  while (it.hasNext()) {
    const x = it.next(), nom = x.getName();
    if (/\.html?$/i.test(nom) && !x.isTrashed() && nettoyerNom_(nom.replace(/\.html?$/i, '')) === page) return x;
  }
  return null;
}
function trouverFichier_(dossier, nom) {
  const it = dossier.getFilesByName(nom);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; }
  return null;
}

/* =====================================================================
   API DES RÉSULTATS (appelée par la page via google.script.run)
   Même contrat que l'ancienne fonction Cloudflare /api/resultats.
   ===================================================================== */
function apiEnregistrer(brut) {
  // essais du parent depuis l'espace parent (« ▶ Tester ») : pas comptés dans les résultats de l'enfant
  if (CONFIG.espace === 'parent') return { ok: true, id: '', essai: true };
  if (typeof brut !== 'string' || brut.length > 200000) return { __status: 400, erreur: 'Données trop volumineuses' };
  let r;
  try { r = JSON.parse(brut); } catch (e) { return { __status: 400, erreur: 'JSON invalide' }; }
  if (!r || typeof r.quiz !== 'string' || !isFinite(+r.score) || !isFinite(+r.total) || +r.total <= 0) {
    return { __status: 400, erreur: 'Champs obligatoires : quiz, score, total' };
  }
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const total = Math.min(500, Math.max(1, Math.round(+r.total))), score = Math.min(total, Math.max(0, +r.score));
  const date = new Date().toISOString();
  // identifiant envoyé par l'appareil : une partie renvoyée (page fermée pendant l'envoi, deux onglets) n'est pas comptée deux fois
  const idApp = String(r._id || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const id = 'r:' + date + ':' + (idApp || Math.random().toString(36).slice(2, 8));
  const cache = cache_();
  // pas plus de 40 parties par minute depuis le lien de l'enfant (le Sheets ne doit pas pouvoir être rempli sans fin)
  const minute = 'n' + Math.floor(Date.now() / 60000), nb = +(cache.get(minute) || 0);
  if (nb >= 40) return { __status: 429, erreur: 'Trop de parties en même temps : réessaie dans une minute.' };
  try { cache.put(minute, String(nb + 1), 120); } catch (e) {}
  let joueur = '';
  try { joueur = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  let questions = Array.isArray(r.questions) ? r.questions.slice(0, 200).filter(q => q && typeof q === 'object').map(q => {
    const x = { q: str(q.q, 400), cat: str(q.cat, 80), donne: str(q.donne, 200), attendu: str(q.attendu, 200), ok: !!q.ok };
    if (q.k) x.k = str(q.k, 40);
    if (q.i) x.i = 1;                                                          // réponse trouvée avec l'indice
    if (!x.ok && typeof q.o === 'string' && q.o.length <= 6000) {               // question entière, pour les révisions : vérifiée comme une question créée
      const o = questionRatee_(q.o); if (o) x.o = JSON.stringify(o);
    }
    return x;
  }) : [];
  // scores par catégorie : seulement des nombres (ils sont affichés dans l'espace parent)
  const cats = {};
  if (r.cats && typeof r.cats === 'object') Object.keys(r.cats).slice(0, 60).forEach(c => {
    const v = r.cats[c]; if (!v || typeof v !== 'object' || /^(__proto__|constructor|prototype)$/.test(c)) return;
    cats[str(c, 80)] = { ok: Math.max(0, Math.round(+v.ok) || 0), total: Math.max(0, Math.round(+v.total) || 0) };
  });
  let jsonQ = JSON.stringify(questions);
  while (jsonQ.length > 49000 && questions.some(q => q.o)) { const q = questions.find(q => q.o); delete q.o; jsonQ = JSON.stringify(questions); }
  if (jsonQ.length > 49000) {         // une cellule Sheets contient au plus 50 000 caractères
    questions = questions.map(q => ({ q: q.q.slice(0, 120), cat: q.cat.slice(0, 40), donne: q.donne.slice(0, 60), attendu: q.attendu.slice(0, 60), ok: q.ok, k: q.k, i: q.i }));
    jsonQ = JSON.stringify(questions);
    while (jsonQ.length > 49000 && questions.length) { questions.pop(); jsonQ = JSON.stringify(questions); }
  }
  const ligne = {
    id, date, joueur,
    quiz: str(r.quiz, 160), titre: str(r.titre, 120), matiere: str(r.matiere, 30),
    score: String(score), total: String(total),
    duree: r.duree != null && isFinite(+r.duree) ? String(Math.round(+r.duree)) : '',
    dateLocale: str(r.dateLocale, 40), appareil: str(r.appareil, 20),
    cats: JSON.stringify(cats),
    questions: jsonQ,
    mode: /^(normal|erreurs|duel|revision)$/.test(r.mode) ? r.mode : 'normal'
  };
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const sh = feuille_();
    if (idApp) {                                                   // déjà reçue ? (les 300 dernières parties suffisent)
      const n = sh.getLastRow(), deb = Math.max(2, n - 299);
      if (n >= 2 && sh.getRange(deb, 1, n - deb + 1, 1).getValues().some(v => String(v[0]).slice(-idApp.length - 1) === ':' + idApp)) return { ok: true, id, deja: true };
    }
    if (sh.getRange(1, COLONNES.length).getValue() !== 'mode') sh.getRange(1, COLONNES.length).setValue('mode');   // Sheets créé avant la colonne « mode »
    sh.appendRow(COLONNES.map(c => cellule_(ligne[c])));
  } finally { verrou.releaseLock(); }
  try { cache.removeAll(['revisions', 'maitrise', 'liste']); cache.put('gen', String(Date.now()), 21600); } catch (e) {}
  LIGNES_ = null;
  // le site n'attend pas cette réponse (l'écran de résultat est déjà affiché) : on en profite pour recalculer
  // tout de suite ce que la prochaine page demandera (scores, révisions, maîtrise), elle n'aura qu'à le lire
  try { listeResumee_(); revisions_(); maitrise_(); } catch (e) {}
  return { ok: true, id };
}

/* question ratée envoyée par le moteur (champ o) : repassée par les mêmes contrôles qu'une question créée */
function questionRatee_(o) {
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return null; } }
  if (!o || typeof o !== 'object') return null;
  // champs des quiz faits à la main (t, alts, accept, e) ramenés au format interne avant le contrôle
  const src = Object.assign({}, o, { type: o.type || o.t, exp: o.exp || o.e });
  if (/^(input|saisie)$/.test(src.type || '')) src.ans = [].concat(o.ans || [], o.a != null ? [o.a] : [], o.alt || [], o.alts || [], o.accept || []);
  const n = normaliserQuestion_(src, 0, [], {}, true);
  if (!n) return null;
  ['unit', 'disp', 'both', 'hint'].forEach(k => { if (typeof o[k] === 'string' && o[k]) n[k] = o[k].replace(/<\/?script[^>]*>/gi, '').slice(0, 200); });
  const clean = (v, l) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, l);
  if (o.k) n.k = clean(o.k, 40);
  if (o.src) n.src = clean(o.src, 120);
  if (o.mat && MATIERES[o.mat]) n.mat = o.mat;
  const ico = emoji_(o.ico); if (ico) n.ico = ico;
  return n;
}

/* ---------------- « Mes révisions » et défi du mois ----------------
   Répétition espacée (boîtes de Leitner) sur les questions déjà ratées, à partir des résultats :
   ratée → boîte 0 ; bonne réponse au moins 1, 3, 7 puis 21 jours après la précédente → boîte suivante ;
   boîte 4 = acquise. Une question est « à revoir » quand son délai est écoulé.
   Défi du mois : les questions ratées le mois précédent et pas encore acquises, proposées tout le mois. */
const DELAIS_REVISION = [1, 3, 7, 21];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function revisions_(maintenant) {
  const cache = cache_();
  if (!maintenant) { const c = lireCache_('revisions'); if (c) return c; }
  const gen = cache.get('gen') || '';
  const now = maintenant || new Date(), JOUR = 864e5;
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1), debutMoisPrec = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const etat = dict_();
  lireLignes_().map(complet_).filter(l => l.date).sort((a, b) => a.date.localeCompare(b.date)).forEach(l => {
    const d = new Date(l.date).getTime();
    (l.questions || []).forEach(x => {
      if (!x.k) return;
      let s = etat[x.k];
      if (!x.ok) {
        const o = x.o ? questionRatee_(x.o) : null;
        s = etat[x.k] = Object.assign(s || {}, { boite: 0, der: d });
        if (o) s.o = o;
        if (d >= debutMoisPrec.getTime() && d < debutMois.getTime()) s.moisPrec = true;
      } else if (s && s.boite < 4 && d - s.der >= DELAIS_REVISION[s.boite] * JOUR * 0.9) {
        s.boite++; s.der = d;
      }
    });
  });
  const avecQuestion = Object.keys(etat).map(k => etat[k]).filter(s => s.o && s.boite < 4);
  const aRevoir = avecQuestion.filter(s => now.getTime() - s.der >= DELAIS_REVISION[s.boite] * JOUR * 0.9).map(s => s.o);
  const defi = avecQuestion.filter(s => s.moisPrec).map(s => s.o);
  const r = { aRevoir, defi, moisDefi: MOIS_FR[debutMoisPrec.getMonth()], nouveauDefi: now.getDate() <= 7 };
  if (!maintenant) mettreEnCache_('revisions', r, gen);
  return r;
}
/* ---------------- Maîtrise par notion (catégorie d'un quiz) et par question ----------------
   Chaque réponse vaut 1 (juste), 0,5 (juste avec l'indice) ou 0 (fausse).
   Notion : Découverte (moins de 3 réponses), En progrès (moins de 70 % sur ses 10 dernières réponses),
   Acquis (70 % ou plus), Maîtrisé (90 % ou plus et au moins 2 jours différents réussis à 80 % ou plus).
   Question : nombre de réponses et série de bonnes réponses sans indice (sert au tirage et au passage à l'écrit).
   Les réponses données dans « Mes révisions » et le défi comptent pour le quiz d'origine. */
const NIVEAUX = ['Découverte', 'En progrès', 'Acquis', 'Maîtrisé'];
function maitrise_() {
  const cache = cache_();
  const c = lireCache_('maitrise'); if (c) return c;
  const gen = cache.get('gen') || '';
  const origine = dict_(), notions = dict_(), questions = dict_(), titres = dict_();
  lireLignes_().map(complet_).filter(l => l.date).sort((a, b) => a.date.localeCompare(b.date)).forEach(l => {
    const virtuel = l.quiz === 'revisions' || l.quiz === 'defi', jour = jour_(new Date(l.date)) || l.date.slice(0, 10);   // jour à l'heure de Paris
    if (!virtuel && l.titre) titres[l.quiz] = l.titre;
    (l.questions || []).forEach(x => {
      let quiz = l.quiz, cat = x.cat || '—';
      if (x.k) { if (virtuel) { const o = origine[x.k]; if (!o) return; quiz = o[0]; cat = o[1]; } else origine[x.k] = [quiz, cat]; }
      else if (virtuel) return;
      const v = x.ok ? (x.i ? 0.5 : 1) : 0;
      const n = ((notions[quiz] = notions[quiz] || dict_())[cat] = notions[quiz][cat] || { r: [], j: dict_() });
      n.r.push(v); if (n.r.length > 10) n.r.shift();
      const j = n.j[jour] = n.j[jour] || [0, 0]; j[0] += v; j[1]++;
      if (x.k) {
        const q = ((questions[quiz] = questions[quiz] || dict_())[x.k] = questions[quiz][x.k] || [0, 0]);
        q[0]++; q[1] = !x.ok ? 0 : x.i ? q[1] : q[1] + 1;
      }
    });
  });
  const res = { notions: {}, q: questions, titres };
  Object.keys(notions).forEach(quiz => {
    res.notions[quiz] = {};
    Object.keys(notions[quiz]).forEach(cat => {
      const n = notions[quiz][cat], nb = Object.keys(n.j).reduce((t, d) => t + n.j[d][1], 0);
      const taux = Math.round(n.r.reduce((a, b) => a + b, 0) / n.r.length * 100);
      const bonsJours = Object.keys(n.j).filter(d => n.j[d][0] / n.j[d][1] >= 0.8).length;
      const niv = nb < 3 ? 0 : taux < 70 ? 1 : taux >= 90 && bonsJours >= 2 ? 3 : 2;
      res.notions[quiz][cat] = [niv, taux, nb];
    });
  });
  mettreEnCache_('maitrise', res, gen);
  return res;
}
/* la partie utile à une page : tout le site pour l'accueil et le tableau de bord, un seul quiz sinon */
function maitrisePour_(page, cles) {
  const m = maitrise_();
  if (page === 'index' || page === 'tableau-de-bord') return { notions: m.notions, titres: m.titres };
  if (!cles) return { notions: m.notions[page] || {}, q: m.q[page] || {} };
  const q = {};                                  // « Mes révisions », défi : les questions de la page, tous quiz confondus
  Object.keys(m.q).forEach(quiz => Object.keys(m.q[quiz]).forEach(k => { if (cles[k]) q[k] = m.q[quiz][k]; }));
  return { notions: {}, q };
}

/* page de quiz fabriquée à partir des questions à revoir ('revisions') ou du défi du mois ('defi') */
let CLES_PAGE_ = null;
function pageRevision_(page) {
  let r; try { r = revisions_(); } catch (e) { return null; }
  const defi = page === 'defi', liste = defi ? r.defi : r.aRevoir;
  if (!liste.length) return null;
  CLES_PAGE_ = {}; liste.forEach(o => { if (o.k) CLES_PAGE_[o.k] = 1; });
  const icones = {};
  const questions = liste.map(o => { const q = Object.assign({}, o); q.cat = o.src || o.cat || 'Révision'; if (o.ico) icones[q.cat] = o.ico; return q; });
  return fabriquerQuizHtml_({
    titre: defi ? 'Défi de ' + r.moisDefi : 'Mes révisions',
    sousTitre: defi ? 'Les questions ratées en ' + r.moisDefi + ' : relève le défi !' : 'Les questions que tu avais ratées, à revoir aujourd\'hui',
    icone: defi ? '🏆' : '🎯', badge: defi ? '🏆' : '', matiere: 'autre', couleur: '#c8102e',
    questions, memo: [], icones
  });
}

function apiLister(q) {
  q = q || {};
  // site de l'enfant : seulement la liste résumée (scores des quiz), jamais le détail des réponses
  if (estEnfant_()) q = {};
  LIGNES_ = null;
  installer_();                // espace parent ouvert par un compte sans accès : refusé ici, avant toute lecture
  if (!q.id && String(q.details) !== '1') return { resultats: listeResumee_() };
  const lignes = lireLignes_();
  if (q.id) {
    const l = lignes.find(x => x.id === q.id);
    return l ? complet_(l) : { __status: 404, erreur: 'Partie introuvable' };
  }
  const liste = lignes.map(l => ({
    id: l.id, date: l.date, quiz: l.quiz, titre: l.titre, matiere: l.matiere,
    score: +l.score || 0, total: +l.total || 0, duree: l.duree === '' ? null : +l.duree,
    joueur: l.joueur, appareil: l.appareil, mode: l.mode || 'normal', _l: l
  }));
  liste.sort((a, b) => String(b.date || b.id).localeCompare(String(a.date || a.id)));
  if (String(q.details) === '1') {
    // seulement ce qu'affiche le tableau de bord (pas la question entière o) : chargement plus léger
    liste.slice(0, 200).forEach(x => { const c = complet_(x._l); x.questions = c.questions.map(y => ({ q: y.q, ok: y.ok, donne: y.donne, attendu: y.attendu, cat: y.cat, i: y.i })); x.cats = c.cats; });
  }
  liste.forEach(x => { delete x._l; if (estEnfant_()) delete x.joueur; });
  return { resultats: liste };
}

/* scores de toutes les parties (sans le détail des réponses) : accueil, badges, meilleur score.
   Gardés en cache jusqu'à la prochaine partie enregistrée ; aussi posés dans la page (__UQ.resultats). */
function listeResumee_() {
  const enCache = lireCache_('liste');
  if (enCache) return enCache;
  const gen = cache_().get('gen') || '';
  const liste = lireLignes_().map(l => ({
    id: l.id, date: l.date, quiz: l.quiz, titre: l.titre, matiere: l.matiere,
    score: +l.score || 0, total: +l.total || 0, duree: l.duree === '' ? null : +l.duree,
    appareil: l.appareil, mode: l.mode || 'normal'
  }));
  liste.sort((a, b) => String(b.date || b.id).localeCompare(String(a.date || a.id)));
  mettreEnCache_('liste', liste, gen);
  return liste;
}

function apiSupprimer(id) {
  if (interdit_()) return refusEnfant_();
  if (typeof id !== 'string' || !/^r:[0-9T:.\-Z]+:[a-z0-9]+$/.test(id)) return { __status: 400, erreur: 'Identifiant invalide' };
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const sh = feuille_();
    const n = sh.getLastRow();
    if (n < 2) return { __status: 404, erreur: 'Partie introuvable' };
    const ids = sh.getRange(2, 1, n - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] === id) {
        sh.deleteRow(i + 2);
        LIGNES_ = null;
        try { cache_().removeAll(['revisions', 'maitrise', 'liste']); } catch (e) {}
        return { ok: true };
      }
    }
    return { __status: 404, erreur: 'Partie introuvable' };
  } finally { verrou.releaseLock(); }
}

/* suppression d'un quiz depuis la page d'accueil : le fichier part dans la corbeille du Drive (récupérable 30 jours) */
function apiSupprimerQuiz(nom) {
  if (interdit_()) return refusEnfant_();
  nom = String(nom || '').split('/').pop();
  if (!/\.html?$/i.test(nom) || nom.length > 200) return { erreur: 'Quiz invalide.' };
  const inst = installer_();
  const f = trouverFichier_(inst.dossier, nom);
  if (!f) return { erreur: 'Ce quiz n\'existe plus (déjà supprimé ?).' };
  try { f.setTrashed(true); } catch (e) { inst.dossier.removeFile(f); }   // quiz créé par l'autre parent : seul lui peut le mettre à la corbeille
  viderCatalogue_();
  return { ok: true };
}

/* Texte d'un quiz du site, au format en lignes : pour le proposer à la bibliothèque de la communauté.
   Seuls les quiz créés depuis le site (configuration en JSON) peuvent être relus ainsi. */
/* demande d'aide (bouton « ? » de l'espace parent) : adresse du compte Google du parent, pour que SoccaQuiz lui réponde.
   Elle n'est donnée qu'à la page ; c'est le parent qui l'envoie (et peut la changer) avec sa question. */
function apiEmailParent() {
  if (interdit_()) return refusEnfant_();
  let email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  if (!email) email = proprio_();
  return { email, prenom: CONFIG.prenom || '', classe: classe_(), version: CONFIG.version || '' };
}
function apiTexteQuiz(nom) {
  if (interdit_()) return refusEnfant_();
  nom = String(nom || '').split('/').pop();
  if (!/\.html?$/i.test(nom) || nom.length > 200) return { erreur: 'Quiz invalide.' };
  const f = trouverFichier_(installer_().dossier, nom);
  if (!f) return { erreur: 'Ce quiz n\'existe plus.' };
  const html = f.getBlob().getDataAsString('UTF-8');
  const i = html.lastIndexOf('MoteurQuiz.lancer(');
  const fin = html.lastIndexOf(');');
  let cfg = null;
  try { cfg = JSON.parse(html.slice(i + 'MoteurQuiz.lancer('.length, fin)); } catch (e) {}
  if (i < 0 || !cfg || !Array.isArray(cfg.questions)) return { erreur: 'Ce quiz a été fait à la main : il ne peut pas être proposé depuis le site.' };
  return { ok: true, titre: String(cfg.titre || ''), texte: lignesDeQuiz_(cfg), biblio: String(cfg.biblio || '') };
}

/* Corriger un quiz du site : son texte (format en lignes) remplace son contenu, sous le même nom de fichier
   (adresse, résultats et révisions gardés). Mêmes contrôles qu'à la création. o.biblio / o.biblioV : mise à jour
   depuis la bibliothèque ; sinon l'identifiant de la bibliothèque déjà dans le quiz est gardé. */
function apiRemplacerQuiz(nom, texte, o) {
  if (interdit_()) return refusEnfant_();
  nom = String(nom || '').split('/').pop();
  if (!/\.html?$/i.test(nom) || nom.length > 200) return { erreur: 'Quiz invalide.' };
  texte = String(texte || '').trim();
  if (texte.length < 20 || texte.length > 300000) return { erreur: 'Texte du quiz vide ou trop long.' };
  const f = trouverFichier_(installer_().dossier, nom);
  if (!f) return { erreur: 'Ce quiz n\'existe plus.' };
  const ancien = configQuiz_(f.getBlob().getDataAsString('UTF-8'));
  if (!ancien) return { erreur: 'Ce quiz a été fait à la main : il ne peut pas être corrigé depuis le site.' };
  o = o || {};
  const biblio = /^[a-z0-9-]{1,80}$/.test(String(o.biblio || '')) ? String(o.biblio) : String(ancien.biblio || '');
  const biblioV = o.biblio ? String(o.biblioV || '') : String(ancien.biblioV || '');
  const q = construireQuiz_(texte, biblio, biblioV);
  if (q.erreur) return q;
  try { f.setContent(q.html); } catch (e) { return { erreur: 'Modification refusée par Google Drive : seul le parent qui a créé ce quiz peut le corriger.' }; }
  viderCatalogue_();
  return { ok: true, titre: q.titre, nb: q.nb, avertissements: q.avert };
}
function configQuiz_(html) {
  const i = html.lastIndexOf('MoteurQuiz.lancer('), fin = html.lastIndexOf(');');
  if (i < 0) return null;
  try { const c = JSON.parse(html.slice(i + 'MoteurQuiz.lancer('.length, fin)); return c && Array.isArray(c.questions) ? c : null; } catch (e) { return null; }
}

/* ---------------- signalements d'erreur ----------------
   L'enfant (« Signaler une erreur » sous une question ratée ou sous « À retenir ») ou le parent (résultats)
   signale une erreur ; elle est gardée dans l'onglet « Signalements » du tableau des résultats. Le parent la
   corrige lui-même (apiRemplacerQuiz) ou l'envoie à la console SoccaQuiz avec un code ; la console renvoie la
   correction, que l'espace parent lit avec ce code. */
const COL_SIGNAL = ['id', 'date', 'origine', 'page', 'titre', 'question', 'attendu', 'k', 'motif', 'remarque', 'statut', 'code', 'maj'];
const STATUTS_SIGNAL = ['nouveau', 'transmis', 'corrige', 'ignore'];
function feuilleSignal_() {
  const ss = installer_().ss;
  let sh = ss.getSheetByName('Signalements');
  if (!sh) { sh = ss.insertSheet('Signalements'); sh.appendRow(COL_SIGNAL); }
  return sh;
}
function apiSignaler(d) {
  d = d || {};
  const enfant = estEnfant_();
  if (!enfant && interdit_()) return refusEnfant_();
  const t = (v, n) => cellule_(String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n));
  const page = nettoyerNom_(String(d.page || ''));
  const question = t(d.question, 400);
  if (!page || !question) return { erreur: 'Signalement incomplet.' };
  const motif = ['reponse', 'question', 'rappel', 'autre'].indexOf(d.motif) >= 0 ? d.motif : 'autre';
  // lien de l'enfant (accès sans compte) : 10 signalements par tranche de 10 minutes, 100 en attente au plus
  const cache = cache_(), cle = 'signal-' + Math.floor(Date.now() / 6e5);
  const n = +(cache.get(cle) || 0);
  if (enfant && n >= 10) return { erreur: 'Beaucoup de signalements en ce moment : réessaie plus tard.' };
  cache.put(cle, String(n + 1), 900);
  const verrou = LockService.getScriptLock();
  verrou.waitLock(15000);
  try {
    const sh = feuilleSignal_(), v = sh.getDataRange().getValues().slice(1);
    if (enfant && v.filter(r => r[10] === 'nouveau').length >= 100) return { erreur: 'Trop de signalements en attente.' };
    // même question déjà signalée et pas encore traitée : on ne la garde qu'une fois
    const deja = v.find(r => r[3] === page && r[5] === question && (r[10] === 'nouveau' || r[10] === 'transmis'));
    if (deja) return { ok: true, id: String(deja[0]), deja: true };
    const id = Utilities.getUuid().slice(0, 8), maintenant = new Date().toISOString();
    sh.appendRow([id, maintenant, enfant ? 'enfant' : 'parent', page, t(d.titre, 120), question, t(d.attendu, 300), t(d.k, 80), motif, t(d.remarque, 300), 'nouveau', '', maintenant]);
    return { ok: true, id };
  } finally { verrou.releaseLock(); }
}
function apiSignalements() {
  if (interdit_()) return refusEnfant_();
  const ss = installer_().ss, sh = ss.getSheetByName('Signalements');
  if (!sh || sh.getLastRow() < 2) return { ok: true, liste: [] };
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, COL_SIGNAL.length).getValues().filter(r => r[0]);
  // fichier du quiz : la page signalée, ou (pages « Mes révisions » / défi) le quiz qui porte ce titre
  const cat = catalogue_(installer_().dossier).QUIZ;
  const fichier = (page, titre) => { const p = cat.find(q => q.fichier.replace(/\.html?$/i, '') === page); if (p) return p.fichier; const t = cat.find(q => q.titre === titre); return t ? t.fichier : ''; };
  const liste = v.map(r => { const o = COL_SIGNAL.reduce((x, c, i) => { x[c] = String(r[i]).replace(/^'(?=[=+\-@])/, ''); return x; }, {}); o.fichier = fichier(o.page, o.titre); return o; })
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
  return { ok: true, liste };
}
function apiSignalementMaj(id, statut, code) {
  if (interdit_()) return refusEnfant_();
  if (STATUTS_SIGNAL.indexOf(statut) < 0) return { erreur: 'Statut inconnu.' };
  if (code && !/^[a-z0-9]{20,40}$/.test(String(code))) return { erreur: 'Code invalide.' };
  const sh = installer_().ss.getSheetByName('Signalements');
  if (!sh) return { erreur: 'Signalement introuvable.' };
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) {
    sh.getRange(i + 1, 11).setValue(statut);
    if (code) sh.getRange(i + 1, 12).setValue(String(code));
    sh.getRange(i + 1, 13).setValue(new Date().toISOString());
    return { ok: true };
  }
  return { erreur: 'Signalement introuvable.' };
}

/* configuration interne d'un quiz → format en lignes (l'inverse de lireFormatLignes_ + normaliserQuestion_) */
function lignesDeQuiz_(c) {
  const ent = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const f = s => ent(s).replace(/[|\r\n]+/g, ' / ').replace(/\s+/g, ' ').trim();
  const L = [], schemas = {}, ecrits = {};
  L.push(['T', f(c.titre), f(c.sousTitre), f(c.matiere || 'autre'), f(c.icone), f(c.badge || '')].join('|') + (c.langueAudio ? '|langue=' + f(c.langueAudio) : ''));
  let cat = null;
  c.questions.forEach(q => {
    if (q.cat !== cat) { cat = q.cat; L.push('## ' + f(cat) + ((c.icones || {})[cat] ? '|' + f(c.icones[cat]) : '')); }
    let l;
    const exp = f(q.exp);
    switch (q.type) {
      case 'qcm': {
        const opts = [q.a].concat((q.opts || []).filter(o => o !== q.a)).map(f);
        l = ['Q', f(q.q)].concat(opts, [exp || (opts.length >= 3 ? 'La bonne réponse est : ' + opts[0] + '.' : '')]); break;
      }
      case 'vf': l = ['V', f(q.q), q.a ? 'V' : 'F', exp]; break;
      case 'input': l = ['S', f(q.q), (q.ans || []).map(f).join(';'), exp]; break;
      case 'trous': l = ['G', f(q.texte), exp]; break;
      case 'ordre': l = ['O', f(q.q)].concat((q.items || []).map(f)); break;
      case 'paires': l = ['A', f(q.q)].concat((q.paires || []).map(p => f(p[0]).replace(/=/g, '-') + '=' + f(p[1]).replace(/=/g, '-'))); break;
      case 'classer': l = ['C', f(q.q)].concat((q.groupes || []).map(g => f(g.nom).replace(/:/g, ' ') + ': ' + (g.items || []).map(x => f(x).replace(/;/g, ',')).join(';'))); break;
      case 'cliquer': l = ['X', f(q.q), f(q.texte), exp]; break;
      case 'nombre': l = ['N', f(q.q), String(q.a).replace('.', ','), String(q.tol || 0).replace('.', ','), exp]; break;
      case 'parler': l = ['P', f(q.q), f(q.phrase), exp]; break;
      case 'clavier': l = ['K', f(q.q), (q.notes || []).map(f).join(' '), exp]; break;
      case 'placer': l = ['L', f(q.q), f((q.notes || [])[0]), exp]; break;
      case 'zone': l = ['Z', f(q.q), f(q.zone), exp]; break;
      case 'legende': l = ['E', f(q.q)].concat((q.legendes || []).map(p => f(p[0]) + '=' + f(p[1]).replace(/=/g, '-')), [exp]); break;
      default: return;
    }
    // schéma : une ligne F avant la question (le même schéma n'est écrit qu'une fois), puis sch=nom
    let sch = '';
    if (q.svg) {
      sch = schemas[q.svg] || (schemas[q.svg] = 's' + (Object.keys(schemas).length + 1));
      if (!ecrits[sch]) { ecrits[sch] = 1; L.push('F|' + sch + '|' + String(q.svg).replace(/[|\r\n]+/g, ' ')); }
    }
    while (l.length > 2 && l[l.length - 1] === '') l.pop();
    if (q.dire && !(q.type === 'parler' && q.dire === q.phrase)) l.push('dire=' + f(q.dire));
    if (q.langue && q.langue !== c.langueAudio) l.push('langue=' + f(q.langue));
    if (q.img) l.push('img=' + f(q.img));
    if (q.fig) l.push('fig=' + f(q.fig));
    if (sch) l.push('sch=' + sch);
    if (q.hint) l.push('indice=' + f(q.hint));
    if (q.notes && q.type !== 'clavier' && q.type !== 'placer') l.push('notes=' + q.notes.map(n => Array.isArray(n) ? n.map(f).join('+') : f(n)).join(' '));
    if (q.portee) l.push(q.portee === 'seule' ? 'portee=seule' : 'portee=oui');
    L.push(l.join('|'));
  });
  const memo = String(c.memo || '').match(/<li>[\s\S]*?<\/li>/g) || [];
  memo.forEach(m => L.push('M|' + f(m)));
  return L.join('\n');
}

/* =====================================================================
   AJOUT D'UN QUIZ DEPUIS LE SITE (page « ajouter »)
   Le parent colle la réponse de l'IA (Claude, ChatGPT, Grok…) : un objet
   JSON décrivant le quiz. On le vérifie, on fabrique le fichier .html
   (même structure que le quiz d'exemple) et on le range dans le dossier Drive.
   Un fichier .html complet collé tel quel est aussi accepté.
   ===================================================================== */
const COULEURS_ = { francais: '#2563eb', maths: '#c2410c', sciences: '#15803d', anglais: '#b91c1c',
  histoire: '#1d4ed8', geographie: '#0f766e', musique: '#be185d', autre: '#475569' };

/* clé Gemini (gratuite, créée par la famille sur aistudio.google.com/apikey) : vérifiée par la page, gardée ici */
/* ---------------- classe et thème ----------------
   La classe choisie est gardée avec son année scolaire : elle monte toute seule chaque 1er septembre
   (jusqu'à la terminale). Le thème du site en découle. */
const CLASSES = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', '2de', '1re', 'Tle'];
function anneeScolaire_(d) { d = d || new Date(); return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; }
function classe_() {
  const p = props_();
  const c = p.getProperty('CLASSE') || CONFIG.classe || '';
  if (c === 'adulte') return c;
  const i = CLASSES.indexOf(c);
  if (i < 0) return '';
  const depuis = +(p.getProperty('CLASSE') ? p.getProperty('CLASSE_ANNEE') : CONFIG.classeAnnee) || anneeScolaire_();
  return CLASSES[Math.min(CLASSES.length - 1, i + Math.max(0, anneeScolaire_() - depuis))];
}
function themeDe_(c) {
  if (c === 'adulte') return 'parent';
  const i = CLASSES.indexOf(c);
  return i < 0 ? 'explorateurs' : i <= 2 ? 'petits' : i <= 4 ? 'lecteurs' : i <= 7 ? 'explorateurs' : i <= 11 ? 'college' : 'lycee';
}
function apiClasse(d) {
  if (interdit_()) return refusEnfant_();
  const c = String((d && d.classe) || '');
  if (c && c !== 'adulte' && CLASSES.indexOf(c) < 0) return { erreur: 'Classe inconnue.' };
  const p = props_();
  if (c) p.setProperties({ CLASSE: c, CLASSE_ANNEE: String(anneeScolaire_()) });
  else { p.deleteProperty('CLASSE'); p.deleteProperty('CLASSE_ANNEE'); }
  const classe = classe_();
  try { cache_().remove('famille-inscrit'); inscrireFamille_(installer_()); } catch (e) {}
  return { ok: true, classe, theme: themeDe_(classe) };
}

/* ---------------- mascotte du lycée ----------------
   Au lycée, le parent choisit la tenue de la mascotte (Réglages, sous la classe) : <html data-mascotte="…">.
   Images : docs/themes/lycee-<mascotte>/ ; la première de la liste sert par défaut. */
const MASCOTTES_LYCEE = ['gothique', 'rap'];
function mascotte_() {
  const m = props_().getProperty('MASCOTTE');
  return MASCOTTES_LYCEE.indexOf(m) >= 0 ? m : MASCOTTES_LYCEE[0];
}
/* ---------------- questions par partie (Réglages, par enfant) ----------------
   0 = automatique (selon l'âge : 8 en maternelle, 10 au CP-CE1, 20 ensuite) ; sinon 10, 15, 20 ou 30 pour tous ses quiz.
   Un quiz qui a moins de questions les pose toutes ; le tirage favorise toujours les questions ratées. */
const PAR_PARTIE_ = [10, 15, 20, 30];
function parPartie_() { const n = +(props_().getProperty('PARPARTIE') || 0); return PAR_PARTIE_.indexOf(n) >= 0 ? n : 0; }
function apiParPartie(d) {
  if (interdit_()) return refusEnfant_();
  const n = +((d && d.n) || 0);
  if (n && PAR_PARTIE_.indexOf(n) < 0) return { erreur: 'Choix inconnu.' };
  if (n) props_().setProperty('PARPARTIE', String(n)); else props_().deleteProperty('PARPARTIE');
  try { cache_().removeAll(['catalogue', 'liste']); } catch (e) {}
  return { ok: true, n };
}

function apiMascotte(d) {
  if (interdit_()) return refusEnfant_();
  const m = String((d && d.mascotte) || '');
  if (MASCOTTES_LYCEE.indexOf(m) < 0) return { erreur: 'Mascotte inconnue.' };
  props_().setProperty('MASCOTTE', m);
  return { ok: true, mascotte: m };
}

/* ---------------- allure de la mascotte : au féminin, au masculin ou neutre ----------------
   Par défaut, devinée d'après le prénom (prénom inconnu ou porté par tous : neutre, la socca de toujours).
   Le parent peut la changer dans Réglages (propriété GENRE : 'f', 'm', 'n' ; absente = automatique).
   On ne parle que de la mascotte, jamais du genre de l'enfant ; les textes du site restent neutres.
   Le serveur pose <html data-genre="f|m"> seulement pour les thèmes dont les dessins existent
   (GENRES_DESSINES) : ailleurs, la mascotte ne change pas et le réglage n'est pas proposé.
   Images : docs/themes/<thème>-f/ et docs/themes/<thème>-m/ (accueil, bravo, encouragement, reflexion). */
// dessins disponibles, par allure : un thème ou une saison n'apparaît ici qu'une fois ses images déposées
// (au lycée : les deux tenues). Une allure sans dessin pour le thème en cours retombe sur la socca de toujours.
/* postures animées du collège (récompense « Mes postures ») : identifiants des bandes de 6 images déposées dans
   docs/themes/poses/<id>.webp (socca de toujours), poses-f/ et poses-m/ (allures). Ordre de déblocage : celui de
   POSES dans moteur/commun/animations.js. Ajouter un id ici une fois l'image en ligne. */
const TOUTES_POSES_ = ['six-seven', 'moue', 'for-sure', 'je-men-fous', 'retourne', 'clin-doeil', 'mewing', 'toc-toc', 'aura', 'sigma',
  'duckface', 'soupir', 'pas-french', 'spiki', 'ehho', 'ours', 'last-dance', 'uk', 'babydoll', 'cri'];
const POSES_DESSINEES = { n: [], f: TOUTES_POSES_, m: TOUTES_POSES_ };   // au masculin et au féminin : 27 nov. 2026
const DESSINS_GENRE = { f: ['petits', 'lecteurs', 'explorateurs', 'college', 'lycee', 'parent'], m: ['petits', 'lecteurs', 'explorateurs', 'college', 'lycee', 'parent'] };
const SAISONS_GENRE = { f: ['noel', 'hiver', 'paques', 'printemps', 'ete', 'rentree', 'automne', 'halloween'], m: ['noel', 'hiver', 'paques', 'printemps', 'ete', 'rentree', 'automne', 'halloween'] };
const GENRES_DESSINES = DESSINS_GENRE.f.concat(DESSINS_GENRE.m.filter(t => DESSINS_GENRE.f.indexOf(t) < 0));   // thèmes où le réglage est proposé
function genreDessine_(theme, g) { return !!DESSINS_GENRE[g] && DESSINS_GENRE[g].indexOf(theme) >= 0; }
const GENRES = ['auto', 'f', 'm', 'n'];
const PRENOMS_MIXTES_ = 'camille sacha sasha noa noah charlie eden alix claude dominique lou andrea andréa ange morgan yael yaël alex dany dani jessy jordan kim loan marley mael maël maé mae nael naël sam swann robin stéphane stephane leslie june ari elia élia'.split(' ');
const PRENOMS_F_ = ('emma louise jade alice chloe chloé lina mila rose anna léa lea mia julia inès ines ambre zoé zoe léna lena juliette lou agathe jeanne iris eva éva romy nina luna victoria margaux margot manon sarah sara clara lana lola charlotte adèle adele alba louna lyna olivia capucine elena héloïse heloise mathilde ava jeanne anaïs anais apolline gabrielle valentine victoire elsa aya maya yasmine salomé salome céleste celeste lise lucie laura marie pauline justine camila diane hanna hannah emy nour assia sofia sophia marion lison sharon alicia amandine aurélie aurelie céline celine claire élise elise émilie emilie fanny isabelle julie léonie leonie maëlle maelle marine mélanie melanie morgane nathalie océane oceane sandrine sophie stéphanie stephanie valérie valerie virginie lilou maelys maëlys mélina melina nora rachel ruth sixtine thaïs thais violette suzanne gaïa gaia alma ninon constance garance albane bérénice berenice cassandre clémence clemence noémie noemie lisa liza giulia')
  .split(' ');
const PRENOMS_M_ = ('gabriel léo leo raphaël raphael louis arthur jules maël adam lucas hugo noé noe liam paul tiago ethan aaron nathan sacha gabin léon leon mohamed mohammed martin isaac victor timéo timeo nolan théo theo mathis axel naël marius enzo evan valentin baptiste antoine thomas alexandre maxime clément clement romain julien nicolas pierre jean jacques françois francois olivier philippe yann yan yanis ilyes ismaël ismael rayan amir younes ayoub sami samuel simon tom tristan elio éliott eliott eliot côme come augustin malo milo ezio lenny kylian kenzo marceau oscar félix felix basile charles david jérémie jeremie daniel benjamin florian kevin kévin anthony quentin vincent sébastien sebastien frédéric frederic laurent christophe guillaume mathieu matthieu jérôme jerome xavier cédric cedric damien adrien alexis bastien corentin dylan erwan gaël gael loïc loic lucien mattéo matteo noam soan wassim zacharie')
  .split(' ');
function sansAccent_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function genreDuPrenom_(prenom) {
  // premier prénom seulement (« Marie-Lou » → « marie »), minuscules
  const p = String(prenom || '').trim().toLowerCase().split(/[\s\-']/)[0];
  if (!p || p.length < 2) return 'n';
  const pa = sansAccent_(p), dans = l => l.indexOf(p) >= 0 || l.map(sansAccent_).indexOf(pa) >= 0;
  if (dans(PRENOMS_MIXTES_)) return 'n';
  if (dans(PRENOMS_F_)) return 'f';
  if (dans(PRENOMS_M_)) return 'm';
  // terminaisons très marquées seulement ; dans le doute : neutre
  if (/(ine|ette|elle|enne|anne|ia|ie|ina|lla)$/.test(pa)) return 'f';
  if (/(ien|ard|ert|ric|ent|ois|aud|in|on|o)$/.test(pa)) return 'm';
  return 'n';
}
function genreReglage_() {
  const g = props_().getProperty('GENRE');
  return GENRES.indexOf(g) >= 0 ? g : 'auto';
}
function genre_() {                    // allure effective : 'f', 'm' ou 'n'
  const g = genreReglage_();
  return g === 'auto' ? genreDuPrenom_(CONFIG.prenom) : g;
}
function apiGenre(d) {
  if (interdit_()) return refusEnfant_();
  const g = String((d && d.genre) || '');
  if (GENRES.indexOf(g) < 0) return { erreur: 'Choix inconnu.' };
  const p = props_();
  if (g === 'auto') p.deleteProperty('GENRE'); else p.setProperty('GENRE', g);
  return { ok: true, genre: g, effectif: genre_() };
}

/* ---------------- saisons ----------------
   Décor de saison ajouté au thème d'âge (frise, couleurs, petite animation) : <html data-saison="…">.
   Le parent peut l'éteindre dans Réglages (propriété SAISON_OFF). */
const SAISONS = ['noel', 'hiver', 'paques', 'printemps', 'ete', 'rentree', 'automne', 'halloween'];
let SAISON_FORCEE = '';
function paques_(an) {                      // dimanche de Pâques (algorithme de Meeus)
  const a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(an, mois - 1, jour);
}
function saisonDe_(d) {
  d = d || new Date();
  const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate()), mmjj = (d.getMonth() + 1) * 100 + d.getDate();
  const lundi = paques_(d.getFullYear()); lundi.setDate(lundi.getDate() + 1);
  const debut = new Date(lundi), fin = new Date(lundi); debut.setDate(debut.getDate() - 14); fin.setDate(fin.getDate() + 7);
  if (jour >= debut && jour <= fin) return 'paques';
  if (mmjj >= 1201) return 'noel';
  if (mmjj <= 320) return 'hiver';
  if (mmjj <= 620) return 'printemps';
  if (mmjj <= 831) return 'ete';
  if (mmjj <= 920) return 'rentree';
  if (mmjj >= 1015 && mmjj <= 1102) return 'halloween';
  return 'automne';
}
function saison_() {
  if (SAISON_FORCEE) return SAISON_FORCEE;
  return props_().getProperty('SAISON_OFF') === '1' ? '' : saisonDe_();
}
function apiSaison(d) {
  if (interdit_()) return refusEnfant_();
  const p = props_();
  if (d && d.active === false) p.setProperty('SAISON_OFF', '1'); else p.deleteProperty('SAISON_OFF');
  return { ok: true, saison: saison_(), active: !(d && d.active === false) };
}

function apiGeminiCle(d) {
  if (interdit_()) return refusEnfant_();
  const cle = String((d && d.cle) || '').trim();
  const props = props_();
  if (cle && !CLE_GEMINI_.test(cle)) return { erreur: "Ce n'est pas une clé Gemini." };
  if (cle) props.setProperty('GEMINI_CLE', cle); else props.deleteProperty('GEMINI_CLE');
  return { ok: true };      // propriété commune du programme : la même clé sert à tous les enfants
}
// nom d'un dessin du catalogue du moteur (moteur/commun/dessins.js) : img=labo:becher, propositions « danger:corrosif »…
const DESSIN_ = /^(?:(?:labo|danger|protection|etat):[a-z]{2,20}|heure:\d{1,2}h\d{2}(?:,\d{1,2}h\d{2}){0,3}|nombre:\d{1,12})$/;
// note de musique : C4, F#4, do3… suivie de *2 / *0.5 (durée) et ^ (fort) ou _ (doux)
const NOTE_ = /^([A-Ga-g]|do|ut|r[eé]|mi|fa|sol|la|si)[#b♯♭]?\d?(\*\d*\.?\d+)?[\^_]?$/i;
const CLE_GEMINI_ = /^(AIza|AQ\.)[\w.\-]{25,200}$/;
// clé du site, sinon celle de la famille (saisie dans l'espace parent d'un autre enfant)
function cleGemini_() { return props_().getProperty('GEMINI_CLE') || ''; }

/* ---------------- famille : un seul espace parent pour plusieurs enfants ----------------
   Chaque site (un par enfant, même compte Google) s'inscrit dans le fichier « SoccaQuiz – Famille.json »
   à la racine du Drive du parent : prénom, classe, adresses, dossier des quiz. L'espace parent s'en sert
   pour passer d'un enfant à l'autre et pour ajouter un quiz à plusieurs enfants ; la clé Gemini y est
   aussi gardée, pour n'être saisie qu'une fois. Ce fichier n'est lu que par les sites du parent
   (ils s'exécutent avec son compte) et n'est jamais envoyé au site de l'enfant. */
const NOM_FAMILLE = 'SoccaQuiz – Famille.json';
// comptes Gmail : …/macros/s/ID/exec ; comptes Google Workspace : …/a/macros/domaine/s/ID/exec
const URL_SITE_ = /^https:\/\/script\.google\.com\/(a\/macros\/[\w.\-]+|macros)\/s\/[\w\-]+\/exec$/;
function fichierFamille_(creer) {
  const p = props_(), id = p.getProperty('FAMILLE');
  let f = null;
  if (id) try { f = DRV_.getFileById(id); if (f.isTrashed()) f = null; } catch (e) { f = null; }
  if (!f && (CONFIG.espace !== 'parent' || estProprietaire_())) { const it = DRV_.getRootFolder().getFilesByName(NOM_FAMILLE); while (!f && it.hasNext()) { const x = it.next(); if (!x.isTrashed()) f = x; } }
  const proprio = CONFIG.espace !== 'parent' || estProprietaire_();     // l'autre parent ne voit que le fichier partagé (par son id)
  if (!proprio) return f;
  if (!f && creer) f = DRV_.getRootFolder().createFile(NOM_FAMILLE, '{"sites":[]}', MimeType.PLAIN_TEXT);
  if (f && f.getId() !== id) p.setProperty('FAMILLE', f.getId());
  return f;
}
function lireFamille_(f) {
  f = f || fichierFamille_(false);
  let d = null;
  if (f) try { d = JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { d = null; }
  if (!d || typeof d !== 'object') d = {};
  d.sites = Array.isArray(d.sites) ? d.sites.filter(x => x && typeof x === 'object') : [];
  return d;
}
function ecrireFamille_(modifier) {
  const verrou = LockService.getScriptLock();     // pas de verrou entre projets : deux inscriptions simultanées sont très rares
  verrou.waitLock(20000);
  try {
    const f = fichierFamille_(true);
    if (!f) return;                                  // autre parent sans accès au fichier : rien à écrire
    const d = lireFamille_(f);
    modifier(d);
    f.setContent(JSON.stringify(d, null, 1));
  } finally { verrou.releaseLock(); }
  cache_().remove('famille');
}
// les enfants sont tous dans ce programme : plus d'inscription dans un fichier de la famille
function inscrireFamille_() {}
// enfants de la famille (ce programme) : prénom, classe, espace parent de chacun, dossier de ses quiz
/* rang d'une classe pour trier les enfants : les plus petits d'abord (PS … Tle), puis les adultes ; classe inconnue à la fin */
function rangClasse_(c) { const i = CLASSES.indexOf(String(c || '')); return i >= 0 ? i : c === 'adulte' ? CLASSES.length : CLASSES.length + 1; }
function familleListe_() {
  const ici = enfantId_();
  const l = couleursEnfants_(enfants_()).map((x, ordre) => pourEnfant_(x.id, () => {
    let dossier = '';
    try { dossier = String(props_().getProperty('DOSSIER') || ''); } catch (e) {}
    return { id: x.id, prenom: String(CONFIG.prenom || x.prenom || '').slice(0, 40), classe: classe_(), parent: urlParentIci_(x.id) || urlIci_(), dossier, ici: x.id === ici, couleur: x.c, ordre };
  }));
  // partout (menu des enfants, Réglages, « Ajouter aussi pour », « Partager ») : du plus petit au plus grand ;
  // même classe : ordre d'ajout. La couleur de chaque enfant ne change pas (elle est rangée avec lui).
  l.sort((a, b) => rangClasse_(a.classe) - rangClasse_(b.classe) || a.ordre - b.ordre);
  l.forEach(x => { delete x.ordre; });
  return l;
}

/* une question du quiz (format JSON interne), vérifiée et nettoyée ; null si elle est inutilisable.
   Sert à la création d'un quiz et aux questions ratées renvoyées par le moteur (révisions, défi). */
/* Schéma SVG écrit par l'IA → SVG sûr : seules quelques balises de dessin et quelques attributs sont gardés, valeurs
   contrôlées (pas d'adresse, de script, de style ni d'événement) ; tout le reste disparaît. Les éléments ayant un id
   (lettres, chiffres, - et _) sont les zones des exercices Z et E. Renvoie { svg, zones } ou null. */
const SVG_BALISES_ = ['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan'];
const SVG_ATTRS_ = ['id', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'fill', 'stroke', 'stroke-width',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'font-size', 'font-weight', 'text-anchor', 'transform', 'viewbox', 'dx', 'dy'];
function svgPropre_(source) {
  const s = String(source || '').slice(0, 12000);
  if (!/^\s*<svg[\s>]/i.test(s)) return null;
  const sortie = [], pile = [], zones = [];
  let n = 0;
  const re = /<\s*(\/?)\s*([a-zA-Z]+)([^<>]*?)(\/?)\s*>|([^<]+)/g;
  let m;
  while ((m = re.exec(s)) && n < 400) {
    if (m[5] != null) { if (pile.length && /^(text|tspan)$/.test(pile[pile.length - 1])) sortie.push(m[5].replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]).slice(0, 80)); continue; }
    const fin = m[1] === '/', nom = m[2].toLowerCase(), auto = m[4] === '/';
    if (SVG_BALISES_.indexOf(nom) < 0) continue;
    if (fin) { const k = pile.lastIndexOf(nom); if (k >= 0) { while (pile.length > k) sortie.push('</' + pile.pop() + '>'); } continue; }
    n++;
    const attrs = [];
    String(m[3]).replace(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (t, a, b, v1, v2) => {
      const nomA = a.toLowerCase(), v = (v1 != null ? v1 : v2).slice(0, 2000);
      if (SVG_ATTRS_.indexOf(nomA) < 0 || /url\s*\(|javascript|expression|[<>&]/i.test(v)) return '';
      if (nomA === 'id') { if (!/^[\w-]{1,30}$/.test(v) || zones.indexOf(v) >= 0) return ''; zones.push(v); }
      else if (!/^[\w\s.,#%()+\-]*$/.test(v)) return '';
      attrs.push((nomA === 'viewbox' ? 'viewBox' : nomA) + '="' + v + '"');
      return '';
    });
    if (nom === 'svg' && pile.length) continue;
    sortie.push('<' + nom + (attrs.length ? ' ' + attrs.join(' ') : '') + (auto ? '/>' : '>'));
    if (!auto) pile.push(nom);
  }
  while (pile.length) sortie.push('</' + pile.pop() + '>');
  const svg = sortie.join('');
  if (!/^<svg/.test(svg) || !/viewBox=/.test(svg)) return null;
  return { svg: svg.slice(0, 15000), zones };
}

function normaliserQuestion_(q, i, avert, d, souple) {   // souple : question ratée d'un quiz existant (pas les contrôles faits pour l'IA)
  d = d || {};
  const txt = (v, n) => String(v == null ? '' : v).replace(/<\/?script[^>]*>/gi, '').trim().slice(0, n);
  if (!q || typeof q !== 'object') return null;
  const type = String(q.type || 'qcm').toLowerCase();
  const base = { cat: txt(q.cat || q.categorie, 60) || 'Questions', q: txt(q.q || q.question, 500), exp: txt(q.exp || q.explication, 500) };
  if (!base.q && type !== 'trous') return null;
  // écoute : phrase lue à voix haute (anglais…) et notes de musique
  const img = emoji_(q.img || q.image) || (DESSIN_.test(String(q.img || '')) ? String(q.img) : '');
  if (img) base.img = img;
  // figure de géométrie décrite en quelques mots (dessinée par le moteur, dessins.js) : caractères limités
  const fig = String(q.fig || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (fig && /^[A-Za-z0-9 ()\[\],;.=°'\-éèêàç/]+$/.test(fig) && /[A-Z][0-9']?\s*\(\s*-?\d/.test(fig)) base.fig = fig;
  // schéma SVG (dessiné par l'IA) : reconstruit avec une liste blanche de balises et d'attributs, rien d'autre
  const svg = q.svg ? svgPropre_(q.svg) : null;
  if (svg) base.svg = svg.svg;
  const dire = txt(q.dire || q.ecoute || q.audio, 300);
  if (dire) { base.dire = dire; const lg = txt(q.langue || q.lang, 10); if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lg)) base.langue = lg; }
  if (Array.isArray(q.notes) && type !== 'clavier' && type !== 'placer') {
    const note = x => NOTE_.test(String(x).trim()) || /^(\/|-(\*\d*\.?\d+)?)$/.test(String(x).trim());   // / sépare deux sons à comparer, - est un silence
    const notes = q.notes.slice(0, 24).map(x => Array.isArray(x) ? x.slice(0, 5).map(y => txt(y, 10)).filter(note) : txt(x, 10))
      .filter(x => Array.isArray(x) ? x.length : note(x));
    if (notes.length) { base.notes = notes; if (q.portee) base.portee = q.portee === 'seule' ? 'seule' : true; }
  }
  if (type === 'zone') {                     // Z : toucher la bonne zone du schéma
    const zone = txt(q.zone, 30);
    if (!svg || svg.zones.indexOf(zone) < 0 || svg.zones.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (schéma ou zone introuvable).'); return null; }
    return Object.assign(base, { type: 'zone', zone });
  }
  if (type === 'legende') {                  // E : placer les étiquettes sur les zones du schéma
    const vues = {};
    const legendes = (Array.isArray(q.legendes) ? q.legendes : []).filter(p => Array.isArray(p) && p.length === 2).map(p => [txt(p[0], 30), txt(p[1], 60)])
      .filter(p => p[1] && svg && svg.zones.indexOf(p[0]) >= 0 && !vues[p[0]] && (vues[p[0]] = 1)).slice(0, 8);
    if (!svg || legendes.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (schéma ou étiquettes introuvables).'); return null; }
    return Object.assign(base, { type: 'legende', legendes });
  }
  if (type === 'qcm') {
    const opts = (Array.isArray(q.opts || q.choix) ? (q.opts || q.choix) : []).map(o => txt(o, 160)).filter(Boolean);
    let a = txt(q.a != null ? q.a : q.reponse, 160);
    const trouve = opts.find(o => o === a) || opts.find(o => o.toLowerCase() === a.toLowerCase());
    if (opts.length < 2 || !trouve) { avert.push('Question ' + (i + 1) + ' ignorée (bonne réponse absente des choix).'); return null; }
    // choix en double (« are » et « Are ») : on n'en garde qu'un ; plus qu'un seul choix → question ignorée
    const vus = new Set(), uniques = opts.filter(o => { const k = o.toLowerCase().replace(/[\s.!?]+/g, ' ').trim(); if (vus.has(k)) return false; vus.add(k); return true; });
    if (uniques.length < 2 || !uniques.includes(trouve)) { avert.push('Question ' + (i + 1) + ' ignorée (choix en double).'); return null; }
    // un mauvais choix qui contient « ou », « les deux », « aucune » rend la question ambiguë
    if (!souple && uniques.some(o => o !== trouve && (/^(les deux|aucune?)( |$)/i.test(o) || (/\s+ou\s+/i.test(o) && o.toLowerCase().includes(trouve.toLowerCase()))))) { avert.push('Question ' + (i + 1) + ' ignorée (choix ambigu du type « A ou B », « les deux »).'); return null; }
    // « Que veut dire la phrase entendue ? » : la phrase lue et la bonne réponse doivent être de même forme
    // (question ↔ question, affirmation ↔ affirmation) ; « He likes peas. » → « Qui aime les petits pois ? » est faux
    const finQ = t => /\?\s*$/.test(String(t));
    if (!souple && base.dire && /veut dire|signifie|tradui|traduction|que dit|sens de/i.test(base.q) && String(trouve).split(/\s+/).length >= 2 && finQ(base.dire) !== finQ(trouve)) {
      avert.push('Question ' + (i + 1) + ' ignorée (la phrase entendue et la bonne réponse ne disent pas la même chose).'); return null;
    }
    return Object.assign(base, { type: 'qcm', opts: uniques, a: trouve });
  } else if (type === 'vf' || type === 'vrai-faux' || type === 'vraifaux') {
    const v = q.a != null ? q.a : q.reponse;
    const a = v === true || /^(vrai|true|oui)$/i.test(String(v).trim()) ? true
            : v === false || /^(faux|false|non)$/i.test(String(v).trim()) ? false : null;
    if (a === null) { avert.push('Question ' + (i + 1) + ' ignorée (réponse ni Vrai ni Faux).'); return null; }
    return Object.assign(base, { type: 'vf', a });
  } else if (type === 'saisie' || type === 'input') {
    const liste = [].concat(q.ans || [], q.a != null ? [q.a] : [], q.reponse != null ? [q.reponse] : [], q.alt || [])
      .map(x => txt(x, 80)).filter(Boolean);
    // « la photosynthèse » accepte aussi « photosynthèse » : l'IA n'a pas à écrire cette variante
    liste.slice().forEach(x => { const s = x.replace(/^(le|la|les|un|une|des|du)\s+|^l['’]\s*/i, ''); if (s && s !== x) liste.push(s); });
    if (!liste.length) { avert.push('Question ' + (i + 1) + ' ignorée (pas de réponse).'); return null; }
    const qq = Object.assign(base, { type: 'input', ans: Array.from(new Set(liste)) });
    // un indice qui contient la réponse (« Ce liquide porte le nom de chaux ») est retiré
    const sans = x => x.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const h = txt(q.hint || q.indice, 200); if (h && !qq.ans.some(r => sans(r).length >= 3 && sans(h).includes(sans(r)) || sans(r).split(/\s+/).some(m => m.length >= 4 && sans(h).includes(m)))) qq.hint = h;
    return qq;
  } else if (type === 'trous') {
    const texte = txt(q.texte, 600), nb = (texte.match(/\[[^\]]+\]/g) || []).length;
    if (!nb || nb > 6) { avert.push('Question ' + (i + 1) + ' ignorée (texte à trous sans [mot] ou avec trop de trous).'); return null; }
    return Object.assign(base, { type: 'trous', q: base.q || 'Complète.', texte });
  } else if (type === 'ordre') {
    const items = (Array.isArray(q.items) ? q.items : []).map(x => txt(x, 120)).filter(Boolean).slice(0, 8);
    if (items.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (moins de 2 éléments à ranger).'); return null; }
    return Object.assign(base, { type: 'ordre', items });
  } else if (type === 'paires') {
    const paires = (Array.isArray(q.paires) ? q.paires : []).filter(p => Array.isArray(p) && p.length === 2).map(p => [txt(p[0], 80), txt(p[1], 80)]).filter(p => p[0] && p[1]).slice(0, 6);
    if (paires.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (moins de 2 paires).'); return null; }
    return Object.assign(base, { type: 'paires', paires });
  } else if (type === 'classer') {
    const groupes = (Array.isArray(q.groupes) ? q.groupes : []).map(g => ({ nom: txt(g && g.nom, 40), items: (Array.isArray(g && g.items) ? g.items : []).map(x => txt(x, 60)).filter(Boolean).slice(0, 6) }))
      .filter(g => g.nom && g.items.length).slice(0, 4);
    if (groupes.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (il faut au moins 2 catégories).'); return null; }
    return Object.assign(base, { type: 'classer', groupes });
  } else if (type === 'cliquer') {
    const texte = txt(q.texte, 600);
    if (!/\*[^*]+\*/.test(texte)) { avert.push('Question ' + (i + 1) + ' ignorée (aucun *mot* à toucher).'); return null; }
    // tous les mots entre *étoiles* : c'est une phrase à reconstituer, jouée en « remettre dans l'ordre »
    const mots = texte.match(/\*[^*]+\*|[^\s*]+/g) || [];
    // un seul mot étoilé avec « écris / complète » : c'est un mot à trouver, joué en texte à trous (sinon la réponse serait affichée)
    if ((texte.match(/\*[^*]+\*/g) || []).length === 1 && /[ée]cri|compl[eè]t|manqu|trouve/i.test(base.q)) { return Object.assign(base, { type: 'trous', texte: texte.replace(/\*([^*]+)\*/, '[$1]') }); }
    if (mots.length >= 2 && mots.length <= 8 && mots.every(m => /^\*.+\*$/.test(m))) { return Object.assign(base, { type: 'ordre', items: mots.map(m => m.slice(1, -1).trim()) }); }
    return Object.assign(base, { type: 'cliquer', texte });
  } else if (type === 'nombre') {
    const a = parseFloat(String(q.a).replace(/\s/g, '').replace(',', '.')), tol = Math.abs(parseFloat(String(q.tol || 0).replace(',', '.'))) || 0;
    if (!isFinite(a)) { avert.push('Question ' + (i + 1) + ' ignorée (réponse non numérique).'); return null; }
    const qq = Object.assign(base, { type: 'nombre', a, tol }); const u = txt(q.unit || q.unite, 12); if (u) qq.unit = u;
    return qq;
  } else if (type === 'parler') {
    const phrase = txt(q.phrase, 200);
    if (!phrase) { avert.push('Question ' + (i + 1) + ' ignorée (phrase à dire absente).'); return null; }
    const qq = Object.assign(base, { type: 'parler', phrase });
    if (phrase !== '*' && !qq.dire) qq.dire = phrase;           // bouton « Écouter » : le modèle à imiter
    if (!qq.langue) { const lg = txt(d.langue || d.langueAudio, 10); if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lg)) qq.langue = lg; }
    return qq;
  } else if (type === 'placer') {
    const n = txt((Array.isArray(q.notes) ? q.notes[0] : q.note) || '', 6);
    if (!/^([A-Ga-g]|do|ut|r[eé]|mi|fa|sol|la|si)\d?$/i.test(n)) { avert.push('Question ' + (i + 1) + ' ignorée (note à placer invalide).'); return null; }
    return Object.assign(base, { type: 'placer', notes: [n] });
  } else if (type === 'clavier') {
    const note = x => /^([A-Ga-g]|do|ut|r[eé]|mi|fa|sol|la|si)[#b♯♭]?\d?$/i.test(String(x).trim());
    const notes = (Array.isArray(q.notes) ? q.notes : []).map(x => txt(x, 5)).filter(note).slice(0, 8);
    if (notes.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (mélodie de moins de 2 notes).'); return null; }
    return Object.assign(base, { type: 'clavier', notes });
  }
  return null;
}

function apiAjouterQuiz(texte, aussi, source, biblioV) {
  if (interdit_()) return refusEnfant_();
  texte = String(texte || '').trim();
  if (texte.length < 20) return { erreur: "Colle d'abord la réponse de l'IA dans le cadre." };
  if (texte.length > 900000) return { erreur: 'Texte trop long.' };
  const inst = installer_();

  // cas 1 : un fichier .html complet (ancienne méthode)
  if (/MoteurQuiz\.lancer\s*\(/.test(texte) && /<html|<!DOCTYPE/i.test(texte)) {
    const meta = lireMeta_(texte, 'quiz.html', new Date());
    const nom = nomLibre_(inst.dossier, meta.titre);
    inst.dossier.createFile(nom + '.html', texte, MimeType.HTML);
    viderCatalogue_();
    return { ok: true, page: nom, titre: meta.titre, nb: null, avertissements: [], aussi: copierAussi_(aussi, meta.titre, texte) };
  }

  const q = construireQuiz_(texte, source, biblioV);
  if (q.erreur) return q;
  const { html, titre, nb, avert } = q;
  const nom = nomLibre_(inst.dossier, titre);
  inst.dossier.createFile(nom + '.html', html, MimeType.HTML);
  viderCatalogue_();
  return { ok: true, page: nom, titre, nb, avertissements: avert, aussi: copierAussi_(aussi, titre, html) };
}

/* texte d'un quiz (format en lignes ou JSON) → page du quiz, avec tous les contrôles de la création ;
   source : identifiant de la bibliothèque, biblioV : sa version (pour proposer les mises à jour) */
function construireQuiz_(texte, source, biblioV) {
  // cas 2 : le format en lignes du message pour l'IA (Q|…, V|…, S|…) — le plus économe en tokens
  // cas 3 : l'ancien format JSON, toujours accepté
  let d = lireFormatLignes_(texte);
  if (!d) {
    const debut = texte.indexOf('{'), fin = texte.lastIndexOf('}');
    if (debut < 0 || fin <= debut) return { erreur: "Je ne trouve pas le quiz dans ce texte. Copie toute la réponse de l'IA (bouton « Copier » sous sa réponse), puis colle-la ici." };
    try { d = JSON.parse(texte.slice(debut, fin + 1).replace(/,\s*([}\]])/g, '$1')); }
    catch (e) { return { erreur: "La réponse de l'IA est incomplète ou abîmée. Demande-lui : « Redonne-moi le quiz complet », puis recopie sa réponse." }; }
  }

  const avert = [];
  const txt = (v, n) => String(v == null ? '' : v).replace(/<\/?script[^>]*>/gi, '').trim().slice(0, n);
  const questions = [];
  (Array.isArray(d.questions) ? d.questions : []).forEach((q, i) => { const x = normaliserQuestion_(q, i, avert, d); if (x) questions.push(x); });
  // même question posée deux fois (l'IA remplit parfois ainsi) : on garde la première
  const dejaVues = new Set();
  const gardees = questions.filter(q => {
    const k = (q.type + ' ' + (q.texte || q.q) + ' ' + JSON.stringify(q.items || q.paires || q.a || q.ans || '')).toLowerCase().replace(/\s+/g, ' ');
    if (dejaVues.has(k)) { avert.push('Question en double ignorée : « ' + String(q.texte || q.q).slice(0, 60) + ' ».'); return false; }
    dejaVues.add(k); return true;
  });
  questions.length = 0; gardees.forEach(q => questions.push(q));
  if (questions.length < 3) return { erreur: "Je n'ai trouvé que " + questions.length + " question(s) valable(s). Redemande le quiz à l'IA." };

  const titre = txt(d.titre || d.title, 100) || 'Quiz';
  let matiere = String(d.matiere || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  if (matiere === 'mathematiques') matiere = 'maths';
  if (!MATIERES[matiere]) matiere = 'autre';
  const memo = (Array.isArray(d.memo) ? d.memo : []).map(x => txt(x, 200)).filter(Boolean).slice(0, 12);
  // un emoji par catégorie, dessiné en haut des questions qui n'ont pas leur propre image
  const icones = {};
  if (d.icones && typeof d.icones === 'object') Object.keys(d.icones).slice(0, 20).forEach(k => { const e = emoji_(d.icones[k]); if (e) icones[txt(k, 60)] = e; });
  const icone = emoji_(d.icone || d.emoji) || MATIERES[matiere].emo;
  // badge : un emoji propre au thème ; l'étoile générique (souvent recopiée de l'exemple) laisse la place à l'icône du quiz
  let badge = emoji_(d.badge);
  if (!badge || /^(⭐|🌟|✨)$/u.test(badge)) badge = icone;
  const html = fabriquerQuizHtml_({
    titre, matiere,
    sousTitre: txt(d.sousTitre || d.sous_titre || d.niveau, 150),
    icone, badge, icones,
    langueAudio: /^[a-z]{2}(-[A-Za-z]{2})?$/.test(txt(d.langueAudio || d.langue, 10)) ? txt(d.langueAudio || d.langue, 10) : '',
    couleur: COULEURS_[matiere], questions, memo, texte: true,
    biblio: /^[a-z0-9-]{1,80}$/.test(String(source || '')) ? String(source) : '',   // ajouté depuis la bibliothèque : on saura s'il en est retiré
    biblioV: /^[a-z0-9-]{1,80}$/.test(String(source || '')) && /^\d{1,6}$/.test(String(biblioV || '')) ? String(biblioV) : ''
  });
  return { html, titre, nb: questions.length, avert };
}


/* ---------------- autre parent ----------------
   Le parent qui a installé le site invite une adresse Google : le dossier de chaque enfant de la famille
   (quiz et résultats) et le fichier de la famille lui sont partagés en modification. Il ouvre ensuite
   l'espace parent avec son propre compte ; « Retirer » arrête ces partages. */
const EMAIL_ = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
function parentsDe_(d) { return (Array.isArray(d.parents) ? d.parents : []).map(x => String(x).toLowerCase()).filter(x => EMAIL_.test(x)).slice(0, 10); }
function editeurs_(o) { try { return o.getEditors().map(u => String(u.getEmail()).toLowerCase()); } catch (e) { return []; } }
function partager_(o, emails, ajouter) {
  const deja = editeurs_(o);
  emails.forEach(m => { try { if (ajouter && deja.indexOf(m) < 0) o.addEditor(m); else if (!ajouter && deja.indexOf(m) >= 0) o.removeEditor(m); } catch (e) { console.error(e); } });
}
function dossiersFamille_() {
  const ids = [installer_().dossier.getId()];
  familleListe_().forEach(x => { if (x.dossier && ids.indexOf(x.dossier) < 0) ids.push(x.dossier); });
  return ids.map(ouvrirDossier_).filter(Boolean);
}
function apiInviterParent(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut inviter quelqu\'un.' };
  if (!siteInstalle_()) return { erreur: 'Mets d\'abord ton site à jour depuis l\'installateur.' };
  const email = String((d && d.email) || '').trim().toLowerCase();
  if (!EMAIL_.test(email)) return { erreur: 'Adresse e-mail invalide.' };
  dossiersFamille_().forEach(x => partager_(x, [email], true));
  ecrireFamille_(f => { f.parents = parentsDe_(f).filter(x => x !== email).concat(email); });
  const fam = fichierFamille_(false); if (fam) partager_(fam, [email], true);
  return { ok: true, parents: parentsDe_(lireFamille_()), liens: liensParent_() };
}
function apiRetirerParent(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut retirer un accès.' };
  const email = String((d && d.email) || '').trim().toLowerCase();
  if (!EMAIL_.test(email)) return { erreur: 'Adresse e-mail invalide.' };
  dossiersFamille_().forEach(x => partager_(x, [email], false));
  const fam = fichierFamille_(false); if (fam) partager_(fam, [email], false);
  ecrireFamille_(f => { f.parents = parentsDe_(f).filter(x => x !== email); });
  return { ok: true, parents: parentsDe_(lireFamille_()) };
}
/* ---------------- remise à zéro (Réglages, parent qui a installé) ----------------
   Rien n'est détruit : l'ancien tableau des résultats est renommé « … (archive du JJ/MM/AAAA) » et remplacé
   par un tableau vide, les quiz partent dans la corbeille du Drive. La mémoire des appareils de l'enfant
   (historique local, file d'envoi, badges vus, tenue de la socca…) est effacée à leur prochaine visite (pont.html). */
function apiRemettreAZero(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut tout remettre à zéro.' };
  d = d || {};
  const attendu = String(CONFIG.prenom || 'zéro').trim().toLowerCase(), donne = String(d.confirmation || '').trim().toLowerCase();
  if (!donne || donne !== attendu) return { erreur: 'Pour confirmer, tape « ' + (CONFIG.prenom || 'zéro') + ' ».' };
  if (!d.resultats && !d.quiz) return { erreur: 'Coche au moins une case.' };
  const inst = installer_(), props = props_(), cache = cache_(), fait = [];
  if (d.resultats) {
    const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Paris', 'dd/MM/yyyy');
    DRV_.getFileById(inst.ss.getId()).setName(NOM_SHEETS + ' (archive du ' + date + ')');
    const ss = creerSheets_(inst.dossier);
    props.setProperty('RESULTATS', ss.getId());
    INST_ = null; LIGNES_ = null;
    fait.push('résultats archivés');
  }
  const corbeille = re => {
    let n = 0; const it = inst.dossier.getFiles();
    while (it.hasNext()) { const f = it.next(); if (f.isTrashed() || !re.test(f.getName())) continue; try { f.setTrashed(true); } catch (e) { inst.dossier.removeFile(f); } n++; }
    return n;
  };
  if (d.quiz) fait.push(corbeille(/\.html?$/i) + ' quiz à la corbeille');
  if (d.resultats) { props.setProperty('RAZ', String(Date.now())); fait.push('mémoire des appareils effacée à leur prochaine visite'); }
  try { cache.removeAll(['catalogue', 'revisions', 'maitrise', 'liste', 'inst', 'famille', 'famille-inscrit']); cache.put('qgen', String(Date.now()), 21600); cache.put('gen', String(Date.now()), 21600); } catch (e) {}
  return { ok: true, fait };
}

/* ---------------- supprimer ce site (un enfant) ----------------
   1re étape, faite ici parce que seul le site a accès au Drive : l'enfant est retiré du fichier de la famille,
   le partage avec l'autre parent est arrêté, ses quiz et résultats vont à la corbeille (sauf « garder »),
   les réglages du site sont effacés. 2e étape : l'installateur (adresse renvoyée) désactive le site et
   efface ce qu'il en gardait. Les autres enfants ne sont jamais touchés. */
function apiSupprimerSite(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut supprimer ce site.' };
  d = d || {};
  const attendu = String(CONFIG.prenom || 'supprimer').trim().toLowerCase();
  if (String(d.confirmation || '').trim().toLowerCase() !== attendu) return { erreur: 'Pour confirmer, tape « ' + (CONFIG.prenom || 'supprimer') + ' ».' };
  const inst = installer_(), props = props_();
  // un enfant parmi d'autres : seuls son dossier et ses réglages partent ; le programme continue pour les autres
  if (enfants_().length > 1) {
    if (!d.garder) inst.dossier.setTrashed(true);
    try { const c = cache_(); c.removeAll(['catalogue', 'revisions', 'maitrise', 'liste', 'inst']); c.put('qgen', String(Date.now()), 21600); } catch (e) {}
    const id = enfantId_(), prenom = CONFIG.prenom;
    retirerEnfant_(id);
    choisirEnfant_('');
    return { ok: true, garde: !!d.garder, retour: '', enfant: prenom, reste: enfants_().map(x => x.prenom), parent: urlParentIci_() };
  }
  let parents = [], reste = 0;
  try {
    const fam = fichierFamille_(false);
    if (fam) {
      ecrireFamille_(f => { parents = parentsDe_(f); f.sites = f.sites.filter(x => x.parent !== CONFIG.urlParent && x.dossier !== inst.dossier.getId()); reste = f.sites.length; });
      if (!reste) try { fam.setTrashed(true); } catch (e) {}      // plus aucun enfant : le fichier de la famille (et la clé Gemini) part aussi
    }
  } catch (e) { console.error(e); }
  if (parents.length) partager_(inst.dossier, parents, false);
  if (!d.garder) inst.dossier.setTrashed(true);                    // quiz et tableau des résultats : corbeille du Drive (30 jours)
  props.deleteAllProperties();
  try { const c = cache_(); c.removeAll(['catalogue', 'revisions', 'maitrise', 'liste', 'inst', 'famille', 'famille-inscrit']); c.put('qgen', String(Date.now()), 21600); } catch (e) {}
  // désinstallation complète : le programme du site (un fichier du Drive) part lui aussi à la corbeille,
  // ce qui arrête ses deux adresses, puis le site retire l'autorisation que le parent lui avait donnée
  let programme = false;
  // le programme ne peut pas se mettre lui-même à la corbeille (drive.file) : l'installateur retire ses publications et vide son code
  const retour = CONFIG.installateur ? CONFIG.installateur + (CONFIG.installateur.indexOf('?') < 0 ? '?' : '&') + 'supprime=' + encodeURIComponent(ScriptApp.getScriptId()) : '';
  try { ScriptApp.invalidateAuth(); } catch (e) {}
  return { ok: true, garde: !!d.garder, retour, programme };
}

// adresses à envoyer à l'autre parent : l'espace parent de chaque enfant
function liensParent_() {
  const l = familleListe_();
  return (l.length ? l : [{ prenom: CONFIG.prenom || '', parent: CONFIG.urlParent }]).map(x => ({ prenom: x.prenom, parent: x.parent }));
}

// site supprimé depuis l'installateur (son dossier est gardé) : le parent le retire de la liste à la main
function apiFamilleRetirer(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut modifier la liste.' };
  const url = String((d && d.parent) || ''), l = enfants_();
  const x = familleListe_().find(y => y.parent === url || y.id === url);
  if (!x || x.ici || x.id === l[0].id) return { erreur: 'Ce site ne peut pas être retiré d\'ici.' };
  retirerEnfant_(x.id);
  return { ok: true };
}

// même quiz déposé dans le dossier d'autres enfants de la famille (adresses de leur espace parent) ;
// seuls les enfants inscrits dans le fichier de la famille sont acceptés. Il apparaît chez eux en moins d'une minute.
function copierAussi_(aussi, titre, html) {
  if (!Array.isArray(aussi) || !aussi.length) return [];
  const faits = [];
  familleListe_().forEach(x => {
    if (x.ici || aussi.indexOf(x.parent) < 0) return;
    try {
      pourEnfant_(x.id, () => { const d = installer_().dossier; d.createFile(nomLibre_(d, titre) + '.html', html, MimeType.HTML); viderCatalogue_(); });
      faits.push(x.prenom || 'un autre enfant');
    } catch (e) { console.error(e); }
  });
  return faits;
}

/* partager un quiz déjà créé avec d'autres enfants de la famille (espace parent → Quiz → « Partager ») : le fichier est
   copié dans leur dossier (mêmes questions, résultats séparés). `aussi` = adresses de leur espace parent, comme pour
   « Ajouter aussi pour » ; un enfant qui a déjà un quiz du même titre est passé (pas de doublon). */
function apiPartagerQuiz(nom, aussi) {
  if (interdit_()) return refusEnfant_();
  nom = String(nom || '').split('/').pop();
  if (!/\.html?$/i.test(nom) || nom.length > 200) return { erreur: 'Quiz invalide.' };
  if (!Array.isArray(aussi) || !aussi.length) return { erreur: 'Choisis au moins un enfant.' };
  const f = trouverFichier_(installer_().dossier, nom);
  if (!f) return { erreur: 'Ce quiz n\'existe plus.' };
  const html = f.getBlob().getDataAsString('UTF-8');
  const ici = (catalogue_(installer_().dossier).QUIZ || []).find(q => q.fichier === nom) || {};
  const titre = String(ici.titre || nom.replace(/\.html?$/i, '')).trim();
  const faits = [], deja = [];
  familleListe_().forEach(x => {
    if (x.ici || aussi.indexOf(x.parent) < 0) return;
    const qui = x.prenom || 'un autre enfant';
    try {
      pourEnfant_(x.id, () => {
        const d = installer_().dossier;
        if ((catalogue_(d).QUIZ || []).some(q => String(q.titre || '').trim().toLowerCase() === titre.toLowerCase())) { deja.push(qui); return; }
        d.createFile(nomLibre_(d, titre) + '.html', html, MimeType.HTML);
        viderCatalogue_();
        faits.push(qui);
      });
    } catch (e) { console.error(e); }
  });
  return { ok: true, titre, faits, deja };
}

/* Format en lignes (voir le message pour l'IA dans page-ajouter.html) :
     T|titre|accroche|matière|icône|badge        ## Catégorie
     Q|question|bonne réponse|faux|faux|explication
     V|affirmation|V ou F|explication            S|question|réponse;variante|explication
     M|point à retenir
   ## Catégorie|emoji : l'emoji illustre les questions de la catégorie.
   Champs nommés possibles n'importe où : dire=…, img=emoji, notes=C4 E4 C4+E4+G4, portee, portee=seule, indice=…, langue=…
   Renvoie null si le texte n'est pas dans ce format (on essaie alors le JSON). */
/* un emoji seul (ou une petite séquence), sans lettre ni balise ; sinon '' */
function emoji_(v) {
  const s = String(v == null ? '' : v).trim().slice(0, 16);
  return s && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s) && !/[\p{L}\p{N}<>"'&|]/u.test(s.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')) ? s : '';
}

function lireFormatLignes_(texte) {
  const d = { questions: [], memo: [], icones: {}, schemas: {} };
  let cat = '', vu = false;
  // un schéma SVG écrit sur plusieurs lignes par l'IA est remis sur une seule
  String(texte).replace(/<svg[\s\S]*?<\/svg>/gi, m => m.replace(/\s*\r?\n\s*/g, ' ')).split(/\r?\n/).forEach(brute => {
    const l = brute.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?/, '').trim();
    if (/^#+\s*\**\s*(sujet|notions?|supports?)\s*\**\s*:/i.test(l)) return;   // analyse de la leçon écrite par l'IA (# Sujet, # Notions, # Supports)
    const titreCat = l.match(/^#{2,}\s*(.+)$/);
    if (titreCat) {                             // ## Catégorie|✂️ : l'emoji illustre ses questions
      const [nom, ico] = titreCat[1].split('|').map(s => s.replace(/[#*]/g, '').trim());
      cat = nom; if (ico) d.icones[cat] = ico;
      return;
    }
    const f = l.match(/^F\s*\|\s*([\w-]{1,30})\s*\|\s*(<svg[\s\S]*<\/svg>)/i);   // F|nom|<svg …>…</svg> : schéma pour Z, E ou sch=nom
    if (f) { d.schemas[f[1]] = f[2]; return; }
    const m = l.match(/^([TQVSMGOACXNPKLZE])\s*[|:]\s*(.*)$/i);
    if (!m) return;
    const sorte = m[1].toUpperCase();
    const champs = m[2].split('|').map(s => s.trim());
    const extra = {}, pos = [];
    // champs nommés : toujours avec = (une bonne réponse « dire » ou « notes » reste une réponse) ;
    // seul « portee » peut être écrit seul, et seulement après la question et sa réponse
    champs.forEach(c => {
      const k = c.match(/^(dire|notes|portee|portée|indice|langue|img|fig|sch)\s*=\s*(.+)$/i);
      if (k) extra[k[1].toLowerCase().replace('é', 'e')] = k[2].trim();
      else if (/^port[eé]e$/i.test(c) && pos.length >= 3) extra.portee = true;
      else pos.push(c);
    });
    while (pos.length && pos[pos.length - 1] === '') pos.pop();
    if (sorte === 'T') {
      vu = true;
      [d.titre, d.sousTitre, d.matiere, d.icone, d.badge] = pos;
      if (extra.langue) d.langue = extra.langue;
      return;
    }
    if (sorte === 'M') { if (pos.join(' | ')) d.memo.push(pos.join(' | ')); return; }
    const q = { cat, q: pos[0] };
    if (sorte === 'G') {                       // G|texte avec [mot] ou [mot;variante]|explication
      Object.assign(q, { type: 'trous', q: 'Complète.', texte: pos[0], exp: pos[1] || '' });
    } else if (sorte === 'O') {                // O|consigne|élément 1|élément 2|… (dans le bon ordre)
      // explication recopiée par l'IA comme dernier élément : on la remet à sa place
      let items = pos.slice(1);
      const n = s => String(s).trim().split(/\s+/).length, der = items[items.length - 1] || '';
      if (items.length >= 3 && n(der) >= 5 && /[.!]$/.test(der.trim()) && items.slice(0, -1).every(a => n(a) * 2 < n(der))) { q.exp = der; items = items.slice(0, -1); }
      Object.assign(q, { type: 'ordre', items });
    } else if (sorte === 'A') {                // A|consigne|gauche=droite|…
      Object.assign(q, { type: 'paires', paires: pos.slice(1).map(x => x.split('=')).filter(x => x.length === 2).map(x => [x[0].trim(), x[1].trim()]) });
    } else if (sorte === 'C') {                // C|consigne|Catégorie: a;b|Catégorie: c;d
      Object.assign(q, { type: 'classer', groupes: pos.slice(1).map(x => { const i = x.indexOf(':'); return i < 0 ? null : { nom: x.slice(0, i).trim(), items: x.slice(i + 1).split(';').map(y => y.trim()).filter(Boolean) }; }).filter(Boolean) });
    } else if (sorte === 'X') {                // X|consigne|texte avec *mots à toucher*|explication
      Object.assign(q, { type: 'cliquer', texte: pos[1] || '', exp: pos[2] || '' });
    } else if (sorte === 'N') {                // N|question|valeur|tolérance|explication
      Object.assign(q, { type: 'nombre', a: pos[1], tol: pos[2] || '0', exp: pos[3] || '' });
    } else if (sorte === 'P') {                // P|consigne|phrase à dire (* = réponse libre)|explication
      Object.assign(q, { type: 'parler', phrase: pos[1] || '', exp: pos[2] || '' });
    } else if (sorte === 'L') {                // L|consigne|G4|explication : placer la note sur la portée
      Object.assign(q, { type: 'placer', notes: [String(pos[1] || '').trim()], exp: pos[2] || '' });
    } else if (sorte === 'K') {                // K|consigne|C4 D4 E4|explication
      Object.assign(q, { type: 'clavier', notes: String(pos[1] || '').split(/[\s,]+/).filter(Boolean), exp: pos[2] || '' });
    } else if (sorte === 'Z') {                // Z|consigne|nom de la zone|explication|sch=schéma : toucher la bonne zone
      Object.assign(q, { type: 'zone', zone: String(pos[1] || '').trim(), exp: pos[2] || '' });
    } else if (sorte === 'E') {                // E|consigne|zone=étiquette|zone=étiquette|…|explication|sch=schéma : légender
      const paires = pos.slice(1).filter(x => /^[\w-]{1,30}\s*=/.test(x)), autres = pos.slice(1).filter(x => !/^[\w-]{1,30}\s*=/.test(x));
      Object.assign(q, { type: 'legende', legendes: paires.map(x => { const k = x.indexOf('='); return [x.slice(0, k).trim(), x.slice(k + 1).trim()]; }), exp: autres[autres.length - 1] || '' });
    } else if (sorte === 'Q') {
      const reste = pos.slice(1);
      // dernier champ = explication s'il y a au moins 3 choix derrière la question, ou s'il ressemble à une phrase
      // (sinon « Q|q|bonne|faux|faux » sans explication perdrait un mauvais choix)
      const mots = t => String(t).trim().split(/\s+/).length, der = reste[reste.length - 1] || '';
      q.exp = reste.length >= 4 || (reste.length === 3 && mots(der) >= 4 && mots(der) > 1.5 * Math.max(mots(reste[0]), mots(reste[1]))) ? reste.pop() : '';
      Object.assign(q, { type: 'qcm', opts: reste, a: reste[0] });
    } else if (sorte === 'V') {
      Object.assign(q, { type: 'vf', a: /^v/i.test(pos[1] || '') ? true : /^f/i.test(pos[1] || '') ? false : pos[1], exp: pos[2] || '' });
    } else {
      Object.assign(q, { type: 'saisie', ans: String(pos[1] || '').split(';').map(s => s.trim()).filter(Boolean), exp: pos[2] || '' });
    }
    if (typeof extra.dire === 'string') q.dire = extra.dire;
    if (typeof extra.img === 'string') q.img = extra.img;
    if (typeof extra.fig === 'string') q.fig = extra.fig;
    if (typeof extra.sch === 'string') q.sch = extra.sch.trim();
    if (typeof extra.langue === 'string') q.langue = extra.langue;
    if (typeof extra.indice === 'string') q.hint = extra.indice;
    if (typeof extra.notes === 'string' && q.type !== 'clavier' && q.type !== 'placer') q.notes = extra.notes.split(/[\s,]+/).filter(Boolean).map(n => n.includes('+') ? n.split('+') : n);
    if (extra.portee) q.portee = extra.portee === 'seule' ? 'seule' : true;
    vu = true;
    d.questions.push(q);
  });  d.questions.forEach(q => { if (q.sch && d.schemas[q.sch]) q.svg = d.schemas[q.sch]; delete q.sch; });

  return vu && d.questions.length ? d : null;
}

function fabriquerQuizHtml_(c) {
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const memoHtml = c.memo.length
    ? '<div class="frise-section"><div class="frise-title">📝 À retenir</div><ul>' + c.memo.map(m => '<li>' + h(m) + '</li>').join('') + '</ul></div>'
    : '';
  const cfg = {
    titre: c.titre, sousTitre: h(c.sousTitre), icone: c.icone, matiere: c.matiere, couleur: c.couleur,
    nbQuestions: Math.min(20, c.questions.length), questions: c.questions, memo: memoHtml
  };
  if (c.texte) cfg.texte = true;          // texte pur (quiz créé depuis le site) : le moteur n'y retire aucune balise
  if (c.badge) cfg.badge = c.badge;
  if (c.biblio) cfg.biblio = c.biblio;
  if (c.biblioV) cfg.biblioV = c.biblioV;
  if (c.icones && Object.keys(c.icones).length) cfg.icones = c.icones;
  if (c.langueAudio) cfg.langueAudio = c.langueAudio;
  const pills = [];
  if (c.questions.some(q => q.dire)) pills.push('🔊 Phrases à écouter');
  if (c.questions.some(q => q.notes && q.portee !== 'seule')) pills.push('🎵 Notes à écouter');
  if (c.questions.some(q => q.type === 'parler')) pills.push('🎤 À dire à voix haute');
  if (pills.length) cfg.pills = pills;
  return '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Quiz – ' + h(c.titre) + '</title>\n<!-- Pool : ' + c.questions.length + ' questions — créé depuis la page « Ajouter un quiz » -->\n' +
    '<link rel="stylesheet" href="commun/moteur-quiz.css">\n<script src="commun/suivi.js"></script>\n<script src="commun/recompenses.js"></script>\n<script src="commun/moteur-quiz.js"></script>\n' +
    '</head>\n<body>\n<div class="container" id="app"></div>\n<script>\nMoteurQuiz.lancer(' + jsonScript_(cfg) + ');\n</script>\n</body>\n</html>\n';
}

function nomLibre_(dossier, titre) {
  const slug = String(titre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'quiz';
  const base = 'quiz_' + slug + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');
  let nom = base, n = 2;
  while (trouverFichier_(dossier, nom + '.html')) nom = base + '-' + (n++);
  return nom;
}

// l'onglet « Parties » même si le parent a ajouté d'autres onglets devant
function feuille_() {
  const ss = installer_().ss, sh = ss.getSheetByName('Parties') || ss.getSheets()[0];
  try { const n = sh.getMaxColumns(); if (n < COLONNES.length) sh.insertColumnsAfter(n, COLONNES.length - n); } catch (e) {}
  return sh;
}
// lu une seule fois par exécution (accueil : révisions + maîtrise + liste)
function lireLignes_() {
  const sh = feuille_();
  const n = sh.getLastRow();
  if (LIGNES_ && LIGNES_.n === n) return LIGNES_.l;
  const l = n < 2 ? [] : sh.getRange(2, 1, n - 1, COLONNES.length).getValues()
    .filter(v => v[0])
    .map(v => COLONNES.reduce((o, c, i) => { o[c] = String(v[i]).replace(/^'(?=[=+\-@])/, ''); return o; }, {}));
  LIGNES_ = { n, l };
  return l;
}
// une valeur qui commence par = + - @ serait prise pour une formule par Google Sheets
function cellule_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) && !/^-?\d/.test(v) ? "'" + v : v; }
function dict_() { return Object.create(null); }      // objet sans prototype : une clé « constructor » ou « __proto__ » ne casse rien
/* Une valeur du cache de Google fait au plus 100 Ko : au-delà, elle est rangée en morceaux de 30 000 caractères
   (90 Ko au plus en UTF-8), la clé principale ne gardant que « #<nombre de morceaux> ». 20 morceaux au plus. */
function mettreEnCache_(cle, valeur, gen, duree) {
  try {
    const t = JSON.stringify(valeur), c = cache_(), d = duree || 600;
    if (gen !== undefined && (c.get('gen') || '') !== gen) return;      // une partie a été enregistrée pendant le calcul
    if (t.length <= 30000) { c.put(cle, t, d); return; }
    const n = Math.ceil(t.length / 30000);
    if (n > 20) return;
    const o = {};
    for (let i = 0; i < n; i++) o[cle + ':' + i] = t.slice(i * 30000, (i + 1) * 30000);
    c.putAll(o, d);
    c.put(cle, '#' + n, d);                      // en dernier : jamais de clé principale sans ses morceaux
  } catch (e) {}
}
function lireCache_(cle) {
  try {
    const c = cache_(), v = c.get(cle);
    if (!v) return null;
    if (v.charAt(0) !== '#') return JSON.parse(v);
    const n = +v.slice(1), cles = [];
    for (let i = 0; i < n; i++) cles.push(cle + ':' + i);
    const m = c.getAll(cles);
    let t = '';
    for (const k of cles) { if (m[k] == null) return null; t += m[k]; }
    return JSON.parse(t);
  } catch (e) { return null; }
}
/* liste des quiz modifiée : catalogue et pages de quiz gardés en cache sont oubliés (le numéro qgen change) */
function viderCatalogue_() {
  try { const c = cache_(); c.remove('catalogue'); c.put('qgen', String(Date.now()), 21600); } catch (e) {}
}
/* contenu d'un quiz du dossier, gardé 5 minutes (une recherche dans Drive coûte souvent plus d'une demi-seconde) */
function quizEnCache_(inst, page) {
  const cle = 'qz:' + (cache_().get('qgen') || '') + ':' + page;
  const v = lireCache_(cle);
  if (typeof v === 'string') return v;
  const f = trouverQuiz_(inst.dossier, page);
  if (!f) return null;
  const html = f.getBlob().getDataAsString('UTF-8');
  mettreEnCache_(cle, html, undefined, 300);
  return html;
}
/* chronomètre (…/exec?chrono=1) : durée de chaque étape côté serveur, affichée par pont.html */
let CHRONO_ = null, CHRONO_DEMANDE_ = '';
function chrono_(etape) {
  if (!CHRONO_) return;
  const t = Date.now();
  CHRONO_.etapes.push([etape, t - CHRONO_.t]);
  CHRONO_.t = t;
}
function complet_(l) {
  const lire = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  return {
    id: l.id, date: l.date, joueur: l.joueur, quiz: l.quiz, titre: l.titre, matiere: l.matiere,
    score: +l.score || 0, total: +l.total || 0, duree: l.duree === '' ? null : +l.duree,
    dateLocale: l.dateLocale, appareil: l.appareil, mode: l.mode || 'normal',
    cats: lire(l.cats) || {}, questions: lire(l.questions) || []
  };
}

/* =====================================================================
   OUTILS
   ===================================================================== */
function nettoyerNom_(s) {
  return String(s).split('/').pop().replace(/\.html?$/i, '').replace(/[^\p{L}\p{N}_.\- ]/gu, '').slice(0, 150) || 'index';
}
function jsonScript_(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
}
function texte_(html) {
  return String(html || '').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function joli_(s) {
  s = String(s).replace(/^quiz[_-]?/i, '').replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sans titre';
}
function dateDepuisNom_(nom) {
  let m = nom.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = nom.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}
function jour_(d) {
  try { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) { return ''; }
}

/* =====================================================================
   CLÉS D'APPAREIL : l'espace parent sans compte Google (chantier « sans alerte », étape 1c)
   Le programme s'exécute toujours avec le compte du parent qui a installé ; il ne peut donc pas savoir qui
   l'appelle. Un appareil de parent est reconnu par une clé tirée au hasard, gardée dans son navigateur :
   - une invitation (code à usage unique, 24 h) est créée depuis l'espace parent, ou par l'installateur pour le
     premier appareil (CONFIG.invitation = empreinte du code), ou dans l'éditeur (nouveauLienParent) ;
   - à l'ouverture du lien, l'appli envoie {api:'appairer', code, nom} : le code est échangé contre une clé ;
   - chaque action des parents arrive en {api:'parent', cle, action, args, e} ; le programme vérifie la clé.
   Seules les empreintes (SHA-256) des codes et des clés sont gardées (propriétés INVITS et CLES). Rôle « proprio »
   (parent qui a installé : inviter, remettre à zéro, supprimer, ajouter un enfant) ou « parent » (autre parent).
   ===================================================================== */
let PARENT_ = null;                       // appareil reconnu pour cette demande : { h, role, nom }
const DUREE_INVITATION_ = 24 * 3600 * 1000, ORIGINE_SITE_ = 'https://app.soccaquiz.fr';
function empreinte_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function aleatoire_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/[^0-9a-f]/gi, '').toLowerCase(); }
function lireListe_(cle) {
  try { const l = JSON.parse(PropertiesService.getScriptProperties().getProperty(cle) || '[]'); return Array.isArray(l) ? l.filter(x => x && typeof x === 'object') : []; } catch (e) { return []; }
}
function ecrireListe_(cle, l) { PropertiesService.getScriptProperties().setProperty(cle, JSON.stringify(l)); }
function nomAppareil_(n) { return String(n || '').replace(/[<>"`\\&$|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50) || 'Appareil'; }
function creerInvitation_(role, nom) {
  const code = aleatoire_(), l = lireListe_('INVITS').filter(x => x.exp > Date.now());
  l.push({ h: empreinte_(code), role: role === 'proprio' ? 'proprio' : 'parent', nom: nomAppareil_(nom), exp: Date.now() + DUREE_INVITATION_ });
  ecrireListe_('INVITS', l.slice(-20));
  return code;
}
// lien de l'espace parent servi hors de Google (le code est après « # » : jamais envoyé à un serveur)
function lienInvitation_(code) {
  const d = deploiement_();
  return d ? ORIGINE_SITE_ + '/parent/?s=' + d + '#i=' + code : '';
}
/* l'installateur (ouvert avec le compte Google du parent) demande un lien pour un nouvel appareil : il prouve qui il est
   par la clé qu'il a écrite dans ce programme à l'installation (seule son empreinte est ici, CONFIG.cleInstallateur) */
function inviterParInstallateur_(cle) {
  const cache = CacheService.getScriptCache(), essais = Number(cache.get('inviter-inst') || 0);
  if (essais >= 20) return { __status: 429, erreur: 'Trop d\'essais. Réessaie dans quelques minutes.' };
  cache.put('inviter-inst', String(essais + 1), 600);
  const h = String(CONFIG.cleInstallateur || '');
  if (!/^[0-9a-f]{64}$/.test(h) || !/^[0-9a-f]{40,80}$/.test(String(cle || '')) || empreinte_(String(cle)) !== h) return { __status: 403, erreur: 'Refusé.' };
  return { ok: true, code: creerInvitation_('proprio', '') };
}
function appairer_(code, nom) {
  code = String(code || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache(), essais = Number(cache.get('appairer') || 0);
  if (essais >= 20) return { __status: 429, erreur: 'Trop d\'essais. Réessaie dans quelques minutes.' };
  cache.put('appairer', String(essais + 1), 600);
  if (!/^[0-9a-f]{40,80}$/.test(code)) return { __status: 400, erreur: 'Lien d\'invitation incomplet.' };
  const verrou = LockService.getScriptLock(); verrou.waitLock(15000);
  try {
    const h = empreinte_(code), props = PropertiesService.getScriptProperties();
    let inv = null;
    const invits = lireListe_('INVITS').filter(x => x.exp > Date.now() && !(x.h === h && (inv = x)));
    // premier appareil : code donné par l'installateur (son empreinte est écrite dans CONFIG.invitation), une seule fois
    if (!inv && CONFIG.invitation && h === CONFIG.invitation && props.getProperty('INVIT_INSTALL') !== h) {
      inv = { role: 'proprio', nom: nomAppareil_(nom) || 'Mon appareil' };
      props.setProperty('INVIT_INSTALL', h);
    }
    if (!inv) return { __status: 403, erreur: 'Ce lien a déjà servi ou a expiré. Demande un nouveau lien.' };
    ecrireListe_('INVITS', invits);
    const cle = aleatoire_(), l = lireListe_('CLES');
    l.push({ h: empreinte_(cle), role: inv.role, nom: nomAppareil_(nom || inv.nom), cree: Date.now(), vu: Date.now() });
    ecrireListe_('CLES', l.slice(-20));
    return { ok: true, cle, role: inv.role };
  } finally { verrou.releaseLock(); }
}
function reconnaitre_(cle) {
  cle = String(cle || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40,80}$/.test(cle)) return false;
  const h = empreinte_(cle), l = lireListe_('CLES'), x = l.find(y => y.h === h);
  if (!x) return false;
  if (Date.now() - (x.vu || 0) > 3600 * 1000) { x.vu = Date.now(); try { ecrireListe_('CLES', l); } catch (e) {} }   // au plus une écriture par heure
  PARENT_ = { h, role: x.role === 'proprio' ? 'proprio' : 'parent', nom: x.nom };
  return true;
}
/* action d'un parent, depuis un appareil reconnu : les mêmes fonctions api… que les pages servies par Google */
function actionParent_(o) {
  if (!reconnaitre_(o.cle)) return { __status: 401, erreur: 'Cet appareil n\'est plus reconnu. Demande un nouveau lien au parent qui a installé SoccaQuiz.' };
  try {
    if (o.action === 'page') {
      const page = nettoyerNom_(o.page || 'tableau-de-bord');
      if (PAGES_PARENT.indexOf(page) < 0) return { erreur: 'Page inconnue.' };
      const inst = installer_(), cat = catalogue_(inst.dossier);
      return { page, html: lib_(PAGES[page], true), reglages: reglagesPage_(page, inst, cat), quiz: cat.QUIZ, matieres: MATIERES, polices: POLICES, prenom: CONFIG.prenom || '', enfant: enfantId_() };
    }
    const nom = String(o.action || '');
    if (!/^api[A-Z]\w{1,40}$/.test(nom) || nom === 'apiPourEnfant' || typeof globalThis[nom] !== 'function') return { __status: 400, erreur: 'Action inconnue.' };
    return { r: globalThis[nom].apply(null, Array.isArray(o.args) ? o.args : []) };
  } catch (e) {
    console.error(e);
    return { __status: 500, erreur: String(e && e.message || e) };
  }
}
// identifiant du déploiement (adresse du site de l'enfant) ; sert aux adresses de app.soccaquiz.fr
function deploiement_() {   // identifiant de la publication : écrit par l'installateur, sinon celui que Google donne au programme
  let u = String(cfgPremier_().urlEnfant || '');
  if (!/\/exec$/.test(u)) { try { u = String(ScriptApp.getService().getUrl() || ''); } catch (e) { u = ''; } }
  const m = u.match(/\/macros\/s\/([\w-]{20,200})\/exec$/);
  return m ? m[1] : '';
}
function lienParentDirect_(id) {
  const d = deploiement_();
  return d ? ORIGINE_SITE_ + '/parent/?s=' + d + (id && id !== enfants_()[0].id ? '&e=' + encodeURIComponent(id) : '') : '';
}
function lienEnfantDirect_(id) {
  const d = deploiement_();
  return d ? ORIGINE_SITE_ + '/?s=' + d + (id && id !== enfants_()[0].id ? '&e=' + encodeURIComponent(id) : '') : '';
}
// espace parent de l'enfant courant : app.soccaquiz.fr/parent pour un appareil reconnu, sinon l'adresse Google
function urlParentIci_(id) { id = id || enfantId_(); return (PARENT_ && lienParentDirect_(id)) || CONFIG.urlParent; }

/* Réglages → Appareils : liste, invitation, retrait */
function apiAppareils() {
  if (interdit_()) return refusEnfant_();
  return {
    appareils: lireListe_('CLES').map(x => ({ id: x.h.slice(0, 12), nom: x.nom, role: x.role, cree: x.cree, vu: x.vu, moi: !!PARENT_ && PARENT_.h === x.h })),
    invitations: lireListe_('INVITS').filter(x => x.exp > Date.now()).length,
    peutInviter: estProprietaire_()
  };
}
function apiInviterAppareil(d) {
  if (interdit_()) return refusEnfant_();
  if (!estProprietaire_()) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut inviter quelqu\'un.' };
  d = d || {};
  const code = creerInvitation_(d.role === 'proprio' ? 'proprio' : 'parent', d.nom);
  return { ok: true, code, lien: lienInvitation_(code), expire: Date.now() + DUREE_INVITATION_ };
}
function apiRetirerAppareil(d) {
  if (interdit_()) return refusEnfant_();
  const id = String((d && d.id) || '');
  const soi = !!PARENT_ && PARENT_.h.slice(0, 12) === id;
  if (!estProprietaire_() && !soi) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut retirer un appareil.' };
  const l = lireListe_('CLES'), reste = l.filter(x => x.h.slice(0, 12) !== id);
  if (reste.length === l.length) return { erreur: 'Appareil introuvable.' };
  ecrireListe_('CLES', reste);
  return { ok: true };
}
function apiRenommerAppareil(d) {
  if (interdit_()) return refusEnfant_();
  const id = String((d && d.id) || ''), nom = nomAppareil_(d && d.nom);
  const soi = !!PARENT_ && PARENT_.h.slice(0, 12) === id;
  if (!estProprietaire_() && !soi) return { erreur: 'Seul le parent qui a installé SoccaQuiz peut renommer un appareil.' };
  if (!nom) return { erreur: 'Écris un nom.' };
  const l = lireListe_('CLES'), x = l.find(y => y.h.slice(0, 12) === id);
  if (!x) return { erreur: 'Appareil introuvable.' };
  x.nom = nom; ecrireListe_('CLES', l);
  return { ok: true, nom };
}
/* depuis l'éditeur (parent qui a installé) : un lien pour un nouvel appareil, si l'ancien est perdu */
function nouveauLienParent() {
  const code = creerInvitation_('proprio', 'Nouvel appareil');
  console.log("Lien pour ouvrir l'espace parent sur un nouvel appareil (valable 24 h, une seule fois) :\n" + (lienInvitation_(code) || 'code : ' + code));
}

/* =====================================================================
   ACCÈS AU DRIVE ET AUX TABLEAUX — autorisation « fichiers créés par SoccaQuiz » seulement
   Le programme ne demande à Google que drive.file (+ l'adresse e-mail) : aucun écran « application non validée ».
   DriveApp et SpreadsheetApp exigent l'accès à tout le Drive / à tous les tableaux : ils sont remplacés par
   DRV_ et TAB_, qui imitent les seules méthodes utilisées ici, au-dessus des services avancés Drive v3 et Sheets v4.
   Google ne sait pas relire le contenu d'un fichier avec drive.file (Drive.Files.get alt=media : contenu coupé
   à ~780 caractères) : les fichiers texte (quiz, fichier de la famille) sont donc « virtuels », rangés dans
   l'onglet « Fichiers » du tableau « SoccaQuiz – Quiz » de leur dossier (morceaux de 40 000 caractères), ou dans
   les propriétés du script pour ceux de la racine du Drive. Essais réels du 20 nov. 2026 : voir le projet claude.ai,
   « etude-installation-sans-alerte ».
   ===================================================================== */
const NOM_QUIZ = 'SoccaQuiz – Quiz';
const MIME_DOSSIER_ = 'application/vnd.google-apps.folder', MIME_TABLEUR_ = 'application/vnd.google-apps.spreadsheet';
const MORCEAU_ = 40000, ONGLET_FICHIERS_ = 'Fichiers', CHAMPS_ = 'id,name,mimeType,trashed,createdTime,modifiedTime,parents';
const iter_ = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
const guillemets_ = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function listerDrive_(q) {
  const r = []; let page;
  do {
    const x = Drive.Files.list({ q: q, pageSize: 200, pageToken: page, fields: 'nextPageToken,files(' + CHAMPS_ + ')' });
    (x.files || []).forEach(f => r.push(f)); page = x.nextPageToken;
  } while (page);
  return r;
}
function editeursDrive_(id) {
  return {
    getEditors: () => (Drive.Permissions.list(id, { fields: 'permissions(id,emailAddress,role)' }).permissions || [])
      .filter(p => p.role === 'writer' && p.emailAddress).map(p => ({ getEmail: () => p.emailAddress })),
    addEditor: m => { Drive.Permissions.create({ role: 'writer', type: 'user', emailAddress: m }, id, { sendNotificationEmail: false }); },
    removeEditor: m => {
      (Drive.Permissions.list(id, { fields: 'permissions(id,emailAddress)' }).permissions || [])
        .filter(p => String(p.emailAddress || '').toLowerCase() === String(m).toLowerCase()).forEach(p => Drive.Permissions.remove(id, p.id));
    }
  };
}

/* ---------- fichiers virtuels ---------- */
const STOCKS_ = {};               // id du tableau → lignes de l'onglet « Fichiers » (gardées le temps d'une exécution)
function stock_(sid) {
  if (!STOCKS_[sid]) STOCKS_[sid] = (Sheets.Spreadsheets.Values.get(sid, ONGLET_FICHIERS_ + '!A1:Z').values || []).map(l => l.map(String));
  return STOCKS_[sid];
}
function contenuLigne_(l) { return l.slice(4).join(''); }
function ligneStock_(id, nom, cree, maj, contenu) {
  const m = String(contenu).match(new RegExp('[\\s\\S]{1,' + MORCEAU_ + '}', 'g')) || [''];
  if (m.length > 22) throw new Error('Fichier trop volumineux (' + nom + ').');
  const l = [id, nom, cree, maj].concat(m);
  while (l.length < 26) l.push('');
  return l;
}
function ecrireLigneStock_(sid, i, l) {
  Sheets.Spreadsheets.Values.update({ values: [l] }, sid, ONGLET_FICHIERS_ + '!A' + (i + 1) + ':Z' + (i + 1), { valueInputOption: 'RAW' });
  stock_(sid)[i] = l.slice();
}
function fichierVirtuel_(sid, rid) {
  const trouver = () => stock_(sid).findIndex(l => l[0] === rid);
  const ligne = () => { const i = trouver(); if (i < 0) throw new Error('Fichier introuvable.'); return stock_(sid)[i]; };
  const o = {
    virtuel: true,
    getId: () => 'v:' + sid + ':' + rid,
    getName: () => ligne()[1],
    getUrl: () => '',
    isTrashed: () => trouver() < 0,
    getDateCreated: () => new Date(ligne()[2]),
    getLastUpdated: () => new Date(ligne()[3]),
    getBlob: () => ({ getDataAsString: () => contenuLigne_(ligne()) }),
    setContent: c => { const i = trouver(), l = stock_(sid)[i]; ecrireLigneStock_(sid, i, ligneStock_(rid, l[1], l[2], new Date().toISOString(), c)); return o; },
    setName: n => { const i = trouver(), l = stock_(sid)[i]; ecrireLigneStock_(sid, i, ligneStock_(rid, String(n), l[2], new Date().toISOString(), contenuLigne_(l))); return o; },
    setTrashed: t => {
      if (!t) return o;
      const i = trouver(); if (i < 0) return o;
      Sheets.Spreadsheets.Values.clear({}, sid, ONGLET_FICHIERS_ + '!A' + (i + 1) + ':Z' + (i + 1));
      stock_(sid)[i] = [];
      return o;
    },
    getEditors: () => [], addEditor: () => {}, removeEditor: () => {}
  };
  return o;
}
function fichiersVirtuels_(sid) {
  return stock_(sid).filter((l, i) => i > 0 && l[0]).map(l => fichierVirtuel_(sid, l[0]));
}
function creerFichierVirtuel_(sid, nom, contenu) {
  const rid = Utilities.getUuid().replace(/-/g, '').slice(0, 16), maintenant = new Date().toISOString();
  const l = ligneStock_(rid, String(nom), maintenant, maintenant, contenu), lignes = stock_(sid);   // lu avant l'ajout
  Sheets.Spreadsheets.Values.append({ values: [l] }, sid, ONGLET_FICHIERS_ + '!A1', { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  lignes.push(l);
  return fichierVirtuel_(sid, rid);
}
/* tableau des quiz d'un dossier (créé à la demande, avec son onglet « Fichiers ») */
const TABLEUR_QUIZ_ = {};
/* Google repart de zéro à chaque exécution ; la simulation des tests, non : elle appelle ceci avant chaque demande */
function reinitStockage_() { [STOCKS_, TABLEUR_QUIZ_].forEach(o => Object.keys(o).forEach(k => { delete o[k]; })); INST_ = null; LIGNES_ = null; PARENT_ = null; PROPRIO_ = null; ACCES_ = null; choisirEnfant_(''); }
function tableurQuiz_(dossierId, creer) {
  if (TABLEUR_QUIZ_[dossierId]) return TABLEUR_QUIZ_[dossierId];
  const props = PropertiesService.getScriptProperties(), cle = 'QUIZ:' + dossierId;
  let sid = props.getProperty(cle);
  if (sid) try { if (Drive.Files.get(sid, { fields: 'trashed' }).trashed) sid = null; } catch (e) { sid = null; }
  if (!sid) {
    const l = listerDrive_(guillemets_(dossierId) + ' in parents and name = ' + guillemets_(NOM_QUIZ) + " and mimeType = '" + MIME_TABLEUR_ + "' and trashed = false");
    sid = l.length ? l[0].id : null;
    if (!sid && creer) {
      sid = TAB_.create(NOM_QUIZ, dossierId).getId();
      const f = TAB_.openById(sid).getSheets()[0];
      f.setName(ONGLET_FICHIERS_);
      f.appendRow(['id', 'nom', 'créé', 'modifié', 'contenu (suite dans les colonnes suivantes)']);
    }
    if (sid) props.setProperty(cle, sid);
  }
  if (sid) TABLEUR_QUIZ_[dossierId] = sid;
  return sid;
}
/* fichiers de la racine du Drive (fichier de la famille) : propriétés du script */
function racineVirtuelle_() {
  const props = PropertiesService.getScriptProperties();
  const lire = () => { try { return JSON.parse(props.getProperty('RACINE') || '{}'); } catch (e) { return {}; } };
  const fichier = nom => {
    const o = {
      virtuel: true,
      getId: () => 'r:' + nom, getName: () => nom, getUrl: () => '',
      isTrashed: () => !lire()[nom],
      getDateCreated: () => new Date((lire()[nom] || {}).cree || 0), getLastUpdated: () => new Date((lire()[nom] || {}).maj || 0),
      getBlob: () => ({ getDataAsString: () => String((lire()[nom] || {}).c || '') }),
      setContent: c => { const t = lire(), x = t[nom] || { cree: new Date().toISOString() }; x.c = String(c); x.maj = new Date().toISOString(); t[nom] = x; props.setProperty('RACINE', JSON.stringify(t)); return o; },
      setTrashed: v => { if (v) { const t = lire(); delete t[nom]; props.setProperty('RACINE', JSON.stringify(t)); } return o; },
      getEditors: () => [], addEditor: () => {}, removeEditor: () => {}
    };
    return o;
  };
  return {
    getId: () => 'root', getName: () => 'Mon Drive', getUrl: () => 'https://drive.google.com/drive/my-drive', isTrashed: () => false,
    getOwner: () => ({ getEmail: () => Session.getEffectiveUser().getEmail() }),
    getFilesByName: n => iter_(lire()[n] ? [fichier(n)] : []),
    getFoldersByName: n => iter_(listerDrive_("'root' in parents and name = " + guillemets_(n) + " and mimeType = '" + MIME_DOSSIER_ + "' and trashed = false").map(dossierDrive_)),
    createFile: (n, c) => fichier(n).setContent(c)
  };
}

/* ---------- vrais fichiers et dossiers du Drive ---------- */
function fichierDrive_(m) {
  const o = Object.assign(editeursDrive_(m.id), {
    getId: () => m.id,
    getName: () => m.name,
    getUrl: () => m.mimeType === MIME_TABLEUR_ ? 'https://docs.google.com/spreadsheets/d/' + m.id : 'https://drive.google.com/file/d/' + m.id,
    isTrashed: () => !!m.trashed,
    getDateCreated: () => new Date(m.createdTime),
    getLastUpdated: () => new Date(m.modifiedTime),
    getBlob: () => { throw new Error('Contenu illisible avec l\'autorisation « fichiers créés par SoccaQuiz ».'); },
    setContent: () => { throw new Error('Contenu non modifiable avec l\'autorisation « fichiers créés par SoccaQuiz ».'); },
    setName: n => { Drive.Files.update({ name: String(n) }, m.id); m.name = String(n); return o; },
    setTrashed: t => { Drive.Files.update({ trashed: !!t }, m.id); m.trashed = !!t; return o; },
    moveTo: d => { Drive.Files.update({}, m.id, null, { addParents: d.getId(), removeParents: (m.parents || []).join(',') }); m.parents = [d.getId()]; return o; }
  });
  return o;
}
function dossierDrive_(m) {
  const dans = (q) => listerDrive_(guillemets_(m.id) + ' in parents and trashed = false' + (q ? ' and ' + q : ''));
  const quiz = () => { const sid = tableurQuiz_(m.id, false); return sid ? fichiersVirtuels_(sid) : []; };
  const o = Object.assign(editeursDrive_(m.id), {
    getId: () => m.id,
    getName: () => m.name,
    getUrl: () => 'https://drive.google.com/drive/folders/' + m.id,
    isTrashed: () => !!m.trashed,
    setTrashed: t => { Drive.Files.update({ trashed: !!t }, m.id); m.trashed = !!t; return o; },
    setName: n => { Drive.Files.update({ name: String(n) }, m.id); m.name = String(n); return o; },
    // les vrais fichiers ne sont que des tableaux (résultats, quiz) : un fichier texte du Drive serait illisible
    getFiles: () => iter_(dans("mimeType = '" + MIME_TABLEUR_ + "'").map(fichierDrive_).concat(quiz())),
    getFilesByName: n => iter_(dans('name = ' + guillemets_(n) + " and mimeType = '" + MIME_TABLEUR_ + "'").map(fichierDrive_).concat(quiz().filter(f => f.getName() === n))),
    getFoldersByName: n => iter_(dans('name = ' + guillemets_(n) + " and mimeType = '" + MIME_DOSSIER_ + "'").map(dossierDrive_)),
    createFile: (n, c) => creerFichierVirtuel_(tableurQuiz_(m.id, true), n, c),
    removeFile: f => { if (f.virtuel) f.setTrashed(true); else Drive.Files.update({}, f.getId(), null, { removeParents: m.id }); }
  });
  return o;
}

const DRV_ = {
  getRootFolder: () => racineVirtuelle_(),
  createFolder: n => dossierDrive_(Drive.Files.create({ name: String(n), mimeType: MIME_DOSSIER_ })),
  getFolderById: id => {
    const m = Drive.Files.get(String(id), { fields: CHAMPS_ });
    if (m.mimeType !== MIME_DOSSIER_) throw new Error('Ce n\'est pas un dossier.');
    return dossierDrive_(m);
  },
  getFileById: id => {
    id = String(id);
    const v = id.match(/^v:([\w-]+):(\w+)$/);
    if (v) { const f = fichierVirtuel_(v[1], v[2]); if (f.isTrashed()) throw new Error('Fichier introuvable.'); return f; }
    if (/^r:/.test(id)) return racineVirtuelle_().getFilesByName(id.slice(2)).next();
    return fichierDrive_(Drive.Files.get(id, { fields: CHAMPS_ }));
  }
};

/* ---------- tableaux (Sheets v4) ---------- */
const lettreCol_ = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const ongletA1_ = t => "'" + String(t).replace(/'/g, "''") + "'";
function feuilleTab_(sid, p) {
  let lignes = null;
  const charger = () => lignes || (lignes = (Sheets.Spreadsheets.Values.get(sid, ongletA1_(p.title)).values || []).map(l => l.map(String)));
  const zone = (r, c, nr, nc) => ongletA1_(p.title) + '!' + lettreCol_(c) + r + ':' + lettreCol_(c + nc - 1) + (r + nr - 1);
  const proprietes = (props, champs) => Sheets.Spreadsheets.batchUpdate({ requests: [{ updateSheetProperties: { properties: Object.assign({ sheetId: p.sheetId }, props), fields: champs } }] }, sid);
  const f = {
    getName: () => p.title,
    setName: n => { proprietes({ title: String(n) }, 'title'); p.title = String(n); return f; },
    setFrozenRows: n => { proprietes({ gridProperties: { frozenRowCount: n } }, 'gridProperties.frozenRowCount'); return f; },
    getMaxRows: () => Math.max(1, charger().length),
    getLastRow: () => { const l = charger(); let n = l.length; while (n && !l[n - 1].some(x => x !== '')) n--; return n; },
    appendRow: r => {
      Sheets.Spreadsheets.Values.append({ values: [r.map(x => x == null ? '' : x)] }, sid, ongletA1_(p.title) + '!A1', { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
      if (lignes) lignes.splice(f.getLastRow(), 0, r.map(x => String(x == null ? '' : x)));
      return f;
    },
    deleteRow: i => {
      Sheets.Spreadsheets.batchUpdate({ requests: [{ deleteDimension: { range: { sheetId: p.sheetId, dimension: 'ROWS', startIndex: i - 1, endIndex: i } } }] }, sid);
      if (lignes) lignes.splice(i - 1, 1);
      return f;
    },
    getDataRange: () => {
      const l = charger(), larg = l.reduce((m, x) => Math.max(m, x.length), 0);
      return { getValues: () => l.slice(0, f.getLastRow()).map(x => Array.from({ length: larg }, (_, j) => x[j] == null ? '' : x[j])) };
    },
    getRange: (r, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      const g = {
        getValues: () => charger().slice(r - 1, r - 1 + nr).concat(Array(Math.max(0, r - 1 + nr - charger().length)).fill([]))
          .slice(0, nr).map(x => Array.from({ length: nc }, (_, j) => x[c - 1 + j] == null ? '' : x[c - 1 + j])),
        getValue: () => g.getValues()[0][0],
        setValues: v => {
          Sheets.Spreadsheets.Values.update({ values: v }, sid, zone(r, c, nr, nc), { valueInputOption: 'RAW' });
          if (lignes) v.forEach((x, i) => { const l = lignes[r - 1 + i] || (lignes[r - 1 + i] = []); x.forEach((y, j) => { l[c - 1 + j] = String(y == null ? '' : y); }); });
          return g;
        },
        setValue: v => g.setValues([[v]]),
        setFontWeight: () => g, setNumberFormat: () => g
      };
      return g;
    }
  };
  return f;
}
function classeurTab_(sid) {
  let meta = null;
  const lire = () => meta || (meta = Sheets.Spreadsheets.get(sid, { fields: 'properties.title,sheets.properties(sheetId,title,index)' }));
  const c = {
    getId: () => sid,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + sid,
    getName: () => lire().properties.title,
    getSheets: () => (lire().sheets || []).map(s => feuilleTab_(sid, s.properties)),
    getSheetByName: n => { const s = (lire().sheets || []).find(x => x.properties.title === n); return s ? feuilleTab_(sid, s.properties) : null; },
    insertSheet: n => {
      const r = Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: String(n) } } }] }, sid);
      meta = null;
      return feuilleTab_(sid, r.replies[0].addSheet.properties);
    }
  };
  return c;
}
const TAB_ = {
  create: (n, dossierId) => classeurTab_(Drive.Files.create(Object.assign({ name: String(n), mimeType: MIME_TABLEUR_ }, dossierId ? { parents: [dossierId] } : {})).id),
  openById: id => { const m = Drive.Files.get(String(id), { fields: 'id,trashed,mimeType' }); if (m.mimeType !== MIME_TABLEUR_) throw new Error('Ce n\'est pas un tableau.'); return classeurTab_(m.id); },
  open: f => TAB_.openById(f.getId())
};
