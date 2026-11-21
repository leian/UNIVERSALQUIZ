/* =====================================================================
   TEST DE L'APPLI SERVIE HORS DE GOOGLE (dossier site/ → build-site/)
   Un faux Google (tests/faux-google.mjs, API JSON …/exec?api=… et POST) et un petit serveur de fichiers
   statiques qui joue le rôle de Cloudflare Pages. On vérifie : accueil et quiz assemblés sur l'appareil,
   changement de page sans rechargement de l'appli, partie enregistrée chez la « famille », score visible au
   retour, affichage immédiat depuis la mémoire de l'appareil quand Google ne répond pas, site sans API.
   Lancé par tests/test.mjs après la construction ; seul : node construire.mjs && node tests/test-site.mjs
   ===================================================================== */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const DRIVE = join(ICI, 'drive-site');
const PG = 8767, PS = 8768;
const GOOGLE = `http://localhost:${PG}`, SITE = `http://localhost:${PS}`;
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright'); }

rmSync(DRIVE, { recursive: true, force: true });
const google = spawn(process.execPath, [join(ICI, 'faux-google.mjs'), join(RACINE, 'build'), DRIVE, String(PG)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => google.stdout.once('data', ok));
const ev = async code => (await (await fetch(GOOGLE + '/eval', { method: 'POST', body: code })).json());
await ev('CONFIG.espace = "enfant"; CONFIG.prenom = "Lana"; CONFIG.urlParent = "https://script.google.com/macros/s/AKfycbPARENT_essai_0123456789/exec"; 0');

// « Cloudflare Pages » : les fichiers de build-site/, rien d'autre
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const statique = http.createServer((req, res) => {
  const u = new URL(req.url, SITE);
  if (u.pathname === '/ancien') { res.writeHead(200, { 'content-type': 'text/html', 'access-control-allow-origin': '*' }); return res.end('<html><body>vieux site</body></html>'); }
  const f = join(RACINE, 'build-site', u.pathname.endsWith('/') ? decodeURIComponent(u.pathname) + 'index.html' : decodeURIComponent(u.pathname));   // comme Cloudflare : dossier → index.html
  if (!f.startsWith(join(RACINE, 'build-site')) || !existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(ok => statique.listen(PS, ok));

let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + '[site] ' + m); if (!c) echecs++; };
const options = { args: ['--no-sandbox'] };
if (process.env.CHROME) options.executablePath = process.env.CHROME;
const browser = await playwright.chromium.launch(options).catch(() => playwright.chromium.launch({ ...options, executablePath: '/usr/bin/google-chrome' }));
const contexte = await browser.newContext({ viewport: { width: 400, height: 800 } });
await contexte.route(/fonts\.(googleapis|gstatic)\.com|leian\.github\.io|jsdelivr|script\.google\.com/, r => r.fulfill({ status: 200, body: '' }));
const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
const ADRESSE = SITE + '/?exec=' + encodeURIComponent(GOOGLE + '/exec');
// la page affichée : le dernier cadre, une fois le précédent retiré
async function cadre() {
  for (let i = 0; i < 200; i++) { if (await page.locator('iframe.page').count() === 1) break; await page.waitForTimeout(50); }
  return page.frameLocator('iframe.page').last();
}

try {
  await page.goto(ADRESSE);
  let f = await cadre();
  await f.locator('a.card').first().waitFor({ timeout: 10000 });
  ok(await f.locator('a.card').count() === 1 && /Lana/.test(await f.locator('body').innerText()), 'accueil assemblé sur l\'appareil (quiz du Drive, prénom)');
  await page.evaluate(() => { window.__pasRecharge = 1; });

  await f.locator('a.card').first().click();
  await page.waitForFunction(() => location.hash === '#quiz_exemple_capitales');
  f = await cadre();
  await f.locator('.start-btn').waitFor({ timeout: 10000 });
  ok(await page.evaluate(() => window.__pasRecharge === 1), 'quiz ouvert sans recharger l\'appli');

  await f.locator('.start-btn').click();
  for (let i = 0; i < 300; i++) {
    if (await f.locator('.result-card').count()) break;
    if (await f.locator('.next-btn').count()) { await f.locator('.next-btn').click(); continue; }
    if (await f.locator('#ans-input').count()) { await f.locator('#ans-input').fill('Paris'); await f.locator('#ans-input').press('Enter'); continue; }
    if (await f.locator('.opt-btn:not([disabled])').count()) { await f.locator('.opt-btn').first().click(); continue; }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
  }
  let lignes = 0;
  for (let i = 0; i < 40 && lignes < 1; i++) { lignes = (await ev('LIGNES_ = null; lireLignes_().length')).r; await page.waitForTimeout(150); }
  const derniere = (await ev('LIGNES_ = null; lireLignes_().slice(-1)[0]')).r;
  ok(await f.locator('.result-card').count() === 1 && lignes === 1 && derniere && derniere.quiz === 'quiz_exemple_capitales', 'partie jouée et enregistrée dans le Google de la famille — ' + JSON.stringify([await f.locator('.result-card').count(), lignes, derniere && derniere.quiz, erreurs.slice(0, 3)]));

  const memoire = await page.evaluate(() => Object.keys(localStorage));
  ok(memoire.some(k => k.indexOf('sq:local:uqSuivi.') === 0) && !memoire.some(k => k.indexOf('uqSuivi.') === 0), 'mémoire de l\'appareil rangée à part pour ce site (deux enfants sur une tablette ne se mélangent pas)');
  await f.locator('.result-btns a.btn-myquiz').first().click();
  await page.waitForFunction(() => location.hash === '');
  f = await cadre();
  await f.locator('a.card .score').first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await f.locator('a.card .score').count() === 1 && await page.evaluate(() => window.__pasRecharge === 1), 'retour à l\'accueil sans rechargement, score de la partie affiché');

  await page.goBack();
  await page.waitForFunction(() => location.hash === '#quiz_exemple_capitales');
  f = await cadre();
  ok(await f.locator('.start-btn').count() === 1, 'bouton retour du téléphone : revient au quiz');

  // porte de l'espace parent : ouverte à part, jamais dans l'appli
  await page.evaluate(() => { location.hash = ''; });
  f = await cadre();
  await f.locator('#porte-parent a').waitFor({ timeout: 10000 });
  const [nouvelle] = await Promise.all([contexte.waitForEvent('page', { timeout: 5000 }).catch(() => null), f.locator('#porte-parent a').click()]);
  ok(!!nouvelle && /AKfycbPARENT/.test(nouvelle.url()), 'lien « Espace parent » ouvert à part — ' + (nouvelle && nouvelle.url()));
  if (nouvelle) await nouvelle.close();

  // Google ne répond pas : l'accueil s'affiche quand même, depuis la mémoire de l'appareil
  const p2 = await contexte.newPage();
  await p2.route(GOOGLE + '/**', r => r.abort());
  await p2.goto(ADRESSE);
  const f2 = p2.frameLocator('iframe.page').last();
  await f2.locator('a.card').first().waitFor({ timeout: 5000 }).catch(() => {});
  ok(await f2.locator('a.card').count() === 1, 'Google injoignable : accueil affiché depuis la mémoire de l\'appareil');
  await f2.locator('a.card').first().click();
  for (let i = 0; i < 100; i++) { if (await p2.locator('iframe.page').count() === 1 && await p2.frameLocator('iframe.page').locator('.start-btn').count()) break; await p2.waitForTimeout(50); }
  ok(await p2.frameLocator('iframe.page').last().locator('.start-btn').count() === 1, 'Google injoignable : quiz déjà ouvert rejoué depuis l\'appareil');
  await p2.close();

  // site d'une version sans API : message (sur le vrai site : renvoi vers l'ancienne appli)
  const p3 = await (await browser.newContext()).newPage();
  await p3.goto(SITE + '/?exec=' + encodeURIComponent(SITE + '/ancien'));
  await p3.waitForTimeout(1500);
  ok(/pas encore l'API/.test(await p3.locator('#msg').innerText()), 'site sans API : reconnu (ancienne appli utilisée en vrai)');

  // espace parent servi hors de Google (chantier « sans alerte », étape 2) : lien d'invitation → clé de l'appareil
  {
    const code = 'b'.repeat(64);
    await ev(`CONFIG.invitation = empreinte_("${code}"); ["CLES", "INVITS", "INVIT_INSTALL"].forEach(k => PropertiesService.getScriptProperties().deleteProperty(k)); 0`);
    const ctxP = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await ctxP.route(/fonts\.(googleapis|gstatic)\.com|leian\.github\.io|jsdelivr|script\.google\.com/, r => r.fulfill({ status: 200, body: '' }));
    const pp = await ctxP.newPage();
    pp.on('pageerror', e => erreurs.push('[parent] ' + e.message));
    const ADR_P = SITE + '/parent/?exec=' + encodeURIComponent(GOOGLE + '/exec');
    await pp.goto(ADR_P + '#i=' + code);
    const cadreP = async () => { for (let i = 0; i < 200; i++) { if (await pp.locator('iframe.page').count() === 1) break; await pp.waitForTimeout(50); } return pp.frameLocator('iframe.page').last(); };
    let fp = await cadreP();
    await fp.locator('#onglets').waitFor({ timeout: 15000 }).catch(() => {});
    const cleGardee = await pp.evaluate(() => Object.keys(localStorage).some(k => /^sq-cle:/.test(k)));
    ok(await fp.locator('#onglets').isVisible() && cleGardee && !/i=/.test(await pp.evaluate(() => location.hash)), 'espace parent hors de Google : le lien d\'invitation ouvre le tableau de bord, la clé est gardée, le code disparaît de l\'adresse');
    await fp.locator('#o-reglages').click();
    await fp.locator('#parents [data-retirer-appareil]').waitFor({ timeout: 10000 }).catch(() => {});
    ok(/cet appareil/.test(await fp.locator('#parents').innerText()) && await fp.locator('#parents [data-inviter="parent"]').count() === 1, 'espace parent hors de Google : Réglages → cet appareil dans la liste, « Inviter l\'autre parent »');
    await fp.locator('a[href="ajouter.html"]').first().click();
    await pp.waitForFunction(() => location.hash === '#ajouter');
    fp = await cadreP();
    await fp.locator('#secours').waitFor({ timeout: 10000 });
    await fp.locator('#secours').evaluate(d => { d.open = true; });
    await fp.locator('#reponse').fill('T|Les planètes|Essai|sciences|🪐|🪐\nQ|La planète rouge ?|Mars|Vénus|Jupiter|Mars.\nQ|La plus grosse ?|Jupiter|Mars|Terre|Jupiter.\nQ|Notre planète ?|la Terre|Mars|la Lune|La Terre.');
    await fp.locator('#creer').click();
    await fp.locator('#resultat .ok, #resultat .ko').waitFor({ timeout: 15000 }).catch(() => {});
    const titres = (await ev('viderCatalogue_(); catalogue_(installer_().dossier).QUIZ.map(q => q.titre).join()')).r;
    ok(/prêt/.test(await fp.locator('#resultat').innerText()) && /Les planètes/.test(titres), 'espace parent hors de Google : quiz créé (actions par la clé de l\'appareil) — ' + titres);
    await pp.goto(ADR_P);
    fp = await cadreP();
    await fp.locator('#onglets').waitFor({ timeout: 15000 }).catch(() => {});
    ok(await fp.locator('#onglets').isVisible(), 'espace parent hors de Google : rouvert plus tard sans lien, grâce à la clé de l\'appareil');
    const autre = await (await browser.newContext()).newPage();
    await autre.goto(ADR_P);
    await autre.waitForTimeout(1500);
    ok(/lien d'invitation/.test(await autre.locator('#msg').innerText()) && !(await autre.locator('iframe.page').count()), 'espace parent hors de Google : un appareil sans clé ne voit rien');
    await ctxP.close();
  }

  ok(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));
} catch (e) {
  ok(false, 'exception : ' + (e && e.stack || e));
} finally {
  await browser.close();
  google.kill();
  statique.close();
}
process.exit(echecs ? 1 : 0);
