/* =====================================================================
   SOCCAQUIZ (ex-Universal Quiz) — version Google Apps Script
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0 — usage commercial interdit :
   https://polyformproject.org/licenses/noncommercial/1.0.0
   ---------------------------------------------------------------------
   Une seule adresse web sert tout le site :
     …/exec                      → page d'accueil « SoccaQuiz »
     …/exec?page=<nom du quiz>   → un quiz (fichier <nom>.html du dossier Drive)
     …/exec?page=tableau-de-bord → suivi des résultats (parents)
     …/exec?page=ajouter         → ajout d'un quiz (parents)

   Deux publications du même site (créées par l'installateur en ligne) :
     • le site de l'enfant (accès : tout le monde, sans compte) : quiz, accueil ;
     • l'espace parent (accès : « Seulement moi », Google vérifie le compte du parent) :
       tout le site, plus « Ajouter un quiz », le suivi des résultats et la clé Gemini.
   Dans le site de l'enfant, les pages et les actions réservées aux parents sont refusées.

   Où sont les choses :
     • le moteur (commun/…) et les pages d'accueil : dans ce projet (dossier lib/)
     • les quiz (.html) : dans le dossier Drive « SoccaQuiz » (« Universal Quiz » pour les sites installés avant)
     • les résultats : dans le Google Sheets « SoccaQuiz – Résultats » (même dossier)

   Le dossier et le Sheets sont créés tout seuls à la première visite
   (ou en lançant la fonction installer() depuis l'éditeur).
   ===================================================================== */

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
  classeAnnee: 0                  // année scolaire de cette classe (2026 = année 2026-2027)
};
const ICONE_SITE = 'https://leian.github.io/UNIVERSALQUIZ/icone.png';
const POLICES = 'https://leian.github.io/UNIVERSALQUIZ/polices/polices.css';
// Appli installable (dossier appli/, publiée sur leian.github.io/app/) : elle affiche le site de l'enfant dans un cadre
// et l'ouvre avec …/exec?cadre=1. Sans ce paramètre, rien ne change. Le mode cadre ne sert qu'à la navigation
// (pont.html) : jamais à changer un style, un texte ou une fonction — une seule interface pour le lien et pour l'appli.
const ORIGINE_APPLI = 'https://leian.github.io';
let CADRE_ = false;                    // remis à zéro dans doGet
let DEPUIS_APPLI_ = false;             // espace parent ouvert depuis l'appli (…?appli=1) : remis à zéro dans doGet
/* adresse de l'appli pour le site de l'enfant : …/app/?s=<identifiant de son déploiement> ('' si inconnue) */
function urlAppli_() {
  const m = String(CONFIG.urlEnfant || '').match(/^https:\/\/script\.google\.com\/macros\/s\/(AKfy[\w-]{20,200})\/exec$/);
  return m ? ORIGINE_APPLI + '/app/?s=' + m[1] : '';
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
function estEnfant_() { return CONFIG.espace === 'enfant'; }
function refusEnfant_() { return { __status: 403, erreur: 'Réservé à l\'espace parent.' }; }
/* Deux parents : l'espace parent s'exécute avec le compte de la personne qui l'ouvre (installateur : USER_ACCESSING,
   tout compte Google). Ce qui donne accès, c'est le partage Drive du dossier de l'enfant. Les propriétés du script
   (clé Gemini, classe…) et le cache ne passent pas par Drive : chaque action vérifie donc d'abord que le visiteur
   est le parent qui a installé le site (il peut ouvrir le programme dans son Drive) ou qu'il a accès au dossier. */
let PROPRIO_ = null, ACCES_ = null, DEMANDE_SUPPR_ = false;
function estProprietaire_() {
  if (PROPRIO_ === null) try { DriveApp.getFileById(ScriptApp.getScriptId()); PROPRIO_ = true; } catch (e) { PROPRIO_ = false; }
  return PROPRIO_;
}
function accesParent_() {
  if (ACCES_ === null) ACCES_ = CONFIG.espace !== 'parent' || estProprietaire_() || !!ouvrirDossier_(PropertiesService.getScriptProperties().getProperty('DOSSIER'));
  return ACCES_;
}
function interdit_() { return estEnfant_() || !accesParent_(); }
const PAS_PARTAGE = 'Cet espace parent ne t\'est pas partagé. Demande au parent qui a installé SoccaQuiz de t\'inviter (Espace parent → Réglages → Autre parent), puis ouvre le lien avec le compte Google invité.';
function urlIci_() {
  return (estEnfant_() ? CONFIG.urlEnfant : CONFIG.espace === 'parent' ? CONFIG.urlParent : '') || ScriptApp.getService().getUrl() || '';
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
  SAISON_FORCEE = SAISONS.indexOf(p.saison) >= 0 ? p.saison : '';
  CLES_PAGE_ = null;     // …/exec?saison=noel : aperçu d'une saison
  INST_ = null; LIGNES_ = null; PROPRIO_ = null; ACCES_ = null; DEMANDE_SUPPR_ = false;
  CADRE_ = p.cadre === '1' && CONFIG.espace !== 'parent';
  DEPUIS_APPLI_ = p.appli === '1' && CONFIG.espace === 'parent';
  const page = nettoyerNom_(p.page || 'index');
  try {
    if (estEnfant_() && PAGES_PARENT.indexOf(page) >= 0) return pageEspaceParent_();
    if (!accesParent_()) return pageErreur_('Espace non partagé', PAS_PARTAGE);
    // …?oublier=<espace parent d'un site supprimé> : lien donné par l'installateur après une suppression faite sans passer par ce site
    if (p.oublier && !estEnfant_() && estProprietaire_() && URL_SITE_.test(String(p.oublier)) && p.oublier !== CONFIG.urlParent) try { ecrireFamille_(f => { f.sites = f.sites.filter(x => x.parent !== p.oublier); }); } catch (e) {}
    DEMANDE_SUPPR_ = !!p.supprimer;
    const inst = installer_();
    try { inscrireFamille_(inst); } catch (err) { console.error(err); }   // jamais bloquant
    let html;
    // dans l'espace parent, l'accueil est le tableau de bord des parents (pas la page de l'enfant)
    const pageServie = CONFIG.espace === 'parent' && page === 'index' ? 'tableau-de-bord' : page;
    if (PAGES[pageServie]) {
      html = lib_(PAGES[pageServie], true);
    } else if (page === 'revisions' || page === 'defi') {
      html = pageRevision_(page);
      if (!html) return pageErreur_('Rien à revoir pour l\'instant', 'Bravo ! Aucune question n\'attend d\'être revue. Reviens après avoir joué quelques quiz.');
    } else {
      const f = trouverQuiz_(inst.dossier, page);
      if (!f) return pageErreur_('Quiz introuvable', 'Aucun fichier « ' + page + '.html » dans le dossier Drive « ' + inst.dossier.getName() + ' ».');
      html = f.getBlob().getDataAsString('UTF-8');
    }
    return servir_(assembler_(html, page, inst));
  } catch (err) {
    console.error(err);
    return pageErreur_('Oups, une erreur', String(err && err.message || err));
  }
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
  if (!estEnfant_()) CacheService.getScriptCache().remove('catalogue');   // depuis le site de l'enfant : pas de vidage du cache à répétition
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
  const props = PropertiesService.getScriptProperties(), cle = props.getProperty('DOSSIER') + '|' + props.getProperty('RESULTATS');
  if (INST_ && INST_.cle === cle) return INST_.r;
  const r = installer0_();
  INST_ = { r, cle: props.getProperty('DOSSIER') + '|' + props.getProperty('RESULTATS') };
  return r;
}
function installer0_() {
  const props = PropertiesService.getScriptProperties();
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
      dossier = premier(DriveApp.getRootFolder().getFoldersByName(CONFIG.nomDossier))
        || (CONFIG.nomDossier === 'SoccaQuiz' && premier(DriveApp.getRootFolder().getFoldersByName(ANCIEN_DOSSIER)))
        || DriveApp.createFolder(CONFIG.nomDossier);
      props.setProperty('DOSSIER', dossier.getId());
      if (!contientHtml_(dossier)) {
        dossier.createFile('quiz_exemple_capitales.html', lib_('lib/exemple-quiz', false), MimeType.HTML);
      }
    }
    ss = ouvrirSheets_(props.getProperty('RESULTATS'));
    if (!ss) {
      const f = trouverFichier_(dossier, NOM_SHEETS) || trouverFichier_(dossier, ANCIEN_SHEETS);
      ss = f ? SpreadsheetApp.open(f) : creerSheets_(dossier);
      props.setProperty('RESULTATS', ss.getId());
    }
  } finally {
    verrou.releaseLock();
  }
  return { dossier, ss };
}

function ouvrirDossier_(id) {
  if (!id) return null;
  try { const d = DriveApp.getFolderById(id); return d.isTrashed() ? null : d; } catch (e) { return null; }
}
function ouvrirSheets_(id) {
  if (!id) return null;
  try { if (DriveApp.getFileById(id).isTrashed()) return null; return SpreadsheetApp.openById(id); } catch (e) { return null; }
}
function contientHtml_(dossier) {
  const it = dossier.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/\.html?$/i.test(f.getName()) && !f.isTrashed()) return true; }
  return false;
}
function creerSheets_(dossier) {
  const ss = SpreadsheetApp.create(NOM_SHEETS);
  DriveApp.getFileById(ss.getId()).moveTo(dossier);
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
function assembler_(html, page, inst) {
  const cat = catalogue_(inst.dossier);
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

  const cfg = {
    url: urlIci_(),
    espace: CONFIG.espace,
    urlEnfant: CONFIG.urlEnfant,
    urlParent: CONFIG.urlParent,
    page: page,
    chemin: '/' + page + '.html',
    liens: cat.liens,
    version: CONFIG.version,
    installateur: CONFIG.installateur,
    pagesParent: PAGES_PARENT,
    classe: classe_(),
    classes: CLASSES,
    revisions: (page === 'index' && CONFIG.espace !== 'parent') ? (() => { try { const r = revisions_(); return { n: r.aRevoir.length, defi: r.defi.length, mois: r.moisDefi, nouveau: r.nouveauDefi }; } catch (e) { return null; } })() : null,
    maitrise: page === 'ajouter' ? null : (() => { try { return maitrisePour_(CONFIG.espace === 'parent' && page === 'index' ? 'tableau-de-bord' : page, CLES_PAGE_); } catch (e) { return null; } })(),
    saison: saison_(),
    saisonDuJour: saisonDe_(),
    saisonActive: PropertiesService.getScriptProperties().getProperty('SAISON_OFF') !== '1',
    raz: PropertiesService.getScriptProperties().getProperty('RAZ') || ''    // remise à zéro de la mémoire des appareils (pont.html)
  };
  cfg.theme = themeDe_(cfg.classe);
  // espace parent ouvert depuis l'appli : son lien « site de l'enfant » ramène dans l'appli (pont.html)
  if (DEPUIS_APPLI_ && urlAppli_()) cfg.retourAppli = urlAppli_();
  if (CADRE_) cfg.cadre = ORIGINE_APPLI;      // ouvert par l'appli installée : pont.html garde les liens dans l'appli
  // la clé Gemini n'est donnée qu'à la page « Ajouter un quiz », jamais aux quiz que joue l'enfant
  if (CONFIG.espace === 'parent' || !CONFIG.espace && page === 'tableau-de-bord') cfg.geminiOk = !!cleGemini_();
  if (page === 'ajouter' && !estEnfant_()) cfg.gemini = cleGemini_();
  // espace parent : les autres enfants de la famille (sélecteur en haut, « ajouter aussi pour… »)
  if (!estEnfant_() && ['index', 'tableau-de-bord'].indexOf(page) >= 0 && URL_SITE_.test(CONFIG.urlParent || '')) {
    cfg.proprio = estProprietaire_();
    if (DEMANDE_SUPPR_) cfg.demandeSuppression = true;    // ouvert par l'installateur (« Supprimer … ») : Réglages → Supprimer
    if (cfg.proprio) try { cfg.parents = parentsDe_(lireFamille_()); cfg.liensParent = liensParent_(); } catch (e) { cfg.parents = []; }
  }
  if (!estEnfant_() && ['index', 'tableau-de-bord'].indexOf(page) >= 0) {
    cfg.razMot = CONFIG.prenom || 'zéro';         // mot à taper pour confirmer une remise à zéro
    try { cfg.dossierUrl = inst.dossier.getUrl(); } catch (e) {}   // Réglages → « Ouvrir le dossier Drive »
  }
  if (!estEnfant_() && ['index', 'tableau-de-bord', 'ajouter'].indexOf(page) >= 0) try { cfg.famille = familleListe_().map(x => ({ prenom: x.prenom, classe: x.classe, parent: x.parent, ici: x.ici })); } catch (e) { cfg.famille = []; }
  // la configuration est posée dans sa propre balise : Apps Script peut retirer les commentaires des fichiers,
  // on ne s'appuie donc sur aucun marqueur à remplacer dans pont.html
  const pont = '<script>window.__UQ = ' + jsonScript_(cfg) + ';</script>\n' + lib_('lib/pont', false);
  const catalogueJs = 'var QUIZ = ' + jsonScript_(cat.QUIZ) + ';\nvar MATIERES = ' + jsonScript_(MATIERES) + ';';
  const tete = '\n<base target="_top">\n' + pont + '\n<script>\n' + catalogueJs + '\n</script>\n';

  // thème d'âge : posé sur <html>, styles ajoutés en fin d'en-tête pour passer après ceux de la page
  // polices (Fredoka, Nunito, Andika) servies par GitHub Pages : aucune requête vers Google Fonts depuis le site de l'enfant
  const styleTheme = '<link rel="stylesheet" href="' + POLICES + '">\n' + lib_(COMMUN['themes.css'], false);
  html = html.replace(/<html\b/i, '<html data-theme="' + cfg.theme + '"' + (cfg.saison ? ' data-saison="' + cfg.saison + '"' : ''));
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
    (CONFIG.urlEnfant ? '<p><a href="' + h(CONFIG.urlEnfant) + '" target="_top">← Revenir aux quiz</a></p>' : '') + '</div>' + signalCadre_())
    .setTitle('Espace parent').setFaviconUrl(ICONE_SITE).addMetaTag('viewport', 'width=device-width, initial-scale=1'));
}

function pageErreur_(titre, message) {
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const accueil = urlIci_();
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
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('catalogue');
  if (enCache) return JSON.parse(enCache);

  const props = PropertiesService.getScriptProperties();
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
      QUIZ.push(Object.assign({ titre: meta.titre, matiere: meta.matiere, fichier: nom, description: meta.description, date: meta.date, badge: meta.badge }, meta.nq ? { nq: meta.nq } : {}, meta.biblio ? { biblio: meta.biblio } : {}));
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

const META_V = 2;                       // à augmenter quand lireMeta_ lit un nouveau champ : les quiz déjà lus sont relus
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
    v: META_V,
    date: dateDepuisNom_(nom) || jour_(cree),
    biblio: /^[a-z0-9-]{1,80}$/.test(champ('biblio')) ? champ('biblio') : ''    // quiz ajouté depuis la bibliothèque : son identifiant
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
  const cache = CacheService.getScriptCache();
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
  try { cache.removeAll(['revisions', 'maitrise']); cache.put('gen', String(Date.now()), 21600); } catch (e) {}
  LIGNES_ = null;
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
  const cache = CacheService.getScriptCache();
  if (!maintenant) { const c = cache.get('revisions'); if (c) return JSON.parse(c); }
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
  const cache = CacheService.getScriptCache();
  const c = cache.get('maitrise'); if (c) return JSON.parse(c);
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
        try { CacheService.getScriptCache().removeAll(['revisions', 'maitrise']); } catch (e) {}
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
  CacheService.getScriptCache().remove('catalogue');
  return { ok: true };
}

/* Texte d'un quiz du site, au format en lignes : pour le proposer à la bibliothèque de la communauté.
   Seuls les quiz créés depuis le site (configuration en JSON) peuvent être relus ainsi. */
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
  return { ok: true, titre: String(cfg.titre || ''), texte: lignesDeQuiz_(cfg) };
}

/* configuration interne d'un quiz → format en lignes (l'inverse de lireFormatLignes_ + normaliserQuestion_) */
function lignesDeQuiz_(c) {
  const ent = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const f = s => ent(s).replace(/[|\r\n]+/g, ' / ').replace(/\s+/g, ' ').trim();
  const L = [];
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
      default: return;
    }
    while (l.length > 2 && l[l.length - 1] === '') l.pop();
    if (q.dire && !(q.type === 'parler' && q.dire === q.phrase)) l.push('dire=' + f(q.dire));
    if (q.langue && q.langue !== c.langueAudio) l.push('langue=' + f(q.langue));
    if (q.img) l.push('img=' + f(q.img));
    if (q.fig) l.push('fig=' + f(q.fig));
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
  const p = PropertiesService.getScriptProperties();
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
  const p = PropertiesService.getScriptProperties();
  if (c) p.setProperties({ CLASSE: c, CLASSE_ANNEE: String(anneeScolaire_()) });
  else { p.deleteProperty('CLASSE'); p.deleteProperty('CLASSE_ANNEE'); }
  const classe = classe_();
  try { CacheService.getScriptCache().remove('famille-inscrit'); inscrireFamille_(installer_()); } catch (e) {}
  return { ok: true, classe, theme: themeDe_(classe) };
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
  return PropertiesService.getScriptProperties().getProperty('SAISON_OFF') === '1' ? '' : saisonDe_();
}
function apiSaison(d) {
  if (interdit_()) return refusEnfant_();
  const p = PropertiesService.getScriptProperties();
  if (d && d.active === false) p.setProperty('SAISON_OFF', '1'); else p.deleteProperty('SAISON_OFF');
  return { ok: true, saison: saison_(), active: !(d && d.active === false) };
}

function apiGeminiCle(d) {
  if (interdit_()) return refusEnfant_();
  const cle = String((d && d.cle) || '').trim();
  const props = PropertiesService.getScriptProperties();
  if (cle && !CLE_GEMINI_.test(cle)) return { erreur: "Ce n'est pas une clé Gemini." };
  if (cle) props.setProperty('GEMINI_CLE', cle); else props.deleteProperty('GEMINI_CLE');
  // la même clé sert à tous les enfants de la famille
  if (CONFIG.urlParent) try { ecrireFamille_(f => { if (cle) f.gemini = cle; else delete f.gemini; }); } catch (e) {}
  return { ok: true };
}
// nom d'un dessin du catalogue du moteur (moteur/commun/dessins.js) : img=labo:becher, propositions « danger:corrosif »…
const DESSIN_ = /^(?:(?:labo|danger|protection|etat):[a-z]{2,20}|heure:\d{1,2}h\d{2}(?:,\d{1,2}h\d{2}){0,3}|nombre:\d{1,12})$/;
// note de musique : C4, F#4, do3… suivie de *2 / *0.5 (durée) et ^ (fort) ou _ (doux)
const NOTE_ = /^([A-Ga-g]|do|ut|r[eé]|mi|fa|sol|la|si)[#b♯♭]?\d?(\*\d*\.?\d+)?[\^_]?$/i;
const CLE_GEMINI_ = /^(AIza|AQ\.)[\w.\-]{25,200}$/;
// clé du site, sinon celle de la famille (saisie dans l'espace parent d'un autre enfant)
function cleGemini_() {
  const propre = PropertiesService.getScriptProperties().getProperty('GEMINI_CLE');
  if (propre || !CONFIG.urlParent) return propre || '';
  try { const g = lireFamille_().gemini; return CLE_GEMINI_.test(g || '') ? g : ''; } catch (e) { return ''; }
}

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
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('FAMILLE');
  let f = null;
  if (id) try { f = DriveApp.getFileById(id); if (f.isTrashed()) f = null; } catch (e) { f = null; }
  if (!f && (CONFIG.espace !== 'parent' || estProprietaire_())) { const it = DriveApp.getRootFolder().getFilesByName(NOM_FAMILLE); while (!f && it.hasNext()) { const x = it.next(); if (!x.isTrashed()) f = x; } }
  const proprio = CONFIG.espace !== 'parent' || estProprietaire_();     // l'autre parent ne voit que le fichier partagé (par son id)
  if (!proprio) return f;
  if (!f && creer) f = DriveApp.getRootFolder().createFile(NOM_FAMILLE, '{"sites":[]}', MimeType.PLAIN_TEXT);
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
  CacheService.getScriptCache().remove('famille');
}
// le site se (ré)inscrit au plus toutes les 6 heures, et tout de suite après un changement de classe
function inscrireFamille_(inst) {
  if (!URL_SITE_.test(CONFIG.urlParent || '')) return;      // site installé à la main : pas de famille
  if (CONFIG.espace === 'parent' && !estProprietaire_()) return;   // l'autre parent n'inscrit rien
  const cache = CacheService.getScriptCache();
  if (cache.get('famille-inscrit')) return;
  const moi = { parent: CONFIG.urlParent, enfant: CONFIG.urlEnfant || '', prenom: CONFIG.prenom || '', classe: classe_(), dossier: inst.dossier.getId() };
  let parents = [];
  ecrireFamille_(d => {
    const i = d.sites.findIndex(x => x.parent === moi.parent || x.dossier === moi.dossier);   // site réinstallé : même dossier
    if (i >= 0) d.sites[i] = moi; else d.sites.push(moi);
    parents = parentsDe_(d);
    // clé Gemini enregistrée avant le partage en famille (v2.60) : elle est recopiée pour les autres enfants
    const propre = PropertiesService.getScriptProperties().getProperty('GEMINI_CLE');
    if (propre && !CLE_GEMINI_.test(d.gemini || '')) d.gemini = propre;
  });
  // nouvel enfant ajouté après l'invitation : son dossier est partagé lui aussi avec l'autre parent
  if (parents.length) partager_(inst.dossier, parents, true);
  cache.put('famille-inscrit', '1', 21600);
}
// enfants de la famille dont le dossier existe encore (site supprimé : il disparaît de la liste)
function familleListe_() {
  if (!URL_SITE_.test(CONFIG.urlParent || '')) return [];
  const cache = CacheService.getScriptCache(), enCache = cache.get('famille');
  let l = null;
  if (enCache) try { l = JSON.parse(enCache); } catch (e) { l = null; }
  if (!l) {
    l = lireFamille_().sites.filter(x => URL_SITE_.test(String(x.parent || '')) && (x.parent === CONFIG.urlParent || (() => {
      try { return !DriveApp.getFolderById(String(x.dossier)).isTrashed(); } catch (e) { return false; }
    })())).map(x => ({ prenom: String(x.prenom || '').slice(0, 40), classe: String(x.classe || '').slice(0, 10), parent: x.parent, dossier: String(x.dossier || '') }));
    try { cache.put('famille', JSON.stringify(l), 60); } catch (e) {}      // court : une classe changée chez un autre enfant apparaît vite
  }
  return l.map(x => Object.assign(x, { ici: x.parent === CONFIG.urlParent }));
}

/* une question du quiz (format JSON interne), vérifiée et nettoyée ; null si elle est inutilisable.
   Sert à la création d'un quiz et aux questions ratées renvoyées par le moteur (révisions, défi). */
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
  const dire = txt(q.dire || q.ecoute || q.audio, 300);
  if (dire) { base.dire = dire; const lg = txt(q.langue || q.lang, 10); if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lg)) base.langue = lg; }
  if (Array.isArray(q.notes) && type !== 'clavier' && type !== 'placer') {
    const note = x => NOTE_.test(String(x).trim()) || /^(\/|-(\*\d*\.?\d+)?)$/.test(String(x).trim());   // / sépare deux sons à comparer, - est un silence
    const notes = q.notes.slice(0, 24).map(x => Array.isArray(x) ? x.slice(0, 5).map(y => txt(y, 10)).filter(note) : txt(x, 10))
      .filter(x => Array.isArray(x) ? x.length : note(x));
    if (notes.length) { base.notes = notes; if (q.portee) base.portee = q.portee === 'seule' ? 'seule' : true; }
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

function apiAjouterQuiz(texte, aussi, source) {
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
    CacheService.getScriptCache().remove('catalogue');
    return { ok: true, page: nom, titre: meta.titre, nb: null, avertissements: [], aussi: copierAussi_(aussi, meta.titre, texte) };
  }

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
    biblio: /^[a-z0-9-]{1,80}$/.test(String(source || '')) ? String(source) : ''    // ajouté depuis la bibliothèque : on saura s'il en est retiré
  });
  const nom = nomLibre_(inst.dossier, titre);
  inst.dossier.createFile(nom + '.html', html, MimeType.HTML);
  CacheService.getScriptCache().remove('catalogue');
  return { ok: true, page: nom, titre, nb: questions.length, avertissements: avert, aussi: copierAussi_(aussi, titre, html) };
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
  if (!URL_SITE_.test(CONFIG.urlParent || '')) return { erreur: 'Mets d\'abord ton site à jour depuis l\'installateur.' };
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
  const inst = installer_(), props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache(), fait = [];
  if (d.resultats) {
    const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Paris', 'dd/MM/yyyy');
    DriveApp.getFileById(inst.ss.getId()).setName(NOM_SHEETS + ' (archive du ' + date + ')');
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
  try { cache.removeAll(['catalogue', 'revisions', 'maitrise', 'famille', 'famille-inscrit']); cache.put('gen', String(Date.now()), 21600); } catch (e) {}
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
  const inst = installer_(), props = PropertiesService.getScriptProperties();
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
  try { CacheService.getScriptCache().removeAll(['catalogue', 'revisions', 'maitrise', 'famille', 'famille-inscrit']); } catch (e) {}
  const retour = CONFIG.installateur ? CONFIG.installateur + (CONFIG.installateur.indexOf('?') < 0 ? '?' : '&') + 'supprime=' + encodeURIComponent(ScriptApp.getScriptId()) : '';
  return { ok: true, garde: !!d.garder, retour };
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
  const url = String((d && d.parent) || '');
  if (!url || url === CONFIG.urlParent) return { erreur: 'Ce site ne peut pas être retiré d\'ici.' };
  ecrireFamille_(f => { f.sites = f.sites.filter(x => x.parent !== url); });
  return { ok: true };
}

// même quiz déposé dans le dossier d'autres enfants de la famille (adresses de leur espace parent) ;
// seuls les enfants inscrits dans le fichier de la famille sont acceptés. Il apparaît chez eux en moins d'une minute.
function copierAussi_(aussi, titre, html) {
  if (!Array.isArray(aussi) || !aussi.length) return [];
  const faits = [];
  familleListe_().forEach(x => {
    if (x.ici || aussi.indexOf(x.parent) < 0) return;
    try { const d = DriveApp.getFolderById(x.dossier); d.createFile(nomLibre_(d, titre) + '.html', html, MimeType.HTML); faits.push(x.prenom || 'un autre enfant'); }
    catch (e) { console.error(e); }
  });
  return faits;
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
  const d = { questions: [], memo: [], icones: {} };
  let cat = '', vu = false;
  String(texte).split(/\r?\n/).forEach(brute => {
    const l = brute.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?/, '').trim();
    if (/^#+\s*\**\s*(sujet|notions?|supports?)\s*\**\s*:/i.test(l)) return;   // analyse de la leçon écrite par l'IA (# Sujet, # Notions, # Supports)
    const titreCat = l.match(/^#{2,}\s*(.+)$/);
    if (titreCat) {                             // ## Catégorie|✂️ : l'emoji illustre ses questions
      const [nom, ico] = titreCat[1].split('|').map(s => s.replace(/[#*]/g, '').trim());
      cat = nom; if (ico) d.icones[cat] = ico;
      return;
    }
    const m = l.match(/^([TQVSMGOACXNPKL])\s*[|:]\s*(.*)$/i);
    if (!m) return;
    const sorte = m[1].toUpperCase();
    const champs = m[2].split('|').map(s => s.trim());
    const extra = {}, pos = [];
    // champs nommés : toujours avec = (une bonne réponse « dire » ou « notes » reste une réponse) ;
    // seul « portee » peut être écrit seul, et seulement après la question et sa réponse
    champs.forEach(c => {
      const k = c.match(/^(dire|notes|portee|portée|indice|langue|img|fig)\s*=\s*(.+)$/i);
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
    if (typeof extra.langue === 'string') q.langue = extra.langue;
    if (typeof extra.indice === 'string') q.hint = extra.indice;
    if (typeof extra.notes === 'string' && q.type !== 'clavier' && q.type !== 'placer') q.notes = extra.notes.split(/[\s,]+/).filter(Boolean).map(n => n.includes('+') ? n.split('+') : n);
    if (extra.portee) q.portee = extra.portee === 'seule' ? 'seule' : true;
    vu = true;
    d.questions.push(q);
  });
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
function mettreEnCache_(cle, valeur, gen) {
  try {
    const t = JSON.stringify(valeur), c = CacheService.getScriptCache();
    if (gen !== undefined && (c.get('gen') || '') !== gen) return;      // une partie a été enregistrée pendant le calcul
    if (Utilities.newBlob(t).getBytes().length < 95000) c.put(cle, t, 600);
  } catch (e) {}
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
