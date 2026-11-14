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
     …/exec?page=controles       → contrôles papier (PDF du dossier Drive)
     …/exec?page=ajouter         → ajout d'un quiz (parents)

   Deux publications du même site (créées par l'installateur en ligne) :
     • le site de l'enfant (accès : tout le monde, sans compte) : quiz, contrôles, accueil ;
     • l'espace parent (accès : « Seulement moi », Google vérifie le compte du parent) :
       tout le site, plus « Ajouter un quiz », le suivi des résultats et la clé Gemini.
   Dans le site de l'enfant, les pages et les actions réservées aux parents sont refusées.

   Où sont les choses :
     • le moteur (commun/…) et les pages d'accueil : dans ce projet (dossier lib/)
     • les quiz (.html) et les contrôles (.pdf) : dans le dossier Drive « SoccaQuiz » (« Universal Quiz » pour les sites installés avant)
     • les résultats : dans le Google Sheets « SoccaQuiz – Résultats » (même dossier)

   Le dossier et le Sheets sont créés tout seuls à la première visite
   (ou en lançant la fonction installer() depuis l'éditeur).
   ===================================================================== */

/* ---------------- RÉGLAGES (à adapter) ---------------- */
const CONFIG = {
  prenom: '',                     // prénom de l'enfant (tableau de bord, encouragements) ; vide = « mon enfant »
  nomDossier: 'SoccaQuiz',        // nom du dossier créé dans ton Google Drive
  partagerPdf: true,              // rend les PDF lisibles par lien, pour que l'enfant puisse les ouvrir
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
/* ------------------------------------------------------ */

const NOM_SHEETS = 'SoccaQuiz – Résultats';
// anciens noms (avant le passage à SoccaQuiz) : un site réinstallé retrouve ainsi ses quiz et ses résultats
const ANCIEN_DOSSIER = 'Universal Quiz', ANCIEN_SHEETS = 'Universal Quiz – Résultats';
const COLONNES = ['id', 'date', 'joueur', 'quiz', 'titre', 'matiere', 'score', 'total', 'duree', 'dateLocale', 'appareil', 'cats', 'questions'];
const PAGES = { 'index': 'lib/page-index', 'tableau-de-bord': 'lib/page-tableau-de-bord', 'controles': 'lib/page-controles', 'ajouter': 'lib/page-ajouter' };
// pages et actions réservées à l'espace parent
const PAGES_PARENT = ['tableau-de-bord', 'ajouter'];
function estEnfant_() { return CONFIG.espace === 'enfant'; }
function refusEnfant_() { return { __status: 403, erreur: 'Réservé à l\'espace parent.' }; }
function urlIci_() {
  return (estEnfant_() ? CONFIG.urlEnfant : CONFIG.espace === 'parent' ? CONFIG.urlParent : '') || ScriptApp.getService().getUrl() || '';
}
const COMMUN = {
  'moteur-quiz.css': 'lib/moteur-quiz-css',
  'themes.css': 'lib/themes-css',
  'suivi.js': 'lib/suivi-js',
  'recompenses.js': 'lib/recompenses-js',
  'moteur-quiz.js': 'lib/moteur-quiz-js',
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
  const page = nettoyerNom_(p.page || 'index');
  try {
    if (estEnfant_() && PAGES_PARENT.indexOf(page) >= 0) return pageEspaceParent_();
    const inst = installer_();
    let html;
    // dans l'espace parent, l'accueil est le tableau de bord des parents (pas la page de l'enfant)
    const pageServie = CONFIG.espace === 'parent' && page === 'index' ? 'tableau-de-bord' : page;
    if (PAGES[pageServie]) {
      html = lib_(PAGES[pageServie], true);
    } else {
      const f = trouverFichier_(inst.dossier, page + '.html');
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
  return { dossier: inst.dossier.getUrl(), resultats: inst.ss.getUrl(), site: url };
}

/* Petit bilan, à lancer depuis l'éditeur en cas de doute. */
function diagnostic() {
  const inst = installer_();
  CacheService.getScriptCache().remove('catalogue');
  const cat = catalogue_(inst.dossier);
  console.log('Dossier : ' + inst.dossier.getName() + ' — ' + inst.dossier.getUrl());
  console.log(cat.QUIZ.length + ' quiz, ' + cat.CONTROLES.length + ' contrôle(s) PDF');
  cat.QUIZ.forEach(q => console.log('  • ' + q.fichier + ' → « ' + q.titre + ' » (' + q.matiere + ')'));
  console.log('Résultats : ' + Math.max(0, inst.ss.getSheets()[0].getLastRow() - 1) + ' partie(s) — ' + inst.ss.getUrl());
  console.log('Site : ' + (ScriptApp.getService().getUrl() || 'pas encore déployé'));
}

/* =====================================================================
   INSTALLATION (automatique et idempotente)
   ===================================================================== */
function installer_() {
  const props = PropertiesService.getScriptProperties();
  let dossier = ouvrirDossier_(props.getProperty('DOSSIER'));
  let ss = ouvrirSheets_(props.getProperty('RESULTATS'));
  if (dossier && ss) return { dossier, ss };

  const verrou = LockService.getScriptLock();
  verrou.waitLock(30000);
  try {
    dossier = ouvrirDossier_(props.getProperty('DOSSIER'));
    if (!dossier) {
      const it = DriveApp.getRootFolder().getFoldersByName(CONFIG.nomDossier);
      // l'ancien dossier « Universal Quiz » n'est repris que par le site principal (les autres sites ont leur propre dossier)
      const ancien = it.hasNext() || CONFIG.nomDossier !== 'SoccaQuiz' ? { hasNext: () => false } : DriveApp.getRootFolder().getFoldersByName(ANCIEN_DOSSIER);
      dossier = it.hasNext() ? it.next() : ancien.hasNext() ? ancien.next() : DriveApp.createFolder(CONFIG.nomDossier);
      props.setProperty('DOSSIER', dossier.getId());
      if (!contientHtml_(dossier)) {
        dossier.createFile('quiz_exemple_capitales.html', lib_('lib/exemple-quiz', false), MimeType.HTML);
      }
    }
    ss = ouvrirSheets_(props.getProperty('RESULTATS'));
    if (!ss) {
      let it = dossier.getFilesByName(NOM_SHEETS);
      if (!it.hasNext()) it = dossier.getFilesByName(ANCIEN_SHEETS);
      ss = it.hasNext() ? SpreadsheetApp.open(it.next()) : creerSheets_(dossier);
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
  while (it.hasNext()) if (/\.html?$/i.test(it.next().getName())) return true;
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

  html = html.replace(/<link\b[^>]*href=["']commun\/([\w.-]+\.css)["'][^>]*>/gi, (m, f) =>
    COMMUN[f] ? lib_(COMMUN[f], true) : '<!-- ' + f + ' introuvable -->');      // déjà entouré de <style>

  html = html.replace(/<script\b[^>]*src=["']commun\/([\w.-]+\.js)["'][^>]*>\s*<\/script>/gi, (m, f) => {
    if (f === 'catalogue.js') return '';                       // remplacé par le catalogue automatique (dans l'en-tête)
    if (!COMMUN[f]) return '<!-- ' + f + ' introuvable -->';
    let s = lib_(COMMUN[f], true);                     // déjà entouré de <script>
    if (f === 'moteur-quiz.js' && !aBadges) s += '\n' + lib_(COMMUN['badges.js'], true);
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
    classe: classe_(),
    classes: CLASSES
  };
  cfg.theme = themeDe_(cfg.classe);
  // la clé Gemini n'est donnée qu'à la page « Ajouter un quiz », jamais aux quiz que joue l'enfant
  if (CONFIG.espace === 'parent' || !CONFIG.espace && page === 'tableau-de-bord') cfg.geminiOk = !!PropertiesService.getScriptProperties().getProperty('GEMINI_CLE');
  if (page === 'ajouter' && !estEnfant_()) cfg.gemini = PropertiesService.getScriptProperties().getProperty('GEMINI_CLE') || '';
  // la configuration est posée dans sa propre balise : Apps Script peut retirer les commentaires des fichiers,
  // on ne s'appuie donc sur aucun marqueur à remplacer dans pont.html
  const pont = '<script>window.__UQ = ' + jsonScript_(cfg) + ';</script>\n' + lib_('lib/pont', false);
  const catalogueJs = 'var QUIZ = ' + jsonScript_(cat.QUIZ) + ';\nvar CONTROLES = ' + jsonScript_(cat.CONTROLES) + ';\nvar MATIERES = ' + jsonScript_(MATIERES) + ';';
  const tete = '\n<base target="_top">\n' + pont + '\n<script>\n' + catalogueJs + '\n</script>\n';

  // thème d'âge : posé sur <html>, styles ajoutés en fin d'en-tête pour passer après ceux de la page
  const styleTheme = (cfg.theme === 'lecteurs' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Andika:wght@400;700&display=swap">\n' : '') + lib_(COMMUN['themes.css'], false);
  html = html.replace(/<html\b/i, '<html data-theme="' + cfg.theme + '"');
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, styleTheme + '\n</head>') : styleTheme + html;
  return /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, m => m + tete)
    : tete + html;
}

function servir_(html) {
  const t = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  return HtmlService.createHtmlOutput(html)
    .setTitle(texte_(t || 'Quiz'))
    .setFaviconUrl(ICONE_SITE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* page affichée dans le site de l'enfant quand on demande une page des parents */
function pageEspaceParent_() {
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;border:2px solid #eadfce;border-radius:16px;background:#fff;color:#2b2350">' +
    '<h2 style="margin-top:0">🔒 Espace parent</h2>' +
    '<p>Cette page est réservée aux parents. Elle s\'ouvre avec le lien « Espace parent », en étant connecté au compte Google du parent.</p>' +
    (CONFIG.urlParent ? '<p><a href="' + h(CONFIG.urlParent) + '" target="_top" style="display:inline-block;background:#7c3aed;color:#fff;border-radius:999px;padding:10px 18px;text-decoration:none;font-weight:600">🔒 Ouvrir l\'espace parent</a></p>' : '') +
    (CONFIG.urlEnfant ? '<p><a href="' + h(CONFIG.urlEnfant) + '" target="_top">← Revenir aux quiz</a></p>' : '') + '</div>')
    .setTitle('Espace parent').setFaviconUrl(ICONE_SITE).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function pageErreur_(titre, message) {
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const accueil = urlIci_();
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px">' +
    '<h2 style="margin-top:0">😕 ' + h(titre) + '</h2><p>' + h(message) + '</p>' +
    (accueil ? '<p><a href="' + h(accueil) + '" target="_top">📚 Revenir à mes quiz</a></p>' : '') + '</div>')
    .setTitle(titre).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* lecture d'un fichier du projet (lib/…) ; {{PRENOM}} y est remplacé par le prénom des réglages.
   Apps Script refuse un fichier .html qui n'est pas du HTML valide : construire.mjs entoure donc
   chaque fichier .js de <script>…</script> et chaque .css de <style>…</style>. */
const LIB_CACHE_ = {};
function lib_(nom, avecPrenom) {
  if (!(nom in LIB_CACHE_)) LIB_CACHE_[nom] = HtmlService.createHtmlOutputFromFile(nom).getContent();
  const s = LIB_CACHE_[nom];
  if (!avecPrenom) return s;
  const prenom = String(CONFIG.prenom || '').trim().replace(/'/g, '’').replace(/[<>"`\\&$]/g, '') || 'mon enfant';
  return s.split('{{PRENOM}}').join(prenom);
}

/* =====================================================================
   CATALOGUE AUTOMATIQUE
   Chaque .html du dossier = un quiz ; chaque .pdf = un contrôle papier.
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
  const QUIZ = [], CONTROLES = [], liens = {};
  let surcharges = { Q: {}, C: {} };

  const it = dossier.getFiles();
  const pdfs = [];
  while (it.hasNext()) {
    const f = it.next();
    const nom = f.getName();
    if (nom === 'catalogue.js') { surcharges = lireSurcharges_(f) || surcharges; continue; }
    if (/\.html?$/i.test(nom)) {
      const cle = 'm_' + f.getId(), maj = f.getLastUpdated().getTime();
      let meta = null;
      try { meta = JSON.parse(toutes[cle] || 'null'); } catch (e) {}
      if (!meta || meta.u !== maj || meta.n !== nom) {
        meta = Object.assign({ u: maj, n: nom }, lireMeta_(f.getBlob().getDataAsString('UTF-8'), nom, f.getDateCreated()));
        aEcrire[cle] = JSON.stringify(meta);
      }
      QUIZ.push({ titre: meta.titre, matiere: meta.matiere, fichier: nom, description: meta.description, date: meta.date, badge: meta.badge });
    } else if (/\.pdf$/i.test(nom)) {
      pdfs.push(f);
    }
  }

  pdfs.forEach(f => {
    const nom = f.getName(), id = f.getId();
    if (CONFIG.partagerPdf && toutes['p_' + id] !== '1') {
      try {
        if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK && f.getSharingAccess() !== DriveApp.Access.ANYONE) {
          f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        }
        aEcrire['p_' + id] = '1';
      } catch (e) { console.warn('Partage impossible pour ' + nom + ' : ' + e.message); }
    }
    liens[nom] = { voir: 'https://drive.google.com/file/d/' + id + '/view', dl: 'https://drive.google.com/uc?export=download&id=' + id };
    const base = nom.replace(/\.pdf$/i, '');
    CONTROLES.push({
      titre: joli_(base.replace(/^controle[_-]?/i, '').replace(/[_-]\d{2}-\d{2}-\d{4}$|[_-]\d{4}-\d{2}-\d{2}$/, '')),
      matiere: 'autre', fichier: nom, description: 'PDF à imprimer',
      date: dateDepuisNom_(nom) || jour_(f.getDateCreated())
    });
  });

  // les descriptions du catalogue.js (s'il existe) l'emportent
  QUIZ.forEach(q => { const s = surcharges.Q[q.fichier]; if (s) Object.assign(q, s, { fichier: q.fichier }); });
  CONTROLES.forEach(c => { const s = surcharges.C[c.fichier]; if (s) Object.assign(c, s, { fichier: c.fichier }); });

  if (Object.keys(aEcrire).length) props.setProperties(aEcrire);
  const cat = { QUIZ, CONTROLES, liens };
  try { cache.put('catalogue', JSON.stringify(cat), CONFIG.dureeCacheCatalogue); } catch (e) {}
  return cat;
}

function lireMeta_(html, nom, cree) {
  const i = html.lastIndexOf('MoteurQuiz.lancer');
  const bloc = i >= 0 ? html.slice(i) : html;
  const champ = k => {
    const m = bloc.match(new RegExp('\\b' + k + '["\']?\\s*:\\s*(["\'`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1'));
    return m ? m[2].replace(/\\(["'`\\])/g, '$1') : '';
  };
  const titreBalise = texte_((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/^Quiz\s*[–-]\s*/i, '');
  const titre = texte_(champ('titre')) || titreBalise || joli_(nom.replace(/\.html?$/i, ''));
  const matiere = (champ('matiere') || 'autre').toLowerCase();
  const sous = texte_(champ('sousTitre').split(/<br\s*\/?>/i)[0]);
  const nb = (html.match(/Pool\s*:\s*(\d+)\s*questions/i) || [])[1];
  return {
    titre: titre.slice(0, 120),
    matiere: MATIERES[matiere] ? matiere : 'autre',
    badge: (/^(⭐|🌟|✨)?$/u.test(champ('badge')) && champ('icone')) || champ('badge') || '',
    description: [sous, nb ? nb + ' questions' : ''].filter(Boolean).join(' · ').slice(0, 200),
    date: dateDepuisNom_(nom) || jour_(cree)
  };
}

function lireSurcharges_(f) {
  try {
    const code = f.getBlob().getDataAsString('UTF-8');
    const r = new Function(code + '\n;return { Q: typeof QUIZ !== "undefined" ? QUIZ : [], C: typeof CONTROLES !== "undefined" ? CONTROLES : [] };')();
    const parFichier = l => (Array.isArray(l) ? l : []).reduce((o, x) => { if (x && x.fichier) o[String(x.fichier).split('/').pop()] = x; return o; }, {});
    return { Q: parFichier(r.Q), C: parFichier(r.C) };
  } catch (e) {
    console.warn('catalogue.js illisible : ' + e.message);
    return null;
  }
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
  const date = new Date().toISOString();
  const id = 'r:' + date + ':' + Math.random().toString(36).slice(2, 8);
  let joueur = '';
  try { joueur = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  let questions = Array.isArray(r.questions) ? r.questions.slice(0, 200).map(q => ({
    q: str(q.q, 400), cat: str(q.cat, 80), donne: str(q.donne, 200), attendu: str(q.attendu, 200), ok: !!q.ok
  })) : [];
  let jsonQ = JSON.stringify(questions);
  if (jsonQ.length > 49000) {         // une cellule Sheets contient au plus 50 000 caractères
    questions = questions.map(q => ({ q: q.q.slice(0, 120), cat: q.cat.slice(0, 40), donne: q.donne.slice(0, 60), attendu: q.attendu.slice(0, 60), ok: q.ok }));
    jsonQ = JSON.stringify(questions);
    while (jsonQ.length > 49000 && questions.length) { questions.pop(); jsonQ = JSON.stringify(questions); }
  }
  const ligne = {
    id, date, joueur,
    quiz: str(r.quiz, 160), titre: str(r.titre, 120), matiere: str(r.matiere, 30),
    score: String(+r.score), total: String(+r.total),
    duree: r.duree != null && isFinite(+r.duree) ? String(Math.round(+r.duree)) : '',
    dateLocale: str(r.dateLocale, 40), appareil: str(r.appareil, 20),
    cats: JSON.stringify(r.cats && typeof r.cats === 'object' ? r.cats : {}).slice(0, 20000),
    questions: jsonQ
  };
  feuille_().appendRow(COLONNES.map(c => ligne[c]));
  return { ok: true, id };
}

function apiLister(q) {
  q = q || {};
  const lignes = lireLignes_();
  if (q.id) {
    const l = lignes.find(x => x.id === q.id);
    return l ? complet_(l) : { __status: 404, erreur: 'Partie introuvable' };
  }
  const liste = lignes.map(l => ({
    id: l.id, date: l.date, quiz: l.quiz, titre: l.titre, matiere: l.matiere,
    score: +l.score || 0, total: +l.total || 0, duree: l.duree === '' ? null : +l.duree,
    joueur: l.joueur, appareil: l.appareil, _l: l
  }));
  liste.sort((a, b) => String(b.date || b.id).localeCompare(String(a.date || a.id)));
  if (String(q.details) === '1') {
    liste.slice(0, 200).forEach(x => { const c = complet_(x._l); x.questions = c.questions; x.cats = c.cats; });
  }
  liste.forEach(x => delete x._l);
  return { resultats: liste };
}

function apiSupprimer(id) {
  if (estEnfant_()) return refusEnfant_();
  if (typeof id !== 'string' || !/^r:[0-9T:.\-Z]+:[a-z0-9]+$/.test(id)) return { __status: 400, erreur: 'Identifiant invalide' };
  const sh = feuille_();
  const n = sh.getLastRow();
  if (n < 2) return { __status: 404, erreur: 'Partie introuvable' };
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0] === id) { sh.deleteRow(i + 2); return { ok: true }; }
  }
  return { __status: 404, erreur: 'Partie introuvable' };
}

/* suppression d'un quiz depuis la page d'accueil : le fichier part dans la corbeille du Drive (récupérable 30 jours) */
function apiSupprimerQuiz(nom) {
  if (estEnfant_()) return refusEnfant_();
  nom = String(nom || '').split('/').pop();
  if (!/\.html?$/i.test(nom) || nom.length > 200) return { erreur: 'Quiz invalide.' };
  const inst = installer_();
  const f = trouverFichier_(inst.dossier, nom);
  if (!f) return { erreur: 'Ce quiz n\'existe plus (déjà supprimé ?).' };
  f.setTrashed(true);
  CacheService.getScriptCache().remove('catalogue');
  return { ok: true };
}

/* =====================================================================
   AJOUT D'UN QUIZ DEPUIS LE SITE (page « ajouter »)
   Le parent colle la réponse de l'IA (Claude, ChatGPT, Grok…) : un objet
   JSON décrivant le quiz. On le vérifie, on fabrique le fichier .html
   (même structure que le quiz d'exemple) et on le range dans le dossier Drive.
   Un fichier .html complet collé tel quel est aussi accepté.
   ===================================================================== */
const COULEURS_ = { francais: '#7c3aed', maths: '#c2410c', sciences: '#15803d', anglais: '#b91c1c',
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
  if (estEnfant_()) return refusEnfant_();
  const c = String((d && d.classe) || '');
  if (c && c !== 'adulte' && CLASSES.indexOf(c) < 0) return { erreur: 'Classe inconnue.' };
  const p = PropertiesService.getScriptProperties();
  if (c) p.setProperties({ CLASSE: c, CLASSE_ANNEE: String(anneeScolaire_()) });
  else { p.deleteProperty('CLASSE'); p.deleteProperty('CLASSE_ANNEE'); }
  const classe = classe_();
  return { ok: true, classe, theme: themeDe_(classe) };
}

function apiGeminiCle(d) {
  if (estEnfant_()) return refusEnfant_();
  const cle = String((d && d.cle) || '').trim();
  const props = PropertiesService.getScriptProperties();
  if (!cle) { props.deleteProperty('GEMINI_CLE'); return { ok: true }; }
  if (!/^(AIza|AQ\.)[\w.\-]{25,200}$/.test(cle)) return { erreur: "Ce n'est pas une clé Gemini." };
  props.setProperty('GEMINI_CLE', cle);
  return { ok: true };
}

function apiAjouterQuiz(texte) {
  if (estEnfant_()) return refusEnfant_();
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
    return { ok: true, page: nom, titre: meta.titre, nb: null, avertissements: [] };
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
  (Array.isArray(d.questions) ? d.questions : []).forEach((q, i) => {
    if (!q || typeof q !== 'object') return;
    const type = String(q.type || 'qcm').toLowerCase();
    const base = { cat: txt(q.cat || q.categorie, 60) || 'Questions', q: txt(q.q || q.question, 500), exp: txt(q.exp || q.explication, 500) };
    if (!base.q && type !== 'trous') return;
    // écoute : phrase lue à voix haute (anglais…) et notes de musique
    const img = emoji_(q.img || q.image);
    if (img) base.img = img;
    const dire = txt(q.dire || q.ecoute || q.audio, 300);
    if (dire) { base.dire = dire; const lg = txt(q.langue || q.lang, 10); if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lg)) base.langue = lg; }
    if (Array.isArray(q.notes) && type !== 'clavier') {
      const note = x => /^([A-Ga-g]|do|ut|r[eé]|mi|fa|sol|la|si)[#b♯♭]?\d?$/i.test(String(x).trim()) || String(x).trim() === '-';
      const notes = q.notes.slice(0, 16).map(x => Array.isArray(x) ? x.slice(0, 5).map(y => txt(y, 5)).filter(note) : txt(x, 5))
        .filter(x => Array.isArray(x) ? x.length : note(x));
      if (notes.length) { base.notes = notes; if (q.portee) base.portee = q.portee === 'seule' ? 'seule' : true; }
    }
    if (type === 'qcm') {
      const opts = (Array.isArray(q.opts || q.choix) ? (q.opts || q.choix) : []).map(o => txt(o, 160)).filter(Boolean);
      let a = txt(q.a != null ? q.a : q.reponse, 160);
      const trouve = opts.find(o => o === a) || opts.find(o => o.toLowerCase() === a.toLowerCase());
      if (opts.length < 2 || !trouve) { avert.push('Question ' + (i + 1) + ' ignorée (bonne réponse absente des choix).'); return; }
      questions.push(Object.assign(base, { type: 'qcm', opts, a: trouve }));
    } else if (type === 'vf' || type === 'vrai-faux' || type === 'vraifaux') {
      const v = q.a != null ? q.a : q.reponse;
      const a = v === true || /^(vrai|true|oui)$/i.test(String(v).trim()) ? true
              : v === false || /^(faux|false|non)$/i.test(String(v).trim()) ? false : null;
      if (a === null) { avert.push('Question ' + (i + 1) + ' ignorée (réponse ni Vrai ni Faux).'); return; }
      questions.push(Object.assign(base, { type: 'vf', a }));
    } else if (type === 'saisie' || type === 'input') {
      const liste = [].concat(q.ans || [], q.a != null ? [q.a] : [], q.reponse != null ? [q.reponse] : [], q.alt || [])
        .map(x => txt(x, 80)).filter(Boolean);
      // « la photosynthèse » accepte aussi « photosynthèse » : l'IA n'a pas à écrire cette variante
      liste.slice().forEach(x => { const s = x.replace(/^(le|la|les|un|une|des|du)\s+|^l['’]\s*/i, ''); if (s && s !== x) liste.push(s); });
      if (!liste.length) { avert.push('Question ' + (i + 1) + ' ignorée (pas de réponse).'); return; }
      const qq = Object.assign(base, { type: 'input', ans: Array.from(new Set(liste)) });
      const h = txt(q.hint || q.indice, 200); if (h) qq.hint = h;
      questions.push(qq);
    } else if (type === 'trous') {
      const texte = txt(q.texte, 600), nb = (texte.match(/\[[^\]]+\]/g) || []).length;
      if (!nb || nb > 6) { avert.push('Question ' + (i + 1) + ' ignorée (texte à trous sans [mot] ou avec trop de trous).'); return; }
      questions.push(Object.assign(base, { type: 'trous', q: base.q || 'Complète.', texte }));
    } else if (type === 'ordre') {
      const items = (Array.isArray(q.items) ? q.items : []).map(x => txt(x, 120)).filter(Boolean).slice(0, 8);
      if (items.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (moins de 2 éléments à ranger).'); return; }
      questions.push(Object.assign(base, { type: 'ordre', items }));
    } else if (type === 'paires') {
      const paires = (Array.isArray(q.paires) ? q.paires : []).filter(p => Array.isArray(p) && p.length === 2).map(p => [txt(p[0], 80), txt(p[1], 80)]).filter(p => p[0] && p[1]).slice(0, 6);
      if (paires.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (moins de 2 paires).'); return; }
      questions.push(Object.assign(base, { type: 'paires', paires }));
    } else if (type === 'classer') {
      const groupes = (Array.isArray(q.groupes) ? q.groupes : []).map(g => ({ nom: txt(g && g.nom, 40), items: (Array.isArray(g && g.items) ? g.items : []).map(x => txt(x, 60)).filter(Boolean).slice(0, 6) }))
        .filter(g => g.nom && g.items.length).slice(0, 4);
      if (groupes.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (il faut au moins 2 catégories).'); return; }
      questions.push(Object.assign(base, { type: 'classer', groupes }));
    } else if (type === 'cliquer') {
      const texte = txt(q.texte, 600);
      if (!/\*[^*]+\*/.test(texte)) { avert.push('Question ' + (i + 1) + ' ignorée (aucun *mot* à toucher).'); return; }
      // tous les mots entre *étoiles* : c'est une phrase à reconstituer, jouée en « remettre dans l'ordre »
      const mots = texte.match(/\*[^*]+\*|[^\s*]+/g) || [];
      if (mots.length >= 2 && mots.length <= 8 && mots.every(m => /^\*.+\*$/.test(m))) { questions.push(Object.assign(base, { type: 'ordre', items: mots.map(m => m.slice(1, -1).trim()) })); return; }
      questions.push(Object.assign(base, { type: 'cliquer', texte }));
    } else if (type === 'nombre') {
      const a = parseFloat(String(q.a).replace(/\s/g, '').replace(',', '.')), tol = Math.abs(parseFloat(String(q.tol || 0).replace(',', '.'))) || 0;
      if (!isFinite(a)) { avert.push('Question ' + (i + 1) + ' ignorée (réponse non numérique).'); return; }
      const qq = Object.assign(base, { type: 'nombre', a, tol }); const u = txt(q.unit || q.unite, 12); if (u) qq.unit = u;
      questions.push(qq);
    } else if (type === 'parler') {
      const phrase = txt(q.phrase, 200);
      if (!phrase) { avert.push('Question ' + (i + 1) + ' ignorée (phrase à dire absente).'); return; }
      const qq = Object.assign(base, { type: 'parler', phrase });
      if (phrase !== '*' && !qq.dire) qq.dire = phrase;           // bouton « Écouter » : le modèle à imiter
      if (!qq.langue) { const lg = txt(d.langue || d.langueAudio, 10); if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lg)) qq.langue = lg; }
      questions.push(qq);
    } else if (type === 'clavier') {
      const note = x => /^([A-Ga-g]|do|ut|r[eé]|mi|fa|sol|la|si)[#b♯♭]?\d?$/i.test(String(x).trim());
      const notes = (Array.isArray(q.notes) ? q.notes : []).map(x => txt(x, 5)).filter(note).slice(0, 8);
      if (notes.length < 2) { avert.push('Question ' + (i + 1) + ' ignorée (mélodie de moins de 2 notes).'); return; }
      questions.push(Object.assign(base, { type: 'clavier', notes }));
    }
  });
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
    couleur: COULEURS_[matiere], questions, memo
  });
  const nom = nomLibre_(inst.dossier, titre);
  inst.dossier.createFile(nom + '.html', html, MimeType.HTML);
  CacheService.getScriptCache().remove('catalogue');
  return { ok: true, page: nom, titre, nb: questions.length, avertissements: avert };
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
    const titreCat = l.match(/^#{2,}\s*(.+)$/);
    if (titreCat) {                             // ## Catégorie|✂️ : l'emoji illustre ses questions
      const [nom, ico] = titreCat[1].split('|').map(s => s.replace(/[#*]/g, '').trim());
      cat = nom; if (ico) d.icones[cat] = ico;
      return;
    }
    const m = l.match(/^([TQVSMGOACXNPK])\s*[|:]\s*(.*)$/i);
    if (!m) return;
    const sorte = m[1].toUpperCase();
    const champs = m[2].split('|').map(s => s.trim());
    const extra = {}, pos = [];
    champs.forEach(c => {
      const k = c.match(/^(dire|notes|portee|portée|indice|langue|img)\s*(?:[=:]\s*(.*))?$/i);
      if (k) extra[k[1].toLowerCase().replace('é', 'e')] = k[2] == null ? true : k[2].trim();
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
      Object.assign(q, { type: 'ordre', items: pos.slice(1) });
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
    } else if (sorte === 'K') {                // K|consigne|C4 D4 E4|explication
      Object.assign(q, { type: 'clavier', notes: String(pos[1] || '').split(/[\s,]+/).filter(Boolean), exp: pos[2] || '' });
    } else if (sorte === 'Q') {
      const reste = pos.slice(1);
      q.exp = reste.length >= 3 ? reste.pop() : '';
      Object.assign(q, { type: 'qcm', opts: reste, a: reste[0] });
    } else if (sorte === 'V') {
      Object.assign(q, { type: 'vf', a: /^v/i.test(pos[1] || '') ? true : /^f/i.test(pos[1] || '') ? false : pos[1], exp: pos[2] || '' });
    } else {
      Object.assign(q, { type: 'saisie', ans: String(pos[1] || '').split(';').map(s => s.trim()).filter(Boolean), exp: pos[2] || '' });
    }
    if (typeof extra.dire === 'string') q.dire = extra.dire;
    if (typeof extra.img === 'string') q.img = extra.img;
    if (typeof extra.langue === 'string') q.langue = extra.langue;
    if (typeof extra.indice === 'string') q.hint = extra.indice;
    if (typeof extra.notes === 'string' && q.type !== 'clavier') q.notes = extra.notes.split(/[\s,]+/).filter(Boolean).map(n => n.includes('+') ? n.split('+') : n);
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
  if (c.badge) cfg.badge = c.badge;
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

function feuille_() { return installer_().ss.getSheets()[0]; }
function lireLignes_() {
  const sh = feuille_();
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLONNES.length).getValues()
    .filter(v => v[0])
    .map(v => COLONNES.reduce((o, c, i) => { o[c] = String(v[i]); return o; }, {}));
}
function complet_(l) {
  const lire = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  return {
    id: l.id, date: l.date, joueur: l.joueur, quiz: l.quiz, titre: l.titre, matiere: l.matiere,
    score: +l.score || 0, total: +l.total || 0, duree: l.duree === '' ? null : +l.duree,
    dateLocale: l.dateLocale, appareil: l.appareil,
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
