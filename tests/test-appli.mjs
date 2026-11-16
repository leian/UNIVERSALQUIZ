/* =====================================================================
   TEST DE L'APPLI INSTALLABLE (dossier appli/) ET DU BANDEAU GOOGLE
   Règle vérifiée ici : le site de l'enfant ne s'affiche JAMAIS sous le bandeau « Cette application a été créée
   par un utilisateur de Google Apps Script », quel que soit le chemin (lien de l'appli, ancien lien ou favori,
   page précise, retour arrière, rechargement, liens de l'espace parent, pages d'erreur, interrupteur).

   Google est reproduit fidèlement : l'adresse script.google.com/macros/s/<id>/exec est une page « enveloppe »
   de Google qui porte le bandeau (caché quand elle est elle-même dans un cadre, comme chez Google) et affiche la
   page du site dans un cadre isolé (sandbox) servi par *.googleusercontent.com, qui ne peut changer la page
   entière qu'après un toucher (« allow-top-navigation-by-user-activation »). Chaque scénario est rejoué aussi
   avec un cadre plus permissif, au cas où Google autoriserait le renvoi automatique.
   Lancé par tests/test.mjs après la construction ; seul : node construire.mjs && node tests/test-appli.mjs
   ===================================================================== */
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const DRIVE = join(ICI, 'drive-appli');
const PORT = 8766, LOCAL = `http://localhost:${PORT}`;
const ID = 'AKfycbTEST_site-de-l-enfant_0123456789', IDP = 'AKfycbTEST_espace-parent_0123456789';
const SITE = `https://script.google.com/macros/s/${ID}/exec`, PARENT = `https://script.google.com/macros/s/${IDP}/exec`;
const APPLI = 'https://leian.github.io/app/', LIEN = APPLI + '?s=' + ID;
const BANDEAU = 'Cette application a été créée par un utilisateur de Google Apps Script';
const SANDBOX_GOOGLE = 'allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation';
const SANDBOX_LIBRE = SANDBOX_GOOGLE.replace('allow-top-navigation-by-user-activation', 'allow-top-navigation');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright'); }

rmSync(DRIVE, { recursive: true, force: true });
const serveur = spawn(process.execPath, [join(ICI, 'faux-google.mjs'), join(RACINE, 'build'), DRIVE, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => serveur.stdout.once('data', ok));
const ev = async code => (await (await fetch(LOCAL + '/eval', { method: 'POST', body: code })).json());
// un seul faux Google pour les deux espaces : chaque requête pose d'abord le bon espace (requêtes mises en file)
let file = Promise.resolve();
const enFile = f => (file = file.then(f, f));
const appelEspace = (espace, url, opts) => enFile(async () => { await ev(`CONFIG.espace = "${espace}"; 0`); const r = await fetch(url, opts); return { status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) }; });

let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + '[appli] ' + m); if (!c) echecs++; };

const options = { args: ['--no-sandbox'] };
if (process.env.CHROME) options.executablePath = process.env.CHROME;
const browser = await playwright.chromium.launch(options).catch(() => playwright.chromium.launch({ ...options, executablePath: '/usr/bin/google-chrome' }));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let reglages = {}, siteAJour = true, sandbox = SANDBOX_GOOGLE;

async function nouvellePage() {
  const contexte = await browser.newContext({ viewport: { width: 400, height: 800 }, serviceWorkers: 'block' });
  const page = await contexte.newPage();
  page.erreurs = [];
  contexte.on('page', p => p.on('pageerror', e => page.erreurs.push(e.message)));
  page.on('pageerror', e => page.erreurs.push(e.message));
  // l'enveloppe : les fichiers du dossier appli/, servis comme sur GitHub Pages
  await contexte.route('https://leian.github.io/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/UNIVERSALQUIZ/soccaquiz.json') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reglages) });
    if (!u.pathname.startsWith('/app/')) return r.fulfill({ status: 200, body: '' });      // polices, images du site
    const f = u.pathname.slice(5) || 'index.html';
    try { return r.fulfill({ status: 200, contentType: TYPES[extname(f)] || 'text/plain', body: readFileSync(join(RACINE, 'appli', f)) }); }
    catch (e) { return r.fulfill({ status: 404, body: '' }); }
  });
  // Google, côté enveloppe : script.google.com/macros/s/<id>/exec → page de Google avec le bandeau + cadre isolé
  await contexte.route('https://script.google.com/**', async r => {
    const u = new URL(r.request().url());
    const m = u.pathname.match(/^\/macros\/s\/([^/]+)\/exec$/);
    if (!m || (m[1] !== ID && m[1] !== IDP)) return r.fulfill({ status: 404, body: 'introuvable' });
    const espace = m[1] === ID ? 'enfant' : 'parent';
    const contenu = await appelEspace(espace, LOCAL + '/exec' + u.search);
    const cadreOk = !contenu.headers['x-frame-options'] && siteAJour;
    const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Google</title></head>
<body style="margin:0;font-family:sans-serif"><div id="bandeau-google" style="background:#fdf6e3;padding:8px;font-size:13px">${BANDEAU}</div>
<iframe id="sandboxFrame" sandbox="${sandbox}" allow="microphone; autoplay; clipboard-write" style="border:0;width:100%;height:760px"
 src="https://n-${espace}.script.googleusercontent.com/userCodeAppPanel${u.search}"></iframe>
<script>if (window.top !== window) document.getElementById('bandeau-google').style.display = 'none';</script></body></html>`;
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: cadreOk ? {} : { 'x-frame-options': 'SAMEORIGIN' }, body: page });
  });
  // Google, côté page du site : *.script.googleusercontent.com (le faux Google, dans le bon espace)
  await contexte.route(/^https:\/\/n-(enfant|parent)\.script\.googleusercontent\.com\//, async r => {
    const u = new URL(r.request().url()), espace = u.hostname.startsWith('n-enfant') ? 'enfant' : 'parent';
    const chemin = u.pathname === '/userCodeAppPanel' ? '/exec' : u.pathname;
    const rep = await appelEspace(espace, LOCAL + chemin + u.search, { method: r.request().method(), body: r.request().postData() || undefined });
    const h = Object.assign({}, rep.headers); delete h['x-frame-options']; delete h['content-length']; delete h['transfer-encoding'];
    return r.fulfill({ status: rep.status, headers: h, body: rep.body });
  });
  await contexte.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/, r => r.fulfill({ status: 200, body: '' }));
  return page;
}
const sitePage = page => page.frames().find(f => /^https:\/\/n-enfant\./.test(f.url()));
const pret = page => page.locator('#demarrage.fini').waitFor({ state: 'attached', timeout: 10000 }).then(() => true, () => false);
// le bandeau est-il visible quelque part, dans une fenêtre qui montre le site de l'enfant ?
async function bandeauEnfant(contexte) {
  for (const p of contexte.pages()) {
    if (!p.url().startsWith(SITE)) continue;
    if (await p.locator('#bandeau-google').isVisible().catch(() => false)) return p.url();
  }
  return '';
}
// état d'une fenêtre : où on est, ce qu'on voit
async function etat(page) {
  const f = sitePage(page);
  return { top: page.url(), site: f ? f.url().replace(/^https:\/\/n-enfant\.script\.googleusercontent\.com\/userCodeAppPanel/, '') : '', bandeau: await bandeauEnfant(page.context()) };
}
const attendreApp = page => page.waitForURL(u => String(u).startsWith(APPLI), { timeout: 8000 }).then(() => pret(page), () => false);
const quiz = 'quiz_exemple_capitales';

try {
  await ev(`CONFIG.urlEnfant = "${SITE}"; CONFIG.urlParent = "${PARENT}"; CONFIG.prenom = "Lana"; 0`);

  // 1. côté Google : ce que sert le site
  const sans = await appelEspace('enfant', LOCAL + '/exec'), avec = await appelEspace('enfant', LOCAL + '/exec?cadre=1');
  const htmlSans = sans.body.toString(), htmlAvec = avec.body.toString();
  ok(!/class="card"|MATIERES/.test(htmlSans) && htmlSans.includes(LIEN) && /Ouvrir SoccaQuiz/.test(htmlSans) && sans.headers['x-frame-options'],
    'site de l\'enfant ouvert directement : aucune page du site, seulement le renvoi vers l\'appli (bouton « Ouvrir SoccaQuiz »)');
  const pageQuiz = (await appelEspace('enfant', LOCAL + '/exec?page=' + quiz + '&mode=erreurs')).body.toString();
  ok(pageQuiz.includes(LIEN + '&amp;q=' + encodeURIComponent('page=' + quiz + '&mode=erreurs').replace(/&/g, '&amp;')) || pageQuiz.includes(JSON.stringify(LIEN + '&q=' + encodeURIComponent('page=' + quiz + '&mode=erreurs'))),
    'ancien lien vers une page précise : renvoi vers la même page dans l\'appli');
  ok(!avec.headers['x-frame-options'] && /"cadre":"https:\/\/leian\.github\.io"/.test(htmlAvec) && /class="card"|MATIERES/.test(htmlAvec), 'dans l\'appli (?cadre=1) : le site s\'affiche et accepte le cadre');
  const classique = (await appelEspace('enfant', LOCAL + '/exec?classique=1')).body.toString();
  ok(/MATIERES/.test(classique) && /"classique":true/.test(classique), 'secours (?classique=1) : le site s\'affiche hors de l\'appli, sans renvoi');
  const parent = await appelEspace('parent', LOCAL + '/exec?cadre=1');
  ok(!!parent.headers['x-frame-options'] && !/"cadre"/.test(parent.body.toString()) && parent.body.toString().includes('"appli":"' + LIEN + '"'), 'espace parent : jamais dans un cadre ; il connaît l\'adresse de l\'appli de l\'enfant');
  const espParent = (await appelEspace('enfant', LOCAL + '/exec?cadre=1&page=ajouter')).body.toString();
  const erreur = (await appelEspace('enfant', LOCAL + '/exec?cadre=1&page=quiz-qui-n-existe-pas')).body.toString();
  ok(espParent.includes('href="' + LIEN + '"') && !espParent.includes('href="' + SITE + '"') && erreur.includes('href="' + LIEN + '"') && !erreur.includes('href="' + SITE + '"'),
    'pages « espace parent » et d\'erreur du site de l\'enfant : « Revenir aux quiz » ramène dans l\'appli');

  for (const [nom, sb] of [['cadre de Google', SANDBOX_GOOGLE], ['cadre permissif', SANDBOX_LIBRE]]) {
    sandbox = sb;
    const T = s => `[${nom}] ` + s;

    // 2. dans l'appli : affichage, navigation, retour arrière, rechargement
    let page = await nouvellePage();
    await page.goto(LIEN);
    ok(await pret(page), T('appli : le site de l\'enfant s\'affiche, l\'écran de démarrage se retire'));
    let f = sitePage(page);
    await f.locator('a.card').first().click();
    await page.waitForFunction(() => /page=/.test(document.getElementById('cadre').src), null, { timeout: 5000 }).catch(() => {});
    await pret(page);
    let e = await etat(page);
    ok(e.top === LIEN && /page=quiz_exemple/.test(e.site) && !e.bandeau, T('appli : accueil → quiz sans quitter l\'appli — ' + JSON.stringify(e)));
    await page.goBack().catch(() => {});
    await page.waitForTimeout(800);
    e = await etat(page);
    ok(e.top.startsWith(APPLI) && !e.bandeau, T('appli : retour arrière, on reste dans l\'appli — ' + JSON.stringify(e)));
    await page.reload(); await pret(page);
    e = await etat(page);
    ok(e.top.startsWith(APPLI) && !e.bandeau && e.site, T('appli : rechargement, on reste dans l\'appli'));
    // quiz → « Quitter » (logo puis Quitter)
    f = sitePage(page);
    await f.locator('a.card').first().click();
    await page.waitForFunction(() => /page=/.test(document.getElementById('cadre').src), null, { timeout: 5000 }).catch(() => {});
    await pret(page);
    // lien « Espace parent » en bas de page : s'ouvre à part ; dans l'espace parent, « Site de l'enfant » ramène dans l'appli
    f = sitePage(page);
    await f.locator('#porte-parent a').waitFor({ timeout: 8000 });
    const [fen] = await Promise.all([page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null), f.locator('#porte-parent a').click()]);
    ok(!!fen && page.url() === LIEN, T('appli : « Espace parent » s\'ouvre dans une autre fenêtre, l\'appli reste en place'));
    if (fen) {
      await fen.waitForLoadState().catch(() => {});
      const fp = () => fen.frames().find(x => /^https:\/\/n-parent\./.test(x.url()));
      await fen.waitForFunction(() => true).catch(() => {});
      for (let i = 0; i < 40 && !(fp() && await fp().locator('#lien-enfant').count().catch(() => 0)); i++) await fen.waitForTimeout(250);
      const infos = fp() ? await fp().evaluate(() => ({ href: document.getElementById('lien-enfant').href, adresses: (document.getElementById('adresses') || {}).textContent || '' })) : {};
      ok(infos.href === LIEN && infos.adresses.includes(LIEN) && !infos.adresses.includes(SITE), T('espace parent : lien « Site de l\'enfant » et adresse « à lui envoyer » = l\'appli — ' + JSON.stringify(infos).slice(0, 200)));
      if (fp()) await fp().locator('#lien-enfant').click();
      ok(await attendreApp(fen) && !(await bandeauEnfant(page.context())), T('espace parent → « Site de l\'enfant » : arrivée dans l\'appli, sans bandeau — ' + fen.url()));
      await fen.close();
    }
    await page.context().close();

    // 3. ancien lien ou favori (adresse Google directe), avec ou sans page précise
    for (const [quoi, adresse, attendu] of [['accueil', SITE, ''], ['page de quiz', SITE + '?page=' + quiz, 'page=' + quiz], ['ancien lien de l\'appli (?cadre=1 hors de l\'appli)', SITE + '?cadre=1&page=' + quiz, 'page=' + quiz]]) {
      page = await nouvellePage();
      await page.goto(adresse);
      // renvoi automatique accepté, ou bouton « Ouvrir SoccaQuiz » (Google refuse le renvoi sans toucher)
      for (let i = 0; i < 60; i++) {
        if (page.url().startsWith(APPLI)) break;
        const fx = sitePage(page);
        if (fx && await fx.locator('#ouvrir, #sq-vers-appli a').count().catch(() => 0)) break;
        await page.waitForTimeout(200);
      }
      let arrive = page.url().startsWith(APPLI);
      if (!arrive) {
        const fs = sitePage(page);
        const bouton = fs ? fs.locator('#ouvrir, #sq-vers-appli a').first() : null;
        const rien = fs ? await fs.evaluate(() => !document.querySelector('#sq-vers-appli') ? !document.querySelector('a.card, #app') : getComputedStyle(document.getElementById('sq-vers-appli')).position === 'fixed') : false;
        ok(rien, T(quoi + ' : sans renvoi automatique, seul le bouton « Ouvrir SoccaQuiz » est visible'));
        await bouton.click().catch(() => {});
      }
      arrive = await attendreApp(page);
      e = await etat(page);
      ok(arrive && !e.bandeau && e.site.includes(attendu) && /cadre=1/.test(e.site), T(quoi + ' : arrivée dans l\'appli' + (attendu ? ', à la même page' : '') + ', sans bandeau — ' + JSON.stringify(e)));
      if (sb === SANDBOX_LIBRE && quoi === 'accueil') ok(page.url().startsWith(APPLI), T('renvoi automatique quand le navigateur l\'accepte'));
      await page.context().close();
    }
  }
  sandbox = SANDBOX_GOOGLE;

  // 4. filets de sécurité, sans jamais renvoyer de lui-même vers l'adresse Google
  let page = await nouvellePage();
  await page.goto(APPLI);
  ok(/Ouvre le lien SoccaQuiz/.test(await page.locator('#msg').innerText()) && !(await page.evaluate(() => document.getElementById('cadre').src)), 'appli : sans identifiant de site, un message et aucun site ouvert');
  await page.goto(APPLI + '?s=pas-un-identifiant');
  ok(/Ouvre le lien SoccaQuiz/.test(await page.locator('#msg').innerText()), 'appli : identifiant invalide refusé');
  await page.goto(LIEN); await pret(page);
  await page.goto(APPLI); await pret(page);
  ok(!!sitePage(page), 'appli : sans ?s= dans l\'adresse, le dernier site ouvert sur l\'appareil est repris');
  const avant = await page.evaluate(() => document.getElementById('cadre').src);
  await page.evaluate(() => window.postMessage({ uq: 'aller', url: 'https://script.google.com/macros/s/AUTRE/exec' }, '*'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('cadre').src) === avant, 'appli : une demande vers un autre site est ignorée');
  await page.context().close();

  siteAJour = false;            // site trop ancien : Google refuse le cadre
  page = await nouvellePage();
  await page.clock.install();
  await page.goto(LIEN);
  await page.clock.fastForward(16000);
  await page.waitForTimeout(300);
  ok(page.url() === LIEN && await page.locator('#reessayer').isVisible() && await page.locator('#secours').isVisible() && !(await bandeauEnfant(page.context())),
    'site qui refuse le cadre : après 15 s, message, « Réessayer » et un lien « Ouvrir sans l\'appli » ; jamais de renvoi automatique vers l\'adresse Google');
  await page.locator('#secours').click();
  await page.waitForURL(u => String(u).startsWith(SITE), { timeout: 8000 }).catch(() => {});
  ok(/classique=1/.test(page.url()), '« Ouvrir sans l\'appli » (choix de la personne) : site classique, sans renvoi vers l\'appli — ' + page.url());
  await page.context().close();
  siteAJour = true;

  reglages = { appli: 'off' };
  page = await nouvellePage();
  await page.goto(LIEN);
  await page.waitForURL(u => String(u).startsWith(SITE), { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const fo = sitePage(page);
  ok(page.url().startsWith(SITE) && /classique=1/.test(page.url()) && fo && await fo.locator('a.card').count() > 0, 'interrupteur "appli": "off" : site classique, sans aller-retour avec l\'appli — ' + page.url());
  if (fo) {
    const href = await fo.locator('a.card').first().evaluate(a => { a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return a.href; });
    await fo.locator('a.card').first().click();
    await page.waitForTimeout(1500);
    ok(page.url().startsWith(SITE) && /classique=1/.test(page.url()) && /page=/.test(page.url()), 'interrupteur "off" : les pages suivantes restent sur le site classique — ' + page.url() + ' ' + href);
  }
  await page.context().close();
  reglages = {};

  page = await nouvellePage();
  await page.clock.install();
  await page.context().route('https://script.google.com/**', r => r.abort());
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  await page.goto(LIEN);
  await page.clock.fastForward(16000);
  ok(page.url() === LIEN && /Pas de connexion/.test(await page.locator('#msg').innerText()) && await page.locator('#reessayer').isVisible() && !(await page.locator('#secours').isVisible()), 'sans connexion : message et bouton « Réessayer », pas de page vide');
  await page.context().close();

  // 5. le manifeste
  const m = JSON.parse(readFileSync(join(RACINE, 'appli', 'manifest.webmanifest'), 'utf8'));
  ok(m.display === 'standalone' && !('start_url' in m) && m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512') && m.icons.some(i => i.purpose === 'maskable'),
    'manifeste : plein écran, icônes 192 et 512, icône découpable, pas de start_url (l\'icône rouvre l\'adresse installée, ?s= compris)');
} catch (e) {
  console.error(e); echecs++;
} finally {
  await browser.close();
  serveur.kill();
  rmSync(DRIVE, { recursive: true, force: true });
}
console.log(echecs ? `[appli] ${echecs} échec(s)` : '[appli] tout est vert');
process.exit(echecs ? 1 : 0);
