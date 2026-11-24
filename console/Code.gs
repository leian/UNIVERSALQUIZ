/* =====================================================================
   SOCCAQUIZ — CONSOLE DE L'ÉDITEUR (compte soccaquiz uniquement)
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0
   ---------------------------------------------------------------------
   Un seul projet, deux déploiements (voir console/LISEZMOI.md) :
   - « Console » (accès Seulement moi) : la page de gestion, en onglets :
     Propositions, Bibliothèque, Invitations, Liens, Versions, Réglages ;
   - « Propositions » (accès Tout le monde) : reçoit seulement les quiz
     que les familles envoient avec « Proposer » (doPost). Sa page (doGet)
     ne montre rien à personne d'autre que l'éditeur.
   Les propositions sont gardées dans un Google Sheets du compte soccaquiz
   (« SoccaQuiz – Propositions ») ; « Publier » écrit le quiz dans
   docs/bibliotheque/ sur GitHub avec un jeton limité au dépôt.
   ===================================================================== */

const DEPOT = 'leian/UNIVERSALQUIZ';
const PAGES = 'https://leian.github.io/UNIVERSALQUIZ/';
const SOURCE_INVITATION = PAGES + 'invitation.html';
const OBJET = "SoccaQuiz : des quiz de révision à partir d'une photo de leçon";
const MATIERES_ = ['francais', 'maths', 'sciences', 'anglais', 'histoire', 'geographie', 'musique', 'autre'];
const CLASSES_ = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', '2de', '1re', 'Tle', 'adulte'];
const COLONNES_ = ['id', 'date', 'statut', 'titre', 'classe', 'matiere', 'nb', 'texte', 'version', 'publie'];

/* ---------------- accès ---------------- */
// l'éditeur seul : le compte qui ouvre la page est celui qui exécute le script
function proprietaire_() {
  let actif = '';
  try { actif = Session.getActiveUser().getEmail(); } catch (e) {}
  return !!actif && actif === Session.getEffectiveUser().getEmail();
}
function exiger_() { if (!proprietaire_()) throw new Error('Réservé à l\'éditeur de SoccaQuiz.'); }

function doGet(e) {
  // espace parent d'une famille : où en est la correction demandée avec ce code ? (seul qui a le code la lit)
  const code = e && e.parameter && e.parameter.correction;
  if (code) return ContentService.createTextOutput(JSON.stringify(correction_(String(code)))).setMimeType(ContentService.MimeType.JSON);
  const sortie = proprietaire_() ? pageHtml_()
    : '<!DOCTYPE html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:17px system-ui;text-align:center;padding:40px;background:#fff8ef;color:#2a1f1a"><p>Cette adresse reçoit les quiz proposés depuis les sites SoccaQuiz.</p><p><a href="' + PAGES + '">Découvrir SoccaQuiz</a></p></body>';
  return HtmlService.createHtmlOutput(sortie)
    .setTitle('SoccaQuiz – Console')
    .setFaviconUrl(PAGES + 'icone.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- réception d'une proposition (déploiement « Propositions », accès Tout le monde) ----------------
   Corps : JSON { type: 'proposition', titre, classe, texte, version }. Seul le texte du quiz est gardé :
   ni adresse, ni nom, ni adresse IP. */
function doPost(e) {
  const rep = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  let d = null;
  try { d = JSON.parse((e && e.postData && e.postData.contents) || ''); } catch (x) {}
  const r = recevoir_(d);
  return rep(r);
}
function recevoir_(d) {
  if (d && d.type === 'erreur') return recevoirErreur_(d);
  if (d && d.type === 'aide') return recevoirAide_(d);
  if (d && d.type === 'stat') return recevoirStat_(d);
  if (!d || d.type !== 'proposition') return { erreur: 'Requête inconnue.' };
  const texte = String(d.texte || '').replace(/\r/g, '').trim();
  if (texte.length < 40 || texte.length > 30000) return { erreur: 'Quiz vide ou trop long.' };
  const lignes = texte.split('\n');
  const t = lignes.find(l => /^T\|/.test(l.trim()));
  const nb = lignes.filter(l => /^[QVSGOACXNPK]\|/.test(l.trim())).length;
  if (!t || nb < 3) return { erreur: 'Ce texte ne ressemble pas à un quiz SoccaQuiz.' };
  // garde-fous contre les envois en rafale : 20 par tranche de 10 minutes, 300 propositions en attente au plus
  const cache = CacheService.getScriptCache(), cle = 'envois-' + Math.floor(Date.now() / 6e5);
  const n = +(cache.get(cle) || 0);
  if (n >= 20) return { erreur: 'Trop d\'envois en ce moment : réessaie dans quelques minutes.' };
  cache.put(cle, String(n + 1), 900);
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const f = feuille_(), donnees = f.getDataRange().getValues();
    if (donnees.filter(r => r[2] === 'nouveau').length >= 300) return { erreur: 'Trop de propositions en attente : réessaie plus tard.' };
    // même quiz déjà reçu : on ne le garde qu'une fois
    if (donnees.some(r => String(r[7]) === texte)) return { ok: true, deja: true };
    const champs = t.trim().split('|');
    const classe = CLASSES_.indexOf(String(d.classe || '')) >= 0 ? String(d.classe) : '';
    const id = Utilities.getUuid().slice(0, 8);
    f.appendRow([id, new Date(), 'nouveau', texteCourt_(d.titre || champs[1], 100), classe, texteCourt_(champs[3], 20).toLowerCase(), nb, texte, texteCourt_(d.version, 12), '']);
    return { ok: true, id };
  } finally { verrou.releaseLock(); }
}
/* ---------------- erreurs signalées par les familles ----------------
   Corps : JSON { type: 'erreur', code, titre, classe, biblio, question, attendu, motif, remarque, texte, version }.
   code : tiré au hasard par l'espace parent ; il sert à relire la correction (doGet ?correction=). Rien d'autre
   n'identifie la famille. */
const COL_ERR_ = ['id', 'date', 'statut', 'code', 'titre', 'classe', 'biblio', 'question', 'attendu', 'motif', 'remarque', 'texte', 'version', 'correction', 'message', 'maj'];
function feuilleErreurs_() {
  const ss = feuille_().getParent();
  let sh = ss.getSheetByName('Erreurs');
  if (!sh) { sh = ss.insertSheet('Erreurs'); sh.appendRow(COL_ERR_); }
  return sh;
}
function recevoirErreur_(d) {
  const code = String(d.code || '');
  if (!/^[a-z0-9]{20,40}$/.test(code)) return { erreur: 'Code invalide.' };
  const texte = String(d.texte || '').replace(/\r/g, '').trim();
  if (texte.length < 40 || texte.length > 30000 || !/^T\|/m.test(texte)) return { erreur: 'Quiz vide ou trop long.' };
  const cache = CacheService.getScriptCache(), cle = 'envois-' + Math.floor(Date.now() / 6e5);
  const n = +(cache.get(cle) || 0);
  if (n >= 20) return { erreur: 'Trop d\'envois en ce moment : réessaie dans quelques minutes.' };
  cache.put(cle, String(n + 1), 900);
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const sh = feuilleErreurs_(), v = sh.getDataRange().getValues();
    if (v.some(r => String(r[3]) === code)) return { ok: true, deja: true };
    if (v.filter(r => r[2] === 'nouveau').length >= 300) return { erreur: 'Trop de signalements en attente : réessaie plus tard.' };
    const classe = CLASSES_.indexOf(String(d.classe || '')) >= 0 ? String(d.classe) : '';
    const biblio = /^[a-z0-9-]{1,80}$/.test(String(d.biblio || '')) ? String(d.biblio) : '';
    const motif = ['reponse', 'question', 'rappel', 'autre'].indexOf(d.motif) >= 0 ? d.motif : 'autre';
    const id = Utilities.getUuid().slice(0, 8), t = (x, m) => cellule_(texteCourt_(x, m));
    sh.appendRow([id, new Date(), 'nouveau', code, t(d.titre, 100), classe, biblio, t(d.question, 400), t(d.attendu, 300), motif, t(d.remarque, 300), cellule_(texte), t(d.version, 12), '', '', '']);
    return { ok: true };
  } finally { verrou.releaseLock(); }
}
/* ---------------- demandes d'aide des familles (onglet Aide) ----------------
   Corps : JSON { type: 'aide', email, message, origine, prenom, classe, version } envoyé par l'espace parent
   (adresse du compte Google du parent, modifiable) ou par la page d'aide de soccaquiz.fr (adresse tapée).
   Gardés : l'adresse, seulement pour répondre, et le message. La réponse part par mail depuis ce compte. */
const COL_AIDE_ = ['id', 'date', 'statut', 'email', 'origine', 'prenom', 'classe', 'version', 'message', 'reponse', 'maj'];
const EMAIL_ = /^[^\s@<>"',;:()\[\]\\]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
function feuilleAide_() {
  const ss = feuille_().getParent();
  let sh = ss.getSheetByName('Aide');
  if (!sh) { sh = ss.insertSheet('Aide'); sh.appendRow(COL_AIDE_); }
  return sh;
}
function recevoirAide_(d) {
  if (d.piege) return { ok: true };                    // champ caché rempli : un robot, on ne garde rien
  const email = String(d.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_.test(email)) return { erreur: 'Adresse mail invalide.' };
  const message = String(d.message || '').replace(/\r/g, '').trim();
  if (message.length < 10) return { erreur: 'Message trop court : décris ce qui se passe.' };
  if (message.length > 3000) return { erreur: 'Message trop long (3 000 caractères au plus).' };
  // garde-fous : 20 envois par tranche de 10 minutes pour tout le monde, 5 demandes par adresse en 6 heures
  const cache = CacheService.getScriptCache(), cle = 'envois-' + Math.floor(Date.now() / 6e5), n = +(cache.get(cle) || 0);
  if (n >= 20) return { erreur: 'Trop d\'envois en ce moment : réessaie dans quelques minutes.' };
  const cleMail = 'aide-' + Utilities.base64EncodeWebSafe(email).slice(0, 200), nm = +(cache.get(cleMail) || 0);
  if (nm >= 5) return { erreur: 'Tu as déjà envoyé plusieurs demandes : SoccaQuiz te répond dès que possible.' };
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const sh = feuilleAide_(), v = sh.getDataRange().getValues();
    if (v.some(r => nonCellule_(r[3]) === email && nonCellule_(r[8]) === message)) return { ok: true, deja: true };   // renvoi : pas compté
    if (v.filter(r => r[2] === 'nouveau').length >= 300) return { erreur: 'Trop de demandes en attente : réessaie plus tard, ou écris à soccaquiz@gmail.com.' };
    cache.put(cle, String(n + 1), 900); cache.put(cleMail, String(nm + 1), 21600);
    const origine = ['parent', 'installateur', 'aide'].indexOf(d.origine) >= 0 ? d.origine : 'aide';
    const classe = CLASSES_.indexOf(String(d.classe || '')) >= 0 ? String(d.classe) : '';
    const id = Utilities.getUuid().slice(0, 8), t = (x, m) => cellule_(texteCourt_(x, m));
    sh.appendRow([id, new Date(), 'nouveau', cellule_(email), origine, t(d.prenom, 40), classe, t(d.version, 12), cellule_(message), '', '']);
    return { ok: true };
  } finally { verrou.releaseLock(); }
}
/* ---------------- compteurs anonymes envoyés par l'installateur (onglet Statistiques) ----------------
   Corps : JSON { type: 'stat', evts: [{ e: 'installation'|'maj'|'suppression', v: 'v2.93' } | { e: 'existant', n }] }.
   Rien d'autre : ni identifiant, ni adresse, ni prénom (l'envoi part des serveurs de Google, pas de l'appareil). */
const COL_STAT_ = ['date', 'evenement', 'version', 'n'];
const EVTS_ = ['installation', 'maj', 'suppression', 'existant'];
function feuilleStats_() {
  const ss = feuille_().getParent();
  let sh = ss.getSheetByName('Statistiques');
  if (!sh) { sh = ss.insertSheet('Statistiques'); sh.appendRow(COL_STAT_); }
  return sh;
}
function recevoirStat_(d) {
  const evts = Array.isArray(d.evts) ? d.evts.slice(0, 3) : [];
  const lignes = evts.filter(x => x && EVTS_.indexOf(x.e) >= 0).map(x => [new Date(), x.e,
    x.e === 'existant' ? '' : (/^v?[\w.\-]{1,15}$/.test(String(x.v || '')) ? String(x.v) : ''),
    x.e === 'existant' ? Math.max(1, Math.min(20, Math.floor(+x.n) || 1)) : 1]);
  if (!lignes.length) return { erreur: 'Compteur inconnu.' };
  const cache = CacheService.getScriptCache(), cle = 'stats-' + Math.floor(Date.now() / 6e5), n = +(cache.get(cle) || 0);
  if (n >= 300) return { erreur: 'Trop d\'envois en ce moment.' };
  cache.put(cle, String(n + 1), 900);
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try { const sh = feuilleStats_(); lignes.forEach(l => sh.appendRow(l)); return { ok: true }; }
  finally { verrou.releaseLock(); }
}
/* remise à zéro des compteurs : la feuille est ARCHIVÉE (renommée), jamais effacée ; la suivante se crée au prochain compteur */
function apiRemettreStatsAZero() {
  exiger_();
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const sh = feuille_().getParent().getSheetByName('Statistiques');
    const n = sh ? Math.max(0, sh.getLastRow() - 1) : 0;
    if (!n) return { ok: true, vide: true };
    const nom = 'Statistiques (archive du ' + Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yyyy HH:mm:ss') + ')';
    sh.setName(nom);
    return { ok: true, archive: nom, n };
  } finally { verrou.releaseLock(); }
}
/* totaux, semaines (lundi), versions */
function stats_() {
  const sh = feuille_().getParent().getSheetByName('Statistiques');
  const t = { existant: 0, installation: 0, maj: 0, suppression: 0 }, semaines = {}, versions = {};
  let debut = '';
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, COL_STAT_.length).getValues().forEach(r => {
    const e = String(r[1]); if (!(e in t)) return;
    const n = +r[3] || 1, d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    t[e] += n;
    if (isNaN(d)) return;
    const iso = d.toISOString(); if (!debut || iso < debut) debut = iso;
    const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const k = Utilities.formatDate(lundi, 'Europe/Paris', 'yyyy-MM-dd');
    const w = semaines[k] || (semaines[k] = { semaine: k, installation: 0, maj: 0, suppression: 0 });
    if (e !== 'existant') w[e] += n;
    const v = String(r[2] || ''); if (v && (e === 'installation' || e === 'maj')) { const x = versions[v] || (versions[v] = { version: v, installation: 0, maj: 0 }); x[e] += n; }
  });
  return { totaux: t, enService: Math.max(0, t.existant + t.installation - t.suppression), debut,
    semaines: Object.keys(semaines).sort().reverse().slice(0, 12).map(k => semaines[k]),
    versions: Object.keys(versions).map(k => versions[k]).sort((a, b) => b.version.localeCompare(a.version, 'fr', { numeric: true })).slice(0, 15) };
}
function trouverAide_(id) {
  const sh = feuilleAide_(), v = sh.getDataRange().getValues();
  const i = v.findIndex((r, k) => k > 0 && String(r[0]) === String(id));
  if (i < 1) throw new Error('Demande introuvable : recharge la page.');
  return { sh, ligne: i + 1, r: v[i] };
}
/* répondre : mail envoyé depuis ce compte (nom de l'onglet Invitations), la demande citée en dessous */
function apiRepondreAide(id, texte) {
  exiger_();
  texte = String(texte || '').replace(/\r/g, '').trim();
  if (texte.length < 2) return { erreur: 'Écris d\'abord ta réponse.' };
  if (texte.length > 5000) return { erreur: 'Réponse trop longue (5 000 caractères au plus).' };
  const a = trouverAide_(id), email = nonCellule_(a.r[3]);
  if (!EMAIL_.test(email)) return { erreur: 'Adresse de la famille invalide : réponds-lui à la main.' };
  if (MailApp.getRemainingDailyQuota() < 1) return { erreur: 'Gmail ne permet plus d\'envoi aujourd\'hui : réessaie demain.' };
  const quand = a.r[1] instanceof Date ? Utilities.formatDate(a.r[1], 'Europe/Paris', 'dd/MM/yyyy') : '';
  const cite = nonCellule_(a.r[8]).split('\n').map(l => '> ' + l).join('\n');
  const nom = PropertiesService.getUserProperties().getProperty('NOM') || 'SoccaQuiz';
  MailApp.sendEmail({ to: email, subject: 'SoccaQuiz : réponse à ta demande d\'aide', name: nom,
    body: texte + '\n\n—\nTa demande' + (quand ? ' du ' + quand : '') + ' :\n' + cite + '\n\nAide de SoccaQuiz : https://soccaquiz.fr/aide.html' });
  a.sh.getRange(a.ligne, 3).setValue('repondu');
  a.sh.getRange(a.ligne, 10, 1, 2).setValues([[cellule_(texte), new Date()]]);
  return { ok: true, email };
}
function apiAideStatut(id, statut) {
  exiger_();
  if (['nouveau', 'classe'].indexOf(statut) < 0) return { erreur: 'Statut inconnu.' };
  const a = trouverAide_(id);
  a.sh.getRange(a.ligne, 3).setValue(statut);
  return { ok: true };
}
function apiSupprimerAide(id) {
  exiger_();
  const a = trouverAide_(id);
  a.sh.deleteRow(a.ligne);
  return { ok: true };
}
function cellule_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) && !/^-?\d/.test(v) ? "'" + v : v; }
const nonCellule_ = v => String(v == null ? '' : v).replace(/^'(?=[=+\-@])/, '');
function correction_(code) {
  if (!/^[a-z0-9]{20,40}$/.test(code)) return { statut: 'inconnu' };
  const sh = feuille_().getParent().getSheetByName('Erreurs');
  if (!sh) return { statut: 'inconnu' };
  const r = sh.getDataRange().getValues().find(x => String(x[3]) === code);
  if (!r) return { statut: 'inconnu' };
  const statut = String(r[2]);
  if (statut === 'corrige') return { statut, texte: nonCellule_(r[13]), message: nonCellule_(r[14]) };
  if (statut === 'sans-erreur') return { statut, message: nonCellule_(r[14]) };
  return { statut: 'attente' };
}
function trouverErreur_(id) {
  const sh = feuilleErreurs_(), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) return { sh, i: i + 1, r: v[i] };
  return null;
}
/* d = { texte, message, pourTous } : la correction est renvoyée à la famille ; quiz de la bibliothèque et pourTous :
   corrigé aussi dans la bibliothèque (nouvelle version proposée à toutes les familles qui l'ont) */
function apiCorrigerErreur(id, d) {
  exiger_();
  d = d || {};
  const l = trouverErreur_(id); if (!l) return { erreur: 'Signalement introuvable.' };
  const texte = String(d.texte || '').replace(/\r/g, '').trim() + '\n';
  const nb = texte.split('\n').filter(x => /^[QVSGOACXNPK]\|/.test(x.trim())).length;
  if (!/^T\|/m.test(texte) || nb < 3) return { erreur: 'Le texte doit contenir une ligne T| et au moins 3 questions.' };
  let biblio = '';
  if (d.pourTous && l.r[6]) {
    if (!PropertiesService.getScriptProperties().getProperty('GITHUB_JETON')) return { erreur: 'Ajoute d\'abord le jeton GitHub (onglet Réglages), ou décoche « pour toutes les familles ».' };
    const id2 = String(l.r[6]), { index, sha } = lireIndex_(), k = index.quiz.findIndex(q => q.id === id2);
    if (k < 0) return { erreur: 'Ce quiz n\'est plus dans la bibliothèque : décoche « pour toutes les familles ».' };
    const f = lireFichier_('docs/bibliotheque/' + id2 + '.txt');
    ecrireFichier_('docs/bibliotheque/' + id2 + '.txt', texte, f && f.sha, 'Bibliothèque : correction de ' + index.quiz[k].titre);
    index.quiz[k].nb = nb; index.quiz[k].v = (+index.quiz[k].v || 1) + 1;
    index.quiz[k].corrige = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
    ecrireFichier_('docs/bibliotheque/index.json', jsonJoli_(index), sha, 'Bibliothèque : correction de ' + index.quiz[k].titre);
    biblio = id2;
  }
  l.sh.getRange(l.i, 3).setValue('corrige');
  l.sh.getRange(l.i, 14).setValue(cellule_(texte));
  l.sh.getRange(l.i, 15).setValue(cellule_(texteCourt_(d.message, 400)));
  l.sh.getRange(l.i, 16).setValue(new Date());
  return { ok: true, biblio };
}
function apiSansErreur(id, message) {
  exiger_();
  const l = trouverErreur_(id); if (!l) return { erreur: 'Signalement introuvable.' };
  l.sh.getRange(l.i, 3).setValue('sans-erreur');
  l.sh.getRange(l.i, 15).setValue(cellule_(texteCourt_(message, 400)));
  l.sh.getRange(l.i, 16).setValue(new Date());
  return { ok: true };
}
function apiRouvrirErreur(id) {
  exiger_();
  const l = trouverErreur_(id); if (!l) return { erreur: 'Signalement introuvable.' };
  l.sh.getRange(l.i, 3).setValue('nouveau');
  return { ok: true };
}
function apiSupprimerErreur(id) {
  exiger_();
  const l = trouverErreur_(id); if (!l) return { erreur: 'Signalement introuvable.' };
  l.sh.deleteRow(l.i);
  return { ok: true };
}

const texteCourt_ = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);

function feuille_() {
  const p = PropertiesService.getScriptProperties();
  let ss = null;
  const id = p.getProperty('PROPOSITIONS');
  if (id) try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  if (!ss) {
    ss = SpreadsheetApp.create('SoccaQuiz – Propositions');
    p.setProperty('PROPOSITIONS', ss.getId());
    ss.getSheets()[0].appendRow(COLONNES_);
  }
  return ss.getSheets()[0];
}

/* ---------------- état de la console ---------------- */
function apiEtat() {
  exiger_();
  const p = PropertiesService.getScriptProperties(), u = PropertiesService.getUserProperties();
  const lignes = feuille_().getDataRange().getValues().slice(1).filter(r => r[0]);
  const props = lignes.map(r => ({ id: String(r[0]), date: r[1] instanceof Date ? r[1].toISOString() : String(r[1]), statut: String(r[2]), titre: String(r[3]), classe: String(r[4]), matiere: String(r[5]), nb: +r[6] || 0, texte: String(r[7]), version: String(r[8]), publie: String(r[9] || '') }))
    .sort((a, b) => b.date.localeCompare(a.date));
  let quota = null; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
  // quiz retirés de la bibliothèque (pour les signaler sur les propositions publiées)
  let retires = []; try { if (p.getProperty('GITHUB_JETON')) retires = lireIndex_().index.retires || []; } catch (e) {}
  let erreurs = [];
  try {
    const sh = feuille_().getParent().getSheetByName('Erreurs');
    if (sh && sh.getLastRow() > 1) erreurs = sh.getRange(2, 1, sh.getLastRow() - 1, COL_ERR_.length).getValues().filter(r => r[0]).map(r => COL_ERR_.reduce((o, c, i) => {
      o[c] = r[i] instanceof Date ? r[i].toISOString() : nonCellule_(r[i]); return o; }, {})).sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) {}
  let aide = [];
  try {
    const sh = feuille_().getParent().getSheetByName('Aide');
    if (sh && sh.getLastRow() > 1) aide = sh.getRange(2, 1, sh.getLastRow() - 1, COL_AIDE_.length).getValues().filter(r => r[0]).map(r => COL_AIDE_.reduce((o, c, i) => {
      o[c] = r[i] instanceof Date ? r[i].toISOString() : nonCellule_(r[i]); return o; }, {})).sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) {}
  let stats = null; try { stats = stats_(); } catch (e) {}
  let projetConsole = ''; try { projetConsole = lienProjetId_(ScriptApp.getScriptId()); } catch (e) {}
  return {
    propositions: props, retires, erreurs, aide, stats,
    projetConsole, projetInstallateur: lienProjetId_(p.getProperty('PROJET_INSTALLATEUR') || ''),
    jeton: !!p.getProperty('GITHUB_JETON'), jetonRelais: !!p.getProperty('RELAIS_JETON'),
    urlPropositions: p.getProperty('URL_PROPOSITIONS') || '',
    feuille: p.getProperty('PROPOSITIONS') ? 'https:\/\/docs.google.com/spreadsheets/d/' + p.getProperty('PROPOSITIONS') : '',
    quota, signature: u.getProperty('SIGNATURE') || '', nom: u.getProperty('NOM') || '',
    matieres: MATIERES_, classes: CLASSES_
  };
}

function trouverLigne_(id) {
  const f = feuille_(), v = f.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) return { f, i: i + 1, r: v[i] };
  return null;
}
function apiStatut(id, statut) {
  exiger_();
  if (['nouveau', 'refuse'].indexOf(statut) < 0) return { erreur: 'Statut inconnu.' };
  const l = trouverLigne_(id); if (!l) return { erreur: 'Proposition introuvable.' };
  l.f.getRange(l.i, 3).setValue(statut);
  return { ok: true };
}
function apiSupprimerProposition(id) {
  exiger_();
  const l = trouverLigne_(id); if (!l) return { erreur: 'Proposition introuvable.' };
  l.f.deleteRow(l.i);
  return { ok: true };
}

/* ---------------- GitHub : lire et écrire docs/bibliotheque ---------------- */
function github_(methode, chemin, corps) {
  const jeton = PropertiesService.getScriptProperties().getProperty('GITHUB_JETON');
  const o = { method: methode, muteHttpExceptions: true, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SoccaQuiz-console', 'X-GitHub-Api-Version': '2022-11-28' } };
  if (jeton) o.headers.Authorization = 'Bearer ' + jeton;
  if (corps) { o.contentType = 'application/json'; o.payload = JSON.stringify(corps); }
  const r = UrlFetchApp.fetch('https:\/\/api.github.com/repos/' + DEPOT + chemin, o);
  const code = r.getResponseCode();
  let j = null; try { j = JSON.parse(r.getContentText() || 'null'); } catch (e) {}
  if (code === 401) throw new Error('Le jeton GitHub est refusé ou a expiré : crée-en un nouveau (onglet Réglages).');
  if (code === 403 && methode !== 'get') throw new Error('Le jeton GitHub n\'a pas le droit d\'écrire dans le dépôt (permission « Contents : Read and write »).');
  return { code, j };
}
function lireFichier_(chemin) {
  const r = github_('get', '/contents/' + chemin + '?ref=main');
  if (r.code === 404) return null;
  if (r.code !== 200 || !r.j) throw new Error('GitHub ne répond pas (erreur ' + r.code + ').');
  return { sha: r.j.sha, texte: Utilities.newBlob(Utilities.base64Decode(String(r.j.content).replace(/\s/g, ''))).getDataAsString('UTF-8') };
}
function ecrireFichier_(chemin, texte, sha, message) {
  const corps = { message, content: Utilities.base64Encode(texte, Utilities.Charset.UTF_8), branch: 'main' };
  if (sha) corps.sha = sha;
  const r = github_('put', '/contents/' + chemin, corps);
  if (r.code !== 200 && r.code !== 201) throw new Error('Écriture sur GitHub impossible (erreur ' + r.code + (r.j && r.j.message ? ' : ' + r.j.message : '') + ').');
}
function lireIndex_() {
  const f = lireFichier_('docs/bibliotheque/index.json');
  const index = f ? JSON.parse(f.texte) : { version: 1, quiz: [] };
  if (!Array.isArray(index.quiz)) index.quiz = [];
  return { index, sha: f && f.sha };
}
function jsonJoli_(o) { return JSON.stringify(o, null, 2) + '\n'; }

function apiBibliotheque() {
  exiger_();
  const i = lireIndex_().index;
  return { ok: true, quiz: i.quiz, retires: Array.isArray(i.retires) ? i.retires : [] };
}

/* d = { id, titre, matiere, classes: [], icone, description, texte, proposition, remplacer } */
function apiPublier(d) {
  exiger_();
  d = d || {};
  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_JETON')) return { erreur: 'Ajoute d\'abord le jeton GitHub (onglet Réglages).' };
  const id = String(d.id || '').trim();
  if (!/^[a-z0-9-]{3,80}$/.test(id)) return { erreur: 'Identifiant : 3 à 80 caractères, minuscules, chiffres et tirets seulement.' };
  const texte = String(d.texte || '').replace(/\r/g, '').trim() + '\n';
  const nb = texte.split('\n').filter(l => /^[QVSGOACXNPK]\|/.test(l.trim())).length;
  if (!/^T\|/m.test(texte) || nb < 3) return { erreur: 'Le texte doit contenir une ligne T| et au moins 3 questions.' };
  const titre = texteCourt_(d.titre, 100); if (!titre) return { erreur: 'Donne un titre.' };
  const matiere = MATIERES_.indexOf(d.matiere) >= 0 ? d.matiere : 'autre';
  const classes = (Array.isArray(d.classes) ? d.classes : []).filter(c => CLASSES_.indexOf(c) >= 0);
  if (!classes.length) return { erreur: 'Coche au moins une classe.' };

  const { index, sha } = lireIndex_();
  const deja = index.quiz.findIndex(q => q.id === id);
  if (deja >= 0 && !d.remplacer) return { erreur: 'Un quiz porte déjà l\'identifiant « ' + id + ' ». Change-le, ou coche « Remplacer ».', existe: true };
  const fichier = lireFichier_('docs/bibliotheque/' + id + '.txt');
  ecrireFichier_('docs/bibliotheque/' + id + '.txt', texte, fichier && fichier.sha, 'Bibliothèque : ' + titre);
  const entree = { id, titre, matiere, classes, nb, icone: texteCourt_(d.icone, 16), description: texteCourt_(d.description, 200), ajoute: Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd') };
  if (!entree.icone) delete entree.icone;
  if (!entree.description) delete entree.description;
  if (deja >= 0) entree.v = (+index.quiz[deja].v || 1) + 1;         // remplacé : les familles qui l'ont voient « Mettre à jour »
  if (deja >= 0) index.quiz[deja] = entree; else index.quiz.unshift(entree);
  if (Array.isArray(index.retires)) index.retires = index.retires.filter(x => x && x.id !== id);   // republié : plus « retiré »
  ecrireFichier_('docs/bibliotheque/index.json', jsonJoli_(index), sha, 'Bibliothèque : ' + (deja >= 0 ? 'mise à jour de ' : 'ajout de ') + titre);
  if (d.proposition) {
    const l = trouverLigne_(d.proposition);
    if (l) { l.f.getRange(l.i, 3).setValue('publie'); l.f.getRange(l.i, 10).setValue(id); }
  }
  return { ok: true, id, nb };
}

function apiRetirer(id, raison) {
  exiger_();
  const { index, sha } = lireIndex_();
  const i = index.quiz.findIndex(q => q.id === id);
  if (i < 0) return { erreur: 'Ce quiz n\'est plus dans la bibliothèque.' };
  const titre = index.quiz[i].titre;
  // les familles qui l'ont ajouté voient « Retiré de la bibliothèque » (et la raison) dans leur onglet Quiz
  // l'entrée complète est gardée : « Réintégrer » remet le quiz tel quel
  index.retires = (Array.isArray(index.retires) ? index.retires : []).filter(x => x && x.id !== id)
    .concat({ id, titre, date: Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'), raison: String(raison || '').replace(/[<>]/g, '').trim().slice(0, 200), entree: index.quiz[i] }).slice(-200);
  index.quiz.splice(i, 1);
  // le fichier .txt reste : les familles qui l'ont déjà ajouté gardent leur copie, et il peut être republié
  ecrireFichier_('docs/bibliotheque/index.json', jsonJoli_(index), sha, 'Bibliothèque : retrait de ' + titre);
  return { ok: true };
}

function apiReintegrer(id) {
  exiger_();
  const { index, sha } = lireIndex_();
  const r = (Array.isArray(index.retires) ? index.retires : []).filter(x => x && x.id === id)[0];
  if (!r) return { erreur: 'Ce quiz n\'est plus dans la liste des retirés.' };
  if (!r.entree || !r.entree.id) return { erreur: 'Retiré avant cette version de la console : utilise « Corriger et republier ».' };
  if (!lireFichier_('docs/bibliotheque/' + id + '.txt')) return { erreur: 'Le fichier du quiz n\'existe plus sur GitHub.' };
  index.quiz = index.quiz.filter(q => q.id !== id);
  index.quiz.unshift(r.entree);
  index.retires = index.retires.filter(x => x && x.id !== id);
  ecrireFichier_('docs/bibliotheque/index.json', jsonJoli_(index), sha, 'Bibliothèque : réintégration de ' + (r.entree.titre || id));
  return { ok: true };
}

function apiTexteBibliotheque(id) {
  exiger_();
  if (!/^[a-z0-9-]{1,80}$/.test(String(id))) return { erreur: 'Identifiant invalide.' };
  const f = lireFichier_('docs/bibliotheque/' + id + '.txt');
  return f ? { ok: true, texte: f.texte } : { erreur: 'Fichier introuvable.' };
}

/* ---------------- réglages ---------------- */
function apiJeton(jeton) {
  exiger_();
  const p = PropertiesService.getScriptProperties();
  jeton = String(jeton || '').trim();
  if (!jeton) { p.deleteProperty('GITHUB_JETON'); return { ok: true, jeton: false }; }
  if (!/^(github_pat_|ghp_)[\w]{20,}$/.test(jeton)) return { erreur: 'Ce n\'est pas un jeton GitHub (il commence par github_pat_).' };
  const avant = p.getProperty('GITHUB_JETON');
  p.setProperty('GITHUB_JETON', jeton);
  try {
    const r = github_('get', '');
    if (r.code !== 200 || !r.j) throw new Error('Le jeton ne donne pas accès au dépôt ' + DEPOT + '.');
    if (r.j.permissions && r.j.permissions.push === false) throw new Error('Le jeton peut lire le dépôt mais pas y écrire : donne-lui « Contents : Read and write ».');
    return { ok: true, jeton: true };
  } catch (e) {
    if (avant) p.setProperty('GITHUB_JETON', avant); else p.deleteProperty('GITHUB_JETON');
    return { erreur: String(e.message || e) };
  }
}

/* ---------------- bilan du relais (nouvelle installation) ----------------
   Totaux calculés par le relais sur sa base D1 : familles inscrites, inscriptions par semaine, familles actives
   (au moins une écriture : partie jouée ou réglage) sur 7 et 30 jours. Aucun identifiant, aucune donnée de famille.
   Le jeton (propriété RELAIS_JETON) est le même que le secret JETON_CONSOLE du Worker « soccaquiz-relais ». */
const RELAIS_ = 'https:\/\/soccaquiz-relais.soccaquiz.workers.dev';
function lireBilan_(jeton) {
  const r = UrlFetchApp.fetch(RELAIS_ + '/bilan', { headers: { Authorization: 'Bearer ' + jeton }, muteHttpExceptions: true });
  let j = null; try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200 || !j || !j.ok) return null;
  return { familles: +j.familles || 0, actives7: +j.actives7 || 0, actives30: +j.actives30 || 0,
    semaines: (Array.isArray(j.semaines) ? j.semaines : []).filter(w => w && /^\d{4}-\d{2}-\d{2}$/.test(w.semaine)).slice(0, 12).map(w => ({ semaine: w.semaine, n: +w.n || 0 })) };
}
function apiBilanRelais() {
  exiger_();
  const jeton = PropertiesService.getScriptProperties().getProperty('RELAIS_JETON');
  if (!jeton) return { sansJeton: true };
  try { const b = lireBilan_(jeton); return b ? { bilan: b } : { erreur: 'Le relais refuse le jeton : vérifie le secret JETON_CONSOLE dans Cloudflare (onglet Réglages).' }; }
  catch (e) { return { erreur: 'Relais injoignable : ' + (e.message || e) }; }
}
function apiJetonRelais(jeton) {
  exiger_();
  const p = PropertiesService.getScriptProperties();
  jeton = String(jeton || '').trim();
  if (!jeton) { p.deleteProperty('RELAIS_JETON'); return { ok: true, jetonRelais: false }; }
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(jeton)) return { erreur: 'Jeton invalide : 32 à 128 lettres ou chiffres (utilise « Créer un jeton »).' };
  let b = null; try { b = lireBilan_(jeton); } catch (e) { return { erreur: 'Relais injoignable : ' + (e.message || e) }; }
  if (!b) return { erreur: 'Le relais ne reconnaît pas ce jeton. Vérifie dans Cloudflare que JETON_CONSOLE (type Secret) contient exactement ce jeton, attends quelques secondes, puis réessaie. Aide : Réglages → Bilan du relais → « En cas de souci ».' };
  p.setProperty('RELAIS_JETON', jeton);
  return { ok: true, jetonRelais: true, bilan: b };
}

/* adresse du déploiement « Propositions » : publiée dans docs/soccaquiz.json, lu par les sites des familles */
function apiUrlPropositions(url) {
  exiger_();
  url = String(url || '').trim();
  if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/.test(url)) return { erreur: 'Colle l\'adresse complète du déploiement « Propositions » (https:\/\/script.google.com/macros/s/…/exec).' };
  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_JETON')) return { erreur: 'Ajoute d\'abord le jeton GitHub.' };
  const f = lireFichier_('docs/soccaquiz.json');
  let cfg = {}; try { cfg = f ? JSON.parse(f.texte) : {}; } catch (e) {}
  cfg.propositions = url;
  ecrireFichier_('docs/soccaquiz.json', jsonJoli_(cfg), f && f.sha, url ? 'Propositions : adresse de réception' : 'Propositions : réception coupée');
  PropertiesService.getScriptProperties().setProperty('URL_PROPOSITIONS', url);
  return { ok: true, url };
}

/* ---------------- raccourcis de l'onglet Liens : programmes Apps Script ----------------
   Console : son propre projet (ScriptApp). Installateur : un autre projet, dont l'adresse est collée une fois. */
const PROJET_ = /^https:\/\/script\.google\.com\/(?:u\/\d+\/)?(?:home\/projects\/|d\/)([\w-]{20,})(?:\/[\w-]*)*\/?(?:\?.*)?$/;
function lienProjetId_(id) { return id ? 'https:\/\/script.google.com/home/projects/' + id + '/edit' : ''; }
function apiProjetInstallateur(url) {
  exiger_();
  url = String(url || '').trim();
  const m = url.match(PROJET_);
  if (url && !m) return { erreur: 'Colle l\'adresse du projet de l\'installateur, ouvert dans l\'éditeur Apps Script (elle commence par https:\/\/script.google.com/home/projects/…).' };
  const p = PropertiesService.getScriptProperties();
  if (m) p.setProperty('PROJET_INSTALLATEUR', m[1]); else p.deleteProperty('PROJET_INSTALLATEUR');
  return { ok: true, lien: lienProjetId_(m ? m[1] : '') };
}

/* ---------------- versions publiées (lecture seule) ---------------- */
function apiVersions() {
  exiger_();
  const r = github_('get', '/releases?per_page=8');
  if (r.code !== 200 || !Array.isArray(r.j)) return { erreur: 'GitHub ne répond pas (erreur ' + r.code + ').' };
  return { ok: true, versions: r.j.map(v => ({ tag: v.tag_name, date: v.published_at, pre: !!v.prerelease, url: v.html_url })) };
}

/* ---------------- invitations (anciennement le projet « Envoi des invitations ») ---------------- */
/* « Lucie <lucie@gmail.com> », « Lucie, lucie@gmail.com », « lucie@gmail.com » … une personne par ligne.
   Seul le premier mot avant ou après l'adresse sert de prénom (« Lucie Martin » → « Bonjour Lucie, »). */
function lireListe_(texte) {
  const vus = {};
  return String(texte || '').split(/[\r\n;]+/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/);
    if (!m) return { ligne: l, erreur: 'adresse introuvable' };
    const email = m[0].toLowerCase();
    const prenom = l.replace(m[0], '').replace(/[<>,:;"()\[\]]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')[0].slice(0, 40);
    if (vus[email]) return { ligne: l, erreur: 'en double' };
    vus[email] = true;
    return { ligne: l, email, prenom };
  });
}
const echapper_ = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* le mail tel qu'il est publié : ce qui est entre les repères <!--MAIL--> et <!--/MAIL--> (dans <div id="mail">) */
function modele_() {
  const r = UrlFetchApp.fetch(SOURCE_INVITATION + '?v=' + Date.now(), { muteHttpExceptions: true, followRedirects: true, headers: { 'Cache-Control': 'no-cache' } });
  if (r.getResponseCode() !== 200) throw new Error('Impossible de lire le mail sur GitHub Pages (erreur ' + r.getResponseCode() + ').');
  const html = r.getContentText('UTF-8');
  const DEBUT = '<!--MAIL-->', FIN = '<!--/MAIL-->';
  const debut = html.indexOf(DEBUT), fin = html.indexOf(FIN, debut);
  if (debut < 0 || fin < 0) throw new Error('Repère ' + (debut < 0 ? DEBUT : FIN) + ' introuvable dans le mail publié sur GitHub Pages (docs/invitation.html) : rien n\'a été envoyé. Préviens Claude.');
  return html.slice(debut + DEBUT.length, fin);
}
function personnaliser_(modele, prenom, signature) {
  return modele
    .replace(/<span id="bonjour">[^<]*<\/span>/, prenom ? 'Bonjour ' + echapper_(prenom) + ',' : 'Bonjour,')
    .replace(/<span id="signature">[^<]*<\/span>/, echapper_(signature || ''));
}
function texteBrut_(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|div)>/gi, '\n').replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 : $1')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}
/* d = { liste, signature, nom, essai } — essai : envoie un seul mail, à soi-même */
function apiEnvoyer(d) {
  exiger_();
  d = d || {};
  const signature = String(d.signature || '').trim().slice(0, 80);
  const nom = String(d.nom || '').trim().slice(0, 60) || 'SoccaQuiz';
  const p = PropertiesService.getUserProperties();
  p.setProperty('SIGNATURE', signature); p.setProperty('NOM', nom);
  const moi = Session.getEffectiveUser().getEmail();
  const liste = d.essai ? [{ ligne: moi, email: moi, prenom: 'Test' }] : lireListe_(d.liste);
  const valides = liste.filter(x => !x.erreur);
  if (!valides.length) return { erreur: 'Aucune adresse dans la liste.', lignes: liste };
  const quota = MailApp.getRemainingDailyQuota();
  if (valides.length > quota) return { erreur: 'Gmail ne permet plus que ' + quota + ' envoi(s) aujourd\'hui : retire des adresses ou attends demain.', lignes: liste };
  const modele = modele_();
  liste.forEach(x => {
    if (x.erreur) return;
    try {
      const html = personnaliser_(modele, x.prenom, signature);
      MailApp.sendEmail({ to: x.email, subject: OBJET, name: nom, htmlBody: html, body: texteBrut_(html) });
      x.ok = true;
    } catch (e) { x.erreur = String(e.message || e); }
  });
  return { ok: true, lignes: liste, quota: MailApp.getRemainingDailyQuota() };
}

/* ---------------- liens utiles (onglet Liens) ---------------- */
const ADR_CONSOLE_ = 'https:\/\/script.google.com/macros/s/AKfycbxsZ8JGrlVuVaX6LyKZXYi5qFnMUen5PNs73QCaeGhu17HVdz8DaKikl2DH5uY6J2V8/exec';
const ADR_PROPOSITIONS_ = 'https:\/\/script.google.com/macros/s/AKfycbybQbaKtUaeZHNGLT93Balt_NpVTOSo0jGVZjSsCqxg8wSqcKkn8ZAR1H8jSSSQoIsr/exec';
const LIENS_ = [
  ['Cette console', [
    ['Console SoccaQuiz', ADR_CONSOLE_, 'Déploiement « Console » (Seulement moi). Après chaque collage de son code : Nouvelle version de « Console » ET de « Propositions ».'],
    ['Réception « Propositions »', ADR_PROPOSITIONS_, '⚠️ Ne jamais oublier de la republier (Nouvelle version) : c\'est par elle qu\'arrivent quiz proposés, erreurs, demandes d\'aide et compteurs. Adresse publiée dans docs/soccaquiz.json.'],
    ['Liste publiée par la console (soccaquiz.json)', PAGES + 'soccaquiz.json', 'Adresse « Propositions » lue par les sites et l\'installateur, et interrupteur de l\'appli.']
  ]],
  ['Pour les familles', [
    ['Installateur SoccaQuiz', 'https:\/\/script.google.com/macros/s/AKfycbxseeW1yjc6MLMFTW1hy2b7RXCiI8Yt6nQKzJLs_k_DT2VhBVgQStarPp8-Dk03jjv1/exec', 'Déploiement « Install officielle » : le lien à donner aux parents, avec « Mettre à jour mon site ».'],
    ['Lien des anciens mails d\'invitation', PAGES + 'installer.html', 'Redirige vers la nouvelle installation (app.soccaquiz.fr/connexion). Le mail actuel pointe directement sur app.soccaquiz.fr/connexion.'],
    ['Mail d\'invitation (aperçu)', PAGES + 'invitation.html', 'Lu aussi par l\'onglet Invitations.'],
    ['Page d\'accueil publique', 'https:\/\/soccaquiz.fr/', 'Celle que vérifie Google (dépôt leian/soccaquiz.fr).'],
    ['Règles de confidentialité', 'https:\/\/soccaquiz.fr/confidentialite.html', 'Copie aussi dans docs/ : modifier les deux.'],
    ['Page d\'aide', 'https:\/\/soccaquiz.fr/aide.html', 'Ouverte par le bouton « ? » de l\'installateur et de l\'espace parent ; son formulaire arrive dans l\'onglet Aide.'],
    ['Créer une clé Gemini gratuite', 'https:\/\/aistudio.google.com/apikey', 'Projet « Default Gemini Project ».'],
    ['Appli de l\'enfant (Cloudflare Pages)', 'https:\/\/app.soccaquiz.fr/', 'Ouverte avec ?s=<identifiant du site> ; l\'enveloppe leian.github.io/app choisit le mode (soccaquiz.json → « appli »).']
  ]],
  ['Nouvelle installation (connexion Google + relais)', [
    ['Page « Commencer avec Google »', 'https:\/\/app.soccaquiz.fr/connexion/', 'Le nouveau point de départ des familles : prénom, classe, compte Google, et c\'est installé (rien dans Apps Script). Rouvrir son espace : ?reconnecter=1.'],
    ['Relais : est-il en marche ?', 'https:\/\/soccaquiz-relais.soccaquiz.workers.dev/sante', 'Doit répondre {"ok":true}. L\'adresse du Worker seule (bouton Visit de Cloudflare) répond « Introuvable » : normal, le relais n\'a pas de page d\'accueil. Worker « soccaquiz-relais » du compte Cloudflare soccaquiz, publié par l\'Action « Relais » à chaque push.'],
    ['Cloudflare : Workers et D1', 'https:\/\/dash.cloudflare.com/?to=/:account/workers-and-pages', 'Worker « soccaquiz-relais » → Settings → Variables and Secrets : CLE_CHIFFREMENT (Secret, NE JAMAIS l\'effacer ni la modifier), GOOGLE_CLIENT_SECRET (Secret), GOOGLE_CLIENT_ID (Variable), JETON_CONSOLE (Secret, facultatif : bilan de l\'onglet Statistiques, voir Réglages). Base D1 « soccaquiz-relais » : une ligne par famille, données chiffrées.'],
    ['Journal du relais (Cloudflare)', 'https:\/\/dash.cloudflare.com/?to=/:account/workers-and-pages', 'Worker « soccaquiz-relais » → onglet Logs : demandes et erreurs des derniers jours. À ouvrir seulement pour comprendre une panne (règles de confidentialité, § 3).'],
    ['Google Cloud : projet « soccaquiz »', 'https:\/\/console.cloud.google.com/auth/overview', 'Choisir le projet soccaquiz : marque, client OAuth « SoccaQuiz relais », accès drive.file seulement. Ne pas toucher aux accès du projet 710131532855 pendant la validation.'],
    ['Action « Relais » (GitHub)', 'https:\/\/github.com/' + DEPOT + '/actions/workflows/relais.yml', 'Tests, puis publication du relais et de app.soccaquiz.fr. Compteurs : les installations par le relais apparaissent avec la version « relais » dans l\'onglet Statistiques.']
  ]],
  ['Site public soccaquiz.fr', [
    ['Dépôt leian/soccaquiz.fr', 'https:\/\/github.com/leian/soccaquiz.fr', 'Accueil, aide et confidentialité (en ligne dès le push).'],
    ['Domaine chez Gandi', 'https:\/\/admin.gandi.net/', 'DNS : A/AAAA vers GitHub Pages, CNAME www et app ; renouvellement chaque année.'],
    ['Cloudflare (compte soccaquiz)', 'https:\/\/dash.cloudflare.com/', 'Projet Pages « soccaquiz » (app.soccaquiz.fr), publié par l\'Action « Publier ».']
  ]],
  ['Bibliothèque', [
    ['Liste publiée (index.json)', PAGES + 'bibliotheque/index.json', 'Lue par l\'onglet Bibliothèque des sites.'],
    ['Dossier sur GitHub', 'https:\/\/github.com/' + DEPOT + '/tree/main/docs/bibliotheque', '']
  ]],
  ['Apps Script (compte soccaquiz)', [
    ['Mes projets Apps Script', 'https:\/\/script.google.com/home', 'Installateur : toujours mettre à jour le déploiement « Install officielle ». Console : déploiements « Console » et « Propositions ».'],
    ['Code de l\'installateur à recoller', 'https:\/\/github.com/' + DEPOT + '/blob/main/en-ligne/Code.gs', 'Bouton « Copy raw file », puis Nouvelle version.'],
    ['Code de cette console', 'https:\/\/github.com/' + DEPOT + '/blob/main/console/Code.gs', 'Même chose : recoller, puis Nouvelle version des deux déploiements.'],
    ['Activer l\'API Apps Script', 'https:\/\/script.google.com/home/usersettings', ''],
    ['Accès accordés aux applications', 'https:\/\/myaccount.google.com/permissions', 'Pour retirer SoccaQuiz et revoir les écrans d\'autorisation.']
  ]],
  ['Validation Google', [
    ['Branding', 'https:\/\/console.cloud.google.com/auth/branding?project=lucky-union-514320-c3', 'Nom, logo, page d\'accueil, « Afficher les problèmes ».'],
    ['Centre de validation', 'https:\/\/console.cloud.google.com/auth/verification?project=lucky-union-514320-c3', ''],
    ['Accès aux données (scopes)', 'https:\/\/console.cloud.google.com/auth/scopes?project=lucky-union-514320-c3', ''],
    ['Audience', 'https:\/\/console.cloud.google.com/auth/audience?project=lucky-union-514320-c3', ''],
    ['Search Console', 'https:\/\/search.google.com/search-console', 'Propriété « domaine » soccaquiz.fr (validée le 17 nov. 2026) ; anciennes : leian.github.io.'],
    ['Marche à suivre', 'https:\/\/github.com/' + DEPOT + '/blob/main/en-ligne/VALIDATION-GOOGLE.md', ''],
    ['Vidéo de démonstration', 'https:\/\/youtu.be/2zi-xip2fUc', '']
  ]],
  ['GitHub (compte leian)', [
    ['Dépôt', 'https:\/\/github.com/' + DEPOT, ''],
    ['Publier une nouvelle version', 'https:\/\/github.com/' + DEPOT + '/actions/workflows/publier.yml', 'Run workflow avec un nouveau tag.'],
    ['Toutes les versions', 'https:\/\/github.com/' + DEPOT + '/releases', ''],
    ['Jetons d\'accès', 'https:\/\/github.com/settings/personal-access-tokens', 'Le jeton de la console : à renouveler avant son expiration.'],
    ['Double authentification', 'https:\/\/github.com/settings/security', 'À activer avant le 25 décembre 2026.']
  ]],
  ['Autres', [
    ['lana-quizz (Cloudflare)', 'https:\/\/lana-quizz.pages.dev', ''],
    ['Logo SoccaQuiz', PAGES + 'logo-soccaquiz.png', ''],
    ['Icône 512 px', PAGES + 'icone.png', '']
  ]]
];

/* ---------------- page de la console ---------------- */
function pageHtml_() {
  // « / » écrit « \/ » : aucune suite « // » dans le script de la page (Apps Script la prendrait pour un commentaire)
  const liens = JSON.stringify(LIENS_).replace(/</g, '\\u003c').replace(/\//g, '\\/');
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><base target="_top"><link rel="stylesheet" href="' + PAGES + 'polices/polices.css"><style>' + CSS_ + '</style></head><body>' +
    '<header class="tete"><img src="' + PAGES + 'icone-96.png" width="40" height="40" alt=""><span class="marque">Socca<em>Quiz</em></span><span class="badge">Console</span></header>' +
    '<nav class="onglets" id="onglets" role="tablist">' +
    [['propositions', 'inbox', 'Propositions'], ['erreurs', 'flag', 'Erreurs'], ['aide', 'aide', 'Aide'], ['stats', 'chart', 'Statistiques'], ['bibliotheque', 'book', 'Bibliothèque'], ['invitations', 'mail', 'Invitations'], ['liens', 'link', 'Liens'], ['versions', 'tag', 'Versions'], ['reglages', 'settings', 'Réglages']]
      .map((o, i) => '<button type="button" role="tab" class="onglet' + (i ? '' : ' on') + '" data-o="' + o[0] + '"><i data-ic="' + o[1] + '"></i> ' + o[2] + (o[0] === 'propositions' ? ' <span class="nb" id="nb-prop" hidden></span>' : o[0] === 'erreurs' ? ' <span class="nb" id="nb-err" hidden></span>' : o[0] === 'aide' ? ' <span class="nb" id="nb-aide" hidden></span>' : '') + '</button>').join('') +
    '</nav><main id="contenu"><p class="petit">Chargement…</p></main>' +
    '<script>var LIENS = ' + liens + ';(' + client_.toString() + ')();</script></body></html>';
}

const CSS_ = `
.chiffres{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:8px 0}
.chiffre{background:var(--bg);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column}
.chiffre b{font:700 1.8rem Fredoka,system-ui,sans-serif;color:var(--rouge)}.chiffre small{color:var(--soft);font-size:.78rem}
table.stats{width:100%;border-collapse:collapse;font-size:.95rem}table.stats th,table.stats td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}
table.stats td+td,table.stats th+th{text-align:right}
:root{--bg:#fff8ef;--card:#fff;--ink:#2a1f1a;--soft:#7a6658;--line:#eadfce;--rouge:#c8102e;--rouge-f:#9e0b24;--rouge-c:#fdeceb;--dore:#e8a83a;--ok:#15803d;--ko:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#1a1412;--card:#241c18;--ink:#f8efe6;--soft:#c4b3a3;--line:#3a2e27;--rouge:#ef4a5c;--rouge-f:#ff6b7a;--rouge-c:#3a1f22;--ok:#4ade80;--ko:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 Nunito,system-ui,sans-serif}
.tete{display:flex;align-items:center;gap:10px;max-width:900px;margin:0 auto;padding:16px 16px 4px}.tete img{border-radius:10px}
.marque{font:700 1.5rem Fredoka,system-ui,sans-serif}.marque em{font-style:normal;color:var(--rouge)}
.badge{font:700 .78rem Nunito,sans-serif;background:var(--rouge-c);color:var(--rouge);border-radius:999px;padding:2px 10px}
.onglets{display:flex;gap:2px;max-width:900px;margin:8px auto 0;padding:0 12px;position:sticky;top:0;z-index:5;background:var(--bg);box-shadow:inset 0 -2px 0 var(--line);overflow-x:auto;scrollbar-width:none}
.onglets::-webkit-scrollbar{display:none}
@media (min-width:700px){.onglets{flex-wrap:wrap;overflow-x:visible}}
.onglet{flex:0 0 auto;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;border:none;background:none;color:var(--soft);padding:12px 12px 10px;font:600 1rem Fredoka,system-ui,sans-serif;cursor:pointer;border-bottom:3px solid transparent}
.onglet.on{color:var(--rouge);border-bottom-color:var(--rouge)}
.nb{font-size:.75rem;background:var(--rouge);color:#fff;border-radius:999px;padding:0 7px}
main{max-width:900px;margin:0 auto;padding:12px 16px 48px}
.box{background:var(--card);border:2px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0}
h2{font:600 1.15rem Fredoka,system-ui,sans-serif;margin:0 0 8px;display:flex;align-items:center;gap:8px}h2 .ic{color:var(--rouge)}
h3{font:600 1.02rem Fredoka,system-ui,sans-serif;margin:0}
.petit{font-size:.88rem;color:var(--soft)}.ok{color:var(--ok)}.ko{color:var(--ko)}
.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:42px;border:2px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:6px 14px;font:600 .92rem Fredoka,system-ui,sans-serif;cursor:pointer;text-decoration:none;transition:scale .12s,filter .12s}
.btn:active{scale:.95;filter:brightness(.92)}.btn:disabled{opacity:.55;cursor:default}
.retrait{margin-top:10px;padding:10px 12px;border:1px solid #fecaca;border-radius:12px;background:#fff7f7}.retrait input{width:100%;margin:6px 0}
.btn.principal{background:var(--rouge);border-color:var(--rouge);color:#fff}.btn.danger{color:var(--ko);border-color:#fecaca}
.confirmation{background:#fff5f5;border:2px solid #fecaca;border-radius:12px;padding:10px 14px;width:100%}.confirmation p{margin:.3em 0}
.btn:focus-visible,.onglet:focus-visible{outline:3px solid var(--dore);outline-offset:2px}
.carte{border:2px solid var(--line);border-radius:14px;padding:12px 14px;margin:10px 0}
.carte .meta{font-size:.84rem;color:var(--soft);margin:2px 0 8px}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.etiq{display:inline-block;font:700 .74rem Nunito,sans-serif;border-radius:999px;padding:1px 9px;background:var(--line);color:var(--ink)}
.etiq.nouveau{background:var(--rouge-c);color:var(--rouge)}.etiq.publie{background:#dcfce7;color:#166534}.etiq.refuse{background:#f3f4f6;color:#6b7280}
label{display:block;font-weight:700;margin:10px 0 4px}
input[type=text],input:not([type]),textarea,select{width:100%;font:inherit;padding:9px 11px;border:2px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink)}
textarea{min-height:120px;font:.84rem/1.45 ui-monospace,Menlo,monospace}
.grille{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}@media (max-width:600px){.grille{grid-template-columns:1fr}}
.classes{display:flex;flex-wrap:wrap;gap:6px}.classes label{display:inline-flex;align-items:center;gap:4px;font-weight:600;margin:0;border:2px solid var(--line);border-radius:999px;padding:3px 10px;cursor:pointer}
.classes input{margin:0}
.apercu{margin:8px 0 0;padding-left:22px;font-size:.88rem}.apercu li{margin:2px 0}
.liens li{list-style:none;padding:8px 0;border-top:1px solid var(--line)}.liens li:first-child{border-top:0}.liens ul{margin:0;padding:0}
.liens a{color:var(--rouge);font-weight:700;text-decoration:none}.liens a:hover{text-decoration:underline}.liens .d{display:block;font-size:.85rem;color:var(--soft)}
.vide{text-align:center;color:var(--soft);padding:20px}
details summary{cursor:pointer;font-weight:700;color:var(--soft);margin:8px 0}
.message{padding:10px 14px;border-radius:12px;margin:10px 0;background:var(--rouge-c)}.message.ok{background:#dcfce7;color:#166534}
ol.etapes{padding-left:22px}ol.etapes li{margin:4px 0}
code{font-size:.85em;word-break:break-all}
`;

/* code de la page, envoyé tel quel au navigateur (pas de « // » ici : Apps Script les prendrait pour des commentaires) */
function client_() {
  var ICONES = {
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>', trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>', plus: '<path d="M12 5v14M5 12h14"/>', ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    aide: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', flag: '<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>', key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>'
  };
  var I = function (n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[n] || '') + '</svg>'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var NOMS = { francais: 'Français', maths: 'Maths', sciences: 'Sciences', anglais: 'Anglais', histoire: 'Histoire', geographie: 'Géographie', musique: 'Musique', autre: 'Autre' };
  var ETAT = null, onglet = 'propositions', edition = null, BIB = null;
  document.querySelectorAll('i[data-ic]').forEach(function (e) { e.outerHTML = I(e.dataset.ic); });

  function appel(fn, args, ok, ko) {
    var r = google.script.run.withSuccessHandler(function (x) { if (x && x.erreur) { (ko || erreur)(x.erreur, x); } else ok(x); })
      .withFailureHandler(function (e) { (ko || erreur)((e && e.message) || String(e)); });
    r[fn].apply(r, args || []);
  }
  /* confirmation sur place : les fenêtres confirm() / prompt() sont bloquées dans le cadre de Google Apps Script */
  function confirmer(b, question, faire) {
    if (b.dataset.arme === '1') { b.dataset.arme = ''; faire(); return; }
    var avant = b.innerHTML; b.dataset.arme = '1'; b.innerHTML = esc(question); b.classList.add('danger');
    setTimeout(function () { if (b.dataset.arme === '1') { b.dataset.arme = ''; b.innerHTML = avant; } }, 5000);
  }
  function erreur(m) { var c = $('message'); if (c) { c.className = 'message'; c.textContent = m; c.hidden = false; c.scrollIntoView({ block: 'nearest' }); } else alert(m); }
  function info(m) { var c = $('message'); if (c) { c.className = 'message ok'; c.textContent = m; c.hidden = false; } }
  var MSG = '<div id="message" class="message" hidden role="status"></div>';
  function date(d) { try { return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d; } }
  function questions(t) {
    return String(t).split('\n').map(function (l) { return l.trim().match(/^([QVSGOACXNPK])\|([^|]*)(?:\|([^|]*))?/); }).filter(Boolean)
      .map(function (m) { return m[1] === 'G' ? m[2].replace(/\[[^\]]*\]/g, '…') : m[1] === 'P' ? m[2] + ' « ' + (m[3] || '') + ' »' : m[2]; });
  }
  function slug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

  function charger(apres) { appel('apiEtat', [], function (e) { ETAT = e; var n = e.propositions.filter(function (p) { return p.statut === 'nouveau'; }).length; $('nb-prop').textContent = n; $('nb-prop').hidden = !n; var ne = (e.erreurs || []).filter(function (x) { return x.statut === 'nouveau'; }).length; $('nb-err').textContent = ne; $('nb-err').hidden = !ne; var na = (e.aide || []).filter(function (x) { return x.statut === 'nouveau'; }).length; $('nb-aide').textContent = na; $('nb-aide').hidden = !na; if (apres) apres(); else afficher(); }); }

  function ouvrir(o) {
    onglet = o; edition = null;
    document.querySelectorAll('.onglet').forEach(function (b) { var on = b.dataset.o === o; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) try { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} });
    afficher();
  }
  $('onglets').addEventListener('click', function (e) { var b = e.target.closest('.onglet'); if (b) ouvrir(b.dataset.o); });

  function afficher() {
    var c = $('contenu');
    if (!ETAT) { c.innerHTML = '<p class="petit">Chargement…</p>'; return; }
    if (edition && edition.erreur) return editeurErreur(c);
    if (edition) return editeur(c);
    ({ propositions: vuePropositions, erreurs: vueErreurs, aide: vueAide, stats: vueStats, bibliotheque: vueBibliotheque, invitations: vueInvitations, liens: vueLiens, versions: vueVersions, reglages: vueReglages }[onglet])(c);
  }

  /* ---------- Statistiques : compteurs anonymes envoyés par l'installateur ---------- */
  function vueStats(c) {
    var S = ETAT.stats;
    if (!S) { c.innerHTML = MSG + '<div class="box"><p class="petit">Statistiques indisponibles pour l\'instant.</p></div>'; return; }
    var t = S.totaux, chiffre = function (n, lib, aide) { return '<div class="chiffre"><b>' + n + '</b><span>' + esc(lib) + '</span>' + (aide ? '<small>' + esc(aide) + '</small>' : '') + '</div>'; };
    var jour = function (k) { try { return new Date(k + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch (e) { return k; } };
    c.innerHTML = MSG + '<div class="box" id="bilan-relais"><h2>' + I('chart') + 'Familles inscrites (nouvelle version)</h2><p class="petit">Lecture du relais…</p></div>' +
      '<div class="box"><h2>' + I('chart') + 'Sites SoccaQuiz</h2>' +
      '<div class="chiffres">' + chiffre(S.enService, 'en service', 'déjà là + installés − supprimés') + chiffre(t.installation, 'installations') + chiffre(t.maj, 'mises à jour') + chiffre(t.suppression, 'suppressions') + '</div>' +
      '<p class="petit">Compteurs anonymes envoyés par l\'installateur' + (S.debut ? ' depuis le ' + esc(new Date(S.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })) : '') + ' : un « +1 » par installation, mise à jour ou suppression, avec le numéro de version, sans rien sur les familles. Les sites installés avant les compteurs (' + t.existant + ' comptés pour l\'instant) le sont à leur première mise à jour ou suppression.</p></div>' +
      '<div class="box"><h2>' + I('chart') + 'Par semaine</h2>' + (S.semaines.length ? '<table class="stats"><tr><th>Semaine du</th><th>Installations</th><th>Mises à jour</th><th>Suppressions</th></tr>' +
        S.semaines.map(function (w) { return '<tr><td>' + esc(jour(w.semaine)) + '</td><td>' + w.installation + '</td><td>' + w.maj + '</td><td>' + w.suppression + '</td></tr>'; }).join('') + '</table>' : '<p class="vide">Rien encore.</p>') + '</div>' +
      '<div class="box"><h2>' + I('tag') + 'Par version</h2>' + (S.versions.length ? '<table class="stats"><tr><th>Version</th><th>Installée</th><th>Mise à jour vers</th></tr>' +
        S.versions.map(function (v) { return '<tr><td>' + esc(v.version) + '</td><td>' + v.installation + '</td><td>' + v.maj + '</td></tr>'; }).join('') + '</table>' : '<p class="vide">Rien encore.</p>') + '</div>' +
      '<div class="box"><h2>' + I('trash') + 'Remettre les compteurs à zéro</h2>' +
      '<p class="petit">Pour repartir de zéro après les essais. Concerne les blocs « Sites SoccaQuiz », « Par semaine » et « Par version » (compteurs reçus de l\'installateur et du relais). Rien n\'est effacé : la feuille « Statistiques » du Sheets « SoccaQuiz – Propositions » est renommée en archive, et une nouvelle se remplit dès le compteur suivant. Le bloc « Familles inscrites » ne change pas : il compte les familles réellement inscrites dans le relais.</p>' +
      '<div class="actions" id="raz-stats"><button class="btn danger" id="raz-demander">' + I('trash') + ' Remettre à zéro…</button></div></div>';
    var total = t.installation + t.maj + t.suppression + t.existant;
    $('raz-demander').onclick = function () {
      $('raz-stats').innerHTML = '<div class="confirmation"><p><b>Remettre les compteurs à zéro ?</b></p>' +
        '<p>Les ' + total + ' compteurs reçus' + (S.debut ? ' depuis le ' + esc(new Date(S.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })) : '') + ' (' + t.installation + ' installations, ' + t.maj + ' mises à jour, ' + t.suppression + ' suppressions) seront rangés dans une feuille d\'archive. L\'onglet Statistiques repartira de zéro.</p>' +
        '<div class="actions"><button class="btn" id="raz-annuler">Annuler</button><button class="btn danger" id="raz-oui">' + I('trash') + ' Oui, remettre à zéro</button></div></div>';
      $('raz-annuler').onclick = function () { vueStats(c); };
      $('raz-oui').onclick = function () {
        this.disabled = true;
        appel('apiRemettreStatsAZero', [], function (r) { charger(function () { ouvrir('stats'); info(r.vide ? 'Rien à remettre à zéro.' : 'Compteurs remis à zéro. Les anciens sont gardés dans la feuille « ' + r.archive + ' ».'); }); }, function (m) { $('raz-oui').disabled = false; erreur(m); });
      };
    };
    var zone = $('bilan-relais'), titre = '<h2>' + I('chart') + 'Familles inscrites (nouvelle version)</h2>';
    appel('apiBilanRelais', [], function (r) {
      if (!zone) return;
      if (r.sansJeton) { zone.innerHTML = titre + '<p class="petit">Pas encore relié au relais : onglet <b>Réglages</b> → « Bilan du relais ».</p>'; return; }
      var B = r.bilan;
      zone.innerHTML = titre + '<div class="chiffres">' + chiffre(B.familles, 'familles inscrites', 'en ce moment, dans le relais') + chiffre(B.actives7, 'actives sur 7 jours') + chiffre(B.actives30, 'actives sur 30 jours') + '</div>' +
        (B.semaines.length ? '<table class="stats"><tr><th>Semaine du</th><th>Inscriptions (familles encore inscrites)</th></tr>' + B.semaines.map(function (w) { return '<tr><td>' + esc(jour(w.semaine)) + '</td><td>' + w.n + '</td></tr>'; }).join('') + '</table>' : '') +
        '<p class="petit">Totaux calculés par le relais : « active » = au moins une partie jouée ou un réglage enregistré. Aucun identifiant ni aucune donnée de famille ne sort du relais.</p>';
    }, function (m) { if (zone) zone.innerHTML = titre + '<p class="petit">' + esc(m) + '</p>'; });
  }

  /* ---------- Demandes d'aide des familles : réponse par mail depuis ce compte ---------- */
  var ORIGINES = { parent: 'Espace parent', installateur: 'Installateur', aide: 'Page d\'aide' };
  function carteAide(x) {
    var lib = { nouveau: 'À répondre', repondu: 'Répondu', classe: 'Classé' }[x.statut] || x.statut;
    return '<div class="carte" data-aide="' + esc(x.id) + '"><h3>' + esc(x.email) + ' <span class="etiq ' + (x.statut === 'nouveau' ? 'nouveau' : x.statut === 'repondu' ? 'publie' : 'refuse') + '">' + esc(lib) + '</span></h3>' +
      '<div class="meta">' + esc(date(x.date)) + ' · ' + esc(ORIGINES[x.origine] || x.origine) + (x.prenom ? ' · ' + esc(x.prenom) : '') + (x.classe ? ' · ' + esc(x.classe) : '') + (x.version ? ' · site ' + esc(x.version) : '') + '</div>' +
      '<p style="margin:6px 0;white-space:pre-wrap">' + esc(x.message) + '</p>' +
      (x.reponse ? '<p class="petit" style="margin:4px 0;white-space:pre-wrap">Ta réponse' + (x.maj ? ' (' + esc(date(x.maj)) + ')' : '') + ' : ' + esc(x.reponse) + '</p>' : '') +
      (x.statut === 'nouveau'
        ? '<label for="r-' + esc(x.id) + '">Ta réponse (envoyée par mail à ' + esc(x.email) + ')</label><textarea id="r-' + esc(x.id) + '" rows="5" maxlength="5000" placeholder="Bonjour, …"></textarea>' +
          '<div class="actions"><button class="btn principal" data-h="repondre">' + I('send') + ' Envoyer la réponse</button><button class="btn" data-h="classer">' + I('check') + ' Classer sans répondre</button></div>'
        : '<div class="actions"><button class="btn" data-h="rouvrir">' + I('undo') + ' Remettre à répondre</button><button class="btn danger" data-h="supprimer">' + I('trash') + ' Supprimer</button></div>') + '</div>';
  }
  function vueAide(c) {
    var A = ETAT.aide || [], nouv = A.filter(function (x) { return x.statut === 'nouveau'; }), autres = A.filter(function (x) { return x.statut !== 'nouveau'; });
    c.innerHTML = MSG + '<div class="box"><h2>' + I('aide') + 'Demandes d\'aide</h2><p class="petit">Envoyées depuis l\'espace parent (adresse du compte Google du parent) ou depuis la page d\'aide de soccaquiz.fr. Ta réponse part par mail depuis ce compte ; la famille peut y répondre directement.' + (ETAT.quota != null ? ' Envois restants aujourd\'hui : ' + ETAT.quota + '.' : '') + '</p>' +
      (nouv.length ? nouv.map(carteAide).join('') : '<p class="vide">Aucune demande en attente.</p>') + '</div>' +
      (autres.length ? '<div class="box"><details><summary>Déjà traitées (' + autres.length + ')</summary>' + autres.map(carteAide).join('') + '</details></div>' : '');
  }
  $('contenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-h]'); if (!b || onglet !== 'aide') return;
    var carte = e.target.closest('.carte'), id = carte && carte.dataset.aide; if (!id) return;
    var fini = function (m) { charger(function () { ouvrir('aide'); if (m) info(m); }); };
    if (b.dataset.h === 'repondre') {
      var ta = carte.querySelector('textarea');
      if (!ta || !ta.value.trim()) { erreur('Écris d\'abord ta réponse.'); if (ta) ta.focus(); return; }
      b.disabled = true;
      appel('apiRepondreAide', [id, ta.value], function (r) { fini('Réponse envoyée à ' + r.email + '.'); }, function (m) { b.disabled = false; erreur(m); });
    }
    else if (b.dataset.h === 'classer') { b.disabled = true; appel('apiAideStatut', [id, 'classe'], function () { fini(); }); }
    else if (b.dataset.h === 'rouvrir') { b.disabled = true; appel('apiAideStatut', [id, 'nouveau'], function () { fini(); }); }
    else if (b.dataset.h === 'supprimer') confirmer(b, 'Toucher encore pour supprimer', function () { appel('apiSupprimerAide', [id], function () { fini(); }); });
  });

  /* ---------- Erreurs signalées par les familles ---------- */
  var MOTIFS = { reponse: 'Bonne réponse fausse', question: 'Question mal écrite ou incomprise', rappel: 'Rappel de la leçon faux', autre: '' };
  function carteErreur(x) {
    var lib = { nouveau: 'À corriger', corrige: 'Corrigé', 'sans-erreur': 'Pas d\'erreur' }[x.statut] || x.statut;
    return '<div class="carte" data-err="' + esc(x.id) + '"><h3>' + esc(x.titre || 'Sans titre') + ' <span class="etiq ' + (x.statut === 'nouveau' ? 'nouveau' : x.statut === 'corrige' ? 'publie' : 'refuse') + '">' + esc(lib) + '</span>' + (x.biblio ? ' <span class="etiq">Bibliothèque</span>' : '') + '</h3>' +
      '<div class="meta">' + esc(date(x.date)) + (x.classe ? ' · ' + esc(x.classe) : '') + (x.version ? ' · site ' + esc(x.version) : '') + '</div>' +
      '<p style="margin:4px 0"><b>' + esc(x.question) + '</b></p>' +
      (x.attendu ? '<p class="petit" style="margin:2px 0">Réponse attendue par le quiz : ' + esc(x.attendu) + '</p>' : '') +
      (MOTIFS[x.motif] || x.remarque ? '<p class="petit" style="margin:2px 0">' + esc([MOTIFS[x.motif], x.remarque ? '« ' + x.remarque + ' »' : ''].filter(Boolean).join(' · ')) + '</p>' : '') +
      (x.message ? '<p class="petit" style="margin:2px 0">Ta réponse : « ' + esc(x.message) + ' »</p>' : '') +
      '<div class="actions">' + (x.statut === 'nouveau' ? '<button class="btn principal" data-e="corriger">' + I('eye') + ' Relire et corriger</button>'
        : '<button class="btn" data-e="corriger">' + I('eye') + ' Revoir</button><button class="btn" data-e="rouvrir">' + I('undo') + ' Remettre à corriger</button><button class="btn danger" data-e="supprimer">' + I('trash') + ' Supprimer</button>') + '</div></div>';
  }
  function vueErreurs(c) {
    var E = ETAT.erreurs || [], nouv = E.filter(function (x) { return x.statut === 'nouveau'; }), autres = E.filter(function (x) { return x.statut !== 'nouveau'; });
    c.innerHTML = MSG + '<div class="box"><h2>' + I('flag') + 'À corriger</h2><p class="petit">Erreurs signalées par les familles dans leurs quiz (questions à réviser, rappels « À retenir »). Ta correction leur revient dans l\'espace parent, qui la leur propose ; pour un quiz de la bibliothèque, elle peut corriger aussi le quiz pour toutes les familles.</p>' +
      (nouv.length ? nouv.map(carteErreur).join('') : '<p class="vide">Aucune erreur en attente.</p>') + '</div>' +
      (autres.length ? '<div class="box"><details><summary>Déjà traitées (' + autres.length + ')</summary>' + autres.map(carteErreur).join('') + '</details></div>' : '');
  }
  function editeurErreur(c) {
    var x = (ETAT.erreurs || []).filter(function (y) { return y.id === edition.id; })[0];
    if (!x) { edition = null; return afficher(); }
    var texte = x.correction || x.texte;
    c.innerHTML = MSG + '<div class="box"><h2>' + I('flag') + 'Corriger « ' + esc(x.titre) + ' »</h2>' +
      '<p><b>Question signalée :</b> ' + esc(x.question) + '</p>' +
      (x.attendu ? '<p class="petit">Réponse attendue par le quiz : ' + esc(x.attendu) + '</p>' : '') +
      (MOTIFS[x.motif] || x.remarque ? '<p class="petit">' + esc([MOTIFS[x.motif], x.remarque ? '« ' + x.remarque + ' »' : ''].filter(Boolean).join(' · ')) + '</p>' : '') +
      '<label for="x-texte">Texte du quiz (la ligne signalée est sélectionnée)</label><textarea id="x-texte" rows="16" spellcheck="false">' + esc(texte) + '</textarea>' +
      '<label for="x-msg">Message pour la famille (facultatif)</label><input id="x-msg" maxlength="400" value="' + esc(x.message || '') + '" placeholder="ex. Merci ! La réponse est corrigée.">' +
      (x.biblio ? '<label style="font-weight:600"><input type="checkbox" id="x-tous" checked> Corriger aussi dans la bibliothèque, pour toutes les familles qui ont ce quiz (« ' + esc(x.biblio) + ' »)</label>' : '') +
      '<div class="actions" style="margin-top:12px"><button class="btn principal" id="x-ok">' + I('check') + ' Envoyer la correction</button><button class="btn" id="x-rien">' + I('x') + ' Pas d\'erreur (envoyer le message)</button><button class="btn" id="x-retour">Retour</button></div></div>';
    var ta = $('x-texte'), cle = String(x.question).replace(/^À retenir : /, '').toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim().slice(0, 30);
    var L = texte.split('\n'), pos = 0;
    for (var i = 0; i < L.length; i++) { if (cle && L[i].toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').indexOf(cle) >= 0) { ta.focus(); ta.setSelectionRange(pos, pos + L[i].length); ta.scrollTop = Math.max(0, i * 19 - 80); break; } pos += L[i].length + 1; }
    $('x-retour').onclick = function () { edition = null; afficher(); };
    $('x-ok').onclick = function () {
      var b = this; b.disabled = true;
      appel('apiCorrigerErreur', [x.id, { texte: ta.value, message: $('x-msg').value, pourTous: !!($('x-tous') && $('x-tous').checked) }], function (r) {
        edition = null; charger(function () { ouvrir('erreurs'); info('Correction envoyée : la famille la verra dans son espace parent.' + (r.biblio ? ' Le quiz « ' + r.biblio + ' » est aussi corrigé dans la bibliothèque : les familles qui l\'ont verront « Mettre à jour ».' : '')); });
      }, function (m) { b.disabled = false; erreur(m); });
    };
    $('x-rien').onclick = function () {
      var b = this;
      if (!$('x-msg').value.trim()) { erreur('Écris d\'abord un petit message pour expliquer à la famille pourquoi ce n\'est pas une erreur.'); $('x-msg').focus(); return; }
      b.disabled = true;
      appel('apiSansErreur', [x.id, $('x-msg').value], function () { edition = null; charger(function () { ouvrir('erreurs'); info('Réponse envoyée à la famille.'); }); }, function (m) { b.disabled = false; erreur(m); });
    };
  }
  $('contenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-e]'); if (!b || onglet !== 'erreurs') return;
    var id = (e.target.closest('.carte') || {}).dataset; id = id && id.err; if (!id) return;
    if (b.dataset.e === 'corriger') { edition = { erreur: true, id: id }; afficher(); }
    else if (b.dataset.e === 'rouvrir') { b.disabled = true; appel('apiRouvrirErreur', [id], function () { charger(function () { ouvrir('erreurs'); }); }); }
    else if (b.dataset.e === 'supprimer') confirmer(b, 'Toucher encore pour supprimer', function () { appel('apiSupprimerErreur', [id], function () { charger(function () { ouvrir('erreurs'); }); }); });
  });

  /* ---------- Propositions ---------- */
  function carteProp(p) {
    var lib = { nouveau: 'À relire', publie: 'Publié', refuse: 'Refusé' }[p.statut] || p.statut;
    var ret = p.publie ? (ETAT.retires || []).filter(function (x) { return x && x.id === p.publie; })[0] : null;
    return '<div class="carte" data-id="' + esc(p.id) + '"><h3>' + esc(p.titre || 'Sans titre') + ' <span class="etiq ' + esc(ret ? 'refuse' : p.statut) + '">' + esc(ret ? 'Retiré' : lib) + '</span></h3>' +
      (ret ? blocRetire(ret) : '') +
      '<div class="meta">' + esc(date(p.date)) + ' · ' + esc(NOMS[p.matiere] || p.matiere || '?') + (p.classe ? ' · ' + esc(p.classe) : '') + ' · ' + p.nb + ' questions' + (p.version ? ' · site ' + esc(p.version) : '') + (p.publie ? ' · publié sous « ' + esc(p.publie) + ' »' : '') + '</div>' +
      '<div class="actions">' +
      (p.statut === 'nouveau' ? '<button class="btn principal" data-a="relire">' + I('eye') + ' Relire et publier</button><button class="btn" data-a="refuser">' + I('x') + ' Refuser</button>'
        : p.statut === 'refuse' ? '<button class="btn" data-a="remettre">' + I('undo') + ' Remettre à relire</button><button class="btn danger" data-a="supprimer">' + I('trash') + ' Supprimer</button>'
          : '<button class="btn" data-a="relire">' + I('eye') + ' Revoir</button>') +
      '</div></div>';
  }
  function vuePropositions(c) {
    var P = ETAT.propositions, nouv = P.filter(function (p) { return p.statut === 'nouveau'; }), autres = P.filter(function (p) { return p.statut !== 'nouveau'; });
    var recep = ETAT.urlPropositions ? '' : '<div class="box"><p class="petit" style="margin:0">' + I('send') + ' La réception directe n\'est pas encore activée : les familles envoient leurs quiz par mail. Pour l\'activer, va dans <b>Réglages</b>.</p></div>';
    c.innerHTML = MSG + recep + '<div class="box"><h2>' + I('inbox') + 'À relire</h2>' +
      (nouv.length ? nouv.map(carteProp).join('') : '<p class="vide">Aucune proposition en attente.</p>') +
      '<div class="actions" style="margin-top:6px"><button class="btn" id="coller">' + I('plus') + ' Coller un quiz reçu par mail</button>' + (ETAT.feuille ? '<a class="btn" href="' + esc(ETAT.feuille) + '" target="_blank" rel="noopener">' + I('ext') + ' Ouvrir le tableau</a>' : '') + '</div></div>' +
      (autres.length ? '<div class="box"><details><summary>Déjà traitées (' + autres.length + ')</summary>' + autres.map(carteProp).join('') + '</details></div>' : '');
    $('coller').onclick = function () { edition = { texte: '', classes: [], nouveau: true }; afficher(); };
  }
  $('contenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var carte = e.target.closest('.carte'), id = carte && carte.dataset.id, a = b.dataset.a;
    if (onglet === 'propositions' && id) {
      var p = ETAT.propositions.filter(function (x) { return x.id === id; })[0]; if (!p) return;
      if (a === 'relire') { edition = depuisTexte(p.texte, p); afficher(); }
      else if (a === 'refuser' || a === 'remettre') { b.disabled = true; appel('apiStatut', [id, a === 'refuser' ? 'refuse' : 'nouveau'], function () { charger(); }); }
      else if (a === 'supprimer') confirmer(b, 'Toucher encore pour supprimer définitivement', function () { appel('apiSupprimerProposition', [id], function () { charger(); }); });
    }
    var rid = carte && carte.dataset.retire;
    if (onglet === 'bibliotheque' && rid && a === 'reintegrer') {
      b.disabled = true;
      appel('apiReintegrer', [rid], function () { BIB = null; info('Réintégré : le quiz est de nouveau dans la bibliothèque, et la mention « Retiré » disparaît chez les familles d\'ici une minute.'); vueBibliotheque($('contenu'), true); }, function (m) { b.disabled = false; erreur(m); });
    }
    if (onglet === 'bibliotheque' && rid && a === 'republier') {
      var r0 = (ETAT.retires || []).filter(function (x) { return x.id === rid; })[0] || { id: rid, titre: '' };
      b.disabled = true;
      appel('apiTexteBibliotheque', [rid], function (r) { edition = depuisTexte(r.texte, null); edition.id = rid; if (r0.titre) edition.titre = r0.titre; edition.remplacer = true; edition.verrou = true; afficher(); });
    }
    if (onglet === 'bibliotheque' && id) {
      var q = (BIB || []).filter(function (x) { return x.id === id; })[0]; if (!q) return;
      if (a === 'retirer') {
        if (carte.querySelector('.retrait')) return;
        var f = document.createElement('div'); f.className = 'retrait';
        f.innerHTML = '<label for="raison-' + esc(id) + '">Raison montrée aux familles qui l\'ont ajouté (facultatif)</label>' +
          '<input id="raison-' + esc(id) + '" maxlength="200" placeholder="ex. erreur dans une réponse">' +
          '<p class="petit">Le quiz quitte la bibliothèque, mais les familles qui l\'ont déjà ajouté le gardent, avec la mention « Retiré de la bibliothèque ». Tu pourras le réintégrer depuis la liste « Retirés ».</p>' +
          '<div class="actions"><button class="btn danger" data-a="retirer-ok">' + I('trash') + ' Retirer</button><button class="btn" data-a="retirer-non">Annuler</button></div>';
        carte.appendChild(f); f.querySelector('input').focus();
      }
      else if (a === 'retirer-non') { var f0 = carte.querySelector('.retrait'); if (f0) f0.remove(); }
      else if (a === 'retirer-ok') { var champ = carte.querySelector('.retrait input'); b.disabled = true; appel('apiRetirer', [id, champ ? champ.value : ''], function () { BIB = null; info('Retiré. Les familles qui l\'avaient ajouté verront « Retiré de la bibliothèque » dans leur onglet Quiz d\'ici une minute. Tu peux le réintégrer depuis la liste « Retirés » plus bas.'); vueBibliotheque($('contenu'), true); }, function (m) { b.disabled = false; erreur(m); }); }
      else if (a === 'modifier') { b.disabled = true; appel('apiTexteBibliotheque', [id], function (r) { edition = depuisTexte(r.texte, null); edition.id = q.id; edition.titre = q.titre; edition.matiere = q.matiere; edition.classes = q.classes || []; edition.icone = q.icone || ''; edition.description = q.description || ''; edition.remplacer = true; edition.verrou = true; afficher(); }); }
    }
  });

  /* éditeur : relecture d'une proposition (ou d'un quiz collé), puis publication dans la bibliothèque */
  function depuisTexte(texte, p) {
    var t = (String(texte).split('\n').filter(function (l) { return /^T\|/.test(l.trim()); })[0] || '').trim().split('|');
    var titre = (p && p.titre) || t[1] || '', matiere = String(t[3] || (p && p.matiere) || 'autre').toLowerCase();
    if (ETAT.matieres.indexOf(matiere) < 0) matiere = 'autre';
    return { texte: texte, proposition: p ? p.id : '', titre: titre, matiere: matiere, classes: p && p.classe ? [p.classe] : [], icone: t[4] || '', description: t[2] || '', id: slug(matiere + '-' + titre), deja: p && p.statut === 'publie' };
  }
  function editeur(c) {
    var e = edition;
    c.innerHTML = MSG + '<div class="box"><h2>' + I('eye') + (e.verrou ? 'Modifier un quiz de la bibliothèque' : e.nouveau ? 'Coller un quiz' : 'Relire la proposition') + '</h2>' +
      '<p class="petit">Vérifie : pas de prénom ni de détail personnel, des réponses justes, des questions claires pour un enfant. Tu peux corriger le texte directement.</p>' +
      '<label for="e-texte">Texte du quiz</label><textarea id="e-texte" rows="14">' + esc(e.texte) + '</textarea>' +
      '<div id="e-apercu"></div>' +
      '<div class="grille"><div><label for="e-titre">Titre</label><input id="e-titre" value="' + esc(e.titre) + '"></div>' +
      '<div><label for="e-id">Identifiant (adresse du fichier)</label><input id="e-id" value="' + esc(e.id) + '"' + (e.verrou ? ' readonly' : '') + '></div>' +
      '<div><label for="e-mat">Matière</label><select id="e-mat">' + ETAT.matieres.map(function (m) { return '<option value="' + m + '"' + (m === e.matiere ? ' selected' : '') + '>' + esc(NOMS[m] || m) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="e-ico">Icône (un emoji)</label><input id="e-ico" value="' + esc(e.icone) + '" maxlength="16"></div></div>' +
      '<label for="e-desc">Description (une phrase pour les parents)</label><input id="e-desc" value="' + esc(e.description) + '" maxlength="200">' +
      '<label>Classes</label><div class="classes">' + ETAT.classes.map(function (k) { return '<label><input type="checkbox" value="' + k + '"' + (e.classes.indexOf(k) >= 0 ? ' checked' : '') + '> ' + (k === 'adulte' ? 'Adulte' : k) + '</label>'; }).join('') + '</div>' +
      '<label style="font-weight:600"><input type="checkbox" id="e-remp"' + (e.remplacer ? ' checked' : '') + '> Remplacer le quiz qui porte déjà cet identifiant</label>' +
      '<div class="actions" style="margin-top:12px"><button class="btn principal" id="e-pub"' + (ETAT.jeton ? '' : ' disabled') + '>' + I('upload') + ' Publier dans la bibliothèque</button><button class="btn" id="e-ret">Retour</button></div>' +
      (ETAT.jeton ? '' : '<p class="petit">Pour publier, ajoute d\'abord le jeton GitHub dans l\'onglet <b>Réglages</b>.</p>') + '</div>';
    function apercu() {
      var q = questions($('e-texte').value);
      $('e-apercu').innerHTML = '<p class="petit" style="margin:6px 0 0">' + q.length + ' question' + (q.length > 1 ? 's' : '') + (q.length < 5 ? ' : un peu court' : '') + '</p><ol class="apercu">' + q.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
    }
    apercu(); $('e-texte').addEventListener('input', apercu);
    $('e-titre').addEventListener('input', function () { if (!e.verrou && !e.idModifie) $('e-id').value = slug($('e-mat').value + '-' + $('e-titre').value); });
    $('e-mat').addEventListener('change', function () { if (!e.verrou && !e.idModifie) $('e-id').value = slug($('e-mat').value + '-' + $('e-titre').value); });
    $('e-id').addEventListener('input', function () { e.idModifie = true; });
    $('e-ret').onclick = function () { edition = null; afficher(); };
    $('e-pub').onclick = function () {
      var b = $('e-pub'); b.disabled = true; b.innerHTML = 'Publication…';
      var d = { id: $('e-id').value.trim(), titre: $('e-titre').value, matiere: $('e-mat').value, icone: $('e-ico').value, description: $('e-desc').value, texte: $('e-texte').value, proposition: e.proposition || '', remplacer: $('e-remp').checked,
        classes: [].slice.call(document.querySelectorAll('.classes input:checked')).map(function (x) { return x.value; }) };
      appel('apiPublier', [d], function (r) {
        BIB = null; edition = null;
        charger(function () { onglet = 'bibliotheque'; ouvrir('bibliotheque'); info('« ' + d.titre + ' » est publié (' + r.nb + ' questions). Il apparaît dans la bibliothèque des sites d\'ici une minute.'); });
      }, function (m) { b.disabled = false; b.innerHTML = I('upload') + ' Publier dans la bibliothèque'; erreur(m); });
    };
  }

  /* message vu par les familles qui avaient ajouté un quiz retiré (onglet Quiz de leur espace parent) */
  function blocRetire(r) {
    return '<p class="petit" style="margin:4px 0 8px;padding:8px 10px;background:var(--rouge-c);border-radius:8px">Retiré de la bibliothèque' + (r.date ? ' le ' + esc(new Date(r.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })) : '') + '.<br>' +
      'Les familles qui l\'avaient ajouté le gardent et voient dans l\'onglet Quiz de leur espace parent : <b>« ⚠️ Retiré de la bibliothèque' + (r.raison ? ' : ' + esc(r.raison) : '') + ' »</b></p>';
  }

  /* ---------- Bibliothèque ---------- */
  function vueBibliotheque(c, garderMsg) {
    var msg = garderMsg && $('message') ? $('message').outerHTML : MSG;
    if (!BIB) {
      c.innerHTML = msg + '<p class="petit">Lecture de la bibliothèque sur GitHub…</p>';
      appel('apiBibliotheque', [], function (r) { BIB = r.quiz; ETAT.retires = r.retires || []; if (onglet === 'bibliotheque' && !edition) vueBibliotheque(c, true); }, function (m) { c.innerHTML = MSG; erreur(m); });
      return;
    }
    c.innerHTML = msg + '<div class="box"><h2>' + I('book') + 'Bibliothèque publiée (' + BIB.length + ')</h2>' +
      (BIB.length ? BIB.map(function (q) {
        return '<div class="carte" data-id="' + esc(q.id) + '"><h3>' + esc((q.icone ? q.icone + ' ' : '') + q.titre) + '</h3><div class="meta">' + esc(NOMS[q.matiere] || q.matiere) + ' · ' + esc((q.classes || []).join(', ')) + ' · ' + (q.nb || '?') + ' questions · ajouté le ' + esc(q.ajoute || '?') + '</div>' +
          (q.description ? '<p class="petit" style="margin:0 0 8px">' + esc(q.description) + '</p>' : '') +
          '<div class="actions"><button class="btn" data-a="modifier"' + (ETAT.jeton ? '' : ' disabled') + '>' + I('eye') + ' Modifier</button><a class="btn" href="https:\/\/leian.github.io/UNIVERSALQUIZ/bibliotheque/' + esc(q.id) + '.txt" target="_blank" rel="noopener">' + I('ext') + ' Texte</a><button class="btn danger" data-a="retirer"' + (ETAT.jeton ? '' : ' disabled') + '>' + I('trash') + ' Retirer</button></div></div>';
      }).join('') : '<p class="vide">La bibliothèque est vide.</p>') +
      '<div class="actions"><button class="btn" id="b-ajout">' + I('plus') + ' Ajouter un quiz à la main</button><button class="btn" id="b-maj">' + I('undo') + ' Actualiser</button></div></div>' +
      ((ETAT.retires || []).length ? '<div class="box"><h2>' + I('x') + 'Retirés de la bibliothèque (' + ETAT.retires.length + ')</h2>' +
        ETAT.retires.slice().reverse().map(function (r) {
          return '<div class="carte" data-retire="' + esc(r.id) + '"><h3>' + esc(r.titre || r.id) + ' <span class="etiq refuse">Retiré</span></h3>' + blocRetire(r) +
            '<div class="actions"><a class="btn" href="https:\/\/leian.github.io/UNIVERSALQUIZ/bibliotheque/' + esc(r.id) + '.txt" target="_blank" rel="noopener">' + I('ext') + ' Texte</a>' +
            (r.entree ? '<button class="btn principal" data-a="reintegrer"' + (ETAT.jeton ? '' : ' disabled') + '>' + I('undo') + ' Réintégrer</button>' : '') +
            '<button class="btn" data-a="republier"' + (ETAT.jeton ? '' : ' disabled') + '>' + I('eye') + ' Corriger et republier</button></div></div>';
        }).join('') + '</div>' : '');
    $('b-ajout').onclick = function () { edition = { texte: '', classes: [], nouveau: true }; afficher(); };
    $('b-maj').onclick = function () { BIB = null; vueBibliotheque(c); };
  }

  /* ---------- Invitations ---------- */
  function vueInvitations(c) {
    c.innerHTML = MSG + '<div class="box"><h2>' + I('mail') + 'Envoyer les invitations</h2><p class="petit">Depuis ce compte Gmail, avec le mail d\'invitation mis en forme (lu sur GitHub Pages).</p>' +
      '<label for="i-liste">Les amis, un par ligne</label><textarea id="i-liste" rows="6" placeholder="Lucie lucie@gmail.com&#10;Marc, marc.dupont@orange.fr&#10;sophie@gmail.com" style="font:inherit"></textarea>' +
      '<p class="petit">Le premier mot avant l\'adresse sert au « Bonjour Lucie, ». Sans prénom : « Bonjour, ».</p>' +
      '<div class="grille"><div><label for="i-sig">Signature, en bas du mail</label><input id="i-sig" maxlength="80" placeholder="ex. Yan" value="' + esc(ETAT.signature) + '"></div>' +
      '<div><label for="i-nom">Nom de l\'expéditeur</label><input id="i-nom" maxlength="60" placeholder="ex. Yan (SoccaQuiz)" value="' + esc(ETAT.nom) + '"></div></div>' +
      '<div class="actions" style="margin-top:12px"><button class="btn principal" id="i-env">' + I('send') + ' Envoyer les invitations</button><button class="btn" id="i-essai">M\'envoyer un essai</button><a class="btn" href="https:\/\/leian.github.io/UNIVERSALQUIZ/invitation.html" target="_blank" rel="noopener">' + I('eye') + ' Voir le mail</a></div>' +
      '<p class="petit" id="i-quota">' + (ETAT.quota != null ? 'Gmail autorise encore ' + ETAT.quota + ' envoi(s) aujourd\'hui depuis ce compte.' : '') + '</p></div><div id="i-res" aria-live="polite"></div>';
    function envoyer(essai) {
      if (!essai && !$('i-liste').value.trim()) return erreur('Écris au moins une adresse.');
      $('i-env').disabled = $('i-essai').disabled = true; $('i-res').innerHTML = '<p class="petit">Envoi en cours…</p>';
      var fin = function (r, m) {
        $('i-env').disabled = $('i-essai').disabled = false;
        var l = ((r && r.lignes) || []).map(function (x) { return '<li class="' + (x.ok ? 'ok' : 'ko') + '">' + (x.ok ? 'Envoyé : ' : 'Erreur : ') + esc(x.prenom ? x.prenom + ' — ' + x.email : (x.email || x.ligne)) + (x.erreur ? ' (' + esc(x.erreur) + ')' : '') + '</li>'; }).join('');
        var n = ((r && r.lignes) || []).filter(function (x) { return x.ok; }).length;
        $('i-res').innerHTML = '<div class="box">' + (m ? '<p class="ko">' + esc(m) + '</p>' : '<p class="ok"><b>' + n + ' invitation(s) envoyée(s).</b></p>') + '<ul>' + l + '</ul></div>';
        if (!m && !essai) $('i-liste').value = ((r && r.lignes) || []).filter(function (x) { return !x.ok; }).map(function (x) { return x.ligne; }).join('\n');
        if (r && r.quota != null) { ETAT.quota = r.quota; $('i-quota').textContent = 'Gmail autorise encore ' + r.quota + ' envoi(s) aujourd\'hui depuis ce compte.'; }
        ETAT.signature = $('i-sig').value; ETAT.nom = $('i-nom').value;
      };
      appel('apiEnvoyer', [{ liste: $('i-liste').value, signature: $('i-sig').value, nom: $('i-nom').value, essai: essai }], function (r) { fin(r); }, function (m, r) { fin(r, m); });
    }
    $('i-env').onclick = function () { envoyer(false); };
    $('i-essai').onclick = function () { envoyer(true); };
  }

  /* ---------- Liens ---------- */
  /* raccourcis : copier le code à recoller, ouvrir le programme Apps Script, rappel des déploiements */
  var CODES = { installateur: { fichier: 'en-ligne/Code.gs' }, console: { fichier: 'console/Code.gs' } };
  function chargerCode(k, relire) {
    var x = CODES[k]; if (x.charge || (x.texte && !relire)) return;   /* en cours, ou déjà lu (relu à chaque ouverture de l'onglet) */
    x.charge = true;
    fetch('https:\/\/raw.githubusercontent.com/leian/UNIVERSALQUIZ/main/' + x.fichier + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) { x.texte = t; x.charge = false; var e = $('code-' + k); if (e) e.textContent = etatCode(k); })
      .catch(function () { x.charge = false; var e = $('code-' + k); if (e) e.textContent = 'GitHub ne répond pas : utilise « Voir sur GitHub ».'; });
  }
  function etatCode(k) {
    var x = CODES[k]; if (!x.texte) return 'lecture sur GitHub…';
    var rep = (x.texte.match(/INSTALLATEUR_V = '([^']+)'/) || [])[1];   /* repère affiché en bas de la page de l'installateur */
    return 'prêt (' + x.texte.split('\n').length + ' lignes' + (rep ? ', repère « ' + rep + ' » : à retrouver en bas de l\'installateur après Nouvelle version' : '') + ')';
  }
  function copierCode(k) {
    var x = CODES[k], e = $('code-' + k);
    if (!x.texte) { if (e) e.textContent = 'Encore en lecture sur GitHub… réessaie dans une seconde.'; chargerCode(k); return; }
    var ok = false, ta = document.createElement('textarea');
    ta.value = x.texte; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (err) {}
    ta.remove();
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(x.texte).then(function () { if (e) e.textContent = '✅ copié : colle-le dans le projet (Ctrl+A, Ctrl+V), puis Enregistrer.'; }, function () { if (e) e.textContent = 'Copie refusée par le navigateur : utilise « Voir sur GitHub » → « Copy raw file ».'; });
    else if (e) e.textContent = ok ? '✅ copié : colle-le dans le projet (Ctrl+A, Ctrl+V), puis Enregistrer.' : 'Copie refusée par le navigateur : utilise « Voir sur GitHub » → « Copy raw file ».';
  }
  function raccourcis() {
    var gh = function (f) { return 'https:\/\/github.com/leian/UNIVERSALQUIZ/blob/main/' + f; };
    var bouton = function (href, ic, txt, cls) { return '<a class="btn' + (cls ? ' ' + cls : '') + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + I(ic) + ' ' + txt + '</a>'; };
    var projetI = ETAT.projetInstallateur
      ? bouton(ETAT.projetInstallateur, 'ext', 'Ouvrir son programme Apps Script') + ' <button class="btn" data-l="changer-projet">' + I('settings') + ' Changer</button>'
      : '<span class="petit" style="display:block;margin-top:6px">Une seule fois : ouvre le projet de l\'installateur dans Apps Script, copie l\'adresse de la page et colle-la ici.</span><div class="actions"><input id="projet-i" placeholder="https:\/\/script.google.com/home/projects/…/edit" style="flex:1;min-width:220px"><button class="btn" data-l="projet">' + I('check') + ' Enregistrer</button></div>';
    return '<div class="box"><h2>' + I('upload') + 'Mettre à jour le code (raccourcis)</h2>' +
      '<div class="carte"><h3>Installateur <span class="etiq">en-ligne/Code.gs</span></h3>' +
        '<div class="actions"><button class="btn principal" data-l="copier" data-k="installateur">' + I('upload') + ' Copier le code</button>' + bouton(gh('en-ligne/Code.gs'), 'ext', 'Voir sur GitHub') + (ETAT.projetInstallateur ? projetI : '') + '</div>' +
        (ETAT.projetInstallateur ? '' : projetI) +
        '<p class="petit" style="margin:6px 0 0">Code : <span id="code-installateur">' + etatCode('installateur') + '</span><br>Ensuite : Déployer → Gérer les déploiements → « <b>Install officielle</b> » → ✏️ → Nouvelle version → Déployer.</p></div>' +
      '<div class="carte"><h3>Console <span class="etiq">console/Code.gs</span></h3>' +
        '<div class="actions"><button class="btn principal" data-l="copier" data-k="console">' + I('upload') + ' Copier le code</button>' + bouton(gh('console/Code.gs'), 'ext', 'Voir sur GitHub') + (ETAT.projetConsole ? bouton(ETAT.projetConsole, 'ext', 'Ouvrir son programme Apps Script') : '') + '</div>' +
        '<p class="petit" style="margin:6px 0 0">Code : <span id="code-console">' + etatCode('console') + '</span></p>' +
        '<p class="message" style="margin:8px 0 0">⚠️ Après le collage : Nouvelle version des <b>deux</b> déploiements, « <b>Console</b> » <b>et</b> « <b>Propositions</b> ». Sans « Propositions », les quiz proposés, erreurs, demandes d\'aide et compteurs envoyés par les familles sont refusés.</p></div>' +
      '<div class="actions">' + bouton('https:\/\/github.com/leian/UNIVERSALQUIZ/actions/workflows/publier.yml', 'tag', 'Publier une version du site') + bouton('https:\/\/script.google.com/home', 'ext', 'Mes projets Apps Script') + '</div></div>';
  }
  $('contenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-l]'); if (!b || onglet !== 'liens') return;
    if (b.dataset.l === 'copier') copierCode(b.dataset.k);
    else if (b.dataset.l === 'changer-projet') { ETAT.projetInstallateur = ''; afficher(); }
    else if (b.dataset.l === 'projet') { b.disabled = true; appel('apiProjetInstallateur', [$('projet-i').value], function (r) { ETAT.projetInstallateur = r.lien; afficher(); }, function (m) { b.disabled = false; erreur(m); }); }
  });
  function vueLiensAvant() { chargerCode('installateur', true); chargerCode('console', true); }   /* toujours la dernière version de GitHub */
  function vueLiens(c) {
    vueLiensAvant();
    c.innerHTML = MSG + raccourcis() + '<p class="petit">Ouvre les pages Google avec le compte soccaquiz, et GitHub avec le compte leian.</p>' + LIENS.map(function (s) {
      return '<div class="box liens"><h2>' + I('link') + esc(s[0]) + '</h2><ul>' + s[1].map(function (l) { return '<li><a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + '</a>' + (l[2] ? '<span class="d">' + esc(l[2]) + '</span>' : '') + '</li>'; }).join('') + '</ul></div>';
    }).join('');
  }

  /* ---------- Versions ---------- */
  function vueVersions(c) {
    c.innerHTML = MSG + '<div class="box"><h2>' + I('tag') + 'Versions publiées</h2><div id="v-liste"><p class="petit">Lecture sur GitHub…</p></div>' +
      '<div class="actions" style="margin-top:8px"><a class="btn principal" href="https:\/\/github.com/leian/UNIVERSALQUIZ/actions/workflows/publier.yml" target="_blank" rel="noopener">' + I('ext') + ' Publier une nouvelle version</a><a class="btn" href="https:\/\/github.com/leian/UNIVERSALQUIZ/releases" target="_blank" rel="noopener">' + I('ext') + ' Toutes les versions</a></div>' +
      '<p class="petit">Chaque famille voit « nouvelle version disponible » dans son espace parent, puis touche « Mettre à jour mon site ».</p></div>';
    appel('apiVersions', [], function (r) {
      $('v-liste').innerHTML = '<ul style="padding-left:20px;margin:0">' + r.versions.map(function (v, i) { return '<li><a href="' + esc(v.url) + '" target="_blank" rel="noopener"><b>' + esc(v.tag) + '</b></a> · ' + esc(date(v.date)) + (v.pre ? ' · <span class="etiq">essai</span>' : i === 0 ? ' · <span class="etiq publie">en service</span>' : '') + '</li>'; }).join('') + '</ul>';
    }, function (m) { $('v-liste').innerHTML = '<p class="ko">' + esc(m) + '</p>'; });
  }

  /* ---------- Réglages ---------- */
  function vueReglages(c) {
    c.innerHTML = MSG + '<div class="box"><h2>' + I('key') + 'Jeton GitHub</h2>' +
      (ETAT.jeton ? '<p class="ok"><b>Jeton enregistré</b> : la console peut publier dans la bibliothèque.</p>' : '<p>Sans jeton, la console ne peut pas publier. À créer une seule fois, avec le compte GitHub <b>leian</b> :</p>') +
      '<ol class="etapes"><li>Ouvre <a href="https:\/\/github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Fine-grained token</a>.</li>' +
      '<li>Nom : <code>Console SoccaQuiz</code>. Expiration : la plus longue proposée (la console te prévient quand il expire).</li>' +
      '<li>Repository access : <b>Only select repositories</b> → <code>leian/UNIVERSALQUIZ</code>.</li>' +
      '<li>Permissions → Repository permissions → <b>Contents : Read and write</b> (rien d\'autre).</li>' +
      '<li><b>Generate token</b>, copie-le (il commence par <code>github_pat_</code>) et colle-le ici.</li></ol>' +
      '<label for="r-jeton">Jeton</label><input id="r-jeton" type="password" autocomplete="off" placeholder="' + (ETAT.jeton ? 'Jeton enregistré (colle un nouveau jeton pour le remplacer)' : 'github_pat_…') + '">' +
      '<div class="actions" style="margin-top:10px"><button class="btn principal" id="r-ok">' + I('check') + ' Enregistrer</button>' + (ETAT.jeton ? '<button class="btn danger" id="r-suppr">' + I('trash') + ' Effacer le jeton</button>' : '') + '</div></div>' +
      '<div class="box"><h2>' + I('send') + 'Réception directe des propositions</h2>' +
      '<p>' + (ETAT.urlPropositions ? '<span class="ok"><b>Activée</b></span> : le bouton « Envoyer à SoccaQuiz » des sites dépose les quiz dans l\'onglet Propositions.' : 'Pas encore activée : les familles envoient leurs quiz par mail.') + '</p>' +
      '<ol class="etapes"><li>Dans ce projet Apps Script : <b>Déployer → Nouveau déploiement</b> → Application web, Exécuter en tant que <b>Moi</b>, Accès <b>Tout le monde</b>, description « Propositions ».</li><li>Copie l\'adresse du déploiement et colle-la ici.</li></ol>' +
      '<label for="r-url">Adresse du déploiement « Propositions »</label><input id="r-url" value="' + esc(ETAT.urlPropositions) + '" placeholder="https:\/\/script.google.com/macros/s/…/exec">' +
      '<div class="actions" style="margin-top:10px"><button class="btn principal" id="r-url-ok"' + (ETAT.jeton ? '' : ' disabled') + '>' + I('check') + ' Activer</button>' + (ETAT.urlPropositions ? '<button class="btn danger" id="r-url-off">' + I('x') + ' Couper la réception</button>' : '') + '</div>' +
      (ETAT.jeton ? '' : '<p class="petit">Le jeton GitHub est nécessaire : l\'adresse est publiée dans docs/soccaquiz.json, que lisent les sites.</p>') + '</div>' +
      '<div class="box"><h2>' + I('key') + 'Bilan du relais</h2>' +
      (ETAT.jetonRelais ? '<p class="ok"><b>Relié</b> : l\'onglet Statistiques affiche les familles inscrites et actives.</p>' : '<p>Pour afficher dans l\'onglet Statistiques les familles inscrites et actives (des totaux seulement), la console et le relais partagent un jeton secret :</p>') +
      '<ol class="etapes"><li>Clique sur <b>Créer un jeton</b>, puis sur <b>Copier</b>.</li>' +
      '<li>Ouvre <a href="https:\/\/dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noopener">Cloudflare → Workers & Pages</a> (compte soccaquiz) → <code>soccaquiz-relais</code> → <b>Settings</b> → <b>Variables and Secrets</b> → <b>Add</b> : type <b>Secret</b>, nom <code>JETON_CONSOLE</code>, valeur : colle le jeton → <b>Deploy</b>.</li>' +
      '<li>Reviens ici et clique sur <b>Enregistrer</b> : la console vérifie que le relais le reconnaît.</li></ol>' +
      '<details><summary>En cas de souci (à lire avant de toucher à Cloudflare)</summary><ul class="etapes">' +
      '<li><b>« Another variable with this name already exists »</b> : <code>JETON_CONSOLE</code> existe déjà (ajouté lors d\'un essai précédent). Ferme la fenêtre (<b>Cancel</b>), repère la ligne <code>JETON_CONSOLE</code> dans <b>Variables and Secrets</b> : si son type est <b>Variable</b>, supprime-la (poubelle de <b>cette ligne seulement</b>) et ajoute-la de nouveau en cochant <b>Secret</b> ; si c\'est déjà un <b>Secret</b>, clique sur le crayon et colle le jeton actuel.</li>' +
      '<li><b>Toujours le type Secret</b>, jamais Variable : une variable ordinaire est lisible par tous ceux qui ouvrent le tableau de bord.</li>' +
      '<li><b>Ne jamais supprimer ni modifier <code>CLE_CHIFFREMENT</code></b> : sans elle, les données de toutes les familles deviennent illisibles, pour de bon. Ne touche pas non plus à <code>GOOGLE_CLIENT_SECRET</code> ni à <code>GOOGLE_CLIENT_ID</code> (connexion Google des familles).</li>' +
      '<li><b>« Le relais ne reconnaît pas ce jeton »</b> : seul le <b>dernier</b> jeton créé ici compte. Si tu as cliqué plusieurs fois sur « Créer un jeton », recopie celui qui est dans le champ et remplace la valeur dans Cloudflare (crayon), puis attends quelques secondes avant <b>Enregistrer</b>. Si tu l\'as perdu : crée-en un nouveau, remplace-le dans Cloudflare, enregistre.</li>' +
      '<li><b>Le relais affiche « Introuvable »</b> (bouton <b>Visit</b> de Cloudflare, ou adresse du Worker ouverte telle quelle) : c\'est normal, il n\'a pas de page d\'accueil. Pour savoir s\'il marche, ouvre <a href="https:\/\/soccaquiz-relais.soccaquiz.workers.dev/sante" target="_blank" rel="noopener">/sante</a> : il doit répondre <code>{"ok":true}</code>.</li>' +
      '<li><b>Changer de jeton</b> (par prudence, ou s\'il a été vu par quelqu\'un) : « Créer un jeton » → crayon de <code>JETON_CONSOLE</code> dans Cloudflare → colle → Deploy → <b>Enregistrer</b> ici. L\'ancien ne marche plus aussitôt.</li>' +
      '<li><b>Délier</b> (bouton ci-dessous) : la console ne lit plus le bilan ; pour que le relais n\'accepte plus aucun jeton, supprime aussi la ligne <code>JETON_CONSOLE</code> dans Cloudflare.</li>' +
      '</ul></details>' +
      '<label for="r-relais">Jeton du relais</label><input id="r-relais" autocomplete="off" placeholder="' + (ETAT.jetonRelais ? 'Jeton enregistré (crée-en un nouveau pour le remplacer)' : 'Clique sur « Créer un jeton »') + '">' +
      '<div class="actions" style="margin-top:10px"><button class="btn" id="r-relais-creer">' + I('key') + ' Créer un jeton</button><button class="btn" id="r-relais-copier">Copier</button><button class="btn principal" id="r-relais-ok">' + I('check') + ' Enregistrer</button>' + (ETAT.jetonRelais ? '<button class="btn danger" id="r-relais-suppr">' + I('trash') + ' Délier</button>' : '') + '</div></div>';
    $('r-relais-creer').onclick = function () { var a = new Uint8Array(32); crypto.getRandomValues(a); $('r-relais').value = Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); };
    $('r-relais-copier').onclick = function () { var v = $('r-relais').value; if (!v) return erreur('Crée d\'abord un jeton.'); try { navigator.clipboard.writeText(v).then(function () { info('Jeton copié : colle-le dans Cloudflare (secret JETON_CONSOLE).'); }, function () { $('r-relais').select(); info('Sélectionné : copie-le avec Ctrl+C.'); }); } catch (e) { $('r-relais').select(); info('Sélectionné : copie-le avec Ctrl+C.'); } };
    $('r-relais-ok').onclick = function () { var v = $('r-relais').value.trim(); if (!v) return erreur('Crée d\'abord un jeton.'); this.disabled = true; appel('apiJetonRelais', [v], function () { charger(function () { vueReglages(c); info('Relais relié : ouvre l\'onglet Statistiques.'); }); }, function (m) { $('r-relais-ok').disabled = false; erreur(m); }); };
    if ($('r-relais-suppr')) $('r-relais-suppr').onclick = function () { confirmer(this, 'Toucher encore pour délier', function () { appel('apiJetonRelais', [''], function () { charger(function () { vueReglages(c); }); }); }); };
    $('r-ok').onclick = function () { var v = $('r-jeton').value.trim(); if (!v) return erreur('Colle le jeton.'); this.disabled = true; appel('apiJeton', [v], function () { charger(function () { vueReglages(c); info('Jeton enregistré et vérifié.'); }); }, function (m) { $('r-ok').disabled = false; erreur(m); }); };
    if ($('r-suppr')) $('r-suppr').onclick = function () { confirmer(this, 'Toucher encore pour effacer le jeton', function () { appel('apiJeton', [''], function () { charger(function () { vueReglages(c); }); }); }); };
    $('r-url-ok').onclick = function () { this.disabled = true; appel('apiUrlPropositions', [$('r-url').value], function () { charger(function () { vueReglages(c); info('Réception activée : les sites la proposeront d\'ici une minute.'); }); }, function (m) { $('r-url-ok').disabled = false; erreur(m); }); };
    if ($('r-url-off')) $('r-url-off').onclick = function () { confirmer(this, 'Toucher encore pour couper (retour au mail)', function () { appel('apiUrlPropositions', [''], function () { charger(function () { vueReglages(c); }); }); }); };
  }

  charger();
}
