/* =====================================================================
   UNIVERSAL QUIZ — version Google Apps Script
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0 — usage commercial interdit :
   https://polyformproject.org/licenses/noncommercial/1.0.0
   ---------------------------------------------------------------------
   Une seule adresse web sert tout le site :
     …/exec                      → page « Mes quiz »
     …/exec?page=<nom du quiz>   → un quiz (fichier <nom>.html du dossier Drive)
     …/exec?page=tableau-de-bord → suivi des résultats (parents)
     …/exec?page=controles       → contrôles papier (PDF du dossier Drive)

   Où sont les choses :
     • le moteur (commun/…) et les pages d'accueil : dans ce projet (dossier lib/)
     • les quiz (.html) et les contrôles (.pdf) : dans le dossier Drive « Universal Quiz »
     • les résultats : dans le Google Sheets « Universal Quiz – Résultats » (même dossier)

   Le dossier et le Sheets sont créés tout seuls à la première visite
   (ou en lançant la fonction installer() depuis l'éditeur).
   ===================================================================== */

/* ---------------- RÉGLAGES (à adapter) ---------------- */
const CONFIG = {
  prenom: '',                     // prénom de l'enfant (tableau de bord, encouragements) ; vide = « mon enfant »
  nomDossier: 'Universal Quiz',   // nom du dossier créé dans ton Google Drive
  partagerPdf: true,              // rend les PDF lisibles par lien, pour que l'enfant puisse les ouvrir
  dureeCacheCatalogue: 60,        // secondes : délai max avant qu'un nouveau quiz apparaisse dans la liste
  version: '',                    // rempli par l'installateur en ligne (ex. v2.0)
  installateur: ''                // adresse de l'installateur en ligne, pour proposer les mises à jour
};
const ICONE_SITE = 'https://leian.github.io/UNIVERSALQUIZ/icone.png';
/* ------------------------------------------------------ */

const NOM_SHEETS = 'Universal Quiz – Résultats';
const COLONNES = ['id', 'date', 'joueur', 'quiz', 'titre', 'matiere', 'score', 'total', 'duree', 'dateLocale', 'appareil', 'cats', 'questions'];
const PAGES = { 'index': 'lib/page-index', 'tableau-de-bord': 'lib/page-tableau-de-bord', 'controles': 'lib/page-controles', 'ajouter': 'lib/page-ajouter' };
const COMMUN = {
  'moteur-quiz.css': 'lib/moteur-quiz-css',
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
    const inst = installer_();
    let html;
    if (PAGES[page]) {
      html = lib_(PAGES[page], true);
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
      dossier = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.nomDossier);
      props.setProperty('DOSSIER', dossier.getId());
      if (!contientHtml_(dossier)) {
        dossier.createFile('quiz_exemple_capitales.html', lib_('lib/exemple-quiz', false), MimeType.HTML);
      }
    }
    ss = ouvrirSheets_(props.getProperty('RESULTATS'));
    if (!ss) {
      const it = dossier.getFilesByName(NOM_SHEETS);
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
    url: ScriptApp.getService().getUrl() || '',
    page: page,
    chemin: '/' + page + '.html',
    liens: cat.liens,
    version: CONFIG.version,
    installateur: CONFIG.installateur
  };
  // la clé Gemini n'est donnée qu'à la page « Ajouter un quiz », jamais aux quiz que joue l'enfant
  if (page === 'ajouter') cfg.gemini = PropertiesService.getScriptProperties().getProperty('GEMINI_CLE') || '';
  // la configuration est posée dans sa propre balise : Apps Script peut retirer les commentaires des fichiers,
  // on ne s'appuie donc sur aucun marqueur à remplacer dans pont.html
  const pont = '<script>window.__UQ = ' + jsonScript_(cfg) + ';</script>\n' + lib_('lib/pont', false);
  const catalogueJs = 'var QUIZ = ' + jsonScript_(cat.QUIZ) + ';\nvar CONTROLES = ' + jsonScript_(cat.CONTROLES) + ';\nvar MATIERES = ' + jsonScript_(MATIERES) + ';';
  const tete = '\n<base target="_top">\n' + pont + '\n<script>\n' + catalogueJs + '\n</script>\n';

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

function pageErreur_(titre, message) {
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const accueil = ScriptApp.getService().getUrl() || '';
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
    badge: champ('badge') || champ('icone') || '',
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
function apiGeminiCle(d) {
  const cle = String((d && d.cle) || '').trim();
  const props = PropertiesService.getScriptProperties();
  if (!cle) { props.deleteProperty('GEMINI_CLE'); return { ok: true }; }
  if (!/^(AIza|AQ\.)[\w.\-]{25,200}$/.test(cle)) return { erreur: "Ce n'est pas une clé Gemini." };
  props.setProperty('GEMINI_CLE', cle);
  return { ok: true };
}

function apiAjouterQuiz(texte) {
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
    if (!base.q) return;
    // écoute : phrase lue à voix haute (anglais…) et notes de musique
    const dire = txt(q.dire || q.ecoute || q.audio, 300);
    if (dire) { base.dire = dire; const lg = txt(q.langue || q.lang, 10); if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lg)) base.langue = lg; }
    if (Array.isArray(q.notes)) {
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
    }
  });
  if (questions.length < 3) return { erreur: "Je n'ai trouvé que " + questions.length + " question(s) valable(s). Redemande le quiz à l'IA." };

  const titre = txt(d.titre || d.title, 100) || 'Quiz';
  let matiere = String(d.matiere || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  if (matiere === 'mathematiques') matiere = 'maths';
  if (!MATIERES[matiere]) matiere = 'autre';
  const memo = (Array.isArray(d.memo) ? d.memo : []).map(x => txt(x, 200)).filter(Boolean).slice(0, 12);
  const html = fabriquerQuizHtml_({
    titre, matiere,
    sousTitre: txt(d.sousTitre || d.sous_titre || d.niveau, 150),
    icone: txt(d.icone || d.emoji, 8) || MATIERES[matiere].emo,
    badge: txt(d.badge, 8),
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
   Champs nommés possibles n'importe où : dire=…, notes=C4 E4 C4+E4+G4, portee, portee=seule, indice=…, langue=…
   Renvoie null si le texte n'est pas dans ce format (on essaie alors le JSON). */
function lireFormatLignes_(texte) {
  const d = { questions: [], memo: [] };
  let cat = '', vu = false;
  String(texte).split(/\r?\n/).forEach(brute => {
    const l = brute.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?/, '').trim();
    const titreCat = l.match(/^#{2,}\s*(.+)$/);
    if (titreCat) { cat = titreCat[1].replace(/[#*]/g, '').trim(); return; }
    const m = l.match(/^([TQVSM])\s*[|:]\s*(.*)$/i);
    if (!m) return;
    const sorte = m[1].toUpperCase();
    const champs = m[2].split('|').map(s => s.trim());
    const extra = {}, pos = [];
    champs.forEach(c => {
      const k = c.match(/^(dire|notes|portee|portée|indice|langue)\s*(?:[=:]\s*(.*))?$/i);
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
    if (sorte === 'Q') {
      const reste = pos.slice(1);
      q.exp = reste.length >= 3 ? reste.pop() : '';
      Object.assign(q, { type: 'qcm', opts: reste, a: reste[0] });
    } else if (sorte === 'V') {
      Object.assign(q, { type: 'vf', a: /^v/i.test(pos[1] || '') ? true : /^f/i.test(pos[1] || '') ? false : pos[1], exp: pos[2] || '' });
    } else {
      Object.assign(q, { type: 'saisie', ans: String(pos[1] || '').split(';').map(s => s.trim()).filter(Boolean), exp: pos[2] || '' });
    }
    if (typeof extra.dire === 'string') q.dire = extra.dire;
    if (typeof extra.langue === 'string') q.langue = extra.langue;
    if (typeof extra.indice === 'string') q.hint = extra.indice;
    if (typeof extra.notes === 'string') q.notes = extra.notes.split(/[\s,]+/).filter(Boolean).map(n => n.includes('+') ? n.split('+') : n);
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
  if (c.langueAudio) cfg.langueAudio = c.langueAudio;
  const pills = [];
  if (c.questions.some(q => q.dire)) pills.push('🔊 Phrases à écouter');
  if (c.questions.some(q => q.notes && q.portee !== 'seule')) pills.push('🎵 Notes à écouter');
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
