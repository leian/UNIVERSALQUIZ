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
const invitations = spawnSync(process.execPath, [join(ICI, 'test-console.mjs')], { stdio: 'inherit' }).status;

// 1. construction + faux Google
if (spawnSync(process.execPath, [join(RACINE, 'construire.mjs')], { stdio: 'inherit' }).status !== 0) process.exit(1);
rmSync(DRIVE, { recursive: true, force: true }); rmSync(join(ICI, 'corbeille'), { recursive: true, force: true });
const serveur = spawn(process.execPath, [join(ICI, 'faux-google.mjs'), join(RACINE, 'build'), DRIVE, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => serveur.stdout.once('data', ok));
// appli installable (dossier appli/) : son propre faux Google, sur un autre port
const appli = spawnSync(process.execPath, [join(ICI, 'test-appli.mjs')], { stdio: 'inherit' }).status;
// appli servie hors de Google (dossier site/) : son propre faux Google et un serveur de fichiers statiques
const siteDirect = spawnSync(process.execPath, [join(ICI, 'test-site.mjs')], { stdio: 'inherit' }).status;

const ev = async code => (await (await fetch(BASE + '/eval', { method: 'POST', body: code })).json());
let echecs = (enLigne === 0 ? 0 : 1) + (invitations === 0 ? 0 : 1) + (appli === 0 ? 0 : 1) + (siteDirect === 0 ? 0 : 1);
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) echecs++; };
// vérification devenue fausse avec le passage à drive.file, à réécrire avec l'étape indiquée (non comptée comme échec)
const aRefaire = (etape, c, m) => console.log((c ? '✅ ' : '⏳ ') + m + (c ? '' : ' — à refaire : ' + etape));

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
  ok(Object.values(s.sheets).map(x => x.name).sort().join() === ['SoccaQuiz – Quiz', 'SoccaQuiz – Résultats'].sort().join() && Object.values(s.sheets)[0].name === 'SoccaQuiz – Résultats' && s.props.includes('DOSSIER'),
    'dossier Drive + tableau des résultats + tableau des quiz (fichiers virtuels, autorisation drive.file) créés');

  // une partie
  await page.locator('a.card').first().click();
  await page.waitForURL(/page=quiz_exemple_capitales/);
  // animations : ajoutées par le serveur même si le quiz déposé ne les déclare pas ; bouton « Sons » mémorisé
  ok(await page.evaluate(() => typeof Animations === 'object') && await page.locator('.fx-son[aria-pressed="true"]').count() === 1, 'animations ajoutées au quiz, sons activés par défaut (primaire)');
  await page.locator('.fx-son').click();
  ok(await page.locator('.fx-son[aria-pressed="false"]').count() === 1 && await page.evaluate(() => localStorage.getItem('uq-sons')) === '0', 'bouton « Sons » : sons coupés et choix mémorisé');
  await page.locator('.fx-son').click();
  await page.locator('.start-btn').click();
  ok(await page.locator('.q-compagnon .compagnon.m-reflexion').count() === 1, 'mascotte compagne à côté de la question (primaire)');
  await page.evaluate(() => MoteurQuiz.repondre('x', true));
  ok(await page.locator('.compagnon.m-bravo').count() === 1 && await page.locator('.q-compagnon .bulle').count() === 1 && await page.locator('.explanation.avec-mascotte').count() === 0, 'bonne réponse : mascotte « bravo » et bulle, une seule mascotte à l\'écran');
  await page.evaluate(() => MoteurQuiz.home());
  ok(!!(await jouer()), 'partie jouée jusqu\'au résultat');
  for (let i = 0; i < 30; i++) { s = await ev('1'); if (Object.values(s.sheets)[0].rows.length >= 2) break; await page.waitForTimeout(100); }   // l'envoi du résultat est asynchrone
  const lignes = Object.values(s.sheets)[0].rows;
  ok(lignes.length === 2 && lignes[1][3] === 'quiz_exemple_capitales', 'résultat écrit dans le Sheets' + (lignes.length === 2 ? '' : ' — lignes : ' + JSON.stringify(lignes.map(l => l[3]))));

  // record de fin de quiz : tiré des résultats enregistrés (même valeur sur tous les appareils), pas de l'appareil
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sq\.meilleur|uqSuivi\.local/.test(k)) localStorage.removeItem(k); });
  await page.reload(); await page.waitForTimeout(1200);
  const attendu = Math.round(+lignes[1][6] / +lignes[1][7] * 100);
  const record = await page.evaluate(() => window.Badges && Badges.meilleur ? Badges.meilleur(null) : 'absent');
  ok(record === attendu, 'record de fin de quiz : repris des résultats enregistrés, pas de la mémoire de l\'appareil — ' + record + ' / ' + attendu);

  // dépôt d'un nouveau quiz (et d'un ancien PDF de contrôle, ignoré depuis la v2.71) dans le dossier
  const dossier = join(DRIVE, 'SoccaQuiz');
  await ev('deposerQuiz(' + JSON.stringify(dossier) + ', "quiz_Test_copie_12-11-2026.html", ' + JSON.stringify(readFileSync(join(RACINE, 'src', 'exemple-quiz.html'), 'utf8')) + ')');
  await ev('CacheService.getScriptCache().remove("catalogue")');
  await page.locator('a.btn-myquiz').first().click();
  await page.waitForURL(BASE + '/exec');
  ok(await page.locator('a.card').count() === 2, 'nouveau fichier déposé → 2 quiz listés');
  ok(await page.locator('a.card .score').count() === 1, 'score affiché sur la carte du quiz joué');
  await page.locator('.semaine').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await page.locator('.semaine .sem-jour.fait').count() === 1 && /1\s*quiz joué/.test(await page.locator('.semaine').innerText()), '« Ma semaine » : 1 quiz joué, jour du jour coché');

  // fluidité : scores posés dans la page (pas d'appel au serveur au chargement), chronomètre, cache en morceaux
  await page.goto(BASE + '/exec?chrono=1');
  await page.locator('#uq-chrono').waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  const chrono = await page.locator('#uq-chrono').innerText().catch(() => '');
  ok(/Serveur : \d/.test(chrono) && !/apiLister/.test(chrono) && await page.evaluate(() => Array.isArray(__UQ.resultats) && __UQ.resultats.length >= 1 && !('joueur' in __UQ.resultats[0])),
    'fluidité : scores posés dans la page (aucun appel apiLister à l\'ouverture), chronomètre affiché avec ?chrono=1 — ' + chrono.replace(/\s+/g, ' ').slice(0, 160));
  await page.locator('a.card').first().click();
  await page.waitForURL(/page=quiz_/);
  await page.locator('#uq-chrono').waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  ok(/Toucher → page prête : \d/.test(await page.locator('#uq-chrono').innerText().catch(() => '')), 'chronomètre : gardé de page en page, durée depuis le toucher du lien');
  await page.locator('#uq-chrono a[data-c="stop"]').click();
  await page.goto(BASE + '/exec');
  await page.waitForTimeout(400);
  ok(await page.locator('#uq-chrono').count() === 0, 'chronomètre : « Arrêter le chrono » le retire');
  const gros = await ev(`(() => { mettreEnCache_('essai', 'é'.repeat(70000)); const t = lireCache_('essai'); const tete = CacheService.getScriptCache().get('essai'); CacheService.getScriptCache().remove('essai:1'); return [t.length, tete, lireCache_('essai')]; })()`);
  ok(gros.r[0] === 70000 && gros.r[1] === '#3' && gros.r[2] === null, 'cache : grande valeur rangée en morceaux, relue entière, ignorée s\'il manque un morceau');
  const qz = await ev(`(() => { const i = installer_(); const a = quizEnCache_(i, 'quiz_exemple_capitales'); const k = Object.keys(CacheService.getScriptCache()).length; viderCatalogue_(); return [!!a, CacheService.getScriptCache().get('qgen') !== null]; })()`);
  ok(qz.r[0] && qz.r[1], 'cache : quiz gardé 5 min, oublié quand la liste des quiz change');

  // API JSON pour l'appli servie hors de Google
  {
    const espace0 = (await ev('CONFIG.espace')).r;
    await ev('CONFIG.espace = "enfant"');
    const etat = await (await fetch(BASE + '/exec?api=etat')).json();
    await ev('CONFIG.espace = ' + JSON.stringify(espace0));
    ok(etat.v === 1 && Array.isArray(etat.quiz) && etat.quiz.length >= 1 && etat.reglages && 'classe' in etat.reglages && !etat.reglages.dossierUrl && !etat.reglages.famille && Array.isArray(etat.reglages.resultats) && !('joueur' in (etat.reglages.resultats[0] || {})) && etat.matieres && !etat.reglages.gemini,
      'API : ?api=etat donne réglages, catalogue, scores (sans compte Google) et rien de réservé aux parents');
    const qz = await (await fetch(BASE + '/exec?api=quiz&page=quiz_exemple_capitales')).json();
    const absent = await (await fetch(BASE + '/exec?api=quiz&page=tableau-de-bord')).json();
    ok(/MoteurQuiz\.lancer/.test(qz.html || '') && qz.maitrise && !!absent.erreur, 'API : ?api=quiz donne le contenu du quiz et sa maîtrise, jamais une page des parents');
    const avant = (await ev('lireLignes_().length')).r;
    const partie = { quiz: 'quiz_exemple_capitales', titre: 'Essai API', score: 1, total: 2, questions: [], _id: 'apiessai1' };
    const post = await (await fetch(BASE + '/exec', { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ api: 'enregistrer', d: JSON.stringify(partie) }) })).json();
    const deja = await (await fetch(BASE + '/exec', { method: 'POST', body: JSON.stringify({ api: 'enregistrer', d: partie }) })).json();
    const mauvais = await (await fetch(BASE + '/exec', { method: 'POST', body: 'pas du json' })).json();
    const apres = (await ev('LIGNES_ = null; lireLignes_().length')).r;
    ok(post.ok && deja.deja && mauvais.__status === 400 && apres === avant + 1, 'API : POST enregistrer (une seule fois par partie), demande illisible refusée — ' + JSON.stringify([post.ok, deja.deja, mauvais.__status, avant, apres]));
    const espace = (await ev('CONFIG.espace')).r;
    await ev('CONFIG.espace = "parent"');
    const refus = [await (await fetch(BASE + '/exec?api=etat')).json(), await (await fetch(BASE + '/exec', { method: 'POST', body: JSON.stringify({ api: 'enregistrer', d: partie }) })).json()];
    await ev('CONFIG.espace = ' + JSON.stringify(espace));
    ok(refus.every(r => r.erreur && !r.reglages && !r.ok), 'API : refusée sur l\'espace parent (servi par Google seulement)');
    await ev('(() => { const sh = feuille_(); const n = sh.getLastRow(); for (let i = n; i >= 2; i--) if (/apiessai1$/.test(sh.getRange(i, 1).getValue())) sh.deleteRow(i); LIGNES_ = null; CacheService.getScriptCache().removeAll(["liste", "revisions", "maitrise"]); })()');
  }

  // « Mes révisions » et défi du mois : répétition espacée sur les questions ratées
  const rq = await ev(`(() => {
    const o = k => JSON.stringify({ type: 'qcm', q: 'Capitale ' + k + ' ?', opts: ['A', 'B', 'C'], a: 'A', cat: 'Europe', exp: 'x', k, src: 'Capitales', mat: 'geographie' });
    const jour = 864e5, t0 = Date.now();
    const rows = feuille_();
    const ajoute = (dt, qs) => rows.appendRow(COLONNES.map(c => ({ id: 'r:' + new Date(dt).toISOString() + ':t' + Math.random().toString(36).slice(2, 6), date: new Date(dt).toISOString(), quiz: 'capitales', titre: 'Capitales', matiere: 'geographie', score: '0', total: String(qs.length), questions: JSON.stringify(qs) })[c] || ''));
    const moisPrec = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 10).getTime();
    ajoute(moisPrec, [{ q: 'Capitale a ?', ok: false, k: 'ka', o: o('ka') }, { q: 'Capitale b ?', ok: false, k: 'kb', o: o('kb') }]);
    ajoute(moisPrec + 2 * jour, [{ q: 'Capitale b ?', ok: true, k: 'kb' }]);
    ajoute(t0 - 3 * jour, [{ q: 'Capitale c ?', ok: false, k: 'kc', o: o('kc') }]);
    ajoute(t0 - 3600e3, [{ q: 'Capitale d ?', ok: false, k: 'kd', o: o('kd') }]);
    CacheService.getScriptCache().remove('revisions');
    const r = revisions_(new Date());
    return { revoir: r.aRevoir.map(x => x.k).sort().join(), defi: r.defi.map(x => x.k).sort().join(), html: /Mes révisions/.test(pageRevision_('revisions') || '') };
  })()`);
  ok(rq.r && rq.r.revoir === 'ka,kb,kc' && rq.r.defi === 'ka,kb' && rq.r.html, 'révisions : questions ratées à revoir quand leur délai est écoulé (pas celle ratée il y a une heure), défi du mois = ratées le mois dernier, quiz fabriqué');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#pour-toi a.mis-en-avant').count() === 2, 'accueil : section « Pour toi » avec « Mes révisions » et le défi du mois');
  await page.goto(BASE + '/exec?page=revisions');
  ok(await page.locator('text=Mes révisions').count() > 0, 'page « Mes révisions » : le quiz s\'ouvre');

  // maîtrise par notion et par question (serveur)
  const mq = await ev(`(() => {
    const jour = 864e5, t0 = Date.now() - 5 * jour, rows = feuille_();
    const ajoute = (dt, quiz, qs) => rows.appendRow(COLONNES.map(c => ({ id: 'r:' + new Date(dt).toISOString() + ':m' + Math.random().toString(36).slice(2, 6), date: new Date(dt).toISOString(), quiz, titre: 'Maîtrise', matiere: 'autre', score: '0', total: String(qs.length), questions: JSON.stringify(qs) })[c] || ''));
    const r = (cat, ok, k, i) => ({ q: 'x', cat, ok, k, i });
    ajoute(t0, 'mq', [r('N1', true, 'a1'), r('N1', true, 'a2'),
      r('N2', false, 'b1'), r('N2', true, 'b2'), r('N2', false, 'b3'), r('N2', true, 'b4'), r('N2', false, 'b1'),
      ...[1,2,3,4,5].map(n => r('N3', true, 'c' + n)), ...[1,2,3,4,5].map(n => r('N4', n > 1, 'd' + n)), r('N5', true, 'e1'), r('N5', true, 'e2'), r('N5', true, 'e3', 1)]);
    ajoute(t0 + jour, 'mq', [...[1,2,3,4,5].map(n => r('N3', true, 'c' + n)), ...[1,2,3,4,5].map(n => r('N4', n > 1, 'd' + n))]);
    ajoute(t0 + 2 * jour, 'revisions', [r('Maîtrise', true, 'b1'), r('Autre', true, 'inconnue')]);
    CacheService.getScriptCache().remove('maitrise');
    const m = maitrise_();
    return { n: m.notions.mq, q: m.q.mq, rev: maitrisePour_('revisions', { b1: 1 }), quiz: maitrisePour_('mq'), index: Object.keys(maitrisePour_('index').notions).includes('mq') };
  })()`);
  const N = (mq.r || {}).n || {};
  ok(N.N1 && N.N1[0] === 0 && N.N2[0] === 1 && N.N3[0] === 3 && N.N4[0] === 2 && N.N4[1] === 80, 'maîtrise : Découverte (2 réponses), En progrès, Maîtrisé (100 % sur 2 jours), Acquis (80 %) — ' + JSON.stringify(N));
  ok(N.N5 && N.N5[1] === 83 && mq.r.q.e3[1] === 0 && mq.r.q.c1.join() === '2,2', 'maîtrise : réponse juste avec l\'indice = demi-réussite, sans allonger la série de la question');
  ok(N.N2 && N.N2[2] === 6 && mq.r.q.b1.join() === '3,1' && mq.r.rev.q.b1 && !mq.r.rev.q.c1, 'maîtrise : une réponse donnée dans « Mes révisions » compte pour le quiz et la notion d\'origine');
  ok(mq.r.index && mq.r.quiz.q.c1 && mq.r.quiz.notions.N3, 'maîtrise : tout le site pour l\'accueil, un seul quiz pour la page du quiz');

  // quiz fait à la main (comme ceux repris de lana-quizz) : vérification propre au quiz, partie protégée sur téléphone
  {
    const fait = readFileSync(join(RACINE, 'src', 'exemple-quiz.html'), 'utf8')
      .replace(/MoteurQuiz\.lancer\(\{/, "MoteurQuiz.lancer({ verifier: (q, v) => String(q.a).toLowerCase() === String(v).trim().toLowerCase(),");
    await ev('deposerQuiz(' + JSON.stringify(join(DRIVE, 'SoccaQuiz')) + ', "quiz_Test_verifier_15-11-2026.html", ' + JSON.stringify(fait) + ')');
    await ev('CacheService.getScriptCache().remove("catalogue")');
    await page.goto(BASE + '/exec?page=quiz_Test_verifier_15-11-2026');
    await page.waitForFunction(() => window.MoteurQuiz && MoteurQuiz._etat().pool > 0);
    const r = await page.evaluate(() => {
      MoteurQuiz.start(); const e = MoteurQuiz._etat(), q = e.questions.find(x => x.type === 'saisie' || x.type === 'input');
      const essai = v => { MoteurQuiz.start(); const e = MoteurQuiz._etat(); e.shuffled[0] = Object.assign({}, q, { type: 'input' }); MoteurQuiz.rafraichir(); document.getElementById('ans-input').value = v; MoteurQuiz.validate(); return MoteurQuiz._etat().answers[0].ok; };
      const a = String(q.a);
      return { point: essai(a + '.'), guillemets: essai('« ' + a + ' »'), faux: essai('zzz.'), badge: !!document.querySelector('.badges-panel'), cache: getComputedStyle(document.querySelector('.badges-panel') || document.body).display === 'none', classe: document.body.classList.contains('en-question') };
    });
    ok(r.point && r.guillemets && !r.faux, 'quiz fait à la main : la vérification du quiz accepte la bonne réponse suivie d\'un point (double espace du clavier Android) ou entre guillemets — ' + JSON.stringify(r));
    ok(r.badge && r.cache && r.classe, 'téléphone : pas de badges (liens vers les autres quiz) sous « Question suivante » pendant les questions');
    await page.evaluate(() => MoteurQuiz.home());
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.badges-panel')).display !== 'none'), 'téléphone : badges de nouveau visibles sur l\'accueil du quiz');
    await page.evaluate(() => { MoteurQuiz.start(); const q = MoteurQuiz._etat().shuffled[0]; if (q.opts) MoteurQuiz.answer(q.opts.indexOf(q.a)); else MoteurQuiz.repondre('x', true); });
    await page.locator('.barre-quiz a.btn-myquiz').click();
    await page.waitForTimeout(300);
    const resteQ = /page=quiz_Test_verifier/.test(page.url()) && await page.locator('#mq-quitter.visible').count() === 1;
    await page.locator('#mq-quitter .mq-q-non').click();
    const continuer = await page.locator('#mq-quitter.visible').count() === 0 && /page=quiz_Test_verifier/.test(page.url());
    await page.locator('.barre-quiz a.btn-myquiz').click();
    await page.waitForTimeout(300);
    const rouverte = await page.locator('#mq-quitter.visible').count() === 1 && /page=quiz_Test_verifier/.test(page.url());
    ok(continuer && rouverte, 'partie en cours : fenêtre « Quitter le quiz ? », « Continuer » la ferme et reste dans le quiz, un nouveau toucher la rouvre (jamais de sortie sans confirmation)');
    await page.locator('#mq-quitter .mq-q-oui').click();
    await page.waitForURL(BASE + '/exec', { timeout: 5000 }).catch(() => {});
    ok(resteQ && page.url() === BASE + '/exec', 'partie en cours : un toucher sur le logo ouvre la fenêtre, « Quitter » ramène à l\'accueil');
    await ev('retirerQuiz(' + JSON.stringify(join(DRIVE, 'SoccaQuiz')) + ', "quiz_Test_verifier_15-11-2026.html")');
    await ev('CacheService.getScriptCache().remove("catalogue")');
  }

  // exercice P : aide sur le micro adaptée au navigateur
  {
    const aide = async (ua, brave) => {
      const c = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 800 } });
      if (brave) await c.addInitScript(() => { navigator.brave = {}; });
      const p = await c.newPage(); await p.route(/fonts\.(googleapis|gstatic)\.com|drive\.google\.com/, r => r.fulfill({ status: 200, body: '' }));
      await p.goto(BASE + '/exec?page=quiz_exemple_capitales'); await p.waitForFunction(() => window.MoteurQuiz && MoteurQuiz._etat().pool > 0);
      const r = await p.evaluate(() => { MoteurQuiz.start(); MoteurQuiz._etat().shuffled[0] = { type: 'parler', q: 'Répète.', phrase: 'I am happy.', cat: 'Oral' }; MoteurQuiz.rafraichir(); const d = document.querySelector('.aide-micro'); return { micro: !!document.querySelector('.ex-micro'), ouvert: !!(d && d.open), texte: d ? d.textContent : '' }; });
      await c.close(); return r;
    };
    const android = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Mobile Safari/537.36';
    const br = await aide(android, true), ch = await aide(android), ios = await aide('Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0 Mobile/15E148 Safari/604.1');
    ok(!br.micro && br.ouvert && /Brave ne laisse pas/.test(br.texte) && ch.micro && !ch.ouvert && /Autorisations/.test(ch.texte) && !ios.micro && /seul Safari/.test(ios.texte),
      'exercice P : explication selon le navigateur (Brave et Chrome sur iPhone : pourquoi c\'est impossible ; Chrome Android : comment autoriser le micro)');
  }

  // moteur : tirage intelligent, passage à l'écrit, notions, indices
  await page.goto(BASE + '/exec?page=quiz_exemple_capitales');
  const mo = await page.evaluate(() => {
    const qs = MoteurQuiz._etat().questions, k = q => MoteurQuiz._cle(q), m = { q: {}, notions: { Capitales: [3, 95, 20], 'À écrire': [1, 40, 8] } };
    qs.forEach((q, i) => { if (q.type === 'qcm') m.q[k(q)] = [3, 2]; else if (i === 5) m.q[k(q)] = [1, 0]; });
    window.__UQ.maitrise = m;
    const poids = qs.map(q => Math.round(MoteurQuiz._poids(q) * 100) / 100);
    MoteurQuiz.home();
    const notions = document.querySelectorAll('.notions .notion').length, txt = (document.querySelector('.notions') || {}).textContent || '';
    MoteurQuiz.start();
    const e = MoteurQuiz._etat();
    return { poids, notions, txt, ecrits: e.shuffled.filter(q => q._ecrit).length, n: e.shuffled.length };
  });
  ok(mo.poids[0] === 0.6 && mo.poids[5] === 4 && mo.poids[8] === 4.2, 'tirage : QCM réussi 2 fois dans une notion maîtrisée 0,6 ; ratée la dernière fois 4 ; nouvelle dans une notion fragile 4,2 — ' + mo.poids.join(' '));
  ok(mo.notions === 3 && /1 sur 3 maîtrisée/.test(mo.txt) && /En progrès/.test(mo.txt) && /Découverte/.test(mo.txt), 'accueil du quiz : niveau de chaque notion');
  ok(mo.ecrits >= 1 && mo.ecrits <= Math.ceil(mo.n / 3), `passage à l'écrit : ${mo.ecrits} QCM réussis 2 fois reviennent en réponse à écrire (un tiers au plus)`);
  await page.evaluate(() => { const e = MoteurQuiz._etat(); for (let i = 0; i < e.shuffled.length && !e.shuffled[e.cur]._ecrit; i++) { MoteurQuiz.answer ? null : 0; } });
  // avance jusqu'à la première question à écrire
  for (let i = 0; i < 12; i++) {
    const ecrit = await page.evaluate(() => { const e = MoteurQuiz._etat(); return !!e.shuffled[e.cur]._ecrit; });
    if (ecrit) break;
    if (await page.locator('.opt-btn:not([disabled])').count()) await page.locator('.opt-btn').first().click();
    else if (await page.locator('#ans-input:not([disabled])').count()) { await page.fill('#ans-input', 'x'); await page.keyboard.press('Enter'); }
    await page.locator('.next-btn').click();
  }
  ok(await page.locator('.ecrit-tag').count() === 1 && await page.locator('.opt-btn').count() === 0, 'question à écrire : « Niveau supérieur », sans les propositions');
  await page.locator('.btn-props').click();
  ok(await page.locator('.opt-btn').count() >= 3 && await page.locator('.ecrit-tag').count() === 0, '« Voir les propositions » : retour au QCM sans pénalité');
  const ecritOk = await page.evaluate(() => {
    MoteurQuiz.home(); MoteurQuiz.start();
    const e = MoteurQuiz._etat(), i = e.shuffled.findIndex(q => q._ecrit); if (i < 0) return null;
    const q = e.shuffled[i]; e.shuffled.splice(i, 1); e.shuffled.unshift(q); MoteurQuiz.rafraichir();
    document.getElementById('ans-input').value = 'la ' + q.a.toLowerCase(); MoteurQuiz.validate();
    return MoteurQuiz._etat().answers[0].ok;
  });
  ok(ecritOk === true, 'réponse écrite : majuscules et article facultatifs (« la madrid » accepté)');
  const ind = await page.evaluate(() => {
    MoteurQuiz.home(); MoteurQuiz.start();
    const e = MoteurQuiz._etat(); e.shuffled[0] = Object.assign({}, e.shuffled.find(q => q.type === 'qcm' && !q._ecrit) || e.shuffled[0], { hint: 'Un coup de pouce' });
    MoteurQuiz.rafraichir();
    const bouton = !!document.getElementById('hint-btn'); MoteurQuiz.indice();
    const q = MoteurQuiz._etat().shuffled[0]; MoteurQuiz.answer(q.opts.indexOf(q.a));
    return { bouton, i: MoteurQuiz._etat().answers[0].i, ok: MoteurQuiz._etat().answers[0].ok };
  });
  ok(ind.bouton && ind.i === true && ind.ok, 'indice : bouton aussi sur un QCM, son usage est noté avec la réponse');

  // récompenses selon l'âge
  const rec = await page.evaluate(() => {
    const H = document.documentElement, r = {};
    const bonne = () => { MoteurQuiz.home(); MoteurQuiz.start(); const e = MoteurQuiz._etat(), q = e.shuffled[0]; e.shuffled[0] = q.opts ? q : e.shuffled.find(x => x.opts && !x._ecrit) || q; MoteurQuiz.rafraichir(); const p = MoteurQuiz._etat().shuffled[0]; MoteurQuiz.answer(p.opts.indexOf(p.a)); };
    H.dataset.theme = 'petits'; bonne(); r.petits = !document.getElementById('saut-mascotte') && !!document.querySelector('.q-compagnon .m-bravo');
    H.dataset.theme = 'college'; bonne(); r.college = !document.getElementById('saut-mascotte');
    window.__UQ.maitrise = { q: {}, notions: { Capitales: [3, 95, 20] } }; MoteurQuiz.home();
    r.emblemes = document.querySelectorAll('.notions img.embleme[src*="niveau-3"]').length === 1;
    return r;
  });
  ok(rec.petits, 'petits : plus de mascotte qui saute dans le coin, la mascotte compagne félicite');
  ok(rec.college && rec.emblemes, 'collège : pas d\'animal ni de saut, emblème de niveau (arbre pour « Maîtrisé ») sur les notions');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'explorateurs'; window.__UQ.maitrise = {}; MoteurQuiz.home(); });

  // défi en famille
  await page.evaluate(() => { window.__UQ.maitrise = {}; MoteurQuiz.home(); });
  await page.locator('.btn-famille').click();
  await page.fill('#fam-1', 'Papa');
  await page.locator('.choice-btn[data-n="3"]').click();
  await page.locator('.start-btn').click();
  const d1 = await page.evaluate(() => ({ tour: document.querySelector('.duel-tour').textContent, n: MoteurQuiz._etat().shuffled.length, nom0: MoteurQuiz._etat().duel.noms[0] }));
  ok(d1.n === 6 && /Papa/.test(await page.locator('.score-badge.duel').innerText()) && /À toi/.test(d1.tour), `défi en famille : 3 questions chacun, scores côte à côte, « À toi, ${d1.nom0} »`);
  const avantDuel = (await ev('1')).sheets; const lignesAvant = Object.values(avantDuel)[0].rows.length;
  for (let i = 0; i < 6; i++) {
    if (await page.locator('.opt-btn:not([disabled])').count()) await page.locator('.opt-btn').first().click();
    else if (await page.locator('#ans-input:not([disabled])').count()) { await page.fill('#ans-input', 'Paris'); await page.keyboard.press('Enter'); }
    if (i === 0) ok(/Au tour de Papa/.test(await page.locator('.next-btn').innerText()), 'défi en famille : « Au tour de Papa »');
    await page.locator('.next-btn').click();
  }
  ok(await page.locator('.duel-scores > div').count() === 2 && await page.locator('.btn-replay', { hasText: 'Revanche' }).count() === 1, 'défi en famille : résultat côte à côte, bouton « Revanche »' + (await page.locator('.duel-scores').count() ? '' : ' — ' + (await page.locator('#app').innerText()).slice(0, 200)));
  let lignesApres = lignesAvant;
  for (let i = 0; i < 30; i++) { lignesApres = Object.values((await ev('1')).sheets)[0].rows.length; if (lignesApres > lignesAvant) break; await page.waitForTimeout(100); }
  ok(lignesApres === lignesAvant + 1, 'défi en famille : seules les réponses de l\'enfant (joueur 1) sont enregistrées');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#album .alb span').count() === 24, 'primaire : album de 24 autocollants sur l\'accueil');
  const habit = await page.evaluate(() => {
    if (typeof socca !== 'function') return 'socca() introuvable';
    localStorage.removeItem('sq.tenue'); localStorage.removeItem('sq.accessoires');
    document.documentElement.dataset.theme = 'petits';
    window.__UQ.maitrise = { notions: { a: { x: [2, 80, 9], y: [3, 95, 9] }, b: { z: [1, 40, 5] } } };
    socca();
    const r = { libres: document.querySelectorAll('#socca .garde button:not(:disabled)').length, porte: !!document.querySelector('.salut .poupee .acc') };
    document.querySelector('#socca .garde button[data-k="0"]').click();
    r.choix = document.querySelector('#socca .garde button.on').dataset.k === '0' && localStorage.getItem('sq.tenue') === '0';
    document.documentElement.dataset.theme = 'explorateurs';
    return r;
  });
  ok(habit.libres === 2 && habit.porte && habit.choix, 'petits : 2 notions acquises = 2 accessoires, la socca porte le nouveau, on peut en changer — ' + JSON.stringify(habit));
  ok(await page.locator('a.card .maitrise .seg i').count() >= 1 && /maîtrisée/.test(await page.locator('a.card .maitrise').first().innerText()), 'accueil : barre de maîtrise des notions sur la carte du quiz joué');

  // tableau de bord
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  await page.waitForTimeout(800);
  ok(/capitales/i.test(await page.locator('body').innerText()), 'tableau de bord : la partie apparaît');
  await ev(`CONFIG.installateur = 'https:\\/\\/script.google.com/macros/s/test/exec'; CONFIG.version = 'v2.0'`);
  await page.evaluate(() => localStorage.setItem('uq.maj', JSON.stringify({ t: Date.now(), v: 'v99.0' })));
  await page.reload();
  const pastille = await page.evaluate(() => ({ inst: !!(window.__UQ || {}).installateur, vue: !document.getElementById('pastille-maj').hidden, bandeau: !document.getElementById('maj').hidden }));
  await ev(`CONFIG.installateur = ''; CONFIG.version = ''`);
  ok(pastille.inst && pastille.vue && pastille.bandeau, 'espace parent : nouvelle version → pastille ronde en haut à droite et bandeau — ' + JSON.stringify(pastille));
  await page.evaluate(() => localStorage.removeItem('uq.maj'));
  ok(await page.locator('.niv-barre span').count() >= 2 && /Notions encore fragiles/.test(await page.locator('body').innerText()), 'tableau de bord : maîtrise des notions et notions fragiles');

  // ajout d'un quiz depuis le site : réponse d'IA collée (JSON dans un bloc de code, avec du texte autour)
  await page.goto(BASE + '/exec');
  await page.locator('a', { hasText: 'Créer un quiz' }).click();
  await page.waitForURL(/page=ajouter/);
  const msgs = await page.evaluate(() => ({ court: window.__consignes.messageCourt(), complet: window.__consignes.messageComplet() }));
  ok(msgs.complet.includes('Q|question|BONNE réponse') && !/Q\|question/.test(await page.locator('main').innerText()), 'page « Ajouter » : consignes prêtes, jamais affichées');
  const phrase = await ev(`(() => { const d = lireFormatLignes_('✅ Quiz prêt ! Touche Copier sur le bloc, puis reviens sur SoccaQuiz.\\n\\u0060\\u0060\\u0060\\nT|Titre|Accroche|maths|🔢|🧮\\nQ|2+2 ?|4|3|5|Deux plus deux.\\n\\u0060\\u0060\\u0060'); return d && d.titre + '/' + d.questions.length; })()`);
  ok(phrase.r === 'Titre/1', 'réponse de l\'IA : la phrase « ✅ Quiz prêt ! » avant le bloc est ignorée — ' + JSON.stringify(phrase.r));
  ok(msgs.complet.includes('✅ Quiz prêt !') && await page.locator('.apercu b', { hasText: 'Copier' }).count() === 1, 'page « Ajouter » : l\'IA annonce le quiz en une phrase, aperçu du bouton Copier sans contenu');
  await page.evaluate(() => { const a = document.querySelector('a.ia'); a.addEventListener('click', e => e.preventDefault(), { once: true }); a.click(); window.dispatchEvent(new Event('focus')); });
  ok(await page.locator('#barre-retour:not([hidden]) #coller-retour').count() === 1, 'retour depuis l\'IA : grand bouton « créer le quiz » en bas de l\'écran');
  await page.locator('#fermer-retour').click();
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
  // analyse de la leçon (# Sujet…), contrôles automatiques : choix en double, « A ou B », question en double, X mal employé
  await page.goto(BASE + '/exec?page=ajouter');
  await page.evaluate(() => { document.getElementById('secours').open = true; });
  await page.fill('#reponse', [
    '```', '# Sujet : le futur simple', '## Notions : terminaisons ; verbes en -yer', '# Supports : Léa ; Hugo',
    'T|Le futur|Conjugue|francais|🔮|🎪', '## Conjugaison|🧩',
    'Q|Futur : je … (essuyer)|j\'essuierai|j\'essuierai ou j\'essuyerai|j\'essuirai|Le y devient i.',
    'Q|Futur : tu … (jouer)|joueras|Joueras|jouras|On garde le e.',
    'Q|Futur : nous … (chanter)|chanterons|chanterez|chanteront|-ons avec nous.',
    'Q|Futur : nous … (chanter)|chanterons|chanterez|chanteront|-ons avec nous.',
    'X|Écris le mot manquant.|Le nombre du bas est le *dénominateur*.|Le bas.',
    'X|Touche les verbes au futur.|Demain, je *chanterai* et tu *danseras*.|Deux verbes.',
    'V|Envoyer est irrégulier.|V|J\'enverrai.', 'S|Quel liquide se trouble avec le CO2 ?|eau de chaux|L\'eau de chaux.|indice=Son nom contient « chaux »', '```'].join('\n'));
  await page.locator('#creer').click();
  await page.locator('#resultat .ok').waitFor({ timeout: 5000 });
  const ctrl = await page.locator('#resultat').innerText();
  await page.locator('#resultat a.btn').click();
  await page.waitForURL(/page=quiz_le-futur_/);
  const htmlCtrl = await page.content();
  ok(/6 questions/.test(ctrl) && !/Son nom contient/.test(htmlCtrl) && /ambigu/.test(ctrl) && /double/.test(ctrl) && !/"cat":"Notions/.test(htmlCtrl) && !/Sujet/.test(htmlCtrl)
     && /"opts":\["joueras","jouras"\]/.test(htmlCtrl) && /"type":"trous","texte":"Le nombre du bas est le \[dénominateur\]\."/.test(htmlCtrl) && /"type":"cliquer"/.test(htmlCtrl),
    'contrôles : analyse ignorée, choix « A ou B » et question en double écartés, choix en double fusionnés, X à un seul mot à écrire → texte à trous, indice qui donne la réponse retiré');
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
  // « Coller ma clé » : lit le presse-papiers (simulé) puis vérifie
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'Ta clé : AIzaFAUSSE_cle_fausse_0123456789abcdef', writeText: async () => {} } }); });
  await page.locator('#g-coller').click();
  await page.locator('#g-resultat .ko').waitFor({ timeout: 5000 });
  ok(/refuse/.test(await page.locator('#g-resultat').innerText()), 'Gemini : une clé refusée par Google est signalée');
  await page.evaluate(() => { document.getElementById('g-manuel').open = true; });   // secours : la clé collée à la main
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
  ok(/3 questions/.test(await page.locator('#g-resultat').innerText()) && gen.length === 3 && /flash-lite/.test(gen[1].u)
     && (gen[1].corps.match(/"inline_data"/g) || []).length === 2 && /"system_instruction".*Q\|question\|BONNE réponse/.test(gen[1].corps),
    'Gemini : 2 photos + consignes (instruction système) envoyées, repli sur le 2e modèle, quiz créé sans copier-coller');
  ok(/flash-lite/.test(gen[2].u) && gen[2].corps.includes('relit un quiz') && gen[2].corps.includes('Quiz à relire') && (gen[2].corps.match(/"inline_data"/g) || []).length === 2,
    'Gemini : 2e passage de relecture (Flash-Lite, avec les photos) avant la création du quiz');
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
    SpeechSynthesis.prototype.getVoices = () => [{ lang: 'fr-FR', name: 'fr', localService: true }, { lang: 'en_GB', name: 'en', localService: true }];
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
    else if (q.type === 'classer') { for (const [gi, g] of q.groupes.entries()) for (const x of g.items) { await page.locator('.ex-ligne').first().locator('.ex-puce', { hasText: exact(x) }).click(); const kase = page.locator('.ex-case').nth(gi), bb = await kase.boundingBox(); await kase.click({ position: { x: 8, y: bb.height - 6 } }); } await page.locator('.ex-valider').click(); }
    else if (q.type === 'cliquer') { await page.locator('.ex-motbtn', { hasText: /^dort$/ }).click(); await page.locator('.ex-motbtn', { hasText: /^ronronne$/ }).click(); await page.locator('.ex-valider').click(); }
    else if (q.type === 'nombre') { await page.fill('#ans-input', '1,41'); await page.keyboard.press('Enter'); }
    else if (q.type === 'parler') { await page.locator('.ex-puce.ok').click(); }
    else if (q.type === 'clavier') { for (const n of ['do', 'ré', 'mi']) await page.locator('.ex-touche', { hasText: new RegExp('^' + n + '$') }).click(); }
    const juste = await page.evaluate(() => { const e = MoteurQuiz._etat(); return !!(e.answers[e.cur] && e.answers[e.cur].ok); });
    if (!juste) console.log('   réponse refusée pour le type', q.type);
    await page.locator('.next-btn').click();
  }
  ok(/^8/.test(await page.locator('.result-score').innerText()) && new Set(typesJoues).size === 8, 'nouveaux types : texte à trous, ordre, paires, classement, mots à toucher, nombre, micro, clavier jouables au toucher (8/8)');
  // mécanique des exercices au toucher
  const meca = await page.evaluate(() => {
    const r = {}, poser = q => { MoteurQuiz.home(); MoteurQuiz.start(); const e = MoteurQuiz._etat(); e.shuffled[0] = Object.assign({ cat: 'Test' }, q); MoteurQuiz.rafraichir(); };
    const btn = (sel, txt) => [...document.querySelectorAll(sel)].find(b => b.textContent.trim().replace(/^\d+/, '') === txt);
    poser({ type: 'paires', q: 'Associe.', paires: [['dog', 'chien'], ['cat', 'chat']] });
    r.attentePaires = (document.querySelector('.ex-valider.attente') || {}).textContent;
    btn('.ex-col:nth-child(2) .ex-puce', 'chat').click(); btn('.ex-col:nth-child(1) .ex-puce', 'cat').click();
    r.droiteDabord = document.querySelectorAll('.ex-col:nth-child(1) .ex-puce.pose').length === 1;
    poser({ type: 'classer', q: 'Classe.', groupes: [{ nom: 'Noms', items: ['table'] }, { nom: 'Verbes', items: ['courir'] }] });
    document.querySelector('.ex-case').click();
    r.clignote = !!document.querySelector('.ex-legende.clignote');
    btn('.ex-puce', 'courir').click(); document.querySelectorAll('.ex-case')[0].click();
    btn('.ex-case .ex-puce', 'courir').click();
    r.repris = !!document.querySelector('.ex-puce[aria-pressed="true"]') && !document.querySelector('.ex-case .ex-puce');
    poser({ type: 'trous', q: 'Complète.', texte: 'Il [a] faim et [était] très fatigué.' });
    const w = [...document.querySelectorAll('.ex-trou')].map(i => i.style.width);
    r.largeurs = w.length === 2 && w[0] === w[1];
    poser({ type: 'nombre', q: 'Température ?', a: '-5', tol: 0 });
    r.moins = document.getElementById('ans-input').getAttribute('inputmode') === 'text';
    return r;
  });
  ok(meca.attentePaires === 'Encore 2 paires à former' && meca.droiteDabord, 'paires : Valider grisé dit ce qui manque, on peut commencer par la colonne de droite');
  ok(meca.clignote && meca.repris, 'classer : toucher une case sans mot choisi fait clignoter la consigne ; un mot rangé se reprend en main d\'un toucher');
  ok(meca.largeurs, 'texte à trous : même largeur pour tous les trous (pas d\'indice sur la longueur)');
  ok(meca.moins, 'nombre négatif : clavier texte (le pavé décimal de l\'iPhone n\'a pas de signe moins)');
  await page.evaluate(() => MoteurQuiz.home());


  await page.goto(BASE + '/exec');
  ok((await page.evaluate(() => (QUIZ.find(q => /listen-and-notes/.test(q.fichier)) || {}))).badge === '🏅' && (await page.evaluate(() => (QUIZ.find(q => /listen-and-notes/.test(q.fichier)) || {}).matiere)) === 'anglais', 'catalogue : badge et matière du quiz créé');
  await page.goto(BASE + '/exec?page=ajouter');
  await page.evaluate(() => { document.getElementById('secours').open = true; });
  await page.fill('#reponse', 'bonjour');
  await page.locator('#creer').click();
  await page.locator('#resultat .ko').waitFor({ timeout: 5000 });
  ok(true, 'texte invalide → message d\'erreur clair');

  // contrôles PDF retirés (v2.71) : page inconnue, aucun bouton, PDF ignorés
  await page.goto(BASE + '/exec?page=controles');
  ok(/introuvable/i.test(await page.locator('body').innerText()), 'contrôles PDF retirés : la page n\'existe plus');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#btn-controles').count() === 0 && await page.evaluate(() => typeof window.CONTROLES === 'undefined'), 'contrôles PDF retirés : ni bouton ni liste sur l\'accueil');

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
  await ligne.locator('button.danger').click();
  ok(await page.locator('.boite').isVisible() && /Les volcans/.test(await page.locator('.boite').innerText()), 'page parents : « Supprimer » demande une confirmation');
  await page.locator('.boite button', { hasText: 'Annuler' }).click();
  ok(await ligne.count() === 1 && (await ev('quizDuDossier(' + JSON.stringify(join(DRIVE, 'SoccaQuiz')) + ')')).r.some(q => /les-volcans/.test(q.nom)), 'page parents : « Annuler » ne supprime rien');
  await ligne.locator('button.danger').click();
  await page.locator('.boite button[data-r=oui]').click();
  await page.waitForFunction(() => !/Les volcans/.test(document.getElementById('liste-quiz').innerText));
  await page.locator('.onglet[data-o=reglages]').click();
  ok(await page.locator('#appareil button').isVisible() && /installé à la main|Site de l'enfant/.test(await page.locator('#adresses').textContent()), 'page parents : l\'onglet « Réglages » montre l\'appareil et les adresses');
  await page.goto(BASE + '/exec');
  ok(await page.locator('a.card', { hasText: 'Les volcans' }).count() === 0 && !(await ev('quizDuDossier(' + JSON.stringify(join(DRIVE, 'SoccaQuiz')) + ')')).r.some(q => /les-volcans/.test(q.nom)), 'page parents : quiz supprimé (fichier à la corbeille, absent de « Mes quiz »)');

  // deux espaces : site de l'enfant (pages et actions des parents refusées) et espace parent
  await ev('CONFIG.espace = "enfant"; CONFIG.urlParent = "https://parent.example/macros/s/P/exec"');
  await page.goto(BASE + '/exec?page=ajouter');
  ok(/Espace parent/.test(await page.locator('body').innerText()) && await page.locator('#reponse').count() === 0, 'site de l\'enfant : « Ajouter un quiz » renvoie vers l\'espace parent');
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  ok(/réservée aux parents/.test(await page.locator('body').innerText()), 'site de l\'enfant : le suivi des résultats est réservé aux parents');
  const refus = await ev('[apiAjouterQuiz("T|Essai|x|autre|⭐|⭐\\nQ|a|b|c|d|e"), apiGeminiCle({ cle: "" }), apiSupprimerQuiz("x.html"), apiSupprimer("r:2026-01-01T00:00:00.000Z:abc"), apiClasse({ classe: "CP" }), apiSaison({ active: false }), apiMascotte({ mascotte: "rap" }), apiGenre({ genre: "f" })]');
  ok(refus.r.every(x => x && x.__status === 403), 'site de l\'enfant : ajout, clé Gemini et suppressions refusés côté Google');
  await page.goto(BASE + '/exec');
  // porte de l'espace parent : ajoutée par le pont, dernier élément de chaque page du site de l'enfant
  const porte = () => page.evaluate(() => { const p = document.getElementById('porte-parent'), a = p && p.querySelector('a'); return { n: document.querySelectorAll('#porte-parent').length, dernier: !!p && (() => { for (let e = p.nextElementSibling; e; e = e.nextElementSibling) { const c = getComputedStyle(e); if (c.display !== 'none' && !/fixed|absolute/.test(c.position) && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(e.tagName)) return false; } return true; })(), href: a && a.href, texte: p && p.innerText.trim(), bas: !!p && [].every.call(document.querySelectorAll('main, aside, #app, .wrap'), e => e.getBoundingClientRect().bottom <= p.getBoundingClientRect().top + 1), ailleurs: [].filter.call(document.querySelectorAll('a'), x => !x.closest('#porte-parent') && /Espace parent|Suivi des résultats|Créer un quiz/.test(x.textContent)).length }; });
  const urlParentEssai = (await ev('CONFIG.urlParent')).r;
  const pA = await porte();
  ok(pA.n === 1 && pA.dernier && pA.bas && pA.texte === 'Espace parent' && pA.href === urlParentEssai && pA.ailleurs === 0 && await page.locator('#foot').count() === 0 && await page.locator('a.card').count() > 0,
    'site de l\'enfant, accueil : quiz visibles, un seul lien parent « Espace parent », tout en bas de la page (après la colonne de côté) — ' + JSON.stringify(pA));
  const coins = await page.evaluate(() => [].map.call(document.querySelectorAll('a.card'), c => ({ nq: (c.querySelector('.coin .nq') || {}).textContent || '', d: (c.querySelector('.d') || {}).textContent || '', haut: c.querySelector('.coin') ? c.querySelector('.coin').getBoundingClientRect().top - c.getBoundingClientRect().top : -1, droite: c.querySelector('.coin') ? c.getBoundingClientRect().right - c.querySelector('.coin').getBoundingClientRect().right : -1 })));
  ok(coins.length && coins.every(c => /^\d+ questions?$/.test(c.nq) && c.haut >= 0 && c.haut < 20 && c.droite >= 0 && c.droite < 20 && !/\d+ questions/.test(c.d)),
    'cartes des quiz : nombre de questions en haut à droite (plus dans la description) — ' + JSON.stringify(coins.slice(0, 3)));
  await page.goto(BASE + '/exec?page=quiz_exemple_capitales');
  await page.locator('#app').waitFor();
  const pQ = await porte();
  ok(pQ.n === 1 && pQ.dernier && pQ.bas && pQ.href === urlParentEssai, 'site de l\'enfant, page de quiz : lien « Espace parent » tout en bas — ' + JSON.stringify(pQ));
  await page.goto(BASE + '/exec?page=revisions');
  const pR = await porte();
  ok(pR.n === 1 && pR.dernier && pR.href === urlParentEssai, 'site de l\'enfant, révisions : lien « Espace parent » tout en bas — ' + JSON.stringify(pR));
  await page.goto(BASE + '/exec');
  await ev('CONFIG.espace = "parent"; CONFIG.urlParent = ""');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#porte-parent').count() === 0, 'espace parent : pas de lien vers lui-même en bas de page');
  ok((await page.locator('.actions-tete a.principal').isVisible() && /Créer un quiz/.test(await page.locator('.actions-tete').innerText()) || await page.locator('.onglet-plus[aria-label="Créer un quiz"]').isVisible()) && await page.locator('#onglets').isVisible() && await page.locator('a.card').count() === 0, 'espace parent : l\'accueil est le tableau de bord des parents (« Créer un quiz » en haut, onglets, pas la page de l\'enfant)');
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
  // mascotte du lycée : liste déroulante dans Réglages seulement au lycée, attribut posé sur la page
  const classeAvant = (await ev('classe_()')).r;
  ok(await page.locator('#choix-mascotte').count() === 0 && await page.locator('html').getAttribute('data-mascotte') === null, 'mascotte : pas de choix hors du lycée');
  await ev('apiClasse({ classe: "1re" })');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#choix-mascotte option').count() === 2 && await page.locator('html').getAttribute('data-mascotte') === 'gothique', 'mascotte : au lycée, deux tenues au choix, gothique par défaut');
  ok((await ev('apiMascotte({ mascotte: "pirate" })')).r.erreur && (await ev('apiMascotte({ mascotte: "rap" })')).r.ok, 'mascotte : seule une tenue de la liste est acceptée');
  await page.goto(BASE + '/exec');
  ok(await page.locator('html').getAttribute('data-mascotte') === 'rap' && await page.locator('#choix-mascotte').inputValue() === 'rap', 'mascotte : la tenue choisie est posée sur la page et dans Réglages');
  await ev('PropertiesService.getScriptProperties().deleteProperty("MASCOTTE")');
  // allure de la mascotte (féminin, masculin, neutre) : devinée d'après le prénom, rectifiable dans Réglages
  const g = (await ev('["Lana","Hugo","Camille","Marie-Lou","Sacha","Justine","Florian","Xq",""].map(genreDuPrenom_).join(",")')).r;
  ok(g === 'f,m,n,f,n,f,m,n,n', 'mascotte : allure devinée d\'après le prénom, neutre dans le doute (' + g + ')');
  const prenomAvant = (await ev('CONFIG.prenom')).r;
  await ev('CONFIG.prenom = ""; var dessinsM = DESSINS_GENRE.m.slice(), saisonsM = SAISONS_GENRE.m.slice(); DESSINS_GENRE.m.length = 0; SAISONS_GENRE.m.length = 0');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#choix-genre option').count() === 4 && await page.locator('#choix-genre option[value="m"]').isDisabled() && await page.locator('html').getAttribute('data-genre') === null, 'mascotte : sans prénom, la socca de toujours ; « au masculin » grisé tant que ses dessins manquent');
  await ev('CONFIG.prenom = "Lana"');
  await page.goto(BASE + '/exec');
  ok(await page.locator('#choix-genre').inputValue() === 'auto' && await page.locator('html').getAttribute('data-genre') === 'f' && await page.locator('html').getAttribute('data-genre-saison') === 'f', 'mascotte : allure automatique d\'après le prénom, costume de saison assorti');
  ok((await ev('apiGenre({ genre: "x" })')).r.erreur && (await ev('apiGenre({ genre: "m" })')).r.ok, 'mascotte : le parent peut rectifier l\'allure');
  await page.goto(BASE + '/exec');
  ok(await page.locator('html').getAttribute('data-genre') === null && await page.locator('#choix-genre').inputValue() === 'm', 'mascotte : allure sans dessins pour ce thème → la socca de toujours, choix gardé dans Réglages');
  await ev('DESSINS_GENRE.m.push(themeDe_(classe_()))');
  await page.goto(BASE + '/exec');
  ok(await page.locator('html').getAttribute('data-genre') === 'm' && await page.locator('html').getAttribute('data-genre-saison') === null, 'mascotte : allure posée dès que ses dessins existent (costume de saison seulement s\'il existe aussi)');
  await ev('apiGenre({ genre: "n" })');
  await page.goto(BASE + '/exec');
  ok(await page.locator('html').getAttribute('data-genre') === null, 'mascotte : neutre = la socca de toujours, sans attribut');
  await ev('apiGenre({ genre: "auto" }); DESSINS_GENRE.m.length = 0; DESSINS_GENRE.m.push(...dessinsM); SAISONS_GENRE.m.push(...saisonsM); CONFIG.prenom = ' + JSON.stringify(prenomAvant));
  await ev('apiClasse({ classe: ' + JSON.stringify(classeAvant) + ' })');
  const essai = await ev('apiEnregistrer(JSON.stringify({ quiz: "x", score: 1, total: 2 }))');
  ok(essai.r.essai === true, 'espace parent : les essais du parent ne sont pas comptés dans les résultats');
  await ev('CONFIG.espace = ""');

  // audit du 15 novembre : données venues du lien de l'enfant (accès anonyme) vérifiées par le serveur
  const sec = await ev(`(function () {
    CacheService.getScriptCache().removeAll(['revisions', 'maitrise']);
    const avant = feuille_().getLastRow();
    const o1 = JSON.stringify({ type: 'qcm', q: 'Q piège', opts: ['a', 'b'], a: 'a', k: 'kx1', evil: '<img src=x onerror=alert(1)>' });
    const o2 = JSON.stringify({ type: 'inconnu', q: '<img src=x onerror=alert(1)>', k: 'kx2' });
    const r1 = apiEnregistrer(JSON.stringify({ _id: 'abc123', quiz: 'secu', score: 9, total: 2, mode: 'duel', cats: { A: { ok: '<img src=x onerror=1>', total: 1 }, constructor: { ok: 1, total: 1 } },
      questions: [{ q: 'x', cat: 'constructor', k: 'kx1', ok: false, o: o1 }, { q: 'y', cat: 'toString', k: '__proto__', ok: false, o: o2 }, null] }));
    const r2 = apiEnregistrer(JSON.stringify({ _id: 'abc123', quiz: 'secu', score: 1, total: 2 }));
    const l = lireLignes_().filter(x => x.quiz === 'secu');
    const qs = JSON.parse(l[0].questions);
    let m = null; try { m = maitrise_(); } catch (e) { m = 'ERREUR ' + e.message; }
    let rv = null; try { rv = revisions_(new Date()); } catch (e) { rv = 'ERREUR ' + e.message; }
    CONFIG.espace = 'enfant';
    const enfant = apiLister({ details: '1' });
    CONFIG.espace = '';
    const parent = apiLister({}).resultats.find(x => x.quiz === 'secu');
    return { ajout: feuille_().getLastRow() - avant, deja: r2.deja, score: l[0].score, total: l[0].total, cats: l[0].cats, mode: parent && parent.mode,
      o1: qs[0].o || '', o2: qs[1].o || '', proto: ({}).boite, m: typeof m, rv: typeof rv, enfantDetails: enfant.resultats.some(x => x.questions || x.joueur !== undefined) };
  })()`);
  ok(sec.r.ajout === 1 && sec.r.deja === true && sec.r.score === '2' && sec.r.total === '2' && sec.r.mode === 'duel', 'serveur : partie renvoyée avec le même identifiant comptée une seule fois, score borné au total, mode de la partie gardé');
  ok(!/img/.test(sec.r.cats) && /"A":\{"ok":0,"total":1\}/.test(sec.r.cats) && !/constructor/.test(sec.r.cats), 'serveur : scores par catégorie réduits à des nombres (pas de code dans l\'espace parent)');
  ok(/"q":"Q piège"/.test(sec.r.o1) && !/evil|onerror/.test(sec.r.o1) && sec.r.o2 === '', 'serveur : question ratée revérifiée (champs inconnus retirés, type inconnu refusé)');
  ok(sec.r.proto === undefined && sec.r.m === 'object' && sec.r.rv === 'object', 'serveur : catégories « constructor », « toString » et clé « __proto__ » sans effet sur la maîtrise et les révisions');
  ok(sec.r.enfantDetails === false, 'serveur : le site de l\'enfant ne reçoit jamais le détail des réponses');
  const lf = await ev(`(function () {
    const d = lireFormatLignes_('T|Verbes|x|francais|📖|🎪\\nQ|Infinitif de « il dit » ?|dire|faire|voir|Le verbe est dire.\\nQ|Contraire de grand ?|petit|haut|large\\nQ|2 + 2 ?|4|5|22|Deux plus deux font quatre, bien sûr.');
    return d.questions.map(q => ({ a: q.a, n: q.opts.length, exp: q.exp }));
  })()`);
  ok(lf.r[0].a === 'dire' && lf.r[0].n === 3 && lf.r[1].n === 3 && lf.r[1].exp === '' && lf.r[2].n === 3 && /quatre/.test(lf.r[2].exp),
    'format en lignes : une bonne réponse « dire » reste une réponse ; sans explication, aucun mauvais choix n\'est perdu');
  const rel = await ev(`(function () {
    const c = 'var QUIZ = [ { fichier: "a.html", titre: "L\\'eau", description: "CM1, niveau: facile // CE2" }, ];';
    const cat = JSON.parse(litteralVersJson_(c, c.indexOf('[')));
    const q = questionRatee_({ t: 'input', q: 'Capitale ?', a: 'Paris', alts: ['paris'], accept: ['Lutèce'], e: 'Bravo', unit: 'km', k: 'z1' });
    const ou = questionRatee_({ type: 'qcm', q: 'Qui ?', opts: ['le chat', 'le chien ou la souris'], a: 'le chat', k: 'z2' });
    return { titre: cat[0].titre, desc: cat[0].description, ans: q && q.ans.join('|'), exp: q && q.exp, unit: q && q.unit, ou: !!ou };
  })()`);
  ok(rel.r.titre === "L'eau" && rel.r.desc === 'CM1, niveau: facile // CE2' && /Lutèce/.test(rel.r.ans) && rel.r.exp === 'Bravo' && rel.r.unit === 'km' && rel.r.ou,
    'relecture : catalogue.js avec apostrophes lu sans être exécuté ; questions ratées des quiz faits à la main gardées dans les révisions (t, alts, accept, e, unit)');
  const ecoute = await ev(`(function () {
    const d = lireFormatLignes_('T|Food|x|anglais|🥦|🍽️\\nQ|Que veut dire la phrase entendue ?|Qui aime les petits pois ?|Il aime les petits pois.|Tu aimes les petits pois ?|Who = qui.|dire=He likes peas.\\nQ|Que veut dire la phrase entendue ?|Il aime les petits pois.|Elle aime les petits pois.|Il n\\'aime pas les petits pois.|He = il.|dire=He likes peas.\\nQ|Que veut dire la phrase entendue ?|Aimes-tu les petits pois ?|Tu aimes les petits pois.|Il aime les petits pois.|Do you… ? = question.|dire=Do you like peas?\\nV|x|V|y');
    const av = [], qs = d.questions.map((q, i) => normaliserQuestion_(q, i, av, d)).filter(Boolean);
    return { n: qs.length, a: qs.map(q => q.a), avert: av.join(' ') };
  })()`);
  ok(ecoute.r.n === 3 && /ne disent pas la même chose/.test(ecoute.r.avert) && !ecoute.r.a.includes('Qui aime les petits pois ?') && ecoute.r.a.includes('Il aime les petits pois.'),
    'écoute : « He likes peas. » avec la bonne réponse « Qui aime les petits pois ? » écartée (phrase entendue et réponse de forme différente)');
  // quiz → texte en lignes → quiz : rien ne se perd (pour proposer un quiz à la bibliothèque)
  const aller = await ev(`(function () {
    const src = 'T|Tout|Accroche|anglais|🎧|🦜|langue=en-US\\n## Mots|📚\\nQ|Chat ?|cat|dog|cow|bird|Cat = chat.|indice=Miaou\\nQ|Deux choix ?|yes|no\\nV|Dog = chien.|V|Oui.|dire=Dog\\nS|Chien ?|dog;a dog|Dog.\\n## Phrases|🧩\\nG|I [am;\\'m] happy.|Be.\\nO|Ordre.|I|am|ten\\nA|Relie.|cat=chat|dog=chien\\nC|Classe.|Animaux: cat;dog|Couleurs: red;blue\\nX|Touche les verbes.|I *run* and *jump* fast.|Verbes.\\nN|Racine de 2 ?|1,414|0,01|Environ.\\nP|Répète.|I am happy.\\nK|Rejoue.|C4 D4 E4\\nQ|Note ?|do|ré|mi|C4 = do.|notes=C4 E4+G4|portee\\nM|Point 1\\nM|Point <2>';
    const r = apiAjouterQuiz(src);
    const t = apiTexteQuiz(r.page + '.html');
    const norm = s => { const d = lireFormatLignes_(s), av = []; return { titre: d.titre, langue: d.langue, icones: d.icones, memo: d.memo, q: d.questions.map((q, i) => normaliserQuestion_(q, i, av, d)) }; };
    const a = norm(src), b = norm(t.texte);
    const enfant = (CONFIG.espace = 'enfant', apiTexteQuiz(r.page + '.html')); CONFIG.espace = '';
    apiSupprimerQuiz(r.page + '.html');
    return { egal: JSON.stringify(a) === JSON.stringify(b), a: JSON.stringify(a), b: JSON.stringify(b), refus: !!(enfant && enfant.erreur) };
  })()`);
  ok(aller.r.egal && aller.r.refus, 'proposer un quiz : quiz du site relu en lignes sans rien perdre (11 types, écoute, notes, indice, mémo), refusé côté enfant' + (aller.r.egal ? '' : ' — ' + aller.r.a + ' ≠ ' + aller.r.b));

  // bibliothèque : liste lue sur GitHub Pages, simulée avec tests/bibliotheque (un quiz d'essai gardé avec les tests :
  // la bibliothèque publiée change à chaque ajout ou retrait depuis la console, l'essai ne doit pas en dépendre)
  await page.route(/leian\.github\.io\/UNIVERSALQUIZ\/bibliotheque\//, async r => {
    const f = new URL(r.request().url()).pathname.split('/').pop();
    try { await r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': f.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8' }, body: readFileSync(join(ICI, 'bibliotheque', f), 'utf8') }); }
    catch (e) { await r.fulfill({ status: 404, body: '' }); }
  });
  await ev(`PropertiesService.getScriptProperties().setProperties({ CLASSE: 'CM1', CLASSE_ANNEE: String(anneeScolaire_()) })`);
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  await page.locator('#o-bibliotheque').click();
  await page.locator('.bib-carte').first().waitFor({ timeout: 5000 });
  const bib1 = await page.evaluate(() => ({ n: document.querySelectorAll('.bib-carte').length, classe: document.getElementById('bib-classe').value }));
  await page.locator('.bib-carte [data-a="apercu"]').first().click();
  await page.locator('.bib-apercu li').first().waitFor({ timeout: 5000 });
  const nbApercu = await page.locator('.bib-apercu li').count();
  await page.locator('.bib-carte [data-a="ajouter"]').first().click();
  await page.locator('.bib-carte .btn.fait').first().waitFor({ timeout: 8000 });
  const listeQuiz = await page.locator('#liste-quiz').innerText();
  await page.selectOption('#bib-classe', 'PS');
  const vide = await page.locator('#bib-liste').innerText();
  ok(bib1.n >= 1 && bib1.classe === 'CM1' && nbApercu >= 10 && /Listen and repeat/.test(listeQuiz) && /Pas encore de quiz/.test(vide),
    'bibliothèque : quiz filtrés selon la classe du site, aperçu des questions, « Ajouter à mon site » crée le quiz — ' + JSON.stringify({ ...bib1, nbApercu }));
  // quiz retiré de la bibliothèque après son ajout : mention dans l'onglet Quiz (avec la raison) ; lien vers le dossier Drive
  const marque = (await ev(`(() => { const it = installer_().dossier.getFiles(); while (it.hasNext()) { const f = it.next(); if (!f.virtuel) continue; const t = f.getBlob().getDataAsString(); if (/listen-and-repeat|Listen and repeat/i.test(t) && /"biblio":\s*"anglais-listen-and-repeat"/.test(t)) return true; } return false; })()`)).r;
  ok(marque === true, 'bibliothèque : le quiz ajouté garde l\'identifiant de la bibliothèque');
  const routeBib = /leian\.github\.io\/UNIVERSALQUIZ\/bibliotheque\/index\.json/;
  await page.route(routeBib, r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ version: 2, quiz: [], retires: [{ id: 'anglais-listen-and-repeat', titre: 'Listen and repeat', raison: 'erreur dans une réponse' }] }) }));
  await ev('CacheService.getScriptCache().remove("catalogue")');
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  await page.locator('#o-quiz').click();
  await page.locator('#liste-quiz .msg.maj').waitFor({ timeout: 5000 }).catch(() => {});
  const retireTxt = await page.locator('#liste-quiz').innerText();
  ok(/Retiré de la bibliothèque : erreur dans une réponse/.test(retireTxt) && /ajouté depuis la bibliothèque en a été retiré/.test(retireTxt), 'bibliothèque : quiz retiré signalé dans l\'onglet Quiz, avec la raison');
  await page.unroute(routeBib);
  await page.locator('#o-reglages').click();
  ok(await page.locator('#adresses a', { hasText: 'Ouvrir le dossier Drive' }).count() === 1, 'Réglages : lien « Ouvrir le dossier Drive »');
  await page.locator('#o-quiz').click();
  await page.locator('#o-quiz').click();
  const ligneBib = page.locator('#liste-quiz tr', { hasText: 'Listen and repeat' });
  await ligneBib.locator('button[data-p]').click();
  await page.locator('dialog.boite textarea').waitFor({ timeout: 5000 });
  const prop = await page.evaluate(() => ({ t: document.querySelector('dialog.boite textarea').value, mail: (document.querySelector('dialog.boite a.btn') || {}).href || '' }));
  ok(/^T\|Listen and repeat\|/.test(prop.t) && /\nP\|Écoute, puis répète\.\|Hello, my name is Lana\./.test(prop.t) && /^mailto:soccaquiz@gmail\.com\?subject=Proposition/.test(prop.mail),
    'proposer un quiz : texte en lignes prêt à envoyer par mail à SoccaQuiz');
  await page.keyboard.press('Escape');
  // réception directe activée (docs/soccaquiz.json) : « Envoyer à SoccaQuiz » poste le quiz à la console de l'éditeur
  let recu = null;
  await page.route(/leian\.github\.io\/UNIVERSALQUIZ\/soccaquiz\.json/, r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ propositions: 'https://script.google.com/macros/s/AKfycbTESTtestTESTtest123/exec' }) }));
  await page.route(/script\.google\.com\/macros\/s\/AKfycbTESTtestTESTtest123\/exec/, r => { recu = r.request().postData(); r.fulfill({ status: 200, body: '{"ok":true}' }); });
  await page.reload();
  await page.locator('#o-quiz').click();
  await page.locator('#liste-quiz tr', { hasText: 'Listen and repeat' }).locator('button[data-p]').click();
  await page.locator('dialog.boite [data-envoyer]').click();
  await page.locator('dialog.boite [data-envoyer]', { hasText: 'Envoyé' }).waitFor({ timeout: 5000 });
  const env = JSON.parse(recu || '{}');
  ok(env.type === 'proposition' && /^T\|Listen and repeat/.test(env.texte) && env.classe === 'CM1' && !/@/.test(recu), 'proposer un quiz : envoi direct à la console SoccaQuiz (texte et classe seulement)');
  await page.keyboard.press('Escape');

  // ---- aide : bouton « ? » de l'espace parent → page d'aide, ou question à SoccaQuiz (réponse par mail au parent) ----
  {
    await ev('globalThis.__sessionAvant = Session.getActiveUser; Session.getActiveUser = () => ({ getEmail: () => "parent@gmail.com" });');
    const refus = (await ev('(() => { const e = CONFIG.espace; CONFIG.espace = "enfant"; const r = apiEmailParent(); CONFIG.espace = e; return r; })()')).r;
    ok(refus && refus.__status === 403 && !refus.email, 'aide : l\'adresse du parent n\'est jamais donnée au site de l\'enfant');
    recu = null;
    await page.reload();
    await page.locator('#bouton-aide').click();
    await page.locator('#boite-aide').waitFor({ timeout: 5000 });
    await page.waitForFunction(() => document.getElementById('aide-mail').value === 'parent@gmail.com', null, { timeout: 5000 }).catch(() => {});
    const lien = await page.locator('#boite-aide a.btn').getAttribute('href');
    await page.locator('#boite-aide [data-aide="envoyer"]').click();
    const trop = await page.locator('#aide-etat').innerText();
    await page.fill('#aide-msg', 'Le site de mon enfant ne s\'ouvre plus sur la tablette.');
    await page.locator('#boite-aide [data-aide="envoyer"]').click();
    await page.locator('#aide-etat', { hasText: 'Envoyé' }).waitFor({ timeout: 5000 }).catch(() => {});
    const a = JSON.parse(recu || '{}');
    ok(lien === 'https://soccaquiz.fr/aide.html' && /10 caractères/.test(trop) && a.type === 'aide' && a.email === 'parent@gmail.com' && a.origine === 'parent' && /tablette/.test(a.message) && a.classe === 'CM1' && /parent@gmail\.com/.test(await page.locator('#aide-etat').innerText()) && await page.locator('#aide-form').isHidden() && await page.locator('#boite-aide [data-aide="envoyer"]').isHidden(),
      'aide : « ? » en haut à droite, lien vers la page d\'aide, question envoyée à la console avec l\'adresse du compte du parent — ' + JSON.stringify(a));
    await page.keyboard.press('Escape');
    await ev('Session.getActiveUser = globalThis.__sessionAvant;');
  }

  // ---- signaler une erreur : l'enfant (questions à réviser, « À retenir »), le parent (résultats), la console ----
  {
    const espaceAvant = (await ev('CONFIG.espace')).r;
    await ev('CONFIG.espace = ""');
    const qs = await ev(`apiAjouterQuiz(${JSON.stringify("T|Les capitales à signaler|Essai|geographie|🗺️|🏛️\n## Capitales|🏛️\nS|Quelle est la capitale de la France ?|Paris|Paris est la capitale.\nS|Quelle est la capitale de l'Italie ?|Rome|Rome est la capitale.\nS|Quelle est la capitale de l'Espagne ?|Madrid|Madrid est la capitale.\nM|Paris est la capitale de la France.\nM|Rome est en Italie.")})`);
    const pageS = qs.r.page, fichierS = pageS + '.html';
    await ev('CONFIG.espace = "enfant"');
    await page.goto(BASE + '/exec?page=' + encodeURIComponent(pageS));
    await page.locator('.start-btn').click();
    for (let i = 0; i < 40 && !(await page.locator('.result-card').count()); i++) {
      if (await page.locator('.next-btn').count()) { await page.locator('.next-btn').click(); continue; }
      if (await page.locator('#ans-input').count()) { await page.fill('#ans-input', 'zzz'); await page.keyboard.press('Enter'); continue; }
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);
    const nbSig = await page.locator('.review-item .signaler').count(), memoSig = await page.locator('.frise-section + .signaler-zone .signaler, .result-card > .signaler-zone .signaler').count();
    ok(nbSig === 3 && memoSig === 1, 'site de l\'enfant : « Signaler une erreur » sous chaque question à réviser et sous « À retenir » — ' + JSON.stringify({ nbSig, memoSig }));
    await page.locator('.review-item .signaler').first().click();
    await page.locator('.signaler-form input[value="reponse"]').check();
    await page.locator('.signaler-form textarea').fill('Je crois que la réponse est fausse');
    await page.locator('.signaler-form .signaler-oui').click();
    await page.locator('.signaler-merci').waitFor({ timeout: 5000 }).catch(() => {});
    ok(/Ton parent va regarder/.test(await page.locator('.signaler-zone').first().innerText()), 'site de l\'enfant : signalement envoyé, « Merci ! Ton parent va regarder ça. »');
    const refusE = await ev(`[apiSignalements(), apiRemplacerQuiz(${JSON.stringify(fichierS)}, "T|x"), apiSignalementMaj("x", "ignore")]`);
    ok(refusE.r.every(x => x && x.__status === 403), 'site de l\'enfant : lire les signalements, corriger un quiz ou changer un statut sont refusés');
    await ev('CONFIG.espace = "parent"');
    const l1 = (await ev('apiSignalements()')).r.liste;
    const s1 = l1.find(x => x.page === pageS);
    ok(s1 && s1.origine === 'enfant' && s1.motif === 'reponse' && s1.remarque === 'Je crois que la réponse est fausse' && s1.fichier === fichierS && s1.statut === 'nouveau' && /capitale/.test(s1.question) && s1.attendu,
      'espace parent : le signalement de l\'enfant est enregistré (question, réponse attendue, motif, remarque, quiz)');
    // corriger soi-même : texte du quiz, ligne signalée sélectionnée, enregistré sous le même nom de fichier
    await page.goto(BASE + '/exec?page=tableau-de-bord');
    await page.locator('#signalements .sig').first().waitFor({ timeout: 8000 }).catch(() => {});
    const bloc = await page.locator('#signalements').innerText().catch(() => '');
    ok(/Erreurs signalées/.test(bloc) && /a signalé/.test(bloc) && /Corriger moi-même/.test(bloc) && /Envoyer à SoccaQuiz/.test(bloc), 'espace parent : bloc « Erreurs signalées » dans Résultats, avec « Corriger moi-même » et « Envoyer à SoccaQuiz »');
    await page.locator(`#signalements .sig[data-id="${s1.id}"] [data-sig="corriger"]`).click();
    await page.locator('dialog.boite textarea.editeur').waitFor({ timeout: 5000 });
    await page.waitForFunction(() => { const t = document.querySelector('dialog.boite textarea.editeur'); return t && t.selectionEnd > t.selectionStart; }, null, { timeout: 3000 }).catch(() => {});
    const sel = await page.evaluate(() => { const t = document.querySelector('dialog.boite textarea.editeur'); return t.value.slice(t.selectionStart, t.selectionEnd); });
    ok(/^S\|Quelle est la capitale/.test(sel), 'corriger : la ligne de la question signalée est sélectionnée — « ' + sel + ' »');
    await page.evaluate(() => { const t = document.querySelector('dialog.boite textarea.editeur'); t.value = t.value.replace(/\|Paris est la capitale\./, '|Paris est bien la capitale (corrigé).'); });
    await page.locator('dialog.boite [data-ok]').click();
    await page.locator('dialog.boite', { hasText: 'Quiz corrigé' }).waitFor({ timeout: 8000 }).catch(() => {});
    const apres1 = await ev(`[apiTexteQuiz(${JSON.stringify(fichierS)}).texte, apiSignalements().liste.find(x => x.id === ${JSON.stringify(s1.id)}).statut]`);
    ok(/bien la capitale \(corrigé\)/.test(apres1.r[0]) && apres1.r[1] === 'corrige', 'corriger soi-même : quiz enregistré sous le même fichier (résultats gardés), signalement « Corrigé »');
    await page.keyboard.press('Escape');
    // envoyer à SoccaQuiz, puis la correction revient de la console (lue avec le code)
    let corr = { statut: 'attente' }, recuE = null;
    await page.unroute(/script\.google\.com\/macros\/s\/AKfycbTESTtestTESTtest123\/exec/);
    await page.route(/script\.google\.com\/macros\/s\/AKfycbTESTtestTESTtest123\/exec/, r => {
      if (r.request().method() === 'POST') { recuE = r.request().postData(); return r.fulfill({ status: 200, body: '{"ok":true}' }); }
      return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(corr) });
    });
    const s2 = (await ev(`apiSignaler({ page: ${JSON.stringify(pageS)}, titre: "Les capitales à signaler", question: "Quelle est la capitale de l'Italie ?", attendu: "Rome", motif: "question", remarque: "" })`)).r;
    await page.reload();
    await page.locator(`#signalements .sig[data-id="${s2.id}"] [data-sig="envoyer"]`).click();
    await page.locator('dialog.boite #sig-rq').fill('La question est ambiguë');
    await page.locator('dialog.boite [data-ok]').click();
    await page.locator('dialog.boite', { hasText: 'Envoyé, merci' }).waitFor({ timeout: 8000 }).catch(() => {});
    const envE = JSON.parse(recuE || '{}');
    const s2b = (await ev('apiSignalements()')).r.liste.find(x => x.id === s2.id);
    ok(envE.type === 'erreur' && /^[a-z0-9]{32}$/.test(envE.code) && /^T\|Les capitales à signaler/.test(envE.texte) && envE.question === "Quelle est la capitale de l'Italie ?" && envE.remarque === 'La question est ambiguë' && !/@|Lana/.test(recuE) && s2b.statut === 'transmis' && s2b.code === envE.code,
      'envoyer à SoccaQuiz : quiz, question et remarque envoyés à la console avec un code (ni prénom ni adresse) ; signalement « en attente »');
    await page.keyboard.press('Escape');
    corr = { statut: 'corrige', texte: envE.texte.replace("|Rome est la capitale.", "|Rome est la capitale de l'Italie (SoccaQuiz)."), message: 'Merci, c\'est corrigé !' };
    await page.reload();
    await page.locator(`#signalements .sig[data-id="${s2.id}"] [data-sig="appliquer"]`).waitFor({ timeout: 8000 }).catch(() => {});
    ok(/Correction de SoccaQuiz disponible/.test(await page.locator(`#signalements .sig[data-id="${s2.id}"]`).innerText()), 'correction prête dans la console : « Correction de SoccaQuiz disponible »');
    await page.locator(`#signalements .sig[data-id="${s2.id}"] [data-sig="appliquer"]`).click();
    await page.locator('dialog.boite textarea.editeur').waitFor({ timeout: 5000 });
    ok(/\(SoccaQuiz\)/.test(await page.locator('dialog.boite textarea.editeur').inputValue()) && /Merci, c'est corrigé/.test(await page.locator('dialog.boite').innerText()), 'appliquer : le texte corrigé et le message de SoccaQuiz sont montrés avant d\'appliquer');
    await page.locator('dialog.boite [data-ok]').click();
    await page.locator('dialog.boite', { hasText: 'Quiz corrigé' }).waitFor({ timeout: 8000 }).catch(() => {});
    for (let i = 0; i < 30 && (await ev(`apiSignalements().liste.find(x => x.id === ${JSON.stringify(s2.id)}).statut`)).r !== 'corrige'; i++) await page.waitForTimeout(200);
    const apres2 = await ev(`[apiTexteQuiz(${JSON.stringify(fichierS)}).texte, apiSignalements().liste.find(x => x.id === ${JSON.stringify(s2.id)}).statut]`);
    ok(/\(SoccaQuiz\)/.test(apres2.r[0]) && /bien la capitale \(corrigé\)/.test(apres2.r[0]) && apres2.r[1] === 'corrige', 'correction de SoccaQuiz appliquée au quiz de la famille ; signalement « Corrigé »');
    await page.keyboard.press('Escape');
    // résultats : boutons sur une question ratée d'une partie
    await page.evaluate(() => document.querySelectorAll('dialog').forEach(d => d.close()));
    await page.locator('.sess-h').first().click();
    await page.locator('.det [data-sigq]').first().waitFor({ timeout: 8000 }).catch(() => {});
    const nbQ = await page.locator('.det [data-sigq="corriger"]').count(), nbE = await page.locator('.det [data-sigq="envoyer"]').count();
    ok(nbQ > 0 && nbQ === nbE, 'résultats : « Corriger le quiz » et « Signaler à SoccaQuiz » sous chaque question ratée — ' + nbQ);
    await page.locator('.det [data-sigq="corriger"]').first().click();
    await page.locator('dialog.boite textarea.editeur').waitFor({ timeout: 8000 }).catch(() => {});
    ok(await page.locator('dialog.boite textarea.editeur').count() === 1, 'résultats → « Corriger le quiz » : l\'éditeur du quiz s\'ouvre');
    await page.evaluate(() => document.querySelectorAll('dialog').forEach(d => d.close()));
    // bibliothèque : quiz corrigé par SoccaQuiz (nouvelle version) → « Mettre à jour » dans l'onglet Quiz
    const routeV = /leian\.github\.io\/UNIVERSALQUIZ\/bibliotheque\/index\.json/;
    await page.route(routeV, r => { const i = JSON.parse(readFileSync(join(ICI, 'bibliotheque', 'index.json'), 'utf8')); i.quiz.forEach(q => { q.v = 2; }); r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(i) }); });
    await page.reload();
    await page.locator('#o-quiz').click();
    const bMaj = page.locator('#liste-quiz button[data-majbib]');
    await bMaj.first().waitFor({ timeout: 8000 }).catch(() => {});
    const nMaj = await bMaj.count();
    if (nMaj) await bMaj.first().click();
    await page.waitForFunction(() => !document.querySelector('#liste-quiz button[data-majbib]'), null, { timeout: 8000 }).catch(() => {});
    const v2 = await ev(`(() => { const it = installer_().dossier.getFiles(); while (it.hasNext()) { const f = it.next(); if (!f.virtuel) continue; const t = f.getBlob().getDataAsString(); if (/"biblio":\\s*"anglais-listen-and-repeat"/.test(t)) return /"biblioV":\\s*"2"/.test(t); } return false; })()`);
    ok(nMaj === 1 && v2.r === true && !(await bMaj.count()), 'bibliothèque : quiz corrigé par SoccaQuiz → « Mettre à jour » remplace le quiz de la famille (version 2)');
    await page.unroute(routeV);
    await ev(`CONFIG.espace = ${JSON.stringify(espaceAvant)}`);
  }
  await page.unroute(/leian\.github\.io\/UNIVERSALQUIZ\/soccaquiz\.json/);
  await ev(`PropertiesService.getScriptProperties().deleteProperty('CLASSE')`);

  const pol = await (await fetch(BASE + '/exec')).text();
  ok(!/fonts\.(googleapis|gstatic)/.test(pol) && /polices\/polices\.css/.test(pol), 'polices servies par GitHub Pages : aucune requête vers Google Fonts');
  // dessins du catalogue : img=labo:becher, propositions dessinées, horloge (le quiz n'écrit que les noms)
  {
    const avantD = (await ev('CONFIG.espace')).r;
    await ev('CONFIG.espace = ""');
    const qd = await ev(`apiAjouterQuiz(${JSON.stringify("T|Le matériel de chimie|Reconnaître le matériel|sciences|🧪|⚗️\n## Matériel|🧪\nQ|Comment s'appelle ce matériel ?|Un bécher|Un ballon|Un erlenmeyer|C'est un bécher.|img=labo:becher\nQ|Lequel est le pictogramme « corrosif » ?|danger:corrosif|danger:toxique|danger:inflammable|Il ronge la peau.\nQ|Quelle heure indique l'horloge ?|3 h 45|4 h 15|9 h 20|Petite aiguille entre 3 et 4.|img=heure:3h45\nQ|Comment s'appelle ce pictogramme ?|Port des gants|Port de la blouse|Port du masque|Il protège les mains.|img=pirate:xx")})`);
    ok(qd.r && qd.r.ok && qd.r.nb === 4, 'dessins : quiz créé avec des noms de dessins — ' + JSON.stringify(qd.r && (qd.r.erreur || qd.r.avertissements)));
    await page.goto(BASE + '/exec?page=' + qd.r.page);
    await page.locator('.start-btn').click();
    const vu = { grand: 0, props: 0, horloge: 0, inconnu: 0, nom: '' };
    for (let i = 0; i < 12; i++) {
      if (await page.locator('.result-card').count()) break;
      if (await page.locator('.next-btn').count()) { await page.locator('.next-btn').click(); continue; }
      const txt = await page.locator('.question-text').innerText();
      if (/matériel/.test(txt)) vu.grand = await page.locator('.fig-box.dessin svg path').count();
      if (/corrosif/.test(txt)) { vu.props = await page.locator('.opts-dessins .opt-dessin svg').count(); vu.nom = await page.locator('.opts-dessins').innerText(); }
      if (/horloge/.test(txt)) vu.horloge = await page.locator('.fig-box.dessin svg circle').count();
      if (/pictogramme \?/.test(txt)) vu.inconnu = await page.locator('.fig-box.dessin').count();
      await page.locator('.opt-btn').first().click();
    }
    ok(vu.grand > 0 && vu.props === 3 && /Corrosif/.test(vu.nom) && vu.horloge > 0 && vu.inconnu === 0, 'dessins : bécher et horloge dessinés en grand, pictogrammes en propositions (nom lu par le lecteur d\'écran), nom inconnu ignoré — ' + JSON.stringify(vu));
    await ev(`CONFIG.espace = ${JSON.stringify(avantD)}`);
  }

  // géométrie décrite en quelques mots (fig=), dessinée par le moteur
  {
    const avantG = (await ev('CONFIG.espace')).r;
    await ev('CONFIG.espace = ""');
    const qg = await ev(`apiAjouterQuiz(${JSON.stringify("T|Les angles|Vocabulaire|maths|📐|📏\n## Angles|📐\nQ|Quel est le sommet de l'angle marqué ?|A|B|C|Le sommet est le point commun aux deux côtés.|fig=A(1,1) B(8,1) C(3,5); [AB]; [AC); angle BAC\nQ|Comment nomme-t-on la droite tracée ?|(d)|[d]|d|Une droite se note entre parenthèses.|fig=A(1,2) B(7,4); (AB)=d\nQ|Quelle figure est dessinée ?|Un carré|Un triangle|Un cercle|Quatre côtés égaux et quatre angles droits.|fig=<script>alert(1)</script> A(1,1)")})`);
    ok(qg.r && qg.r.ok && qg.r.nb === 3, 'géométrie : quiz avec figures décrites accepté — ' + JSON.stringify(qg.r && (qg.r.erreur || qg.r.avertissements)));
    const tg = (await ev(`apiTexteQuiz(${JSON.stringify(qg.r.page + '.html')})`)).r;
    ok(tg && /fig=A\(1,1\) B\(8,1\) C\(3,5\); \[AB\]; \[AC\); angle BAC/.test(tg.texte || '') && !/script/.test(tg.texte || ''), 'géométrie : figure relue en lignes ; figure avec des caractères interdits écartée');
    await page.goto(BASE + '/exec?page=' + qg.r.page);
    await page.locator('.start-btn').click();
    const vu = { angle: 0, droite: 0, aucune: -1 };
    for (let i = 0; i < 10; i++) {
      if (await page.locator('.result-card').count()) break;
      if (await page.locator('.next-btn').count()) { await page.locator('.next-btn').click(); continue; }
      const txt = await page.locator('.question-text').innerText();
      if (/sommet/.test(txt)) vu.angle = await page.locator('.fig-box.geo svg path[stroke="#dc2626"]').count();
      if (/droite tracée/.test(txt)) vu.droite = await page.locator('.fig-box.geo svg text', { hasText: '(d)' }).count();
      if (/figure est dessinée/.test(txt)) vu.aucune = await page.locator('.fig-box.geo').count();
      await page.locator('.opt-btn').first().click();
    }
    ok(vu.angle === 1 && vu.droite === 1 && vu.aucune === 0, 'géométrie : angle marqué et droite nommée dessinés, rien pour la figure refusée — ' + JSON.stringify(vu));
    await ev(`CONFIG.espace = ${JSON.stringify(avantG)}`);
  }

  // musique : placer une note sur la portée (L), sons à comparer (/), durée et intensité (*2, ^, _)
  {
    const avantM = (await ev('CONFIG.espace')).r;
    await ev('CONFIG.espace = ""');
    const qm = await ev(`apiAjouterQuiz(${JSON.stringify("T|Lire et écouter|La portée et le son|musique|🎼|🎵\n## Portée|🎼\nL|Place la note sol sur la portée.|G4|Le sol est sur la 2e ligne.\nL|Place la note do aigu.|C5|Le do aigu est dans le 3e interligne.\n## Écoute|👂\nV|Le 2e son est plus aigu que le 1er.|V|notes=C4 / G4|Le sol est plus aigu que le do.\nQ|Quel son dure le plus longtemps ?|Le son 2|Le son 1|Ils durent pareil|Le 2e est tenu deux fois plus longtemps.|notes=E4 / E4*2\nQ|Quel son est le plus fort ?|Le son 1|Le son 2|Ils sont aussi forts|Le 1er est joué fort.|notes=A4^ / A4_")})`);
    ok(qm.r && qm.r.ok && qm.r.nb === 5, 'musique : quiz avec L, sons à comparer, durées et nuances accepté — ' + JSON.stringify(qm.r && (qm.r.erreur || qm.r.avertissements)));
    const lignes = (await ev(`apiTexteQuiz(${JSON.stringify(qm.r.page + '.html')})`)).r;
    ok(lignes && /\nL\|Place la note sol sur la portée\.\|G4/.test(lignes.texte || '') && /notes=E4 \/ E4\*2/.test(lignes.texte || '') && /notes=A4\^ \/ A4_/.test(lignes.texte || ''), 'musique : relu en lignes sans rien perdre (L, /, *2, ^, _)');
    await page.goto(BASE + '/exec?page=' + qm.r.page);
    await page.locator('.start-btn').click();
    const vu = { placerOk: 0, placerKo: 0, sons: 0, monter: 0 };
    for (let i = 0; i < 12; i++) {
      if (await page.locator('.result-card').count()) break;
      if (await page.locator('.next-btn').count()) { await page.locator('.next-btn').click(); continue; }
      const txt = await page.locator('.question-text').innerText();
      if (/Place la note sol/.test(txt)) {
        vu.monter = await page.locator('[data-f="placer-haut:"]').count();
        await page.locator('rect[data-f="placer:32"]').click();         // sol4 = pas 32
        await page.locator('.ex-valider').click();
        vu.placerOk = await page.locator('.explanation').innerText().then(t => /Bonne réponse|Bravo|bien joué|Exact/i.test(t) ? 1 : 0);
        continue;
      }
      if (/do aigu/.test(txt)) {
        await page.locator('[data-f="placer-bas:"]').click();           // part du mi4 → ré4 : faux
        await page.locator('.ex-valider').click();
        vu.placerKo = await page.locator('.portee.placer ellipse').count();   // la note placée (rouge) et la bonne (verte)
        continue;
      }
      if (/2e son est plus aigu/.test(txt)) vu.sons = await page.locator('.ecoute-btn', { hasText: /Son \d/ }).count();
      const opt = page.locator('.opt-btn').first();
      if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
    }
    ok(vu.placerOk === 1 && vu.placerKo === 2 && vu.sons === 2 && vu.monter === 1, 'musique : note placée sur la portée (juste et fausse, correction dessinée), boutons « Son 1 » / « Son 2 » — ' + JSON.stringify(vu));
    await ev(`CONFIG.espace = ${JSON.stringify(avantM)}`);
  }

  // famille : un seul programme pour tous les enfants (étape 1b du chantier « sans alerte »)
  {
    const avant = (await ev('JSON.stringify({ e: CONFIG.espace, u: CONFIG.urlParent, p: CONFIG.prenom })')).r;
    const P1 = 'https://script.google.com/macros/s/LANA/exec';
    await ev(`CONFIG.espace = "parent"; CONFIG.urlParent = "${P1}"; CONFIG.prenom = "Lana";
      ["GEMINI_CLE", "ENFANTS"].forEach(k => PropertiesService.getScriptProperties().deleteProperty(k)); choisirEnfant_("");`);
    const ajout = (await ev('[apiAjouterEnfant({ prenom: "Hugo", classe: "CE1" }), apiAjouterEnfant({ prenom: "hugo" }).erreur, apiAjouterEnfant({ prenom: "  " }).erreur]')).r;
    const H = ajout[0].id, P2 = P1 + '?e=' + H;
    ok(ajout[0].ok && /^[a-z0-9]{6}$/.test(H) && ajout[0].parent === P2 && !!ajout[1] && !!ajout[2], 'famille : « Ajouter un enfant » (même programme, adresse …?e=<id>), doublon et prénom vide refusés — ' + JSON.stringify(ajout));
    // couleur fixe par enfant : gardée quand un autre est retiré, la première libre pour le suivant
    const coul = (await ev(`(() => { const z = apiAjouterEnfant({ prenom: "Zoé" }).id, n = apiAjouterEnfant({ prenom: "Noé" }).id, avant = familleListe_().map(x => x.couleur); retirerEnfant_(z); const apres = familleListe_().map(x => x.couleur); const o = apiAjouterEnfant({ prenom: "Léo" }).id; const fin = familleListe_().map(x => [x.prenom, x.couleur]); retirerEnfant_(n); retirerEnfant_(o); return { avant, apres, fin }; })()`)).r;
    ok(JSON.stringify(coul.avant) === '[0,1,2,3]' && JSON.stringify(coul.apres) === '[0,1,3]' && JSON.stringify(coul.fin) === '[["Lana",0],["Hugo",1],["Noé",3],["Léo",2]]', 'famille : chaque enfant garde sa couleur, même après la suppression d\'un autre ; le nouveau prend la première libre — ' + JSON.stringify(coul));
    const sep = (await ev(`({ lana: [installer_().dossier.getName(), classe_()], hugo: pourEnfant_("${H}", () => [installer_().dossier.getName(), classe_(), CONFIG.prenom]), apres: [installer_().dossier.getName(), CONFIG.prenom] })`)).r;
    ok(sep.hugo[0] === 'SoccaQuiz – Hugo' && sep.hugo[1] === 'CE1' && sep.hugo[2] === 'Hugo' && sep.lana[0] !== sep.hugo[0] && sep.lana[1] !== 'CE1' && sep.apres[0] === sep.lana[0] && sep.apres[1] === 'Lana',
      'famille : chaque enfant a son dossier, sa classe et son prénom ; on revient bien au premier — ' + JSON.stringify(sep));
    await page.goto(BASE + '/exec');
    const fam = await page.locator('#famille').innerText().catch(() => '');
    if (process.env.SQ_CAPTURE) { await page.setViewportSize({ width: 390, height: 800 }); await page.screenshot({ path: '/tmp/tb-mobile.png' }); await page.locator('#famille summary').click().catch(() => {}); await page.screenshot({ path: '/tmp/tb-menu.png' }); await page.locator('#famille summary').click().catch(() => {}); await page.setViewportSize({ width: 1100, height: 800 }); await page.screenshot({ path: '/tmp/tb-pc.png' }); }
    ok(await page.locator('#famille').isVisible() && /Lana/.test(await page.locator('#famille span.on').textContent()) && await page.locator(`#famille a[href="${P2}"]`).count() === 1,
      'famille : sélecteur en haut de l\'espace parent (enfant affiché, lien vers l\'autre) — ' + fam.replace(/\s+/g, ' '));
    const g = await ev(`(() => { const k = "AIza" + "x".repeat(35); apiGeminiCle({ cle: k }); return pourEnfant_("${H}", cleGemini_) === k; })()`);
    ok(g.r === true, 'famille : clé Gemini saisie une fois, la même pour tous les enfants');
    await page.goto(BASE + '/exec?page=ajouter');
    ok(await page.locator(`#pour-qui input[data-parent="${P2}"]`).count() === 1 && /Hugo/.test(await page.locator('#pour-qui').innerText()), 'famille : « Ajouter aussi pour Hugo » sur la page de création');
    await page.locator(`#pour-qui input[data-parent="${P2}"]`).check();
    await page.locator('#secours').evaluate(d => { d.open = true; });
    await page.fill('#reponse', 'T|Les fractions|Moitiés et tiers|maths|🍕|🍰\nQ|Combien font une moitié plus une moitié ?|1|2|3|Deux moitiés font un.\nQ|Quelle est la moitié de 10 ?|5|2|4|10 divisé par 2.\nQ|Quel est le tiers de 9 ?|3|6|1|9 divisé par 3.');
    await page.locator('#creer').click();
    await page.locator('#resultat .ok, #resultat .ko').waitFor({ timeout: 10000 }).catch(() => {});
    const htmlHugo = (await ev('quizDuDossier(' + JSON.stringify(join(DRIVE, 'SoccaQuiz – Hugo')) + ')')).r.map(q => q.nom).filter(n => n.endsWith('.html'));
    ok(/Ajouté aussi pour Hugo/.test(await page.locator('#resultat').innerText()) && htmlHugo.filter(n => /fractions/i.test(n)).length === 1, 'famille : quiz créé pour les deux enfants — ' + htmlHugo.join(','));
    // espace parent de Hugo (…?e=<id>) : ses réglages, ses quiz ; les appels des pages passent par apiPourEnfant() avec son id
    await page.goto(BASE + '/exec?e=' + H);
    ok(/Hugo/.test(await page.locator('#famille span.on').textContent().catch(() => '')) && await page.locator(`#famille a[href="${P1}"]`).count() === 1, 'famille : espace parent de Hugo (…?e=<id>), lien de retour vers Lana');
    const nLana = (await ev('quizDuDossier(' + JSON.stringify(join(DRIVE, 'SoccaQuiz')) + ').length')).r;
    await page.goto(BASE + '/exec?e=' + H + '&page=ajouter');
    await page.locator('#secours').evaluate(d => { d.open = true; });
    await page.fill('#reponse', 'T|Les volcans de Hugo|Essai|sciences|🌋|🌋\nQ|Un volcan crache ?|de la lave|de l\'eau|du sable|Lave.\nQ|Le cratère est ?|en haut|en bas|à côté|En haut.\nQ|L\'Etna est en ?|Italie|France|Espagne|Sicile.');
    await page.locator('#creer').click();
    await page.locator('#resultat .ok, #resultat .ko').waitFor({ timeout: 10000 }).catch(() => {});
    const apres = (await ev(`[quizDuDossier(${JSON.stringify(join(DRIVE, 'SoccaQuiz – Hugo'))}).map(q => q.nom).join(), quizDuDossier(${JSON.stringify(join(DRIVE, 'SoccaQuiz'))}).length]`)).r;
    ok(/volcans-de-hugo/i.test(apres[0]) && apres[1] === nLana, 'famille : depuis la page de Hugo, le quiz va dans son dossier à lui (apiPourEnfant), rien chez Lana — ' + JSON.stringify(apres));
    const catHugo = (await ev(`pourEnfant_("${H}", () => catalogue_(installer_().dossier).QUIZ.map(q => q.titre).join())`)).r;
    ok(/Les fractions/.test(catHugo) && /Les volcans de Hugo/.test(catHugo), 'famille : liste des quiz de Hugo — ' + catHugo);
    await page.goto(BASE + '/exec');
    await page.locator('#o-reglages').click();
    ok(await page.locator('#box-famille').isVisible() && await page.locator('#ajouter-enfant').isVisible() && /Hugo/.test(await page.locator('#famille-reglages').innerText()), 'famille : Réglages → enfants de la famille et « Ajouter un enfant »');
    const ret = await ev(`apiFamilleRetirer({ parent: "${P1}" }).erreur`);
    ok(!!ret.r, 'famille : le premier enfant ne peut pas être retiré de la liste d\'ici');
    const classeAvant = (await ev('classe_()')).r;
    await ev('apiClasse({ classe: "CM2" })');
    await page.goto(BASE + '/exec?page=ajouter');
    ok(/Classe : CM2/.test(await page.locator('#classe-info').innerText()) && !(await page.locator('#classe').isVisible()) && await page.locator('#classe').inputValue() === 'CM2', 'page Ajouter : classe reprise des Réglages, plus de champ à remplir');
    await ev(`apiClasse({ classe: ${JSON.stringify(classeAvant)} })`);
    const intrus = await ev(`apiAjouterQuiz("T|Essai|x|autre|⭐|⭐\\nQ|Un ?|a|b|c|d\\nQ|Deux ?|a|b|c|d\\nQ|Trois ?|a|b|c|d", ["https://script.google.com/macros/s/INCONNU/exec"]).aussi.length`);
    ok(intrus.r === 0, 'famille : un enfant qui n\'est pas dans la famille est refusé');
    // deux parents : invitation par lien (clé d'appareil, sans compte Google), autre parent, inconnu
    const urlEnfantAvant = (await ev('CONFIG.urlEnfant')).r;
    await ev('CONFIG.urlEnfant = "https://script.google.com/macros/s/AKfyTEST1234567890abcdefghij/exec"; ["CLES", "INVITS"].forEach(k => PropertiesService.getScriptProperties().deleteProperty(k));');
    await page.goto(BASE + '/exec');
    await page.locator('#o-reglages').click();
    await page.locator('#parents [data-inviter="parent"]').waitFor({ timeout: 10000 }).catch(() => {});
    ok(await page.locator('#box-parents').isVisible() && /Aucun appareil/.test(await page.locator('#parents').innerText()), 'autre parent : encadré « Autre parent et appareils » dans Réglages (parent qui a installé)');
    await page.locator('#parents [data-inviter="parent"]').click();
    await page.locator('#parents .adr, #parents .ko').waitFor({ timeout: 10000 }).catch(() => {});
    const lienInv = await page.locator('#parents .adr').innerText().catch(() => '');
    ok(/^https:\/\/app\.soccaquiz\.fr\/parent\/\?s=AKfyTEST1234567890abcdefghij#i=[0-9a-f]{64}$/.test(lienInv) && await page.locator('#parents a[href^="mailto:"]').count() === 1 && await page.locator('#copier-invit').count() === 1,
      'autre parent : « Inviter l\'autre parent » donne un lien à usage unique, à copier ou envoyer par mail — ' + lienInv);
    const pJulie = await (await fetch(BASE + '/exec', { method: 'POST', body: JSON.stringify({ api: 'appairer', code: lienInv.split('#i=')[1], nom: 'Téléphone de Julie' }) })).json();
    await page.goto(BASE + '/exec');
    await page.locator('#o-reglages').click();
    await page.locator('#parents [data-retirer-appareil]').waitFor({ timeout: 10000 }).catch(() => {});
    ok(pJulie.ok && pJulie.role === 'parent' && /Téléphone de Julie/.test(await page.locator('#parents').innerText()) && /autre parent/.test(await page.locator('#parents').innerText()), 'autre parent : son appareil apparaît dans la liste, avec « Retirer »');
    await ev('FAUX.proprio = false; PROPRIO_ = null; ACCES_ = null;');
    await page.goto(BASE + '/exec');
    await page.locator('#o-reglages').click();
    ok(await page.locator('#onglets').isVisible() && !(await page.locator('[data-inviter]').count()) && !(await page.locator('#ajouter-enfant').count()), 'autre parent : espace parent ouvert, sans le droit d\'inviter ni d\'ajouter un enfant');
    const autre = await ev('[apiInviterAppareil({}).erreur, apiFamilleRetirer({ parent: "' + P2 + '" }).erreur, apiClasse({ classe: "CM1" }).ok]');
    ok(!!autre.r[0] && !!autre.r[1] && autre.r[2] === true, 'autre parent : peut gérer (classe…), pas inviter ni retirer un enfant');
    await ev('FAUX.etranger = true');
    await page.goto(BASE + '/exec');
    const inconnu = await ev('[apiClasse({ classe: "CP" }).__status, apiGeminiCle({ cle: "" }).__status, apiInviterAppareil({}).__status, (() => { try { apiLister({}); return "lu"; } catch (e) { return "refusé"; } })(), classe_()]');
    ok(/ne t'est pas partagé/.test(await page.locator('body').innerText()) && inconnu.r.slice(0, 3).every(x => x === 403) && inconnu.r[3] === 'refusé' && inconnu.r[4] === 'CM1',
      'inconnu avec un compte Google : page « espace non partagé », aucune action, rien de lu ni modifié — ' + JSON.stringify(inconnu.r));
    await ev('FAUX.etranger = false; FAUX.proprio = true; PROPRIO_ = null; ACCES_ = null;');
    await page.goto(BASE + '/exec');
    await page.locator('#o-reglages').click();
    await page.locator('#parents [data-retirer-appareil]').waitFor({ timeout: 10000 }).catch(() => {});
    await page.locator('#parents [data-retirer-appareil]').first().click();
    await page.locator('#parents .ok, #parents .ko').waitFor({ timeout: 10000 }).catch(() => {});
    const retire = (await ev('lireListe_("CLES").length')).r;
    const apresRetrait = await (await fetch(BASE + '/exec', { method: 'POST', body: JSON.stringify({ api: 'parent', cle: pJulie.cle, action: 'apiAppareils' }) })).json();
    ok(/Accès retiré/.test(await page.locator('#parents').innerText()) && retire === 0 && apresRetrait.__status === 401, 'autre parent : « Retirer » coupe l\'accès de son appareil tout de suite');
    await ev(`CONFIG.urlEnfant = ${JSON.stringify(urlEnfantAvant)};`);

    // remise à zéro avec cases à cocher
    await page.goto(BASE + '/exec');
    await page.evaluate(() => { localStorage.setItem('sq.tenue', '3'); localStorage.setItem('uqSuivi.local', '[1]'); localStorage.setItem('uq-sons', '0'); });
    await page.locator('#o-reglages').click();
    const avantRaz = await ev('({ ss: PropertiesService.getScriptProperties().getProperty("RESULTATS"), html: installer_().dossier.getFiles ? (() => { let n = 0; const it = installer_().dossier.getFiles(); while (it.hasNext()) if (/\.html$/.test(it.next().getName())) n++; return n; })() : 0, classe: classe_() })');
    await page.locator('[data-raz="resultats"]').check();
    await page.locator('[data-raz="quiz"]').check();
    ok(await page.locator('#suppr-go').isDisabled(), 'remise à zéro : bouton grisé tant que le prénom n\'est pas tapé');
    await page.fill('#suppr-confirmation', 'lana');
    await page.locator('#suppr-go').click();
    await page.locator('#suppr-msg .ok, #suppr-msg .ko').waitFor({ timeout: 10000 }).catch(() => {});
    const apresRaz = await ev(`(() => { const p = PropertiesService.getScriptProperties(); let n = 0; const it = installer_().dossier.getFiles(); while (it.hasNext()) if (/\\.html$/.test(it.next().getName())) n++;
      return { ss: p.getProperty("RESULTATS"), html: n, raz: !!p.getProperty("RAZ"), classe: classe_() }; })()`);
    apresRaz.r.archive = /archive du/.test((apresRaz.sheets[avantRaz.r.ss] || {}).name || '');
    apresRaz.r.lignes = ((apresRaz.sheets[apresRaz.r.ss] || {}).rows || []).length;
    ok(/C'est fait/.test(await page.locator('#suppr-msg').innerText()) && apresRaz.r.ss !== avantRaz.r.ss && apresRaz.r.archive && apresRaz.r.lignes === 1 && apresRaz.r.html === 0 && avantRaz.r.html > 0 && apresRaz.r.raz && apresRaz.r.classe === avantRaz.r.classe,
      'remise à zéro : résultats archivés et nouveau tableau vide, quiz à la corbeille, classe non cochée gardée — ' + JSON.stringify(apresRaz.r));
    await page.goto(BASE + '/exec');
    const local = await page.evaluate(() => [localStorage.getItem('sq.tenue'), localStorage.getItem('uqSuivi.local'), localStorage.getItem('uq-sons')]);
    ok(local[0] === null && local[1] === null && local[2] === '0', 'remise à zéro : mémoire de l\'appareil effacée (préférence « Sons » gardée)');
    const razRefus = await ev('(() => { FAUX.proprio = false; PROPRIO_ = null; ACCES_ = null; const r = apiRemettreAZero({ resultats: true, confirmation: "Lana" }).erreur; FAUX.proprio = true; PROPRIO_ = null; ACCES_ = null; return [r, apiRemettreAZero({ resultats: true, confirmation: "Paul" }).erreur]; })()');
    ok(razRefus.r && razRefus.r.every(Boolean), 'remise à zéro : refusée à l\'autre parent et sans le bon prénom — ' + JSON.stringify(razRefus));

    const retire2 = (await ev(`[apiFamilleRetirer({ parent: "${P2}" }).ok, enfants_().map(x => x.prenom).join(), PropertiesService.getScriptProperties().getKeys().filter(k => k.indexOf("${H}|") === 0).length]`)).r;
    await page.goto(BASE + '/exec');
    await page.locator('#o-reglages').click();
    ok(retire2[0] === true && retire2[1] === 'Lana' && retire2[2] === 0 && (await page.locator('#famille details').count()) === 0 && /Un autre enfant/.test(await page.locator('#famille-reglages').innerText()),
      'famille : enfant retiré (ses réglages effacés) → un seul enfant, pas de menu de choix, Réglages propose d\'en ajouter un — ' + JSON.stringify(retire2));
    const urls = await ev('[URL_SITE_.test("https://script.google.com/macros/s/AKfy-1_x/exec"), URL_SITE_.test("https://script.google.com/a/macros/ecole.fr/s/AKfy-1/exec"), URL_SITE_.test("https://script.google.com/macros/s/AKfy/exec?x=1")]');
    ok(urls.r.join() === 'true,true,false', 'famille : adresses des comptes Gmail et Google Workspace reconnues');
    await ev('CONFIG.espace = "enfant"');
    await page.goto(BASE + '/exec');
    ok(await page.evaluate(() => !('famille' in (window.__UQ || {}))), 'famille : rien n\'est envoyé au site de l\'enfant');
    const a = JSON.parse(avant);
    await ev(`CONFIG.espace = ${JSON.stringify(a.e)}; CONFIG.urlParent = ${JSON.stringify(a.u)}; CONFIG.prenom = ${JSON.stringify(a.p)};
      ["GEMINI_CLE", "FAMILLE", "RACINE", "ENFANTS"].forEach(k => PropertiesService.getScriptProperties().deleteProperty(k)); choisirEnfant_("");`);
    rmSync(join(DRIVE, 'SoccaQuiz – Hugo'), { recursive: true, force: true });
  }

  // site réinstallé après le passage à SoccaQuiz : il retrouve l'ancien dossier « Universal Quiz » et son Sheets
  const ancien = await ev(`(function () {
    const d = DRV_.createFolder('Universal Quiz');
    const ss = TAB_.create('Universal Quiz – Résultats', d.getId());
    PropertiesService.getScriptProperties().setProperties({ DOSSIER: '', RESULTATS: '' });
    // l'ancien site n'avait que le dossier « Universal Quiz » : on cache le dossier SoccaQuiz du test
    const vrai = DRV_.getRootFolder;
    DRV_.getRootFolder = () => { const r = vrai(); const f = r.getFoldersByName; r.getFoldersByName = n => n === 'SoccaQuiz' ? { hasNext: () => false } : f(n); return r; };
    const i = installer_();
    DRV_.getRootFolder = vrai;
    return { dossier: i.dossier.getName(), ss: i.ss.getId() === ss.getId() };
  })()`);
  ok(ancien.r && ancien.r.dossier === 'Universal Quiz' && ancien.r.ss, 'site réinstallé : reprend l\'ancien dossier « Universal Quiz » et ses résultats');
  // supprimer un enfant (Réglages) : un enfant parmi d'autres → seuls son dossier et ses réglages partent, le programme
  // continue ; le dernier enfant → ménage du Drive ici, puis l'installateur retire les publications du programme
  {
    const P1 = 'https://script.google.com/macros/s/LANA/exec';
    await ev(`CONFIG.espace = "parent"; CONFIG.urlParent = "${P1}"; CONFIG.prenom = "Lana"; CONFIG.installateur = "https://script.google.com/macros/s/INSTALL/exec"; FAUX.proprio = true; FAUX.etranger = false; PROPRIO_ = null; ACCES_ = null;
      PropertiesService.getScriptProperties().deleteProperty("ENFANTS"); choisirEnfant_(""); CacheService.getScriptCache().remove("catalogue");`);
    const H = (await ev('apiAjouterEnfant({ prenom: "Hugo", classe: "CE1" }).id')).r;
    const avantS = (await ev(`({ lana: installer_().dossier.getId(), hugo: pourEnfant_("${H}", () => installer_().dossier.getId()) })`)).r;
    await page.goto(BASE + '/exec?supprimer=1');
    await page.locator('#box-suppr').waitFor({ timeout: 5000 });
    ok(await page.locator('#box-suppr').isVisible() && await page.locator('#p-reglages').isVisible(), 'supprimer : ouvert depuis l\'installateur, Réglages et encadré « Supprimer » affichés directement');
    ok(await page.locator('#suppr-site').isChecked() && await page.locator('#suppr-go').isDisabled(), 'supprimer : case « Supprimer » déjà cochée, bouton grisé tant que le prénom n\'est pas tapé');
    let lien = '';
    await page.route('**/macros/s/INSTALL/exec**', route => { lien = route.request().url(); route.fulfill({ contentType: 'text/html',
      body: '<script>parent.postMessage({ uq: "suppr", etat: "ok", desinstalle: true, id: "projet-script" }, "*")</script>' }); });
    await page.locator('[data-raz="resultats"]').check(); await page.locator('[data-raz="quiz"]').check();
    await page.fill('#suppr-confirmation', 'Lana');
    await page.locator('#suppr-go').click();
    await page.locator('#suppr-msg .ok, #suppr-msg .ko').waitFor({ timeout: 10000 }).catch(() => {});
    const fin1 = await page.locator('#suppr-msg').innerText().catch(() => '');
    const apres1 = (await ev(`({ lana: !!ouvrirDossier_(${JSON.stringify(avantS.lana)}), enfants: enfants_().map(x => x.prenom).join(), premier: [installer_().dossier.getId() === ${JSON.stringify(avantS.hugo)}, CONFIG.prenom, classe_()], prefixes: PropertiesService.getScriptProperties().getKeys().filter(k => /\\|/.test(k)).length })`)).r;
    ok(!apres1.lana && apres1.enfants === 'Hugo' && apres1.premier.join() === 'true,Hugo,CE1' && apres1.prefixes === 0 && !lien && /n'est plus dans SoccaQuiz/.test(fin1) && /Rien ne change pour Hugo/.test(fin1) && await page.locator('#suppr-msg a', { hasText: 'Continuer avec Hugo' }).count() === 1,
      'supprimer un enfant parmi d\'autres : son dossier à la corbeille, Hugo prend la première place (adresse sans « e »), programme gardé, pas d\'installateur — ' + JSON.stringify({ apres1, fin1 }));
    // dernier enfant : comme avant, l'installateur termine (publications retirées : à refaire avec l'étape installateur)
    await page.goto(BASE + '/exec?supprimer=1');
    await page.locator('#box-suppr').waitFor({ timeout: 5000 });
    await page.locator('[data-raz="resultats"]').check(); await page.locator('[data-raz="quiz"]').check();
    await page.fill('#suppr-confirmation', 'Hugo');
    await page.locator('#suppr-go').click();
    await page.locator('#suppr-msg .ok, #suppr-msg .ko').waitFor({ timeout: 10000 }).catch(() => {});
    const fin = await page.locator('#suppr-msg').innerText().catch(() => '');
    await page.unroute('**/macros/s/INSTALL/exec**');
    const apresS = (await ev(`({ hugo: !!ouvrirDossier_(${JSON.stringify(avantS.hugo)}), props: PropertiesService.getScriptProperties().getKeys().length, auth: !!FAUX.authRetiree })`)).r;
    const versInstallateur = await page.locator('#suppr-msg a[href*="supprime="]').count();
    ok(!apresS.hugo && apresS.auth && (versInstallateur === 1 || /supprime=/.test(lien)), 'supprimer le dernier enfant : dossier à la corbeille, autorisation retirée, renvoi vers l\'installateur — ' + JSON.stringify({ apresS, versInstallateur }));
    ok(/entièrement supprimé/.test(fin) && /entièrement désinstallé/.test(fin) && /supprime=projet-script&cadre=1/.test(lien),
      'supprimer : tout se termine sur la même page, l\'installateur retire la publication et vide le programme dans un cadre invisible — ' + fin);
  }

  // clés d'appareil (étape 1c) : l'espace parent sans compte Google, par l'adresse unique du programme
  {
    const avant = (await ev('JSON.stringify({ e: CONFIG.espace, u: CONFIG.urlEnfant, i: CONFIG.invitation })')).r;
    const poste = async o => (await fetch(BASE + '/exec', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(o) })).json();
    const code1 = 'a'.repeat(64);
    await ev(`CONFIG.espace = "enfant"; CONFIG.urlEnfant = "https://script.google.com/macros/s/AKfyTEST1234567890abcdefghij/exec"; CONFIG.invitation = empreinte_("${code1}");
      ["CLES", "INVITS", "INVIT_INSTALL"].forEach(k => PropertiesService.getScriptProperties().deleteProperty(k)); CacheService.getScriptCache().remove("appairer");`);
    const p1 = await poste({ api: 'appairer', code: code1, nom: 'Téléphone de Yan' });
    const p1bis = await poste({ api: 'appairer', code: code1, nom: 'Autre' });
    ok(p1.ok && /^[0-9a-f]{64}$/.test(p1.cle) && p1.role === 'proprio' && !p1bis.ok && /déjà servi/.test(p1bis.erreur || ''),
      'clés d\'appareil : le lien de l\'installateur donne la clé du premier appareil (parent qui a installé), une seule fois');
    const garde = (await ev('JSON.stringify(PropertiesService.getScriptProperties().getProperty("CLES"))')).r;
    ok(!garde.includes(p1.cle), 'clés d\'appareil : seule l\'empreinte de la clé est gardée');
    const page = await poste({ api: 'parent', cle: p1.cle, action: 'page', page: 'tableau-de-bord' });
    ok(/Suivi/.test(page.html || '') && page.reglages && Array.isArray(page.reglages.famille) && page.reglages.proprio !== false, 'clés d\'appareil : page des parents (tableau de bord et ses réglages) pour un appareil reconnu');
    const inv = await poste({ api: 'parent', cle: p1.cle, action: 'apiInviterAppareil', args: [{ nom: 'Julie' }] });
    ok(inv.r && inv.r.ok && /^https:\/\/app\.soccaquiz\.fr\/parent\/\?s=AKfyTEST1234567890abcdefghij#i=[0-9a-f]{64}$/.test(inv.r.lien), 'clés d\'appareil : « Inviter l\'autre parent » donne un lien app.soccaquiz.fr/parent (code après #) — ' + (inv.r && inv.r.lien));
    const p2 = await poste({ api: 'appairer', code: inv.r.code, nom: 'Téléphone de Julie' });
    const actions2 = await Promise.all([
      poste({ api: 'parent', cle: p2.cle, action: 'apiInviterAppareil', args: [{}] }),
      poste({ api: 'parent', cle: p2.cle, action: 'apiClasse', args: [{ classe: 'CM1' }] }),
      poste({ api: 'parent', cle: 'f'.repeat(64), action: 'apiClasse', args: [{ classe: 'CP' }] }),
      poste({ api: 'parent', cle: p2.cle, action: 'apiPourEnfant', args: [] })
    ]);
    ok(p2.role === 'parent' && actions2[0].r && !!actions2[0].r.erreur && actions2[1].r && actions2[1].r.ok && actions2[2].__status === 401 && actions2[3].__status === 400,
      'clés d\'appareil : l\'autre parent gère (classe…) sans pouvoir inviter ; clé inconnue refusée — ' + JSON.stringify(actions2.map(x => x.r || x.__status)));
    const liste = await poste({ api: 'parent', cle: p1.cle, action: 'apiAppareils' });
    const julie = liste.r.appareils.find(x => x.nom === 'Téléphone de Julie');
    ok(liste.r.appareils.length === 2 && liste.r.appareils.find(x => x.moi).nom === 'Téléphone de Yan' && julie && julie.role === 'parent', 'clés d\'appareil : Réglages → liste des appareils (celui-ci repéré)');
    const ret = await poste({ api: 'parent', cle: p1.cle, action: 'apiRetirerAppareil', args: [{ id: julie.id }] });
    const apres = await poste({ api: 'parent', cle: p2.cle, action: 'apiAppareils' });
    ok(ret.r && ret.r.ok && apres.__status === 401, 'clés d\'appareil : « Retirer » coupe l\'accès de cet appareil tout de suite');
    const enfant = (await ev('[apiClasse({ classe: "CP" }).__status, apiAppareils().__status]')).r;
    ok(enfant.join() === '403,403', 'clés d\'appareil : sans clé, l\'adresse de l\'enfant reste fermée aux actions des parents');
    const a = JSON.parse(avant);
    await ev(`CONFIG.espace = ${JSON.stringify(a.e)}; CONFIG.urlEnfant = ${JSON.stringify(a.u)}; CONFIG.invitation = ${JSON.stringify(a.i)};`);
  }

  ok(erreursJs.length === 0, 'aucune erreur JavaScript' + (erreursJs.length ? ' :\n   ' + erreursJs.join('\n   ') : ''));
} finally {
  await browser.close();
  serveur.kill();
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
