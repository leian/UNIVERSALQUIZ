// Essais du relais (voie 2) en local : faux Google (connexion, Drive) et fausse base D1 (node:sqlite).
// Usage : node construire.mjs && node relais/construire.mjs && node tests/test-relais.mjs
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const WORKER = pathToFileURL(join(ICI, '..', 'relais', 'dist', 'worker.js')).href;
let echecs = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) echecs++; };

/* ---------- fausse base D1 ---------- */
const sql = new DatabaseSync(':memory:');
const DB = {
  prepare: (q) => {
    let args = [];
    const st = {
      bind: (...a) => { args = a; return st; },
      first: async () => sql.prepare(q).get(...args) || null,
      all: async () => ({ results: sql.prepare(q).all(...args) }),
      run: async () => { const r = sql.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; }
    };
    return st;
  }
};

/* ---------- faux Google ---------- */
const fichiers = new Map();        // id → { name, mimeType, parents, contenu }
let n = 0, lectures = 0, revoque = false;
const COMPTE = 'parent.test@exemple.fr';
const rep = (o, s = 200) => new Response(typeof o === 'string' ? o : JSON.stringify(o), { status: s });
const vraiFetch = globalThis.fetch;
const STATS = [];
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(typeof url === 'string' ? url : url.url), corps = o.body;
  if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token') {
    const p = new URLSearchParams(String(corps));
    if (p.get('client_secret') !== 'secret-essai') return rep({ error: 'invalid_client' }, 401);
    if (p.get('grant_type') === 'authorization_code') return p.get('code') === 'bon-code' ? rep({ access_token: 'acces-1', refresh_token: 'durable-1', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' }) : rep({ error: 'invalid_grant' }, 400);
    if (p.get('grant_type') === 'refresh_token') return !revoque && p.get('refresh_token') === 'durable-1' ? rep({ access_token: 'acces-2', expires_in: 3600 }) : rep({ error: 'invalid_grant' }, 400);
  }
  if (u.host === 'oauth2.googleapis.com' && u.pathname === '/revoke') { revoque = true; return rep({}); }
  if (u.host === 'leian.github.io' && u.pathname === '/UNIVERSALQUIZ/soccaquiz.json') return rep({ propositions: 'https://script.google.com/macros/s/AKfyPROPOSITIONS/exec' });
  if (u.host === 'script.google.com' && u.pathname === '/macros/s/AKfyPROPOSITIONS/exec') { STATS.push(JSON.parse(String(corps))); return rep({ ok: true }); }
  if (u.host === 'www.googleapis.com') {
    const auth = (o.headers || {}).Authorization || '';
    if (!/^Bearer acces-/.test(auth)) return rep({ error: 'unauthorized' }, 401);
    if (u.pathname === '/drive/v3/about') return rep({ user: { emailAddress: COMPTE, displayName: 'Parent' } });
    if (u.pathname === '/upload/drive/v3/files' && o.method === 'POST') {
      const b = String(corps), limite = b.split('\r\n')[0], parts = b.split(limite);
      const meta = JSON.parse(parts[1].split('\r\n\r\n')[1]), contenu = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      const id = 'g' + (++n);
      fichiers.set(id, { name: meta.name, mimeType: meta.mimeType, parents: meta.parents || ['root'], contenu });
      return rep({ id });
    }
    let m = u.pathname.match(/^\/upload\/drive\/v3\/files\/(\w+)$/);
    if (m && o.method === 'PATCH') { const f = fichiers.get(m[1]); if (!f) return rep({}, 404); f.contenu = String(corps); return rep({ id: m[1] }); }
    m = u.pathname.match(/^\/drive\/v3\/files\/(\w+)$/);
    if (m && u.searchParams.get('alt') === 'media') { const f = fichiers.get(m[1]); lectures++; return f ? rep(f.contenu) : rep({}, 404); }
    if (m && o.method === 'PATCH') { const f = fichiers.get(m[1]); if (!f) return rep({}, 404); Object.assign(f, JSON.parse(corps)); return rep({ id: m[1] }); }
  }
  throw new Error('Appel inattendu : ' + u.href);
};

const env = { DB, GOOGLE_CLIENT_ID: 'client-essai', GOOGLE_CLIENT_SECRET: 'secret-essai', CLE_CHIFFREMENT: Buffer.alloc(32, 7).toString('base64') };
let relais = (await import(WORKER)).default;
const appel = async (chemin, corps, methode) => {
  const r = await relais.fetch(new Request('https://relais.test' + chemin, corps === undefined ? { method: methode || 'GET', headers: { Origin: 'https://app.soccaquiz.fr' } } : { method: 'POST', body: typeof corps === 'string' ? corps : JSON.stringify(corps), headers: { Origin: 'https://app.soccaquiz.fr' } }), env);
  return { statut: r.status, cors: r.headers.get('Access-Control-Allow-Origin'), d: await r.json() };
};

/* 1. inscription */
const refus = await appel('/connexion', { code: 'mauvais-code' });
ok(refus.d.erreur === 'code' && !refus.d.s, 'connexion : un mauvais code est refusé');
const ins = await appel('/connexion', { code: 'bon-code', prenom: 'Lana', classe: 'CM1' });
ok(ins.d.ok && /^r[A-Za-z0-9]{23}$/.test(ins.d.s) && ins.d.code && ins.d.nouvelle, 'connexion : nouvelle famille, identifiant et code du premier appareil — ' + JSON.stringify(ins.d).slice(0, 120));
const S = ins.d.s;
const ligne = sql.prepare('SELECT * FROM familles').get();
ok(ligne && !/durable-1|parent\.test|Lana/.test(JSON.stringify(ligne)), 'D1 : clé durable, adresse et prénom chiffrés (rien de lisible)');
ok([...fichiers.values()].some(f => f.name === 'SoccaQuiz' && f.mimeType === 'application/vnd.google-apps.folder') && [...fichiers.values()].some(f => f.name === 'SoccaQuiz – famille.json'), 'Drive : dossier « SoccaQuiz » et fichier de la famille créés');

/* 2. site de l'enfant */
const etat = await appel('/f/' + S + '?api=etat');
ok(etat.statut === 200 && etat.cors === 'https://app.soccaquiz.fr' && etat.d.prenom === 'Lana' && Array.isArray(etat.d.quiz) && etat.d.quiz.length >= 1, 'API etat : prénom, quiz d\'exemple, CORS — ' + JSON.stringify({ statut: etat.statut, prenom: etat.d.prenom, nb: (etat.d.quiz || []).length, err: etat.d.erreur }));
ok(etat.d.reglages && etat.d.reglages.urlParent === 'https://app.soccaquiz.fr/parent/?s=' + S, 'API etat : lien « Espace parent » du site de l\'enfant vers app.soccaquiz.fr/parent — ' + (etat.d.reglages && etat.d.reglages.urlParent));
ok(etat.d.reglages && etat.d.reglages.classe === 'CM1', 'API etat : classe CM1 dans les réglages — ' + (etat.d.reglages && etat.d.reglages.classe));
const page = etat.d.quiz && etat.d.quiz[0] && (etat.d.quiz[0].page || etat.d.quiz[0].fichier || '').replace(/\.html$/, '');
const quiz = await appel('/f/' + S + '?api=quiz&page=' + encodeURIComponent(page));
ok(quiz.d.html && quiz.d.html.length > 500, 'API quiz : contenu du quiz d\'exemple (' + (quiz.d.html || '').length + ' caractères) ' + (quiz.d.erreur || ''));

const partie = { quiz: page, titre: 'Capitales', score: 7, total: 10, _id: 'app1x', questions: [{ q: 'Capitale de l\'Italie ?', cat: 'Europe', donne: 'Milan', attendu: 'Rome', ok: false, k: 'k1' }] };
const enr = await appel('/f/' + S, { api: 'enregistrer', d: JSON.stringify(partie) });
const deja = await appel('/f/' + S, { api: 'enregistrer', d: JSON.stringify(partie) });
ok(enr.d.ok && deja.d.deja, 'API enregistrer : partie enregistrée une seule fois — ' + JSON.stringify([enr.d, deja.d]).slice(0, 160));
const resultats = [...fichiers.values()].find(f => /Résultats/.test(f.name));
ok(resultats && /Rome/.test(resultats.contenu), 'Drive : la partie est dans le fichier des résultats (' + (resultats && resultats.name) + ')');

/* 3. relais redémarré (autre machine) : tout est relu dans le Drive */
relais = (await import(WORKER + '?redemarrage=1')).default;
const avant = lectures;
const etat2 = await appel('/f/' + S + '?api=etat');
ok(etat2.d.prenom === 'Lana' && etat2.d.quiz.length === etat.d.quiz.length && lectures > avant, 'redémarrage : données relues dans le Drive de la famille (' + (lectures - avant) + ' lectures)');
const avant2 = lectures;
await appel('/f/' + S + '?api=etat');
ok(lectures === avant2, 'mémoire : une seconde demande ne relit pas le Drive');

/* 4. espace parent : appairer l'appareil puis demander une page */
const app = await appel('/f/' + S, { api: 'appairer', code: ins.d.code, nom: 'Téléphone' });
ok(app.d.cle && app.d.role === 'proprio', 'appairer : clé du premier appareil (rôle proprio) — ' + JSON.stringify(app.d).slice(0, 100));
const reuse = await appel('/f/' + S, { api: 'appairer', code: ins.d.code, nom: 'Autre' });
ok(!reuse.d.cle, 'appairer : le code ne sert qu\'une fois');
const tb = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'page', page: 'tableau-de-bord' });
ok(tb.d.html && tb.d.html.length > 1000 && tb.d.prenom === 'Lana', 'espace parent : page tableau de bord — ' + (tb.d.erreur || (tb.d.html || '').length));
const sans = await appel('/f/' + S, { api: 'parent', cle: 'fausse', action: 'page', page: 'tableau-de-bord' });
ok(sans.statut === 401 && !sans.d.html, 'espace parent : refusé sans clé reconnue');
const enfants = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiAjouterEnfant', args: [{ prenom: 'Hugo', classe: 'CP' }] });
ok(enfants.d.r && !enfants.d.r.erreur, 'espace parent : ajouter un enfant (Hugo) — ' + JSON.stringify(enfants.d).slice(0, 160));
const etatH = await appel('/f/' + S + '?api=etat&e=' + (enfants.d.r && (enfants.d.r.id || (enfants.d.r.enfant && enfants.d.r.enfant.id)) || 'b'));
ok(etatH.d.prenom === 'Hugo', 'site de Hugo : son propre accueil — ' + etatH.d.prenom);
ok([...fichiers.values()].some(f => /\(Hugo\)\.json$/.test(f.name)), 'Drive : fichiers de Hugo séparés — ' + [...fichiers.values()].map(f => f.name).join(', '));

const idHugo = enfants.d.r && (enfants.d.r.id || (enfants.d.r.enfant && enfants.d.r.enfant.id)) || 'b';
const ren = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, e: idHugo, action: 'apiRenommerEnfant', args: [{ prenom: 'Hugo-Léo' }] });
const etatR = await appel('/f/' + S + '?api=etat&e=' + idHugo);
const ren1 = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiRenommerEnfant', args: [{ prenom: 'Lana-Rose' }] });
const etat1 = await appel('/f/' + S + '?api=etat');
const double = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiRenommerEnfant', args: [{ prenom: 'hugo-léo' }] });
ok(ren.d.r && ren.d.r.ok && etatR.d.prenom === 'Hugo-Léo' && ren1.d.r && ren1.d.r.ok && etat1.d.prenom === 'Lana-Rose' && double.d.r && double.d.r.erreur,
  'renommer un enfant (le premier aussi), prénom en double refusé — ' + [etatR.d.prenom, etat1.d.prenom, JSON.stringify(double.d.r)].join(' / '));
await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiRenommerEnfant', args: [{ prenom: 'Lana' }] });
await appel('/f/' + S, { api: 'parent', cle: app.d.cle, e: idHugo, action: 'apiRenommerEnfant', args: [{ prenom: 'Hugo' }] });
const apps = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiAppareils' });
const moi = apps.d.r && apps.d.r.appareils.find(x => x.moi);
const renA = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiRenommerAppareil', args: [{ id: moi && moi.id, nom: 'Tablette <b>salon</b>' }] });
const apps2 = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiAppareils' });
ok(renA.d.r && renA.d.r.ok && apps2.d.r.appareils.find(x => x.moi).nom === 'Tablette bsalon/b', 'renommer un appareil (nom nettoyé) — ' + JSON.stringify(apps2.d.r && apps2.d.r.appareils));

/* 4 bis. schémas : F (SVG nettoyé), Z (toucher la zone), E (légender), aller-retour du texte */
const svgPiege = '<svg viewBox="0 0 300 200" onload="alert(1)"><script>alert(2)</script><rect id="coeur" x="120" y="60" width="60" height="60" fill="#e57373"/><ellipse id="poumons" cx="70" cy="90" rx="40" ry="60" fill="#90caf9"/><circle id="estomac" cx="230" cy="140" r="35" fill="#ffcc80" style="background:url(javascript:alert(3))"/><a href="javascript:alert(4)"><text x="10" y="20">piège</text></a><text x="150" y="190" text-anchor="middle">Le corps</text></svg>';
const texteSch = ['T|Le corps humain|Les organes|sciences|🫀|🩺', '## Organes|🫀',
  'F|corps|' + svgPiege,
  'Z|Touche le cœur.|coeur|Le cœur pompe le sang.|sch=corps',
  'E|Légende le schéma.|coeur=Cœur|poumons=Poumons|estomac=Estomac|Chaque organe a un rôle.|sch=corps',
  'Z|Touche le foie.|foie|Zone absente : ignorée.|sch=corps',
  'Q|Quel organe fait respirer ?|Les poumons|Le cœur|L\'estomac|Les poumons font respirer.',
  'V|Le cœur est un muscle.|V|Oui.', 'S|Organe qui digère ?|estomac|C\'est l\'estomac.', 'M|Le cœur pompe le sang.'].join('\n');
const ajout = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiAjouterQuiz', args: [texteSch] });
ok(ajout.d.r && ajout.d.r.ok && ajout.d.r.nb === 5 && (ajout.d.r.avertissements || []).some(a => /schéma ou zone/.test(a)), 'schémas : quiz créé, la zone absente est écartée — ' + JSON.stringify(ajout.d.r).slice(0, 200));
const qSch = await appel('/f/' + S + '?api=quiz&page=' + encodeURIComponent(ajout.d.r.page));
const h = String(qSch.d.html || '').replace(/\\u003c/g, '<');
ok(/"type":"zone"/.test(h) && /"type":"legende"/.test(h) && /<svg viewBox/.test(h), 'schémas : exercices Z et E dans la page du quiz');
ok(!/onload|<script>alert|javascript:|url\(|<a |style=/.test(h.replace(/<script[^>]*>[\s\S]*?MoteurQuiz/, '')) && /id=\\?"coeur\\?"/.test(h) && /Le corps/.test(h), 'schémas : SVG nettoyé (ni script, ni événement, ni adresse, ni style), zones et texte gardés');
const txt = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiTexteQuiz', args: [ajout.d.r.page + '.html'] });
const lignes = String(txt.d.r && (txt.d.r.texte || txt.d.r) || '');
ok(/^F\|s1\|<svg/m.test(lignes) && /^Z\|Touche le cœur\.\|coeur\|.*sch=s1/m.test(lignes) && /^E\|Légende le schéma\.\|coeur=Cœur\|poumons=Poumons\|estomac=Estomac\|.*sch=s1/m.test(lignes) && (lignes.match(/^F\|/gm) || []).length === 1, 'schémas : texte en lignes (Corriger moi-même) avec un seul F et sch= — ' + lignes.split('\n').filter(l => /^[FZE]\|/.test(l)).map(l => l.slice(0, 60)).join(' / '));

/* 5. reconnexion du même compte : même famille, nouveau code d'appareil */
const re = await appel('/connexion', { code: 'bon-code', prenom: 'X', classe: 'CP' });
ok(re.d.s === S && re.d.code && re.d.nouvelle === false, 'reconnexion : même famille, nouveau code');

/* 6. suppression : un enfant parmi d'autres, puis le dernier (SoccaQuiz quitte la famille) */
const idH = enfants.d.r && (enfants.d.r.id || (enfants.d.r.enfant && enfants.d.r.enfant.id)) || 'b';
const supH = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiSupprimerSite', args: [{ confirmation: 'Hugo' }], e: idH });
ok(supH.d.r && supH.d.r.ok && supH.d.r.reste && supH.d.r.reste[0] === 'Lana', 'supprimer Hugo : Lana reste — ' + JSON.stringify(supH.d).slice(0, 140));
ok([...fichiers.values()].filter(f => /\(Hugo\)\.json$/.test(f.name)).every(f => f.trashed), 'Drive : fichiers de Hugo à la corbeille');
ok([...fichiers.values()].filter(f => /Résultats\.json$/.test(f.name)).every(f => !f.trashed), 'Drive : fichiers de Lana intacts');
const supL = await appel('/f/' + S, { api: 'parent', cle: app.d.cle, action: 'apiSupprimerSite', args: [{ confirmation: 'Lana' }] });
ok(supL.d.r && supL.d.r.ok && supL.d.r.complet, 'supprimer le dernier enfant : suppression complète — ' + JSON.stringify(supL.d).slice(0, 140));
ok(revoque, 'accès Google retiré (révocation)');
ok(!sql.prepare('SELECT id FROM familles WHERE id = ?').get(S), 'D1 : famille effacée');
ok([...fichiers.values()].find(f => f.name === 'SoccaQuiz' && f.mimeType === 'application/vnd.google-apps.folder').trashed, 'Drive : dossier « SoccaQuiz » à la corbeille');
ok((await appel('/f/' + S + '?api=etat')).statut === 404, 'site de l\'enfant : « n\'existe plus » (404)');

/* 7. adresses inconnues */
ok((await appel('/f/rInconnue00000000000000000?api=etat')).statut === 404, 'famille inconnue : 404 (« supprimée »)');
ok((await appel('/f/pas-un-id?api=etat')).statut === 404, 'identifiant mal formé : 404');

ok(STATS.length >= 2 && STATS.every(x => x.type === 'stat' && x.evts.length === 1 && Object.keys(x.evts[0]).join() === 'e,v' && x.evts[0].v === 'relais') && STATS.some(x => x.evts[0].e === 'installation') && STATS.some(x => x.evts[0].e === 'suppression'), 'compteurs anonymes envoyés à la console (installation, suppression ; rien d\'autre) — ' + JSON.stringify(STATS));
console.log(echecs ? '\n' + echecs + ' échec(s).' : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
