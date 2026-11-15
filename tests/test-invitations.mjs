/* Test de la page d'envoi des invitations (invitations/Code.gs), avec un faux Gmail. Usage : node tests/test-invitations.mjs */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + '[invitations] ' + m); if (!c) echecs++; };
const envoyes = [], props = {};
let quota = 100;
const ctx = {
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => readFileSync(join(RACINE, 'docs', 'invitation.html'), 'utf8') }) },
  MailApp: { getRemainingDailyQuota: () => quota, sendEmail: m => { if (m.to === 'casse@x.fr') throw new Error('Adresse refusée'); envoyes.push(m); quota--; } },
  PropertiesService: { getUserProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'soccaquiz@gmail.com' }) },
  HtmlService: { createHtmlOutput: h => { const o = { h, setTitle: () => o, setFaviconUrl: () => o, addMetaTag: () => o }; return o; } }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(RACINE, 'invitations', 'Code.gs'), 'utf8'), ctx);

const r = ctx.apiEnvoyer({ liste: 'Lucie Martin <Lucie@Gmail.com>\nMarc, marc.dupont@orange.fr\nsophie@gmail.com\nlucie@gmail.com\npas une adresse\nZoé <casse@x.fr>', signature: 'Yan', nom: 'Yan (SoccaQuiz)' });
ok(r.ok && envoyes.length === 3 && r.lignes.filter(x => x.erreur).length === 3, '3 envoyés, doublon, ligne sans adresse et refus de Gmail signalés');
const lucie = envoyes[0];
ok(lucie.to === 'lucie@gmail.com' && lucie.name === 'Yan (SoccaQuiz)' && /Bonjour Lucie,/.test(lucie.htmlBody) && /Bonne/.test(lucie.htmlBody) && />?Yan</.test(lucie.htmlBody.replace(/\s+/g, ' ')) && !/id="(bonjour|signature)"/.test(lucie.htmlBody),
  'mail personnalisé (prénom, signature, expéditeur)');
ok(/Bonjour Marc,/.test(envoyes[1].htmlBody), 'prénom : premier mot seulement');
ok(/Bonjour,/.test(envoyes[2].htmlBody) && /Installer SoccaQuiz : https:\/\/leian\.github\.io\/UNIVERSALQUIZ\/installer\.html/.test(envoyes[2].body) && !/<!--|TEXTE À METTRE/.test(envoyes[2].htmlBody) && !/<script|<input|Copier le mail/.test(envoyes[2].htmlBody),
  'sans prénom : « Bonjour, » ; version texte avec le lien ; rien de la page autour du mail');
quota = 1;
ok(/Gmail ne permet plus que 1/.test(ctx.apiEnvoyer({ liste: 'a@b.fr\nc@d.fr' }).erreur) && envoyes.length === 3, 'quota Gmail insuffisant : rien n\'est envoyé');
const e = ctx.apiEnvoyer({ essai: true, signature: 'Yan' });
ok(e.ok && envoyes[3].to === 'soccaquiz@gmail.com' && ctx.apiEtat().signature === 'Yan', 'essai envoyé à soi-même, signature retenue');
ok(/apiEnvoyer/.test(ctx.doGet().h), 'page servie');
const vrai = ctx.UrlFetchApp.fetch;
ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => readFileSync(join(RACINE, 'docs', 'invitation.html'), 'utf8').replace('<!--/MAIL-->', '') });
let refus = ''; try { ctx.modele_(); } catch (err) { refus = err.message; }
ctx.UrlFetchApp.fetch = vrai;
ok(/Repère <!--\/MAIL--> introuvable/.test(refus), 'repère du mail manquant : erreur claire, rien d\'envoyé');
const installer = readFileSync(join(RACINE, 'docs', 'installer.html'), 'utf8');
ok(/http-equiv="refresh" content="0; url=https:\/\/script\.google\.com\/macros\/s\/AKfy/.test(installer) && (installer.match(/AKfycbxseeW1[\w-]+/g) || []).every(x => readFileSync(join(RACINE, 'en-ligne', 'LISEZMOI.md'), 'utf8').includes(x)), 'docs/installer.html redirige vers l\'installateur officiel');
console.log(echecs ? '[invitations] ' + echecs + ' échec(s)' : '[invitations] tout est vert');
process.exit(echecs ? 1 : 0);
