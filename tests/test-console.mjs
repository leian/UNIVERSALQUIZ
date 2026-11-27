/* Test de la console de l'éditeur (console/Code.gs) : propositions, publication sur GitHub (simulé),
   invitations, accès réservé. Usage : node tests/test-console.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + '[console] ' + m); if (!c) echecs++; };

// faux Google Sheets (une feuille)
const lignes = [];
const feuille = {
  appendRow: r => lignes.push(r.slice()),
  getDataRange: () => ({ getValues: () => lignes.map(r => r.slice()) }),
  getRange: (l, c) => ({ setValue: v => { lignes[l - 1][c - 1] = v; } }),
  deleteRow: l => lignes.splice(l - 1, 1)
};
const ss = { getId: () => 'feuille123', getSheets: () => [feuille] };
feuille.getParent = () => ss;
// onglet « Erreurs » (créé par la console)
const lignesE = [];
const feuilleE = {
  appendRow: r => lignesE.push(r.slice()),
  getDataRange: () => ({ getValues: () => lignesE.map(r => r.slice()) }),
  getLastRow: () => lignesE.length,
  getRange: (l, c, nl, nc) => ({ setValue: v => { lignesE[l - 1][c - 1] = v; }, getValues: () => lignesE.slice(l - 1, l - 1 + nl).map(r => r.slice(c - 1, c - 1 + nc)) }),
  deleteRow: l => lignesE.splice(l - 1, 1)
};
let ongletE = false;
// onglet « Aide » (demandes d'aide des familles)
const lignesA = [];
const feuilleA = {
  appendRow: r => lignesA.push(r.slice()),
  getDataRange: () => ({ getValues: () => lignesA.map(r => r.slice()) }),
  getLastRow: () => lignesA.length,
  getRange: (l, c, nl, nc) => ({ setValue: v => { lignesA[l - 1][c - 1] = v; }, setValues: vs => { vs[0].forEach((v, i) => { lignesA[l - 1][c - 1 + i] = v; }); }, getValues: () => lignesA.slice(l - 1, l - 1 + nl).map(r => r.slice(c - 1, c - 1 + nc)) }),
  deleteRow: l => lignesA.splice(l - 1, 1)
};
let ongletA = false;
// onglet « Statistiques » (compteurs anonymes de l'installateur)
const lignesS = [];
const feuilleS = {
  appendRow: r => lignesS.push(r.slice()),
  getLastRow: () => lignesS.length,
  getRange: (l, c, nl, nc) => ({ getValues: () => lignesS.slice(l - 1, l - 1 + nl).map(r => r.slice(c - 1, c - 1 + nc)) })
};
let ongletS = false, archiveS = null;
const MONITORING = []; let monitoringEtat = 'off';
feuilleS.setName = n => { archiveS = { nom: n, lignes: lignesS.splice(0) }; ongletS = false; };
ss.getSheetByName = n => n === 'Erreurs' && ongletE ? feuilleE : n === 'Aide' && ongletA ? feuilleA : n === 'Statistiques' && ongletS ? feuilleS : null;
ss.insertSheet = n => { if (n === 'Aide') { ongletA = true; return feuilleA; } if (n === 'Statistiques') { ongletS = true; return feuilleS; } ongletE = true; return feuilleE; };
// faux GitHub (API contents)
const depot = { 'docs/bibliotheque/index.json': JSON.stringify({ version: 1, quiz: [{ id: 'anglais-x', titre: 'X', matiere: 'anglais', classes: ['CM1'], nb: 5, ajoute: '2026-11-01' }] }), 'docs/bibliotheque/anglais-x.txt': 'T|X\nQ|a|b|c\n', 'docs/soccaquiz.json': '{}' };
const commits = [];
let jetonValide = true;
const props = {}, uprops = {}, cache = {};
let actif = 'soccaquiz@gmail.com', quota = 100;
const envoyes = [];
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const ctx = {
  console,
  ScriptApp: { getScriptId: () => 'ID-CONSOLE-0123456789abcdef', getOAuthToken: () => 'jeton-oauth' },
  Session: { getActiveUser: () => ({ getEmail: () => actif }), getEffectiveUser: () => ({ getEmail: () => 'soccaquiz@gmail.com' }) },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }),
    getUserProperties: () => ({ getProperty: k => uprops[k] ?? null, setProperty: (k, v) => { uprops[k] = v; } })
  },
  SpreadsheetApp: { create: () => ss, openById: id => { if (id !== 'feuille123') throw new Error('x'); return ss; } },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: {
    getUuid: () => Math.random().toString(16).slice(2) + 'abcdef12',
    base64Encode: s => b64(s), base64EncodeWebSafe: s => b64(s).replace(/\+/g, '-').replace(/\//g, '_'), base64Decode: s => Buffer.from(s, 'base64'),
    newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    Charset: { UTF_8: 'UTF-8' },
    formatDate: () => '2026-11-15'
  },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  HtmlService: { createHtmlOutput: h => { const o = { h, setTitle: () => o, setFaviconUrl: () => o, addMetaTag: () => o }; return o; } },
  MailApp: { getRemainingDailyQuota: () => quota, sendEmail: m => { envoyes.push(m); quota--; } },
  UrlFetchApp: {
    fetch: (url, o = {}) => {
      const rep = (code, j) => ({ getResponseCode: () => code, getContentText: () => typeof j === 'string' ? j : JSON.stringify(j) });
      if (url.startsWith('https://leian.github.io/UNIVERSALQUIZ/invitation.html')) return rep(200, readFileSync(join(RACINE, 'docs', 'invitation.html'), 'utf8'));
      if (url.startsWith('https://monitoring.googleapis.com/v3/projects/soccaquiz/timeSeries?')) {
        MONITORING.push({ url, o });
        if (monitoringEtat === 'off') return rep(403, { error: { message: 'Cloud Monitoring API has not been used in project 123 before or it is disabled.' } });
        const q = new URL(url).searchParams;
        if (q.get('aggregation.alignmentPeriod') === '86400s') return rep(200, { timeSeries: [
          { metric: { labels: { response_code: '200' } }, points: [{ interval: { endTime: '2026-11-25T12:00:00Z' }, value: { int64Value: '1200' } }, { interval: { endTime: '2026-11-24T12:00:00Z' }, value: { int64Value: '800' } }] },
          { metric: { labels: { response_code: '429' } }, points: [{ interval: { endTime: '2026-11-25T12:00:00Z' }, value: { int64Value: '3' } }] },
          { metric: { labels: { response_code: '404' } }, points: [{ interval: { endTime: '2026-11-24T12:00:00Z' }, value: { int64Value: '5' } }] }] });
        return rep(200, { timeSeries: [{ points: [{ interval: { endTime: '2026-11-25T08:01:00Z' }, value: { int64Value: '42' } }, { interval: { endTime: '2026-11-25T08:02:00Z' }, value: { int64Value: '7' } }] }] });
      }
      if (url === 'https://soccaquiz-relais.soccaquiz.workers.dev/bilan') return (o.headers || {}).Authorization === 'Bearer ' + 'k'.repeat(64)
        ? rep(200, { ok: true, t: 1, familles: 5, enfants: 8, parFamille: { '1': 3, '2': 1, '3': 0, '4+': 1, '<x>': 9 }, actives7: 2, actives30: 4, semaines: [{ semaine: '2026-11-23', n: 3 }, { semaine: '<x>', n: 9 }], drive: { jours: [{ jour: '2026-11-25', appels: 1203, refus: 3, erreurs: 0 }, { jour: '2026-11-24', appels: 805, refus: 0, erreurs: 5 }, { jour: '<x>', appels: 99999 }], pointeMinute: 42, pointeA: '2026-11-25T08:01:00.000Z' } }) : rep(404, { erreur: 'Introuvable.' });
      const m = url.match(/^https:\/\/api\.github\.com\/repos\/leian\/UNIVERSALQUIZ(.*)$/);
      if (!m) return rep(404, {});
      if (o.headers && o.headers.Authorization && !jetonValide) return rep(401, { message: 'Bad credentials' });
      const chemin = m[1];
      if (chemin === '') return rep(200, { permissions: { push: true } });
      if (chemin.startsWith('/releases')) return rep(200, [{ tag_name: 'v2.57', published_at: '2026-11-15T12:00:00Z', prerelease: false, html_url: 'u' }]);
      const f = chemin.replace(/^\/contents\//, '').replace(/\?.*$/, '');
      if ((o.method || 'get') === 'get') return depot[f] == null ? rep(404, {}) : rep(200, { sha: 'sha-' + f, content: b64(depot[f]).replace(/(.{60})/g, '$1\n') });
      const corps = JSON.parse(o.payload);
      if (depot[f] != null && corps.sha !== 'sha-' + f) return rep(409, { message: 'sha manquant' });
      depot[f] = Buffer.from(corps.content, 'base64').toString('utf8'); commits.push({ f, message: corps.message, auth: !!o.headers.Authorization });
      return rep(200, {});
    }
  }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(RACINE, 'console', 'Code.gs'), 'utf8'), ctx);

const QUIZ = 'T|Listen and repeat|Écoute puis répète|anglais|🎧|🦜\n## Se présenter|👋\nP|Écoute, puis répète.|Hello, my name is Lana.\nQ|Que veut dire…|J\'ai dix ans.|J\'ai deux ans.|Tu as dix ans.|Bien.|dire=I am ten years old.\nS|Écris : I like ___ .|cats|Chats.|dire=I like cats.\nM|Point';

// 1. réception (accès anonyme)
actif = '';
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);
const r1 = post({ type: 'proposition', titre: 'Listen and repeat', classe: 'CM1', texte: QUIZ, version: 'v2.57' });
ok(r1.ok && lignes.length === 2 && lignes[1][2] === 'nouveau' && lignes[1][4] === 'CM1' && lignes[1][5] === 'anglais' && lignes[1][6] === 3, 'proposition reçue sans compte : rangée « nouveau » avec classe, matière et nombre de questions');
ok(post({ type: 'proposition', texte: QUIZ }).deja && lignes.length === 2, 'même quiz envoyé deux fois : gardé une seule fois');
ok(post({ type: 'proposition', texte: 'bonjour, voici du texte quelconque sans quiz dedans du tout' }).erreur && post({ type: 'autre' }).erreur && post({ type: 'proposition', classe: '<b>', texte: QUIZ + '\nQ|x|y|z' }).ok && lignes[2][4] === '', 'texte qui n\'est pas un quiz refusé ; classe inconnue ignorée');
for (let i = 0; i < 25; i++) post({ type: 'proposition', texte: QUIZ + '\nQ|n' + i + '|y|z' });
ok(/Trop d'envois/.test(post({ type: 'proposition', texte: QUIZ + '\nQ|fin|y|z' }).erreur), 'envois en rafale : 20 par tranche de 10 minutes');
lignes.splice(4);   // on garde 3 propositions

// 2. accès réservé
let refus = ''; try { ctx.apiEtat(); } catch (e) { refus = e.message; }
const pagePublique = ctx.doGet().h;
ok(/Réservé/.test(refus) && !/apiEtat/.test(pagePublique) && /reçoit les quiz/.test(pagePublique), 'sans compte : console refusée, page neutre');
actif = 'autre@gmail.com';
refus = ''; try { ctx.apiPublier({}); } catch (e) { refus = e.message; }
ok(/Réservé/.test(refus), 'autre compte Google : refusé');
actif = 'soccaquiz@gmail.com';
const page = ctx.doGet().h;
const script = page.slice(page.indexOf('<script>') + 8, page.lastIndexOf('</script>'));
let syntaxe = true; try { new vm.Script(script); } catch (e) { syntaxe = e.message; }
ok(/apiEtat/.test(page) && syntaxe === true && !/\/\//.test(script.replace(/https:\\\/\\\//g, '')), 'console servie à l\'éditeur : script valide, sans « // » (piège Apps Script) — ' + syntaxe);

// 3. état, statut
const e = ctx.apiEtat();
ok(e.propositions.length === 3 && !e.jeton && e.feuille.includes('feuille123'), 'état : 3 propositions, pas encore de jeton');
const idProp = lignes[1][0];
ctx.apiStatut(idProp, 'refuse'); const st1 = lignes[1][2]; ctx.apiStatut(idProp, 'nouveau');
ok(st1 === 'refuse' && lignes[1][2] === 'nouveau' && ctx.apiStatut(idProp, 'publie').erreur, 'refuser, remettre à relire ; statut « publié » réservé à la publication');

// 4. jeton et publication
ok(/Ajoute d'abord le jeton/.test(ctx.apiPublier({ id: 'x-y', titre: 't', texte: QUIZ, classes: ['CM1'] }).erreur), 'sans jeton : publication refusée');
ok(/github_pat_/.test(ctx.apiJeton('mauvais').erreur), 'jeton mal formé refusé');
jetonValide = false;
ok(/refusé ou a expiré/.test(ctx.apiJeton('github_pat_' + 'a'.repeat(40)).erreur) && !props.GITHUB_JETON, 'jeton refusé par GitHub : pas enregistré');
jetonValide = true;
ok(ctx.apiJeton('github_pat_' + 'a'.repeat(40)).ok && props.GITHUB_JETON, 'jeton vérifié puis enregistré');
ok(/identifiant/i.test(ctx.apiPublier({ id: 'Mauvais ID', titre: 't', texte: QUIZ, classes: ['CM1'] }).erreur) && /classe/.test(ctx.apiPublier({ id: 'ok-id', titre: 't', texte: QUIZ, classes: [] }).erreur) && /3 questions/.test(ctx.apiPublier({ id: 'ok-id', titre: 't', texte: 'T|x\nQ|a|b', classes: ['CM1'] }).erreur), 'contrôles : identifiant, classes, au moins 3 questions');
const pub = ctx.apiPublier({ id: 'anglais-listen-and-repeat', titre: 'Listen and repeat', matiere: 'anglais', classes: ['CM1', 'CM2', 'zz'], icone: '🎧', description: 'Écouter, répéter.', texte: QUIZ, proposition: idProp });
const index = JSON.parse(depot['docs/bibliotheque/index.json']);
ok(pub.ok && pub.nb === 3 && depot['docs/bibliotheque/anglais-listen-and-repeat.txt'].startsWith('T|Listen and repeat') && index.quiz[0].id === 'anglais-listen-and-repeat' && index.quiz[0].classes.join() === 'CM1,CM2' && index.quiz[0].ajoute === '2026-11-15' && index.quiz.length === 2 && commits.every(c => c.auth),
  'publier : fichier .txt et entrée en tête de index.json écrits sur GitHub avec le jeton (accents compris)');
ok(lignes[1][2] === 'publie' && lignes[1][9] === 'anglais-listen-and-repeat', 'proposition marquée publiée, avec son identifiant');
ok(ctx.apiPublier({ id: 'anglais-listen-and-repeat', titre: 'Autre', classes: ['CM1'], texte: QUIZ }).existe, 'identifiant déjà pris : refusé sans « Remplacer »');
ok(ctx.apiPublier({ id: 'anglais-listen-and-repeat', titre: 'Listen 2', matiere: 'anglais', classes: ['CM1'], texte: QUIZ, remplacer: true }).ok && JSON.parse(depot['docs/bibliotheque/index.json']).quiz.filter(q => q.id === 'anglais-listen-and-repeat').length === 1, 'remplacer : une seule entrée, mise à jour');
ok(ctx.apiBibliotheque().quiz.length === 2 && ctx.apiTexteBibliotheque('anglais-x').texte.startsWith('T|X') && ctx.apiTexteBibliotheque('../x').erreur, 'bibliothèque lue sur GitHub ; texte d\'un quiz ; identifiant invalide refusé');
ok(ctx.apiRetirer('anglais-x').ok && JSON.parse(depot['docs/bibliotheque/index.json']).quiz.length === 1 && depot['docs/bibliotheque/anglais-x.txt'], 'retirer : enlevé de index.json, fichier gardé');
{ const b = ctx.apiBibliotheque(); ok(b.retires && b.retires.some(x => x.id === 'anglais-x') && ctx.apiEtat().retires.some(x => x.id === 'anglais-x'), 'retirer : le quiz retiré (titre, date, raison) est listé par la console (Bibliothèque et propositions)'); }
{ const re = ctx.apiReintegrer('anglais-x'), ix = JSON.parse(depot['docs/bibliotheque/index.json']);
  ok(re.ok && ix.quiz.some(q => q.id === 'anglais-x' && q.titre) && !(ix.retires || []).some(x => x.id === 'anglais-x') && ctx.apiReintegrer('anglais-x').erreur, 'réintégrer : le quiz retiré revient tel quel dans la bibliothèque et sort des retirés');
  ctx.apiRetirer('anglais-x', 'essai'); }

// 5. adresse de réception publiée pour les sites
ok(ctx.apiUrlPropositions('http://pirate.fr').erreur && ctx.apiUrlPropositions('https://script.google.com/macros/s/AKfycbyABCDEFGHIJKLMNOPQRSTUV123/exec').ok && JSON.parse(depot['docs/soccaquiz.json']).propositions.endsWith('/exec') && ctx.apiEtat().urlPropositions,
  'adresse « Propositions » vérifiée puis publiée dans docs/soccaquiz.json');
ok(ctx.apiVersions().versions[0].tag === 'v2.57', 'versions lues sur GitHub');
jetonValide = false;
refus = ''; try { ctx.apiPublier({ id: 'abc-def', titre: 't', matiere: 'maths', classes: ['CM1'], texte: QUIZ }); } catch (err) { refus = err.message; }
ok(/expiré/.test(refus), 'jeton expiré : message clair (affiché par la console)');
jetonValide = true;

// 6. invitations
const inv = ctx.apiEnvoyer({ liste: 'Lucie Martin <Lucie@Gmail.com>\nMarc, marc@orange.fr\nsophie@gmail.com\nlucie@gmail.com\npas une adresse', signature: 'Yan', nom: 'Yan (SoccaQuiz)' });
ok(inv.ok && envoyes.length === 3 && inv.lignes.filter(x => x.erreur).length === 2 && /Bonjour Lucie,/.test(envoyes[0].htmlBody) && /Bonjour,/.test(envoyes[2].htmlBody) && /Installer SoccaQuiz : https:\/\/app\.soccaquiz\.fr\/connexion\//.test(envoyes[2].body),
  'invitations : 3 envoyées, doublon et ligne sans adresse signalés, prénom et version texte');
quota = 1;
ok(/Gmail ne permet plus que 1/.test(ctx.apiEnvoyer({ liste: 'a@b.fr\nc@d.fr' }).erreur) && envoyes.length === 3, 'quota Gmail insuffisant : rien n\'est envoyé');
quota = 10;
ok(ctx.apiEnvoyer({ essai: true, signature: 'Yan' }).ok && envoyes[3].to === 'soccaquiz@gmail.com' && ctx.apiEtat().signature === 'Yan', 'essai envoyé à soi-même, signature retenue');
const vrai = ctx.UrlFetchApp.fetch;
ctx.UrlFetchApp.fetch = (u, o) => u.includes('invitation.html') ? ({ getResponseCode: () => 200, getContentText: () => readFileSync(join(RACINE, 'docs', 'invitation.html'), 'utf8').replace('<!--/MAIL-->', '') }) : vrai(u, o);
refus = ''; try { ctx.modele_(); } catch (err) { refus = err.message; }
ctx.UrlFetchApp.fetch = vrai;
ok(/Repère <!--\/MAIL--> introuvable/.test(refus), 'repère du mail manquant : erreur claire, rien d\'envoyé');
const installer = readFileSync(join(RACINE, 'docs', 'installer.html'), 'utf8');
ok(/http-equiv="refresh" content="0; url=https:\/\/app\.soccaquiz\.fr\/connexion\/"/.test(installer) && !/script\.google\.com/.test(installer) && readFileSync(join(RACINE, 'docs', 'invitation.html'), 'utf8').includes('https://app.soccaquiz.fr/connexion/'), 'docs/installer.html (anciens mails) et le mail d\'invitation mènent à la nouvelle installation');


// erreurs signalées par les familles : réception, correction (famille seule ou toute la bibliothèque), relecture par code
{
  actif = 'soccaquiz@gmail.com';
  const QUIZ_E = 'T|X|Sous-titre|anglais|🇬🇧|⭐\nQ|What is « cat » ?|chat|chien|vache|Explication\nQ|b|c|d|e|f\nQ|g|h|i|j|k\nM|Un rappel faux\n';
  const code = 'abcdefghij0123456789klmnopqrstuv';
  const BID = JSON.parse(depot['docs/bibliotheque/index.json']).quiz[0].id;     // un quiz encore dans la bibliothèque
  const lire = c => JSON.parse(ctx.doGet({ parameter: { correction: c } }).t);
  ok(lire(code).statut === 'inconnu', 'correction : code inconnu → « inconnu »');
  Object.keys(cache).filter(k => /^envois-/.test(k)).forEach(k => delete cache[k]);     // compteur d'envois des tests précédents
  const r1 = post({ type: 'erreur', code, titre: 'X', classe: 'CM1', biblio: BID, question: 'What is « cat » ?', attendu: 'chat', motif: 'reponse', remarque: '=HYPERLINK("x")', texte: QUIZ_E, version: 'v2.82' });
  ok(r1.ok && lignesE.length === 2 && lignesE[1][2] === 'nouveau' && lignesE[1][3] === code && /^'=/.test(lignesE[1][10]), 'erreur reçue : rangée dans l\'onglet « Erreurs », formule neutralisée');
  ok(post({ type: 'erreur', code, texte: QUIZ_E }).deja && lignesE.length === 2, 'même code envoyé deux fois : gardé une fois');
  ok(post({ type: 'erreur', code: 'court', texte: QUIZ_E }).erreur && post({ type: 'erreur', code: code.replace('a', 'z'), texte: 'rien' }).erreur, 'code invalide ou texte qui n\'est pas un quiz : refusé');
  ok(lire(code).statut === 'attente', 'correction pas encore faite : « attente »');
  const e = ctx.apiEtat();
  const x = e.erreurs.find(y => y.code === code);
  ok(x && x.question === 'What is « cat » ?' && x.biblio === BID && x.remarque === '=HYPERLINK("x")', 'console : l\'erreur est listée (texte d\'origine rendu)');
  actif = 'intrus@gmail.com';
  let refus = ''; try { ctx.apiCorrigerErreur(x.id, { texte: QUIZ_E }); } catch (err) { refus = err.message; }
  ok(/Réservé/.test(refus), 'corriger : réservé à l\'éditeur');
  actif = 'soccaquiz@gmail.com';
  ok(!!ctx.apiCorrigerErreur(x.id, { texte: 'pas un quiz' }).erreur, 'correction qui n\'est pas un quiz : refusée');
  const avant = JSON.parse(depot['docs/bibliotheque/index.json']).quiz.find(q => q.id === BID);
  const corrige = QUIZ_E.replace('|chat|chien|', '|un chat|chien|');
  const c1 = ctx.apiCorrigerErreur(x.id, { texte: corrige, message: 'Merci !', pourTous: true });
  const apres = JSON.parse(depot['docs/bibliotheque/index.json']).quiz.find(q => q.id === BID);
  const l = lire(code);
  ok(c1.ok && c1.biblio === BID && l.statut === 'corrige' && /\|un chat\|/.test(l.texte) && l.message === 'Merci !', 'correction envoyée : la famille la lit avec son code (texte et message)');
  ok(/\|un chat\|/.test(depot['docs/bibliotheque/' + BID + '.txt']) && apres.v === (+avant.v || 1) + 1 && apres.nb === 3, '« pour toutes les familles » : quiz de la bibliothèque corrigé, nouvelle version (v ' + apres.v + ')');
  // famille seule : la bibliothèque ne bouge pas
  const code2 = 'zyxwvutsrqponmlkjihgfedcba987654';
  post({ type: 'erreur', code: code2, titre: 'Y', question: 'b', texte: QUIZ_E });
  const y = ctx.apiEtat().erreurs.find(z => z.code === code2);
  const v0 = JSON.parse(depot['docs/bibliotheque/index.json']).quiz.find(q => q.id === BID).v;
  ok(ctx.apiCorrigerErreur(y.id, { texte: corrige, pourTous: true }).ok && JSON.parse(depot['docs/bibliotheque/index.json']).quiz.find(q => q.id === BID).v === v0, 'quiz d\'une famille (pas de la bibliothèque) : seule cette famille reçoit la correction');
  ok(ctx.apiRouvrirErreur(y.id).ok && lire(code2).statut === 'attente' && ctx.apiSansErreur(y.id, 'C\'est bien « chat ».').ok && lire(code2).statut === 'sans-erreur' && lire(code2).message === 'C\'est bien « chat ».' && !lire(code2).texte,
    '« Pas d\'erreur » : la famille reçoit le message, sans texte de quiz');
  ok(ctx.apiSupprimerErreur(y.id).ok && lire(code2).statut === 'inconnu', 'signalement supprimé');
  // republier un quiz de la bibliothèque (Bibliothèque → Remplacer) : nouvelle version aussi
  const vA = JSON.parse(depot['docs/bibliotheque/index.json']).quiz.find(q => q.id === BID).v;
  ctx.apiPublier({ id: BID, titre: 'X', matiere: 'anglais', classes: ['CM1'], texte: corrige, remplacer: true });
  ok(JSON.parse(depot['docs/bibliotheque/index.json']).quiz.find(q => q.id === BID).v === vA + 1, 'quiz de la bibliothèque remplacé : nouvelle version proposée aux familles');
  ok(/data-o="erreurs"/.test(ctx.doGet({ parameter: {} }).h) && /nb-err/.test(ctx.doGet({ parameter: {} }).h), 'console : onglet « Erreurs » avec son compteur');
}
// demandes d'aide : réception publique (espace parent, page d'aide), réponse par mail depuis la console
{
  const envoi = d => ctx.recevoir_(d);
  ok(envoi({ type: 'aide', email: 'pas-une-adresse', message: 'Bonjour, je ne trouve pas le lien.' }).erreur && envoi({ type: 'aide', email: 'a@b.fr', message: 'court' }).erreur
    && envoi({ type: 'aide', email: 'a@b.fr', message: 'x'.repeat(3001) }).erreur, 'demande d\'aide : adresse invalide, message trop court ou trop long refusés');
  ok(envoi({ type: 'aide', email: 'robot@spam.fr', message: 'Message de robot assez long', piege: 'x' }).ok && !lignesA.length, 'champ piège rempli (robot) : rien n\'est gardé');
  const r = envoi({ type: 'aide', email: 'Parent@Gmail.com ', message: '=Bonjour, le site de Tom ne s\'ouvre plus.', origine: 'parent', prenom: 'Tom', classe: 'CE1', version: 'v2.92' });
  ok(r.ok && lignesA.length === 2 && lignesA[1][3] === 'parent@gmail.com' && lignesA[1][8] === "'=Bonjour, le site de Tom ne s'ouvre plus." && lignesA[1][4] === 'parent',
    'demande reçue : adresse mise en minuscules, texte protégé contre les formules du tableur');
  ok(envoi({ type: 'aide', email: 'parent@gmail.com', message: '=Bonjour, le site de Tom ne s\'ouvre plus.' }).deja && lignesA.length === 2, 'même demande envoyée deux fois : gardée une fois');
  for (let k = 0; k < 4; k++) envoi({ type: 'aide', email: 'parent@gmail.com', message: 'Autre question numéro ' + k });
  ok(/plusieurs demandes/.test(envoi({ type: 'aide', email: 'parent@gmail.com', message: 'Encore une autre question' }).erreur || ''), 'plus de 5 demandes par adresse en 6 heures : refusé');
  actif = 'intrus@gmail.com';
  let refus = ''; try { ctx.apiRepondreAide('x', 'y'); } catch (err) { refus = err.message; }
  ok(/Réservé/.test(refus), 'répondre : réservé à l\'éditeur');
  actif = 'soccaquiz@gmail.com';
  const a = ctx.apiEtat().aide.find(x => x.prenom === 'Tom');
  const avant = envoyes.length;
  ok(a && a.message === '=Bonjour, le site de Tom ne s\'ouvre plus.' && ctx.apiEtat().aide.filter(x => x.statut === 'nouveau').length === 5, 'onglet Aide : demandes listées, texte d\'origine rendu');
  ok(ctx.apiRepondreAide(a.id, '').erreur && envoyes.length === avant, 'réponse vide : rien n\'est envoyé');
  const rr = ctx.apiRepondreAide(a.id, 'Bonjour, mets le site à jour depuis l\'installateur.');
  const m = envoyes[envoyes.length - 1];
  ok(rr.ok && m.to === 'parent@gmail.com' && /réponse à ta demande d'aide/.test(m.subject) && /mets le site à jour/.test(m.body) && /> =Bonjour, le site de Tom/.test(m.body)
    && ctx.apiEtat().aide.find(x => x.id === a.id).statut === 'repondu', 'réponse envoyée par mail à l\'adresse du parent, demande citée, statut « Répondu »');
  ok(ctx.apiAideStatut(a.id, 'nouveau').ok && ctx.apiAideStatut(a.id, 'classe').ok && ctx.apiAideStatut(a.id, 'nimporte').erreur && ctx.apiSupprimerAide(a.id).ok && !ctx.apiEtat().aide.find(x => x.id === a.id),
    'demande remise à répondre, classée, puis supprimée');
  const page = ctx.doGet({ parameter: {} }).h;
  ok(/data-o="aide"/.test(page) && /nb-aide/.test(page) && !/[^:]\/\/(?!\s)/.test((page.match(/<script>([\s\S]*)<\/script>/) || [])[1].replace(/https?:\\\/\\\//g, '')), 'console : onglet « Aide » avec son compteur');
}
{
  const page = ctx.doGet({ parameter: {} }).h, js = (page.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';
  let compile = true; try { new Function(js); } catch (e) { compile = false; }
  const refs = ['socca-f-nouvelle.png', 'socca-m.png', 'socca-n.png'].every(f => existsSync(new URL('../docs/themes/reference/' + f, import.meta.url)));
  ok(/data-o="mascottes"/.test(page) && /vueMascottes/.test(js) && compile && refs, 'console : onglet « Mascottes » (prompts ChatGPT, 3 allures, images de référence en ligne), script valide');
}
// compteurs anonymes de l'installateur → onglet Statistiques
{
  const r0 = ctx.apiEtat().stats;
  ok(r0 && r0.enService === 0 && !r0.semaines.length, 'statistiques : vides au départ');
  ok(post({ type: 'stat', evts: [{ e: 'installation', v: 'v2.93' }] }).ok && post({ type: 'stat', evts: [{ e: 'installation', v: 'v2.93' }] }).ok
    && post({ type: 'stat', evts: [{ e: 'existant', n: 3 }, { e: 'maj', v: 'v2.93' }] }).ok && post({ type: 'stat', evts: [{ e: 'suppression', v: 'v2.92' }] }).ok, 'compteurs reçus');
  ok(post({ type: 'stat', evts: [{ e: 'pirate' }] }).erreur && post({ type: 'stat', evts: [{ e: 'existant', n: 5000 }] }).ok && lignesS[lignesS.length - 1][3] === 20
    && post({ type: 'stat', evts: [{ e: 'maj', v: '<script>' }] }).ok && lignesS[lignesS.length - 1][2] === '', 'compteurs : événement inconnu refusé, nombres bornés, version douteuse effacée');
  const S = ctx.apiEtat().stats;
  ok(S.totaux.installation === 2 && S.totaux.maj === 2 && S.totaux.suppression === 1 && S.totaux.existant === 23 && S.enService === 24 && S.semaines.length === 1 && S.semaines[0].installation === 2
    && S.versions[0].version === 'v2.93' && S.versions[0].installation === 2 && S.versions[0].maj === 1, 'statistiques : en service = déjà là + installés − supprimés, par semaine et par version — ' + JSON.stringify(S.totaux));
  ok(/data-o="stats"/.test(ctx.doGet({ parameter: {} }).h), 'console : onglet « Statistiques »');
  const r = ctx.apiRemettreStatsAZero(), S2 = ctx.apiEtat().stats;
  ok(r.ok && r.n > 0 && /^Statistiques \(archive du /.test(r.archive) && archiveS && archiveS.lignes.length === r.n + 1 && S2.enService === 0 && S2.totaux.installation === 0 && !S2.semaines.length,
    'remise à zéro des compteurs : feuille archivée (rien d\'effacé), statistiques reparties de zéro — ' + JSON.stringify(r));
  ok(ctx.apiRemettreStatsAZero().vide && post({ type: 'stat', evts: [{ e: 'installation', v: 'relais' }] }).ok && ctx.apiEtat().stats.totaux.installation === 1, 'remise à zéro : rien à faire quand c\'est vide ; le compteur suivant recrée la feuille');
  const pageS = ctx.doGet({ parameter: {} }).h;
  ok(/raz-demander/.test(pageS) && /Oui, remettre à zéro/.test(pageS) && /raz-annuler/.test(pageS), 'console : bouton « Remettre à zéro… » avec confirmation (Annuler / Oui)');
}
// bilan du relais → onglet Statistiques (jeton partagé avec le secret JETON_CONSOLE du Worker)
{
  ok(ctx.apiBilanRelais().sansJeton && ctx.apiEtat().jetonRelais === false, 'bilan du relais : rien sans jeton');
  ok(ctx.apiJetonRelais('court').erreur && ctx.apiJetonRelais('z'.repeat(64)).erreur && ctx.apiEtat().jetonRelais === false, 'bilan du relais : jeton mal formé ou inconnu du relais refusé, rien d\'enregistré');
  const r = ctx.apiJetonRelais('k'.repeat(64)), b = ctx.apiBilanRelais().bilan;
  ok(r.ok && ctx.apiEtat().jetonRelais === true && b.familles === 5 && b.enfants === 8 && b.parFamille.map(x => x.n).join() === '3,1,0,1' && b.actives7 === 2 && b.actives30 === 4 && b.semaines.length === 1 && b.semaines[0].n === 3, 'bilan du relais : jeton vérifié puis retenu ; totaux lus, semaine douteuse écartée');
  const page = ctx.doGet({ parameter: {} }).h;
  ok(/bilan-relais/.test(page) && /JETON_CONSOLE/.test(page) && /Journal du relais/.test(page) && /En cas de souci/.test(page) && /already exists/.test(page) && /CLE_CHIFFREMENT/.test(page), 'console : bloc « Familles inscrites », réglage du jeton, lien vers le journal');
  ok(ctx.apiJetonRelais('').ok && ctx.apiEtat().jetonRelais === false, 'bilan du relais : délier');
}
// appels à l'API Drive comptés par le relais (bloc « Appels à Google Drive » de Statistiques), diagnostic autoriserConsole
{
  ctx.apiJetonRelais('k'.repeat(64));
  const d = ctx.apiBilanRelais().bilan.drive;
  ok(d.total30 === 2008 && d.quota30 === 3 && d.erreurs30 === 5 && d.pointeMinute === 42 && d.maxJour === 1203 && d.jours.length === 2 && d.moyenne === 1004 && d.pointeA === '2026-11-25T08:01:00.000Z',
    'appels Drive : totaux sur 30 jours, refus pour quota, autres erreurs, pointe par minute (jour douteux écarté) — ' + JSON.stringify(d).slice(0, 160));
  const journal = []; const avantLog = console.log; console.log = m => journal.push(String(m));
  let diag; try { diag = ctx.autoriserConsole(); } finally { console.log = avantLog; }
  const man = JSON.parse(readFileSync(join(RACINE, 'console', 'appsscript.json'), 'utf8'));
  const page = ctx.doGet({ parameter: {} }).h;
  ok(diag === 'OK' && /Autorisations accordées/.test(journal.join(' ')) && !man.oauthScopes.some(x => /monitoring/.test(x)) && /usage-drive/.test(page) && !/apiUsageDrive|monitoring\.googleapis/.test(page),
    'appels Drive : bloc Statistiques alimenté par le relais, plus de Cloud Monitoring (ni autorisation monitoring.read) ; autoriserConsole écrit les autorisations accordées');
  ctx.apiJetonRelais('');
}
// onglet Liens : raccourcis vers le code à recoller et les programmes Apps Script, rappel des deux déploiements
{
  const e = ctx.apiEtat();
  ok(e.projetConsole === 'https://script.google.com/home/projects/ID-CONSOLE-0123456789abcdef/edit' && e.projetInstallateur === '', 'liens : programme de la console connu, celui de l\'installateur à coller une fois');
  ok(ctx.apiProjetInstallateur('https://exemple.fr/x').erreur && ctx.apiProjetInstallateur('https://script.google.com/home/projects/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit').ok
    && ctx.apiEtat().projetInstallateur === 'https://script.google.com/home/projects/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'liens : adresse du projet de l\'installateur vérifiée puis retenue');
  actif = 'intrus@gmail.com'; let refus = ''; try { ctx.apiProjetInstallateur(''); } catch (err) { refus = err.message; } actif = 'soccaquiz@gmail.com';
  const page = ctx.doGet({ parameter: {} }).h;
  ok(/Réservé/.test(refus) && /Copier le code/.test(page) && /« <b>Propositions<\/b> »/.test(page) && /raw\.githubusercontent\.com/.test(page) && /Réception « Propositions »/.test(page) && /soccaquiz\.fr\/aide\.html/.test(page.replace(/\\\//g, '/'))
    && !/\balert\(/.test((page.match(/<script>([\s\S]*)<\/script>/) || [])[1].replace(/else alert\(m\)/, '')), 'liens : raccourcis « Copier le code », rappel « Console et Propositions », nouveaux liens');
}
console.log(echecs ? '[console] ' + echecs + ' échec(s)' : '[console] tout est vert');
process.exit(echecs ? 1 : 0);
