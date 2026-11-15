/* Test de la console de l'éditeur (console/Code.gs) : propositions, publication sur GitHub (simulé),
   invitations, accès réservé. Usage : node tests/test-console.mjs */
import { readFileSync } from 'node:fs';
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
    base64Encode: s => b64(s), base64Decode: s => Buffer.from(s, 'base64'),
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
ok(inv.ok && envoyes.length === 3 && inv.lignes.filter(x => x.erreur).length === 2 && /Bonjour Lucie,/.test(envoyes[0].htmlBody) && /Bonjour,/.test(envoyes[2].htmlBody) && /Installer SoccaQuiz : https:\/\/leian\.github\.io\/UNIVERSALQUIZ\/installer\.html/.test(envoyes[2].body),
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
ok(/http-equiv="refresh" content="0; url=https:\/\/script\.google\.com\/macros\/s\/AKfy/.test(installer) && (installer.match(/AKfycbxseeW1[\w-]+/g) || []).every(x => readFileSync(join(RACINE, 'en-ligne', 'LISEZMOI.md'), 'utf8').includes(x) && readFileSync(join(RACINE, 'console', 'Code.gs'), 'utf8').includes(x)), 'docs/installer.html, la notice et les liens de la console mènent au même installateur');

console.log(echecs ? '[console] ' + echecs + ' échec(s)' : '[console] tout est vert');
process.exit(echecs ? 1 : 0);
