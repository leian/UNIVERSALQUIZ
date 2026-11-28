#!/usr/bin/env node
/* =====================================================================
   ESSAI DES CONSIGNES AVEC GEMINI, comme le fait la page « Ajouter un quiz »
   (création, puis relecture), pour comparer les quiz obtenus sur de vraies leçons.
   Usage :
     node outils/essai-gemini.mjs <dossier de photos> [nb de questions] [classe]
   La clé est lue dans .outils/gemini-cle.txt (dossier ignoré par git ; une seule ligne, la clé),
   ou à défaut dans la variable GEMINI_CLE (déconseillé : elle reste dans l'historique du shell).
   Exemple :
     node outils/essai-gemini.mjs ~/Images/lecon-anglais 12 6e
   Écrit dans le dossier des photos : essai-<heure>-1-creation.txt et essai-<heure>-2-relecture.txt.
   La clé ne quitte pas l'ordinateur (seulement vers Google) et n'est écrite nulle part.
   ===================================================================== */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const [dossier, nb = '12', classe = ''] = process.argv.slice(2);
const FICHIER_CLE = join(RACINE, '.outils', 'gemini-cle.txt');
const cle = (process.env.GEMINI_CLE || (existsSync(FICHIER_CLE) ? readFileSync(FICHIER_CLE, 'utf8') : '')).trim();
if (!dossier || !cle) { console.error('Usage : node outils/essai-gemini.mjs <dossier de photos> [nb] [classe]\n(clé Gemini dans .outils/gemini-cle.txt, ou variable GEMINI_CLE)'); process.exit(1); }

const CONSIGNES = readFileSync(join(RACINE, 'src', 'consignes.txt'), 'utf8').replace(/\r\n/g, '\n');
const RELECTURE = readFileSync(join(RACINE, 'src', 'relecture.txt'), 'utf8').replace(/\r\n/g, '\n');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };
const photos = readdirSync(dossier).filter(f => MIME[extname(f).toLowerCase()]).sort().slice(0, 8)
  .map(f => ({ inline_data: { mime_type: MIME[extname(f).toLowerCase()], data: readFileSync(join(dossier, f)).toString('base64') } }));
if (!photos.length) { console.error('Aucune photo (.jpg, .png, .webp, .heic) dans ' + dossier); process.exit(1); }

// mêmes réglages que src/page-ajouter.html
const MODELES = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const demande = `Crée un quiz de révision de ${nb} questions${classe ? ' pour un élève de ' + classe : ''} à partir des photos jointes (une leçon, ou une simple photo pour un quiz de découverte).`;
const nbQuestions = t => (String(t).match(/^\s*[QVSGOACXNPK]\s*\|/gim) || []).length;

async function appel(modeles, systeme, texte) {
  for (const m of modeles) {
    const t0 = Date.now();
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systeme }] }, contents: [{ role: 'user', parts: [{ text: texte }, ...photos] }] })
    });
    const d = await r.json().catch(() => ({}));
    const t = d.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('');
    if (r.ok && t) { console.log(`  ${m} : ${((Date.now() - t0) / 1000).toFixed(0)} s, ${d.usageMetadata?.totalTokenCount ?? '?'} tokens`); return t; }
    console.log(`  ${m} : échec ${r.status} ${d.error?.message?.slice(0, 120) || ''}`);
    if (r.ok || (r.status !== 404 && r.status !== 429 && r.status < 500)) break;
  }
  throw new Error('Gemini n\'a pas répondu.');
}

const heure = new Date().toISOString().slice(11, 19).replace(/:/g, '');
console.log(`${photos.length} photo(s), ${nb} questions${classe ? ', ' + classe : ''}\n1. Création`);
const quiz = await appel(MODELES, CONSIGNES, demande);
writeFileSync(join(dossier, `essai-${heure}-1-creation.txt`), quiz);
console.log(`  → ${nbQuestions(quiz)} questions\n2. Relecture`);
const relu = await appel(MODELES.slice().reverse(), RELECTURE + '\n\n--- Consignes du quiz ---\n' + CONSIGNES, demande + '\n\nQuiz à relire :\n' + quiz);
writeFileSync(join(dossier, `essai-${heure}-2-relecture.txt`), relu);
const garde = /^\s*T\s*\|/m.test(relu) && nbQuestions(relu) >= Math.ceil(nbQuestions(quiz) * 0.8);
console.log(`  → ${nbQuestions(relu)} questions, ${garde ? 'relecture gardée par le site' : 'relecture écartée (le site garderait la création)'}`);

// lignes changées par la relecture : c'est là qu'on voit ce que Gemini avait raté
const avant = new Set(quiz.split('\n').map(l => l.trim())), apres = relu.split('\n').map(l => l.trim());
const changees = apres.filter(l => /^[QVSGOACXNPK]\s*\|/i.test(l) && !avant.has(l));
console.log(`\nLignes réécrites par la relecture (${changees.length}) :\n` + changees.map(l => '  ' + l).join('\n'));
console.log(`\nFichiers : ${join(dossier, `essai-${heure}-*.txt`)}`);
