/* =====================================================================
   TEST DE BOUT EN BOUT, SANS COMPTE GOOGLE
   Lance un « faux Google » (tests/faux-google.mjs) qui exécute Code.gs
   avec des services simulés, puis joue dans Chrome comme un enfant.
   Usage :   node tests/test.mjs
   Prérequis : npm i -D playwright && npx playwright install chromium
   ===================================================================== */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync, rmSync } from 'node:fs';
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

// 1. construction + faux Google
if (spawnSync(process.execPath, [join(RACINE, 'construire.mjs')], { stdio: 'inherit' }).status !== 0) process.exit(1);
rmSync(DRIVE, { recursive: true, force: true });
const serveur = spawn(process.execPath, [join(ICI, 'faux-google.mjs'), join(RACINE, 'build'), DRIVE, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => serveur.stdout.once('data', ok));

const ev = async code => (await (await fetch(BASE + '/eval', { method: 'POST', body: code })).json());
let echecs = 0;
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
  s = await ev('1');
  const lignes = Object.values(s.sheets)[0].rows;
  ok(lignes.length === 2 && lignes[1][3] === 'quiz_exemple_capitales', 'résultat écrit dans le Sheets');

  // dépôt d'un nouveau quiz + d'un PDF dans le dossier
  const dossier = join(DRIVE, 'Universal Quiz');
  copyFileSync(join(RACINE, 'src', 'exemple-quiz.html'), join(dossier, 'quiz_Test_copie_12-11-2026.html'));
  writeFileSync(join(dossier, 'controle_Test_12-11-2026.pdf'), '%PDF-1.4\n');
  await ev('CacheService.getScriptCache().remove("catalogue")');
  await page.locator('a.btn-myquiz').first().click();
  await page.waitForURL(BASE + '/exec');
  ok(await page.locator('a.card').count() === 2, 'nouveau fichier déposé → 2 quiz listés');
  ok(await page.locator('a.card .score').count() === 1, 'score affiché sur la carte du quiz joué');

  // tableau de bord
  await page.goto(BASE + '/exec?page=tableau-de-bord');
  await page.waitForTimeout(800);
  ok(/capitales/i.test(await page.locator('body').innerText()), 'tableau de bord : la partie apparaît');

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
  const r = await ev('apiSupprimer(apiLister({}).resultats[0].id)');
  ok(r.r.ok && Object.values(r.sheets)[0].rows.length === 1, 'suppression d\'une partie');

  ok(erreursJs.length === 0, 'aucune erreur JavaScript' + (erreursJs.length ? ' :\n   ' + erreursJs.join('\n   ') : ''));
} finally {
  await browser.close();
  serveur.kill();
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
