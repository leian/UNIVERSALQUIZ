/* =====================================================================
   TEST DE BOUT EN BOUT, SANS COMPTE GOOGLE
   Lance un « faux Google » (tests/faux-google.mjs) qui exécute Code.gs
   avec des services simulés, puis joue dans Chrome comme un enfant.
   Usage :   node tests/test.mjs
   Prérequis : npm i -D playwright && npx playwright install chromium
   ===================================================================== */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const DRIVE = join(ICI, 'drive');
const PORT = 8765, BASE = `http://localhost:${PORT}`;
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) {
  try { playwright = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright'); }
  catch (e2) { console.error('Installe Playwright : npm i -D playwright && npx playwright install chromium'); process.exit(1); }
}

// 0. installateur en ligne (simulation de l'API Apps Script)
const enLigne = spawnSync(process.execPath, [join(ICI, 'test-en-ligne.mjs')], { stdio: 'inherit' }).status;
const invitations = spawnSync(process.execPath, [join(ICI, 'test-invitations.mjs')], { stdio: 'inherit' }).status;

// 1. construction + faux Google
if (spawnSync(process.execPath, [join(RACINE, 'construire.mjs')], { stdio: 'inherit' }).status !== 0) process.exit(1);
rmSync(DRIVE, { recursive: true, force: true }); rmSync(join(ICI, 'corbeille'), { recursive: true, force: true });
const serveur = spawn(process.execPath, [join(ICI, 'faux-google.mjs'), join(RACINE, 'build'), DRIVE, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => serveur.stdout.once('data', ok));

const ev = async code => (await (await fetch(BASE + '/eval', { method: 'POST', body: code })).json());
let echecs = (enLigne === 0 ? 0 : 1) + (invitations === 0 ? 0 : 1);
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) echecs++; };

const options = { args: ['--no-sandbox'] };
if (process.env.CHROME) options.executablePath = process.env.CHROME;
const browser = await playwright.chromium.launch(options).catch(() => playwright.chromium.launch({ ...options, executablePath: '/usr/bin/google-chrome' }));
const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
const erreursJs = [];
page.on('pageerror', e => erreursJs.push(page.url() + ' : ' + e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com|drive\.google\.com/, r => r.fulfill({ status: 200, body: '' }));

async function jouer() {
  await page.locator('.start-btn').click();
  for (let i = 0; i < 300; i++) {
    if (await page.locator('.result-card').count()) break;
    if (await page.locator('.next-btn').count()) { await page.locator('.next-btn').click(); continue; }
    if (await page.locator('#ans-input').count()) { await page.fill('#ans-input', 'Paris'); await page.keyboard.press('Enter'); continue; }
    if (await page.locator('.opt-btn:not([disabled])').count()) { await page.locator('.opt-btn').first().click(); continue; }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(800);
  return page.locator('.result-score').innerText();
}

// Google Apps Script retire ce qu'il prend pour des commentaires « // » dans les scripts, avec un découpage naïf
// qui se trompe sur les chaînes : une adresse « https://… » écrite telle quelle dans le code peut être coupée
// (« Invalid or unexpected token » sur le vrai site, pas dans la simulation). On écrit donc « https:\/\/… ».
{
  const fautifs = [];
  for (const dossier of ['moteur', 'moteur/commun', 'src']) for (const f of readdirSync(join(RACINE, dossier))) {
    if (!/\.(html|js)$/.test(f)) continue;
    const s = readFileSync(join(RACINE, dossier, f), 'utf8');
    const blocs = f.endsWith('.js') ? [s] : [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    blocs.forEach(b => b.split('\n').forEach(l => { const t = l.trim(); if (l.includes('://') && !/^(\/\/|\*|\/\*)/.test(t)) fautifs.push(dossier + '/' + f + ' : ' + t.slice(0, 60)); }));
  }
  ok(!fautifs.length, 'aucune adresse « :// » écrite telle quelle dans le code des scripts' + (fautifs.length ? ' — ' + fautifs.join(' | ') : ''));
}

try {
  // installation automatique
  await page.goto(BASE + '/exec');
  ok(await page.locator('a.card').count() === 1, 'première visite : le quiz d\'exemple est listé');
  let s = await ev('1');
  ok(Object.keys(s.sheets).length === 1 && s.props.includes('DOSSIER'), 'dossier Drive + Google Sheets créés');

  // une partie
  await page.locator('a.card').first().click();
  await page.waitForURL(/page=quiz_exemple_capitales/);
  ok(!!(await jouer()), 'partie jouée jusqu\'au résultat');
  for (let i = 0; i < 30; i++) { s = await ev('1'); if (Object.values(s.sheets)[0].rows.length >= 2) break; await page.waitForTimeout(100); }   // l'envoi du résultat est asynchrone
  const lignes = Object.values(s.sheets)[0].rows;
  ok(lignes.length === 2 && lignes[1][3] === 'quiz_exemple_capitales', 'résultat écrit dans le Sheets' + (lignes.length === 2 ? '' : ' — lignes : ' + JSON.stringify(lignes.map(l => l[3]))));

  // dépôt d'un nouveau quiz + d'un PDF dans le dossier
  const dossier = join(DRIVE, 'SoccaQuiz');
  copyFileSync(join(RACINE, 'src', 'exemple-quiz.html'), join(dossier, 'quiz_Test_copie_12-11-2026.html'));
  writeFileSync(join(dossier, 'controle_Test_12-11-2026.pdf'), '%PDF-1.4\n');
  await ev('CacheService.getScriptCache().remove("catalogue")');
  await page.locator('a.btn-myquiz').first().click();
  await page.waitForURL(BASE + '/exec');
  ok(await page.locator('a.card').count() === 2, 'nouveau fichier déposé → 2 quiz listés');
  ok(await page.locator('a.card .score').count() === 1, 'score affiché sur la carte du quiz joué');
  await page.locator('.semaine').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await page.locator('.semaine .sem-jour.fait').count() === 1 && /1\s*quiz joué/.test(await page.locator('.semaine').innerText()), '« Ma semaine » : 1 quiz joué, jour du jour coché');

  // tableau de bord
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  await page.waitForTimeout(800);
  ok(/capitales/i.test(await page.locator('body').innerText()), 'tableau de bord : la partie apparaît');

  // ajout d'un quiz depuis le site : réponse d'IA collée (JSON dans un bloc de code, avec du texte autour)
  await page.goto(BASE + '/exec');
  await page.locator('a', { hasText: 'Ajouter un quiz' }).click();
  await page.waitForURL(/page=ajouter/);
  const msgs = await page.evaluate(() => ({ court: window.__consignes.messageCourt(), complet: window.__consignes.messageComplet() }));
  ok(msgs.complet.includes('Q|question|BONNE réponse') && !/Q\|question/.test(await page.locator('main').innerText()), 'page « Ajouter » : consignes prêtes, jamais affichées');
  const hrefs = await page.locator('a.ia').evaluateAll(l => l.map(a => a.href));
  const urlConsignes = (msgs.court.match(/https:\/\/leian\.github\.io\/UNIVERSALQUIZ\/consignes\/(\w+)\.txt/) || [])[1];
  const publiees = urlConsignes && existsSync(join(RACINE, 'docs', 'consignes', urlConsignes + '.txt')) ? readFileSync(join(RACINE, 'docs', 'consignes', urlConsignes + '.txt'), 'utf8') : '';
  ok(hrefs.length === 3 && hrefs.every(h => decodeURIComponent(h.split('?q=')[1]) === msgs.court) && msgs.court.length < 600
     && publiees === readFileSync(join(RACINE, 'src', 'consignes.txt'), 'utf8').replace(/\r\n/g, '\n') && msgs.complet.endsWith(publiees),
    'liens Claude / ChatGPT / Grok : message court (' + msgs.court.length + ' car.) qui renvoie aux consignes publiées sur GitHub Pages');
  const reponseIA = 'Voici ton quiz :\n```json\n' + JSON.stringify({
    titre: 'Les fractions', sousTitre: 'CM1', matiere: 'Mathématiques', icone: '🍕',
    questions: [
      { type: 'qcm', cat: 'Lire', q: 'Combien vaut 1/2 + 1/2 ?', opts: ['1', '2', '1/4'], a: '1', exp: 'Deux moitiés font un entier.' },
      { type: 'vf', cat: 'Comparer', q: '1/3 est plus grand que 1/2.', a: 'Faux', exp: '1/2 est plus grand.' },
      { type: 'saisie', cat: 'Écrire', q: 'Écris la capitale de la France.', ans: ['Paris'], exp: 'Paris.' },
      { type: 'qcm', cat: 'Lire', q: 'Question cassée', opts: ['a', 'b'], a: 'c', exp: '' }
    ],
    memo: ['Le dénominateur est en bas.']
  }, null, 2) + ',\n```\nBonnes révisions !';
  await page.evaluate(() => { document.getElementById('secours').open = true; });
  await page.fill('#reponse', reponseIA);
  await page.locator('#creer').click();
  await page.locator('#resultat .ok').waitFor({ timeout: 5000 });
  ok(/3 questions/.test(await page.locator('#resultat').innerText()) && /ignorée/.test(await page.locator('#resultat').innerText()), 'quiz créé depuis la réponse de l\'IA (3 questions, 1 ignorée)');
  await page.locator('#resultat a.btn').click();
  await page.waitForURL(/page=quiz_les-fractions_/);
  ok(!!(await jouer()), 'le quiz créé se joue jusqu\'au résultat');
  // format en lignes (celui que demandent les consignes) : texte autour, bloc de code, catégories, champs nommés
  await page.goto(BASE + '/exec?page=ajouter');
  await page.evaluate(() => { document.getElementById('secours').open = true; });
  await page.fill('#reponse', [
    'Voici le quiz :', '```', 'T|Le verbe BE|Conjugue to be|anglais|🇬🇧|⭐',
    '## Formes contractées|✂️', 'Q|He is = ?|He\'s|His|He\'m|He is se contracte en He\'s.',
    'V|We are se contracte en We\'re.|V|We are → We\'re.',
    '## Conjugaison', 'S|Complète : They ___ happy.|are|Avec they, on emploie are.|img=😄',
    'S|Quel organe pompe le sang ?|le cœur|C\'est le cœur.',
    'Q|Que veut dire la phrase entendue ?|Es-tu content ?|Es-tu triste ?|Je suis content.|Explication.|dire=Are you happy?',
    'V|Le son monte.|F|Il descend.|notes=G4 C4+E4 E4|portee',
    'Q|Question cassée|seule',
    'M|I am → I\'m', '```', 'Bonnes révisions !'].join('\n'));
  await page.locator('#creer').click();
  await page.locator('#resultat .ok').waitFor({ timeout: 5000 });
  ok(/6 questions/.test(await page.locator('#resultat').innerText()) && /ignorée/.test(await page.locator('#resultat').innerText()), 'format en lignes : quiz créé (6 questions, 1 ignorée)');
  await page.locator('#resultat a.btn').click();
  await page.waitForURL(/page=quiz_le-verbe-be_/);
  const html = await page.content();
  ok(/"cat":"Formes contractées"/.test(html) && /"a":"He's"/.test(html) && /"dire":"Are you happy\?"/.test(html)
     && /"notes":\["G4",\["C4","E4"\],"E4"\],"portee":true/.test(html) && /"ans":\["le cœur","cœur"\]/.test(html) && /"badge":"🇬🇧"/.test(html)
     && /"icones":\{"Formes contractées":"✂️"\}/.test(html) && /"img":"😄"/.test(html),
    'format en lignes : catégories, bonne réponse, écoute, notes, article facultatif, badge (⭐ remplacé par l\'icône), emoji de catégorie, image');
  ok(!!(await jouer()), 'format en lignes : le quiz se joue jusqu\'au résultat');
  // bouton unique « Coller et créer » : lit le presse-papiers
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE + '/exec?page=ajouter');
  await page.evaluate(t => navigator.clipboard.writeText(t), 'T|Les volcans|Révise|sciences|🌋|🔥\n## Volcans\nQ|Que crache un volcan ?|De la lave|De l\'eau|Du sable|La lave.\nV|Un volcan peut dormir.|V|Oui.\nS|Comment appelle-t-on la roche fondue ?|la lave;magma|La lave.');
  await page.locator('#coller-creer').click();
  await page.locator('#resultat .ok').waitFor({ timeout: 5000 });
  ok(/3 questions/.test(await page.locator('#resultat').innerText()), 'bouton « Coller et créer » : quiz créé en un geste');

  // Gemini : clé vérifiée et gardée par le site, photos envoyées depuis le navigateur, repli sur le second modèle
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
  const appels = [];
  await page.route(/generativelanguage\.googleapis\.com/, async r => {
    const u = r.request().url(), cleUtilisee = r.request().headers()['x-goog-api-key'] || new URL(u).searchParams.get('key');
    appels.push({ u, cle: cleUtilisee, corps: r.request().postData() || '' });
    if (cleUtilisee !== 'AQ.Ab8TEST-cle_de_test_0123456789abcdef') return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. API_KEY_INVALID' } }) });
    if (/\/models\?/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"models":[]}' });
    if (/gemini-flash-latest:/.test(u)) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"status":"UNAVAILABLE","message":"overloaded"}}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '```\nT|Le verbe BE|Conjugue to be|anglais|🇬🇧|⭐\n## Conjugaison\nS|They ___ happy.|are|Avec they : are.\nQ|He is = ?|He\'s|His|He is → He\'s.\nV|I am = I\'m|V|Oui.\n```' }] } }] }) });
  });
  await page.goto(BASE + '/exec?page=ajouter');
  ok(await page.locator('#g-sans-cle').isVisible() && !(await page.locator('#g-avec-cle').isVisible()), 'Gemini : sans clé, la procédure de création de clé est affichée');
  await page.fill('#g-cle', 'AIzaFAUSSE_cle_fausse_0123456789abcdef');
  await page.locator('#g-enregistrer').click();
  await page.locator('#g-resultat .ko').waitFor({ timeout: 5000 });
  ok(/refuse/.test(await page.locator('#g-resultat').innerText()), 'Gemini : une clé refusée par Google est signalée');
  await page.fill('#g-cle', 'AQ.Ab8TEST-cle_de_test_0123456789abcdef');
  await page.locator('#g-enregistrer').click();
  await page.locator('#g-resultat .ok').waitFor({ timeout: 5000 });
  await page.goto(BASE + '/exec?page=ajouter');
  const htmlQuiz = await (await fetch(BASE + '/exec?page=quiz_exemple_capitales')).text();
  ok(await page.locator('#g-avec-cle').isVisible() && !htmlQuiz.includes('Ab8TEST'), 'Gemini : clé gardée par le site, absente des pages de quiz');
  await page.setInputFiles('#g-photos', [{ name: 'p1.png', mimeType: 'image/png', buffer: PNG }, { name: 'p2.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForFunction(() => !document.getElementById('g-creer').disabled);
  await page.locator('#g-creer').click();
  await page.locator('#g-resultat .ok').waitFor({ timeout: 8000 });
  const gen = appels.filter(a => /generateContent/.test(a.u));
  ok(/3 questions/.test(await page.locator('#g-resultat').innerText()) && gen.length === 2 && /flash-lite/.test(gen[1].u)
     && (gen[1].corps.match(/"inline_data"/g) || []).length === 2 && gen[1].corps.includes('Q|question|BONNE réponse'),
    'Gemini : 2 photos + consignes envoyées, repli sur le 2e modèle, quiz créé sans copier-coller');
  await page.unroute(/generativelanguage\.googleapis\.com/);

  // quiz d'anglais et de musique : phrases à écouter, notes jouées, portée, badge
  await page.goto(BASE + '/exec?page=ajouter');
  await page.evaluate(() => { document.getElementById('secours').open = true; });
  await page.fill('#reponse', JSON.stringify({
    titre: 'Listen and notes', matiere: 'anglais', icone: '🎧', badge: '🏅',
    questions: [
      { type: 'qcm', cat: 'Écoute', q: 'Que veut dire la phrase entendue ?', dire: 'Open your book, please.', opts: ['Ouvre ton livre', 'Ferme la porte'], a: 'Ouvre ton livre', exp: '' },
      { type: 'saisie', cat: 'Notes', q: 'Quelle est cette note ?', notes: ['G4'], portee: true, ans: ['Paris', 'sol'], exp: '' },
      { type: 'vf', cat: 'Notes', q: 'Le son monte.', notes: ['C4', ['E4', 'G4'], 'do4', 'pouet'], a: true, exp: '' },
      { type: 'qcm', cat: 'Lecture', q: 'Quelle est cette note ?', notes: ['A4'], portee: 'seule', opts: ['la', 'si'], a: 'la', exp: '' }
    ]
  }));
  await page.locator('#creer').click();
  await page.locator('#resultat .ok').waitFor({ timeout: 5000 });
  await page.locator('#resultat a.btn').click();
  await page.waitForURL(/page=quiz_listen-and-notes_/);
  await page.evaluate(() => {
    window.__dit = []; window.__notes = 0;
    SpeechSynthesis.prototype.speak = function (u) { window.__dit.push(u.text + '|' + u.lang + '|' + u.rate.toFixed(1)); };
    const AC = window.AudioContext, cree = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { window.__notes++; return cree.call(this); };
  });
  ok(/Phrases à écouter/.test(await page.locator('.start-infos').innerText()) && /Notes à écouter/.test(await page.locator('.start-infos').innerText()), 'accueil du quiz : pastilles « à écouter »');
  await page.locator('.start-btn').click();
  const vu = { dire: false, notes: false, portee: false, seule: false };
  for (let i = 0; i < 4; i++) {
    const q = await page.evaluate(() => { const e = MoteurQuiz._etat(); return e.shuffled[e.cur]; });
    if (q.dire) { await page.locator('.ecoute-btn').first().click(); await page.locator('.ecoute-btn.lent').click(); const dit = await page.evaluate(() => window.__dit.join(' / ')); vu.dire = dit === 'Open your book, please.|en-GB|0.9 / Open your book, please.|en-GB|0.6'; if (!vu.dire) console.log('dit =', dit); }
    else if (q.portee === 'seule') vu.seule = (await page.locator('.portee svg ellipse').count()) === 1 && (await page.locator('.ecoute-btn').count()) === 0;
    else if (q.portee) vu.portee = (await page.locator('.portee svg ellipse').count()) === 1 && (await page.locator('.ecoute-btn').count()) === 1;
    else { const avant = await page.evaluate(() => window.__notes); await page.locator('.ecoute-btn').click(); vu.notes = (await page.evaluate(() => window.__notes)) - avant === 12; }   // 4 notes (dont un accord de 2, « pouet » ignoré) × 3 oscillateurs
    if (await page.locator('#ans-input').count()) { await page.fill('#ans-input', 'sol'); await page.keyboard.press('Enter'); }
    else await page.locator('.opt-btn').first().click();
    await page.locator('.next-btn').click();
  }
  ok(vu.dire, 'anglais : la phrase est lue (normal puis lentement), en en-GB');
  ok(vu.notes, 'musique : les notes sont jouées (accord compris, note invalide ignorée)');
  ok(vu.portee && vu.seule, 'musique : portée dessinée, avec ou sans bouton d\'écoute');
  // nouveaux types d'exercices (G, O, A, C, X, N, P, K) : création au format en lignes, puis partie jouée en touchant l'écran
  await page.goto(BASE + '/exec?page=ajouter');
  await page.evaluate(() => { document.getElementById('secours').open = true; });
  await page.fill('#reponse', ['T|Huit types|Essai|autre|🧪|🏆', '## Tout',
    'G|Il [a] faim et [est;était] fatigué.|a / est.',
    'O|Range du plus petit au plus grand.|1|5|12|40|On range les nombres du plus petit au plus grand.',
    'A|Relie.|dog=chien|cat=chat|bird=oiseau',
    'C|Classe.|Noms: table;chat|Verbes: courir;lire',
    'X|Touche les verbes.|Le chat *dort* et *ronronne* au soleil.|dort, ronronne.',
    'N|√2 ≈ ?|1,414|0,01|Racine de 2.',
    'P|Répète.|I am happy.',
    'K|Rejoue la mélodie.|C4 D4 E4', 'M|Varier les exercices.'].join('\n'));
  await page.locator('#creer').click();
  await page.locator('#resultat .ok').waitFor({ timeout: 5000 });
  ok(/8 questions/.test(await page.locator('#resultat').innerText()), 'format en lignes : les 8 nouveaux types sont reconnus');
  await page.locator('#resultat a.btn').click();
  await page.waitForURL(/page=quiz_huit-types_/);
  await page.locator('.start-btn').click();
  const exact = t => new RegExp('^\\s*(?:\\d+)?' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
  const typesJoues = [];
  for (let i = 0; i < 8; i++) {
    const q = await page.evaluate(() => { const e = MoteurQuiz._etat(); return e.shuffled[e.cur]; });
    typesJoues.push(q.type);
    if (q.type === 'trous') { const t = page.locator('.ex-trou'); await t.nth(0).fill('a'); await t.nth(1).fill('était'); await page.keyboard.press('Enter'); }
    else if (q.type === 'ordre') { for (const x of q.items) await page.locator('.ex-ligne:not(.ordre) .ex-puce', { hasText: exact(x) }).click(); await page.locator('.ex-valider').click(); }
    else if (q.type === 'paires') { for (const [g, d] of q.paires) { await page.locator('.ex-col').nth(0).locator('.ex-puce', { hasText: exact(g) }).click(); await page.locator('.ex-col').nth(1).locator('.ex-puce', { hasText: exact(d) }).click(); } await page.locator('.ex-valider').click(); }
    else if (q.type === 'classer') { for (const [gi, g] of q.groupes.entries()) for (const x of g.items) { await page.locator('.ex-ligne').first().locator('.ex-puce', { hasText: exact(x) }).click(); await page.locator('.ex-case-nom').nth(gi).click(); } await page.locator('.ex-valider').click(); }
    else if (q.type === 'cliquer') { await page.locator('.ex-motbtn', { hasText: /^dort$/ }).click(); await page.locator('.ex-motbtn', { hasText: /^ronronne$/ }).click(); await page.locator('.ex-valider').click(); }
    else if (q.type === 'nombre') { await page.fill('#ans-input', '1,41'); await page.keyboard.press('Enter'); }
    else if (q.type === 'parler') { await page.locator('.ex-puce.ok').click(); }
    else if (q.type === 'clavier') { for (const n of ['do', 'ré', 'mi']) await page.locator('.ex-touche', { hasText: new RegExp('^' + n + '$') }).click(); }
    const juste = await page.evaluate(() => { const e = MoteurQuiz._etat(); return !!(e.answers[e.cur] && e.answers[e.cur].ok); });
    if (!juste) console.log('   réponse refusée pour le type', q.type);
    await page.locator('.next-btn').click();
  }
  ok(/^8/.test(await page.locator('.result-score').innerText()) && new Set(typesJoues).size === 8, 'nouveaux types : texte à trous, ordre, paires, classement, mots à toucher, nombre, micro, clavier jouables au toucher (8/8)');

  await page.goto(BASE + '/exec');
  ok((await page.evaluate(() => (QUIZ.find(q => /listen-and-notes/.test(q.fichier)) || {}))).badge === '🏅' && (await page.evaluate(() => (QUIZ.find(q => /listen-and-notes/.test(q.fichier)) || {}).matiere)) === 'anglais', 'catalogue : badge et matière du quiz créé');
  await page.goto(BASE + '/exec?page=ajouter');
  await page.evaluate(() => { document.getElementById('secours').open = true; });
  await page.fill('#reponse', 'bonjour');
  await page.locator('#creer').click();
  await page.locator('#resultat .ko').waitFor({ timeout: 5000 });
  ok(true, 'texte invalide → message d\'erreur clair');

  // contrôles PDF
  await page.goto(BASE + '/exec?page=controles');
  const lien = page.locator('a.open').first();
  await Promise.all([page.waitForEvent('popup', { timeout: 5000 }).catch(() => null), lien.click()]);
  ok(/drive\.google\.com\/file\/d\//.test(await lien.getAttribute('href')), 'lien PDF réécrit vers Drive');

  // prénom
  await ev('CONFIG.prenom = "Zoé"');
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  ok(/Zoé/.test(await page.locator('h1').innerText()), 'prénom personnalisé');

  // page inconnue + suppression
  await page.goto(BASE + '/exec?page=nexiste-pas');
  ok(/Quiz introuvable/.test(await page.locator('body').innerText()), 'page inconnue → message clair');
  const avant = Object.values((await ev('1')).sheets)[0].rows.length;
  const r = await ev('apiSupprimer(apiLister({}).resultats[0].id)');
  ok(r.r.ok && Object.values(r.sheets)[0].rows.length === avant - 1, 'suppression d\'une partie');

  // page parents : liste des quiz, suppression avec confirmation (corbeille du Drive) ; plus de croix dans « Mes quiz »
  await page.goto(BASE + '/exec');
  ok(await page.locator('a.card .suppr').count() === 0, 'Mes quiz : pas de bouton de suppression côté enfant');
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  await page.locator('.onglet[data-o=quiz]').click();
  ok(await page.locator('#p-quiz').isVisible() && !(await page.locator('#p-resultats').isVisible()), 'page parents : l\'onglet « Gérer les quiz » s\'ouvre');
  const ligne = page.locator('#liste-quiz tr', { hasText: 'Les volcans' });
  await ligne.locator('button').click();
  ok(await page.locator('.boite').isVisible() && /Les volcans/.test(await page.locator('.boite').innerText()), 'page parents : « Supprimer » demande une confirmation');
  await page.locator('.boite button', { hasText: 'Annuler' }).click();
  ok(await ligne.count() === 1 && readdirSync(join(DRIVE, 'SoccaQuiz')).some(n => /les-volcans/.test(n)), 'page parents : « Annuler » ne supprime rien');
  await ligne.locator('button').click();
  await page.locator('.boite button[data-r=oui]').click();
  await page.waitForFunction(() => !/Les volcans/.test(document.getElementById('liste-quiz').innerText));
  await page.locator('.onglet[data-o=reglages]').click();
  ok(await page.locator('#appareil button').isVisible() && /installé à la main|Site de l'enfant/.test(await page.locator('#adresses').innerText()), 'page parents : l\'onglet « Réglages » montre l\'appareil et les adresses');
  await page.goto(BASE + '/exec');
  ok(await page.locator('a.card', { hasText: 'Les volcans' }).count() === 0 && !readdirSync(join(DRIVE, 'SoccaQuiz')).some(n => /les-volcans/.test(n)), 'page parents : quiz supprimé (fichier à la corbeille, absent de « Mes quiz »)');

  // deux espaces : site de l'enfant (pages et actions des parents refusées) et espace parent
  await ev('CONFIG.espace = "enfant"; CONFIG.urlParent = "https://parent.example/macros/s/P/exec"');
  await page.goto(BASE + '/exec?page=ajouter');
  ok(/Espace parent/.test(await page.locator('body').innerText()) && await page.locator('#reponse').count() === 0, 'site de l\'enfant : « Ajouter un quiz » renvoie vers l\'espace parent');
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  ok(/réservée aux parents/.test(await page.locator('body').innerText()), 'site de l\'enfant : le suivi des résultats est réservé aux parents');
  const refus = await ev('[apiAjouterQuiz("T|Essai|x|autre|⭐|⭐\\nQ|a|b|c|d|e"), apiGeminiCle({ cle: "" }), apiSupprimerQuiz("x.html"), apiSupprimer("r:2026-01-01T00:00:00.000Z:abc"), apiClasse({ classe: "CP" }), apiSaison({ active: false })]');
  ok(refus.r.every(x => x && x.__status === 403), 'site de l\'enfant : ajout, clé Gemini et suppressions refusés côté Google');
  await page.goto(BASE + '/exec');
  const pied = await page.locator('#foot').innerText();
  ok(/Espace parent/.test(pied) && !/Ajouter un quiz|Suivi/.test(pied) && await page.locator('a.card').count() > 0, 'site de l\'enfant : quiz visibles, seul lien parent « 🔒 Espace parent »');
  await ev('CONFIG.espace = "parent"; CONFIG.urlParent = ""');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#actions').isVisible() && /Créer un quiz/.test(await page.locator('#actions').innerText()) && await page.locator('a.card').count() === 0, 'espace parent : l\'accueil est le tableau de bord des parents (actions, pas la page de l\'enfant)');
  ok(await page.locator('#liste-quiz a.tester').count() > 0 && await page.locator('#liste-quiz button[data-f]').count() > 0, 'espace parent : chaque quiz peut être testé ou supprimé');
  ok(/Clé Gemini/.test(await page.locator('#info-gemini').innerText()), 'espace parent : état de la clé Gemini affiché');
  // classe et thème : choix dans Réglages, thème posé sur <html>, montée automatique au 1er septembre
  ok(await page.locator('html').getAttribute('data-theme') === 'explorateurs' && await page.locator('#choix-classe').count() === 1, 'espace parent : thème par défaut « explorateurs » et choix de la classe dans Réglages');
  const cl = await ev('[apiClasse({ classe: "CP" }), apiClasse({ classe: "Z" }), (PropertiesService.getScriptProperties().setProperty("CLASSE_ANNEE", String(anneeScolaire_() - 2)), classe_()), apiClasse({ classe: "Tle" }), (PropertiesService.getScriptProperties().setProperty("CLASSE_ANNEE", String(anneeScolaire_() - 3)), classe_()), apiClasse({ classe: "adulte" }).theme]');
  ok(cl.r[0].theme === 'lecteurs' && cl.r[1].erreur && cl.r[2] === 'CE2' && cl.r[4] === 'Tle' && cl.r[5] === 'parent', 'classe : thème déduit, classe inconnue refusée, passage en classe supérieure chaque année (sans dépasser la terminale), adulte → thème parent');
  await page.goto(BASE + '/exec');
  ok(await page.locator('html').getAttribute('data-theme') === 'parent', 'espace parent : le thème choisi est appliqué à la page');
  ok((await ev('apiClasse({ classe: "" }).theme')).r === 'explorateurs', 'classe effacée : retour au thème de base');
  // saisons : calendrier (Pâques calculé), réglage parent, attribut posé sur la page
  const sa = await ev('[2026, 2027].map(a => paques_(a).toDateString()).concat(["2026-12-10","2027-01-15","2027-03-20","2026-04-10","2026-05-20","2026-07-14","2026-09-05","2026-10-01","2026-10-31","2026-11-14"].map(x => { const [y, m, j] = x.split("-").map(Number); return saisonDe_(new Date(y, m - 1, j)); }))');
  ok(sa.r.join() === 'Sun Apr 05 2026,Sun Mar 28 2027,noel,hiver,paques,paques,printemps,ete,rentree,automne,halloween,automne', 'saisons : Pâques 2026 et 2027, Noël, hiver, Pâques (même en mars), printemps, été, rentrée, automne, Halloween (seconde quinzaine d\'octobre)');
  await page.goto(BASE + '/exec');
  ok(!!(await page.locator('html').getAttribute('data-saison')) && await page.locator('#choix-saison').count() === 1, 'saisons : décor posé sur la page, case à cocher dans Réglages');
  ok((await ev('apiSaison({ active: false }).saison')).r === '', 'saisons : le parent peut éteindre les décorations');
  await page.goto(BASE + '/exec');
  ok(await page.locator('html').getAttribute('data-saison') === null, 'saisons éteintes : plus de décor sur la page');
  await ev('apiSaison({ active: true })');
  const essai = await ev('apiEnregistrer(JSON.stringify({ quiz: "x", score: 1, total: 2 }))');
  ok(essai.r.essai === true, 'espace parent : les essais du parent ne sont pas comptés dans les résultats');
  await ev('CONFIG.espace = ""');

  // site réinstallé après le passage à SoccaQuiz : il retrouve l'ancien dossier « Universal Quiz » et son Sheets
  const ancien = await ev(`(function () {
    const d = DriveApp.createFolder('Universal Quiz');
    const ss = SpreadsheetApp.create('Universal Quiz – Résultats'); DriveApp.getFileById(ss.getId()).moveTo(d);
    PropertiesService.getScriptProperties().setProperties({ DOSSIER: '', RESULTATS: '' });
    // l'ancien site n'avait que le dossier « Universal Quiz » : on cache le dossier SoccaQuiz du test
    const vrai = DriveApp.getRootFolder;
    DriveApp.getRootFolder = () => { const r = vrai(); const f = r.getFoldersByName; r.getFoldersByName = n => n === 'SoccaQuiz' ? { hasNext: () => false } : f(n); return r; };
    const i = installer_();
    DriveApp.getRootFolder = vrai;
    return { dossier: i.dossier.getName(), ss: i.ss.getId() === ss.getId() };
  })()`);
  ok(ancien.r && ancien.r.dossier === 'Universal Quiz' && ancien.r.ss, 'site réinstallé : reprend l\'ancien dossier « Universal Quiz » et ses résultats');
  ok(erreursJs.length === 0, 'aucune erreur JavaScript' + (erreursJs.length ? ' :\n   ' + erreursJs.join('\n   ') : ''));
} finally {
  await browser.close();
  serveur.kill();
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
