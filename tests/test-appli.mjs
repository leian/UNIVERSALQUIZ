/* =====================================================================
   TEST DE L'APPLI INSTALLABLE (dossier appli/) AVEC LE SITE DE L'ENFANT
   L'enveloppe (leian.github.io/app/) affiche le site dans un cadre : on vérifie que le site s'y affiche,
   que la navigation reste dans l'appli, que rien ne change hors de l'appli, et les deux filets de sécurité
   (interrupteur "appli": "off", retour au site classique si le site ne s'affiche pas).
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
const ID = 'AKfycbTEST_site-de-l-enfant_0123456789';
const SITE = `https://script.google.com/macros/s/${ID}/exec`;
const APPLI = 'https://leian.github.io/app/';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright'); }

rmSync(DRIVE, { recursive: true, force: true });
const serveur = spawn(process.execPath, [join(ICI, 'faux-google.mjs'), join(RACINE, 'build'), DRIVE, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => serveur.stdout.once('data', ok));
const ev = async code => (await (await fetch(LOCAL + '/eval', { method: 'POST', body: code })).json());
let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + '[appli] ' + m); if (!c) echecs++; };

const options = { args: ['--no-sandbox'] };
if (process.env.CHROME) options.executablePath = process.env.CHROME;
const browser = await playwright.chromium.launch(options).catch(() => playwright.chromium.launch({ ...options, executablePath: '/usr/bin/google-chrome' }));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let reglages = {}, siteAJour = true;

async function nouvellePage() {
  const contexte = await browser.newContext({ viewport: { width: 400, height: 800 }, serviceWorkers: 'block' });
  const page = await contexte.newPage();
  page.erreurs = [];
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
  // le site de l'enfant : le faux Google, vu à son adresse script.google.com
  await contexte.route('https://script.google.com/**', async r => {
    const u = new URL(r.request().url());
    if (!siteAJour) u.searchParams.delete('cadre');          // site pas encore mis à jour : il ne connaît pas ?cadre=1
    const chemin = u.pathname.replace(/^\/macros\/s\/[^/]+/, '');
    const rep = await r.fetch({ url: LOCAL + chemin + u.search });
    return r.fulfill({ response: rep });
  });
  await contexte.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/, r => r.fulfill({ status: 200, body: '' }));
  return page;
}
const cadreDe = page => page.frames().find(f => f !== page.mainFrame());
const pret = page => page.locator('#demarrage.fini').waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false);

try {
  await ev(`CONFIG.espace = "enfant"; CONFIG.urlEnfant = "${SITE}"; CONFIG.urlParent = "https://script.google.com/macros/s/PARENT/exec"; CONFIG.prenom = "Lana"; 0`);

  // 1. rien ne change sans ?cadre=1
  const sans = await fetch(LOCAL + '/exec'), avec = await fetch(LOCAL + '/exec?cadre=1');
  const htmlSans = await sans.text(), htmlAvec = await avec.text();
  ok(sans.headers.get('x-frame-options') && !/"cadre"/.test(htmlSans), 'sans ?cadre=1 : le site refuse toujours le cadre et ne reçoit aucun réglage « cadre »');
  ok(!avec.headers.get('x-frame-options') && /"cadre":"https:\/\/leian\.github\.io"/.test(htmlAvec), 'avec ?cadre=1 : affichage dans le cadre autorisé, adresse de l\'appli transmise au pont');
  ok(htmlSans.replace(/\s+/g, ' ') === htmlAvec.replace(/,?"cadre":"[^"]*"/, '').replace(/\s+/g, ' '), 'avec ou sans cadre : la page servie est la même, au réglage « cadre » près');
  await ev('CONFIG.espace = "parent"; 0');
  const parent = await fetch(LOCAL + '/exec?cadre=1');
  ok(!!parent.headers.get('x-frame-options') && !/"cadre"/.test(await parent.text()), 'espace parent : jamais dans un cadre, même avec ?cadre=1');
  await ev('CONFIG.espace = "enfant"; 0');
  const erreur = await fetch(LOCAL + '/exec?cadre=1&page=quiz-qui-n-existe-pas');
  ok(!erreur.headers.get('x-frame-options') && /uq: "pret"/.test(await erreur.text()), 'page d\'erreur : affichable dans l\'appli, qui est prévenue');

  // 2. l'appli affiche le site et garde la navigation
  let page = await nouvellePage();
  await page.goto(APPLI + '?s=' + ID);
  ok(await pret(page), 'appli : le site de l\'enfant s\'affiche dans le cadre, l\'écran de démarrage se retire');
  let cadre = cadreDe(page);
  ok(/[?&]cadre=1/.test(cadre.url()) && cadre.url().startsWith(SITE), 'appli : le cadre ouvre le site de l\'enfant avec ?cadre=1');
  await cadre.locator('a.card').first().waitFor({ timeout: 5000 });
  await cadre.locator('a.card').first().click();
  await page.waitForFunction(() => /page=/.test(document.getElementById('cadre').src), null, { timeout: 5000 }).catch(() => {});
  ok(await pret(page), 'appli : un quiz ouvert depuis l\'accueil se charge dans le cadre');
  cadre = cadreDe(page);
  ok(page.url() === APPLI + '?s=' + ID && /page=quiz_exemple/.test(cadre.url()) && /cadre=1/.test(cadre.url()), 'appli : on reste dans l\'appli (adresse inchangée), le quiz garde ?cadre=1 — ' + cadre.url());
  ok(await cadre.locator('#app').count() === 1 && await cadre.evaluate(() => typeof MoteurQuiz === 'object'), 'appli : le moteur de quiz tourne dans le cadre');
  // lien vers l'espace parent : s'ouvre à part, l'appli reste en place
  await cadre.evaluate(u => { const a = document.createElement('a'); a.id = 't-parent'; a.href = u; a.textContent = 'parent'; a.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'; document.body.appendChild(a); }, 'https://script.google.com/macros/s/PARENT/exec?page=ajouter');
  const [autre] = await Promise.all([page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null), cadre.locator('#t-parent').click()]);
  ok(!!autre && page.url() === APPLI + '?s=' + ID, 'appli : un lien vers l\'espace parent s\'ouvre dans une autre fenêtre');
  ok(!!autre && /[?&]page=ajouter&appli=1$/.test(autre.url()), 'appli : l\'espace parent est prévenu qu\'on vient de l\'appli (?appli=1) — ' + (autre && autre.url()));
  if (autre) await autre.close();
  // l'appli refuse d'afficher autre chose que ce site
  await cadre.evaluate(() => window.top.postMessage({ uq: 'aller', url: 'https://script.google.com/macros/s/AUTRE/exec' }, '*'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('cadre').src).then(s => s.startsWith(SITE)), 'appli : une demande vers un autre site est ignorée');
  // adresse sans paramètre : le site retenu sur l'appareil est rouvert
  await page.goto(APPLI);
  ok(await pret(page) && cadreDe(page).url().startsWith(SITE), 'appli : sans ?s= dans l\'adresse, le dernier site ouvert sur l\'appareil est repris');
  ok(page.erreurs.length === 0, 'appli : aucune erreur JavaScript' + (page.erreurs.length ? ' — ' + page.erreurs.join(' | ') : ''));
  await page.context().close();

  // 3. hors de l'appli, ?cadre=1 ne change rien
  page = await nouvellePage();
  await page.goto(SITE + '?cadre=1');
  await page.locator('a.card').first().click();
  await page.waitForURL(/page=quiz_exemple/, { timeout: 5000 }).catch(() => {});
  ok(/page=quiz_exemple/.test(page.url()) && !/leian\.github\.io/.test(page.url()), 'hors de l\'appli : même avec ?cadre=1, les liens se comportent comme d\'habitude');
  await page.context().close();

  // 3 bis. espace parent ouvert depuis l'appli : son lien « site de l'enfant » ramène dans l'appli
  const PARENT = 'https://script.google.com/macros/s/PARENT/exec';
  ok(!/"retourAppli"/.test(await (await fetch(LOCAL + '/exec?appli=1')).text()), 'site de l\'enfant : ?appli=1 n\'y change rien');
  await ev('CONFIG.espace = "parent"; 0');
  ok(!/"retourAppli"/.test(await (await fetch(LOCAL + '/exec')).text()), 'espace parent ouvert normalement : aucun réglage de retour vers l\'appli');
  ok((await (await fetch(LOCAL + '/exec?appli=1')).text()).includes('"retourAppli":"' + APPLI + '?s=' + ID + '"'), 'espace parent ouvert depuis l\'appli : il reçoit l\'adresse de l\'appli de l\'enfant');
  const lienEnfant = async p => {
    await p.evaluate(u => { const a = document.createElement('a'); a.id = 't-enfant'; a.href = u; a.target = '_top'; a.textContent = 'enfant'; a.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'; document.body.appendChild(a); }, SITE);
    await ev('CONFIG.espace = "enfant"; 0');
    await p.locator('#t-enfant').click();
    await p.waitForURL(u => !String(u).includes('/PARENT/'), { timeout: 8000 }).catch(() => {});
    await ev('CONFIG.espace = "parent"; 0');
    return p.url();
  };
  page = await nouvellePage();
  await page.goto(PARENT + '?appli=1');
  await page.goto(PARENT);                       // autre page de l'espace parent, même onglet : on s'en souvient
  ok(await lienEnfant(page) === APPLI + '?s=' + ID, 'espace parent ouvert depuis l\'appli : « site de l\'enfant » ramène dans l\'appli, même après un changement de page');
  await page.context().close();
  page = await nouvellePage();
  await page.goto(PARENT);
  ok(await lienEnfant(page) === SITE, 'espace parent ouvert normalement : « site de l\'enfant » ouvre le lien habituel');
  await page.context().close();
  await ev('CONFIG.espace = "enfant"; 0');

  // 4. filets de sécurité
  page = await nouvellePage();
  await page.goto(APPLI);
  ok(/Ouvre le lien SoccaQuiz/.test(await page.locator('#msg').innerText()) && !(await page.evaluate(() => document.getElementById('cadre').src)), 'appli : sans identifiant de site, un message et aucun site ouvert');
  await page.goto(APPLI + '?s=pas-un-identifiant');
  ok(/Ouvre le lien SoccaQuiz/.test(await page.locator('#msg').innerText()), 'appli : identifiant invalide refusé');
  await page.context().close();

  reglages = { appli: 'off' };
  page = await nouvellePage();
  await page.goto(APPLI + '?s=' + ID);
  await page.waitForURL(SITE, { timeout: 8000 }).catch(() => {});
  ok(page.url() === SITE, 'interrupteur "appli": "off" : l\'appli renvoie au site classique — ' + page.url());
  await page.context().close();
  reglages = {};

  siteAJour = false;
  page = await nouvellePage();
  await page.clock.install();
  await page.goto(APPLI + '?s=' + ID);
  await page.waitForTimeout(500);
  const encoreLa = page.url().startsWith(APPLI) && !(await page.locator('#demarrage.fini').count());
  await page.clock.fastForward(16000);
  await page.waitForURL(SITE, { timeout: 8000 }).catch(() => {});
  ok(encoreLa && page.url() === SITE, 'site pas encore mis à jour (cadre refusé) : après 15 s, retour automatique au site classique — ' + page.url());
  await page.context().close();
  siteAJour = true;

  page = await nouvellePage();
  await page.clock.install();
  await page.context().route('https://script.google.com/**', r => r.abort());
  await page.context().setOffline(false);
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  await page.goto(APPLI + '?s=' + ID);
  await page.clock.fastForward(16000);
  ok(page.url().startsWith(APPLI) && /Pas de connexion/.test(await page.locator('#msg').innerText()) && await page.locator('#reessayer').isVisible(), 'sans connexion : message et bouton « Réessayer », pas de page vide');
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
