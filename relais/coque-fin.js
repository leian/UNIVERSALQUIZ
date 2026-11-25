/* =====================================================================
   RELAIS SOCCAQUIZ — fin de l'assemblage (après build/Code.gs)
   Adresses :
     POST /connexion                 { code, prenom, classe } → inscription ou reconnexion d'une famille
     GET  /f/<famille>?api=…         → doGet de Code.gs (site de l'enfant : etat, quiz…)
     POST /f/<famille>                → doPost de Code.gs (enregistrer, signaler, appairer, parent…)
     GET  /sante                     → « ok »
     GET  /bilan                     → totaux pour la console de l'éditeur (en-tête Authorization: Bearer <JETON_CONSOLE>)
   Secrets (Cloudflare) : GOOGLE_CLIENT_SECRET, CLE_CHIFFREMENT (32 octets en base64), JETON_CONSOLE (facultatif, posé à la main).
   Variable : GOOGLE_CLIENT_ID.
   Base D1 (liaison DB) : une ligne par famille ; les réglages de Code.gs (propriétés du script) y sont chiffrés.
   Données de la famille : dans SON Drive, dossier « SoccaQuiz » (autorisation drive.file seule) :
     « SoccaQuiz – famille.json » (dossiers et liste des tableaux) + un fichier .json par tableau (quiz, résultats).
   ===================================================================== */
const CONFIG_DEFAUT_ = JSON.parse(JSON.stringify(CONFIG));
const ORIGINES_ = ['https://app.soccaquiz.fr', 'https://essai.soccaquiz.pages.dev'];
const RETOUR_GOOGLE_ = 'https://app.soccaquiz.fr/connexion/';
const ID_FAMILLE_ = /^r[A-Za-z0-9]{23}$/;          // 24 caractères : accepté par deploiement_() de Code.gs ([\w-]{20,200})
const CLASSES_OK_ = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', '2de', '1re', 'Tle', 'adulte'];
const MEMOIRE_ = new Map();
let FAMILLE_ = '';                                  // famille de la demande en cours
/* liens vers le site de l'enfant : directement app.soccaquiz.fr (pas d'enveloppe leian.github.io/app ni de bandeau Google) */
urlAppliBase_ = function () { return FAMILLE_ ? ORIGINE_SITE_ + '/?s=' + FAMILLE_ : ''; };
urlAppli_ = function () { const b = urlAppliBase_(); return b && !estPremier_() ? b + '&e=' + enfantId_() : b; };                         // famille → { rev, magasin, fichiers, cache, jeton, expire } (le temps de vie du relais)

export default {
  async fetch(req, env, ctx) {
    try { return await traiter_(req, env); }
    finally { const f = enregistrerAppels_(env); if (ctx && ctx.waitUntil) ctx.waitUntil(f); else await f; }
  }
};
async function traiter_(req, env) {
    const url = new URL(req.url), origine = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ORIGINES_.indexOf(origine) >= 0 || /^http:\/\/localhost(:\d+)?$/.test(origine) ? origine : ORIGINES_[0], 'Vary': 'Origin' };
    const json = (o, statut) => new Response(JSON.stringify(o), { status: statut || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors) });
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }, cors) });
      if (url.pathname === '/sante') return json({ ok: true });
      await schema_(env);
      if (url.pathname === '/bilan' && req.method === 'GET') return bilan_(env, req, json);
      if (url.pathname === '/connexion' && req.method === 'POST') return json(await connexion_(env, await lireCorps_(req), url));
      const m = url.pathname.match(/^\/f\/([^/]+)\/?$/);
      if (m) {
        if (!ID_FAMILLE_.test(m[1])) return json({ v: API_V, erreur: 'Adresse inconnue.' }, 404);
        const parametres = Object.fromEntries(url.searchParams);
        const corps = req.method === 'POST' ? await req.text() : null;
        if (corps != null && corps.length > 900000) return json({ v: API_V, erreur: 'Demande trop volumineuse.' }, 413);
        const r = await demande_(env, m[1], parametres, corps, url);
        return json(r.objet, r.statut);
      }
      return json({ erreur: 'Introuvable.' }, 404);
    } catch (e) {
      console.error(e && e.stack || e);
      return json({ v: API_V, erreur: e && e.message ? e.message : String(e), relais: true }, e && e.statut || 500);
    }
}

async function lireCorps_(req) {
  try { return JSON.parse(await req.text()); } catch (e) { const x = new Error('Demande illisible.'); x.statut = 400; throw x; }
}

/* ---------- D1 ---------- */
let SCHEMA_OK_ = false;
async function schema_(env) {
  if (SCHEMA_OK_) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS familles (id TEXT PRIMARY KEY, email_h TEXT UNIQUE, email_c TEXT, jeton_c TEXT, dossier TEXT, index_id TEXT, props_c TEXT, rev INTEGER NOT NULL DEFAULT 0, verrou INTEGER NOT NULL DEFAULT 0, cree INTEGER, maj INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS usage_jour (jour TEXT PRIMARY KEY, appels INTEGER NOT NULL DEFAULT 0, refus INTEGER NOT NULL DEFAULT 0, erreurs INTEGER NOT NULL DEFAULT 0)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS usage_minute (minute INTEGER PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)').run();
  SCHEMA_OK_ = true;
}
const familleD1_ = (env, id) => env.DB.prepare('SELECT * FROM familles WHERE id = ?').bind(id).first();

/* ---------- chiffrement (AES-GCM) ---------- */
let CLE_AES_ = null;
async function cleAes_(env) {
  if (CLE_AES_) return CLE_AES_;
  if (!env.CLE_CHIFFREMENT) throw new Error('Réglage manquant : CLE_CHIFFREMENT.');
  const brut = Uint8Array.from(atob(env.CLE_CHIFFREMENT), c => c.charCodeAt(0));
  if (brut.length !== 32) throw new Error('CLE_CHIFFREMENT doit faire 32 octets.');
  CLE_AES_ = await crypto.subtle.importKey('raw', brut, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return CLE_AES_;
}
const b64_ = o => { let s = ''; o.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); };
const deb64_ = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
async function chiffrer_(env, texte) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleAes_(env), new TextEncoder().encode(texte)));
  const t = new Uint8Array(12 + c.length); t.set(iv); t.set(c, 12);
  return b64_(t);
}
async function dechiffrer_(env, b) {
  if (!b) return '';
  const t = deb64_(b);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: t.slice(0, 12) }, await cleAes_(env), t.slice(12)));
}
const hex_ = o => Array.from(o, x => x.toString(16).padStart(2, '0')).join('');
const hacher_ = t => hex_(sha256Octets_(String(t)));
function idFamille_() {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', o = crypto.getRandomValues(new Uint8Array(23));
  return 'r' + Array.from(o, x => a[x % 62]).join('');
}

/* ---------- Google ---------- */
async function jsonOk_(r, etape) {
  const t = await r.text();
  if (!r.ok) { const e = new Error(etape + ' : ' + r.status + ' ' + t.slice(0, 300)); e.google = r.status; throw e; }
  return t ? JSON.parse(t) : {};
}
async function jetonGoogle_(env, corps, etape) {
  return jsonOk_(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, corps))
  }), etape);
}
async function acces_(env, fam) {
  const mem = MEMOIRE_.get(fam.id);
  if (mem && mem.jeton && mem.expire > Date.now() + 60000) return mem.jeton;
  let j;
  try { j = await jetonGoogle_(env, { refresh_token: await dechiffrer_(env, fam.jeton_c), grant_type: 'refresh_token' }, 'accès Google'); }
  catch (e) {
    if (e.google === 400 || e.google === 401) { const x = new Error('SoccaQuiz n\'a plus accès au Drive de cette famille (accès retiré dans le compte Google ?). Le parent doit se reconnecter.'); x.statut = 401; throw x; }
    throw e;
  }
  const m = MEMOIRE_.get(fam.id) || {};
  m.jeton = j.access_token; m.expire = Date.now() + (j.expires_in || 3600) * 1000;
  MEMOIRE_.set(fam.id, m);
  return j.access_token;
}
/* chaque appel à l'API Google Drive (toutes familles) est compté : totaux par jour et par minute dans D1 (tables usage_*),
   pour suivre le quota du projet Google « soccaquiz » dans la console (bilan). Aucun identifiant de famille. */
const APPELS_ = { n: 0, refus: 0, erreurs: 0, minutes: {} };
const drive_ = async (jeton, adresse, o = {}) => {
  const r = await fetch(adresse, Object.assign({}, o, { headers: Object.assign({ Authorization: 'Bearer ' + jeton }, o.headers || {}) }));
  APPELS_.n++; if (r.status === 429) APPELS_.refus++; else if (r.status >= 400) APPELS_.erreurs++;
  const mn = Math.floor(Date.now() / 60000); APPELS_.minutes[mn] = (APPELS_.minutes[mn] || 0) + 1;
  return r;
};
const jourParis_ = t => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
async function enregistrerAppels_(env) {
  if (!APPELS_.n) return;
  const a = { n: APPELS_.n, refus: APPELS_.refus, erreurs: APPELS_.erreurs, minutes: APPELS_.minutes };
  APPELS_.n = 0; APPELS_.refus = 0; APPELS_.erreurs = 0; APPELS_.minutes = {};
  try {
    const t = Date.now(), req = [env.DB.prepare('INSERT INTO usage_jour (jour, appels, refus, erreurs) VALUES (?, ?, ?, ?) ON CONFLICT(jour) DO UPDATE SET appels = appels + excluded.appels, refus = refus + excluded.refus, erreurs = erreurs + excluded.erreurs').bind(jourParis_(t), a.n, a.refus, a.erreurs)];
    Object.keys(a.minutes).forEach(m => req.push(env.DB.prepare('INSERT INTO usage_minute (minute, n) VALUES (?, ?) ON CONFLICT(minute) DO UPDATE SET n = n + excluded.n').bind(+m, a.minutes[m])));
    if (Math.random() < 0.02) { req.push(env.DB.prepare('DELETE FROM usage_minute WHERE minute < ?').bind(Math.floor(t / 60000) - 2880)); req.push(env.DB.prepare('DELETE FROM usage_jour WHERE jour < ?').bind(jourParis_(t - 400 * 864e5))); }
    await env.DB.batch(req);
  } catch (e) { console.error('compteur des appels Drive : ' + (e && e.message || e)); }
}
async function lireFichier_(jeton, id) {
  const r = await drive_(jeton, 'https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
  const t = await r.text();
  if (!r.ok) { const e = new Error('lecture du Drive : ' + r.status + ' ' + t.slice(0, 200)); e.google = r.status; throw e; }
  return t;
}
async function creerFichier_(jeton, nom, parent, contenu, mime) {
  const limite = 'sq' + crypto.randomUUID().replace(/-/g, '');
  const meta = Object.assign({ name: nom, mimeType: mime || 'application/json' }, parent ? { parents: [parent] } : {});
  const corps = '--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + limite + '\r\nContent-Type: ' + (mime || 'application/json') + '; charset=UTF-8\r\n\r\n' + (contenu || '') + '\r\n--' + limite + '--';
  return (await jsonOk_(await drive_(jeton, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + limite }, body: corps
  }), 'création dans le Drive')).id;
}
async function ecrireFichier_(jeton, id, contenu, nom) {
  if (nom) await jsonOk_(await drive_(jeton, 'https://www.googleapis.com/drive/v3/files/' + id + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nom }) }), 'renommage dans le Drive');
  return jsonOk_(await drive_(jeton, 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media&fields=id', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: contenu
  }), 'écriture dans le Drive');
}

/* ---------- magasin de la famille (Drive) ---------- */
const NOM_INDEX_ = 'SoccaQuiz – famille.json';
async function chargerMagasin_(env, fam) {
  const mem = MEMOIRE_.get(fam.id);
  if (mem && mem.magasin && mem.rev === fam.rev) return mem;
  const jeton = await acces_(env, fam);
  const index = JSON.parse(await lireFichier_(jeton, fam.index_id) || '{}');
  const magasin = { dossiers: index.dossiers || {}, tableurs: {}, permissions: index.permissions || {} }, fichiers = {};
  await Promise.all(Object.keys(index.tableurs || {}).map(async id => {
    const t = index.tableurs[id];
    fichiers[id] = t.fichier;
    let contenu = { feuilles: [] };
    try { contenu = JSON.parse(await lireFichier_(jeton, t.fichier) || '{}'); } catch (e) { if (e.google !== 404) throw e; }
    const meta = Object.assign({}, t); delete meta.fichier;
    magasin.tableurs[id] = Object.assign(meta, { feuilles: contenu.feuilles || [] });
  }));
  const m = MEMOIRE_.get(fam.id) || {};
  Object.assign(m, { rev: fam.rev, magasin, fichiers, cache: m.rev === fam.rev && m.cache ? m.cache : {} });
  MEMOIRE_.set(fam.id, m);
  return m;
}
const nomFichierTableur_ = (magasin, t) => {
  const d = (t.parents || []).map(p => magasin.dossiers[p]).find(Boolean);
  return t.name + (d && d.name && d.name !== 'SoccaQuiz' ? ' (' + d.name.replace(/^SoccaQuiz – /, '') + ')' : '') + '.json';
};
async function enregistrerMagasin_(env, fam, ctx, fichiers) {
  const jeton = await acces_(env, fam), M = ctx.magasin;
  const ids = Array.from(ctx.sale).filter(id => id !== 'index' && M.tableurs[id]);
  let indexSale = ctx.sale.has('index');
  // tableau mis à la corbeille (ou dans un dossier mis à la corbeille, ex. un enfant supprimé) : son fichier aussi
  const jete = t => t.trashed || (t.parents || []).some(p => M.dossiers[p] && M.dossiers[p].trashed);
  await Promise.all(Object.keys(M.tableurs).filter(id => fichiers[id] && jete(M.tableurs[id]) && !M.tableurs[id].fichierJete).map(async id => {
    await jsonOk_(await drive_(jeton, 'https://www.googleapis.com/drive/v3/files/' + fichiers[id] + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }), 'corbeille du Drive');
    M.tableurs[id].fichierJete = true; indexSale = true;
  }));
  await Promise.all(ids.filter(id => !M.tableurs[id].fichierJete).map(async id => {
    const t = M.tableurs[id], contenu = JSON.stringify({ feuilles: t.feuilles });
    if (fichiers[id]) await ecrireFichier_(jeton, fichiers[id], contenu);
    else { fichiers[id] = await creerFichier_(jeton, nomFichierTableur_(M, t), fam.dossier, contenu); indexSale = true; }
  }));
  if (indexSale) {
    const tableurs = {};
    Object.keys(M.tableurs).forEach(id => { const t = Object.assign({}, M.tableurs[id]); delete t.feuilles; t.fichier = fichiers[id]; tableurs[id] = t; });
    await ecrireFichier_(jeton, fam.index_id, JSON.stringify({ v: 1, dossiers: M.dossiers, tableurs, permissions: M.permissions }));
  }
}

/* ---------- faire tourner Code.gs ---------- */
function executer_(fam, mem, props, email, fn) {
  const ctx = {
    magasin: structuredClone(mem.magasin), sale: new Set(), props, propsSales: false, cache: mem.cache,
    famille: fam.id, email, visiteur: '', adresse: 'https://script.google.com/macros/s/' + fam.id + '/exec', revoquer: false
  };
  creerServices_(ctx);
  FAMILLE_ = fam.id;
  ENFANT_ = null; PREMIER_CFG_ = null;
  let cfg = {};
  try { cfg = JSON.parse(props.__CONFIG || '{}'); } catch (e) { cfg = {}; }
  Object.keys(CONFIG).forEach(k => { CONFIG[k] = CONFIG_DEFAUT_[k]; });
  Object.assign(CONFIG, cfg, { espace: 'enfant', urlEnfant: ctx.adresse, urlParent: ORIGINE_SITE_ + '/parent/?s=' + fam.id, installateur: '' });
  reinitStockage_();
  const sortie = fn();
  ctx.sortie = sortie && typeof sortie.getContent === 'function' ? sortie.getContent() : JSON.stringify(sortie == null ? {} : sortie);
  return ctx;
}
/* une demande : charger, exécuter, enregistrer ce qui a changé (verrou court si besoin d'écrire, nouvel essai si conflit) */
async function demande_(env, id, parametres, corps, url) {
  for (let essai = 0; essai < 3; essai++) {
    const fam = await familleD1_(env, id);
    if (!fam) return { objet: { v: API_V, supprime: true }, statut: 404 };
    const mem = await chargerMagasin_(env, fam);
    const props = JSON.parse(await dechiffrer_(env, fam.props_c) || '{}');
    const email = await dechiffrer_(env, fam.email_c);
    const ctx = executer_(fam, mem, props, email, () => corps == null
      ? doGet({ parameter: parametres })
      : doPost({ parameter: parametres, postData: { contents: corps, type: 'text/plain' } }));
    let objet; try { objet = JSON.parse(ctx.sortie); } catch (e) { objet = { v: API_V, erreur: 'Réponse illisible.' }; }
    const statut = objet && objet.__status ? objet.__status : 200;
    if (!ctx.sale.size && !ctx.propsSales && !ctx.revoquer) return { objet, statut };
    // il faut écrire : verrou de la famille (15 s), puis vérifier que personne n'a écrit entre-temps
    const t = Date.now();
    const pris = await env.DB.prepare('UPDATE familles SET verrou = ? WHERE id = ? AND rev = ? AND verrou < ?').bind(t + 15000, id, fam.rev, t).run();
    if (!pris.meta || !pris.meta.changes) { await new Promise(r => setTimeout(r, 300 + 400 * essai)); MEMOIRE_.delete(id); continue; }
    try {
      if (ctx.revoquer) {
        // dernier enfant supprimé (apiSupprimerSite → invalidateAuth) : SoccaQuiz quitte entièrement la famille
        const garde = !!(objet && objet.r && objet.r.garde);
        if (!garde) try { const j = await acces_(env, fam); await drive_(j, 'https://www.googleapis.com/drive/v3/files/' + fam.dossier, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); } catch (e) { console.error(e); }
        await revoquerFamille_(env, fam);
        await env.DB.prepare('DELETE FROM familles WHERE id = ?').bind(id).run();
        MEMOIRE_.delete(id);
        await compterRelais_('suppression');
        if (objet && objet.r) objet.r.complet = true;
        return { objet, statut };
      }
      const fichiers = Object.assign({}, mem.fichiers);
      if (ctx.sale.size) await enregistrerMagasin_(env, fam, ctx, fichiers);
      const props_c = ctx.propsSales ? await chiffrer_(env, JSON.stringify(ctx.props)) : fam.props_c;
      await env.DB.prepare('UPDATE familles SET props_c = ?, rev = rev + 1, verrou = 0, maj = ? WHERE id = ?').bind(props_c, Date.now(), id).run();
      MEMOIRE_.set(id, Object.assign(MEMOIRE_.get(id) || {}, { rev: fam.rev + 1, magasin: ctx.magasin, fichiers, cache: ctx.cache }));
      return { objet, statut };
    } catch (e) {
      await env.DB.prepare('UPDATE familles SET verrou = 0 WHERE id = ?').bind(id).run();
      MEMOIRE_.delete(id);
      throw e;
    }
  }
  return { objet: { v: API_V, erreur: 'SoccaQuiz est très occupé, réessaie dans un instant.' }, statut: 503 };
}
async function revoquerFamille_(env, fam) {
  try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: await dechiffrer_(env, fam.jeton_c) }) }); } catch (e) {}
}

/* ---------- inscription « Commencer avec Google » ----------
   La page app.soccaquiz.fr/connexion/ reçoit le code de Google et nous le passe avec le prénom et la classe.
   Nouvelle famille : dossier « SoccaQuiz » + fichier de la famille dans son Drive, premier enfant, code du premier appareil.
   Famille déjà inscrite (même compte Google) : nouvelle clé durable, et un code pour ouvrir l'espace parent sur cet appareil. */
async function connexion_(env, o, url) {
  if (!o || typeof o.code !== 'string' || o.code.length > 2000) { const e = new Error('Code de connexion manquant.'); e.statut = 400; throw e; }
  let j;
  try { j = await jetonGoogle_(env, { code: o.code, redirect_uri: RETOUR_GOOGLE_, grant_type: 'authorization_code' }, 'connexion Google'); }
  catch (e) { if (e.google === 400) return { erreur: 'code', message: 'La connexion Google a expiré ou a déjà servi : recommence.' }; throw e; }
  if (String(j.scope || '').split(' ').indexOf('https://www.googleapis.com/auth/drive.file') < 0) return { erreur: 'drive', message: 'Google n\'a pas donné l\'accès aux fichiers SoccaQuiz.' };
  const moi = await jsonOk_(await drive_(j.access_token, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)'), 'compte Google');
  const email = String(moi.user && moi.user.emailAddress || '').toLowerCase();
  if (!email) throw new Error('Adresse du compte Google introuvable.');
  const emailH = hacher_('soccaquiz|' + email);
  const existante = await env.DB.prepare('SELECT * FROM familles WHERE email_h = ?').bind(emailH).first();
  const nomAppareil = String(o.appareil || 'Premier appareil').slice(0, 40);
  if (existante) {
    // reconnexion : Google ne redonne une clé durable qu'avec prompt=consent ; sinon on garde l'ancienne
    if (j.refresh_token) await env.DB.prepare('UPDATE familles SET jeton_c = ?, maj = ? WHERE id = ?').bind(await chiffrer_(env, j.refresh_token), Date.now(), existante.id).run();
    MEMOIRE_.delete(existante.id);
    // prénom tapé sur la page : enfant déjà là → on l'ouvre ; sinon on l'ajoute à la famille (le parent croyait installer pour lui)
    const prenomR = String(o.prenom || '').replace(/[<>"`\\&$|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30), classeR = CLASSES_OK_.indexOf(o.classe) >= 0 ? o.classe : '';
    let code = null, enfant = '', ajoute = false;
    await demandeInterne_(env, existante.id, () => {
      code = creerInvitation_('proprio', nomAppareil);
      if (prenomR) {
        const deja = enfants_().find(x => String(x.prenom).toLowerCase() === prenomR.toLowerCase());
        if (deja) enfant = deja.id;
        else {
          PARENT_ = { h: 'connexion', role: 'proprio', nom: nomAppareil };
          try { const r = apiAjouterEnfant({ prenom: prenomR, classe: classeR }); if (r && r.ok) { enfant = r.id; ajoute = true; } }
          finally { PARENT_ = null; }
        }
      }
      installer_();
      return { ok: true };
    });
    if (!code) throw new Error('Code d\'appareil non créé.');
    return { ok: true, s: existante.id, code, nouvelle: false, enfant, ajoute, prenom: prenomR };
  }
  if (!j.refresh_token) return { erreur: 'cle', message: 'Google n\'a pas donné de clé durable : recommence la connexion.' };
  const prenom = String(o.prenom || '').trim().slice(0, 30), classe = CLASSES_OK_.indexOf(o.classe) >= 0 ? o.classe : '';
  const dossier = await creerFichier_(j.access_token, 'SoccaQuiz', null, null, MIME_D_);
  const indexId = await creerFichier_(j.access_token, NOM_INDEX_, dossier, JSON.stringify({ v: 1, dossiers: {}, tableurs: {}, permissions: {} }));
  const id = idFamille_(), t = Date.now(), an = new Date(), annee = an.getMonth() >= 7 ? an.getFullYear() : an.getFullYear() - 1;
  const props = { PROPRIO: email, __CONFIG: JSON.stringify({ prenom, nomDossier: 'SoccaQuiz', classe, classeAnnee: classe ? annee : 0, version: 'relais' }), ENFANTS: JSON.stringify([{ id: 'a', prenom }]) };
  await env.DB.prepare('INSERT INTO familles (id, email_h, email_c, jeton_c, dossier, index_id, props_c, rev, verrou, cree, maj) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)')
    .bind(id, emailH, await chiffrer_(env, email), await chiffrer_(env, j.refresh_token), dossier, indexId, await chiffrer_(env, JSON.stringify(props)), t, t).run();
  const code = await codeAppareil_(env, id, nomAppareil);
  await compterRelais_('installation');
  return { ok: true, s: id, code, nouvelle: true };
}
/* code à usage unique pour le premier appareil (ou un nouvel appareil après reconnexion) : Code.gs le fabrique (creerInvitation_) */
async function codeAppareil_(env, id, nom) {
  let code = null;
  const r = await demandeInterne_(env, id, () => { code = creerInvitation_('proprio', nom); installer_(); return { ok: true }; });
  if (!code) throw new Error('Code d\'appareil non créé.');
  return code;
}
async function demandeInterne_(env, id, fn) {
  for (let essai = 0; essai < 3; essai++) {
    const fam = await familleD1_(env, id), mem = await chargerMagasin_(env, fam);
    const props = JSON.parse(await dechiffrer_(env, fam.props_c) || '{}'), email = await dechiffrer_(env, fam.email_c);
    const ctx = executer_(fam, mem, props, email, fn), t = Date.now();
    const pris = await env.DB.prepare('UPDATE familles SET verrou = ? WHERE id = ? AND rev = ? AND verrou < ?').bind(t + 15000, id, fam.rev, t).run();
    if (!pris.meta || !pris.meta.changes) { await new Promise(r => setTimeout(r, 300)); MEMOIRE_.delete(id); continue; }
    try {
      const fichiers = Object.assign({}, mem.fichiers);
      if (ctx.sale.size) await enregistrerMagasin_(env, fam, ctx, fichiers);
      await env.DB.prepare('UPDATE familles SET props_c = ?, rev = rev + 1, verrou = 0, maj = ? WHERE id = ?').bind(await chiffrer_(env, JSON.stringify(ctx.props)), Date.now(), id).run();
      MEMOIRE_.set(id, Object.assign(MEMOIRE_.get(id) || {}, { rev: fam.rev + 1, magasin: ctx.magasin, fichiers, cache: ctx.cache }));
      return ctx;
    } catch (e) { await env.DB.prepare('UPDATE familles SET verrou = 0 WHERE id = ?').bind(id).run(); MEMOIRE_.delete(id); throw e; }
  }
  throw new Error('SoccaQuiz est très occupé, réessaie dans un instant.');
}

/* bilan pour la console de l'éditeur (onglet Statistiques) : des TOTAUX seulement, calculés ici sur les colonnes en clair
   (dates de création et de dernière écriture) ; aucun identifiant, aucune donnée déchiffrée ne sort.
   Protégé par le secret JETON_CONSOLE (absent ou trop court : l'adresse n'existe pas). Règles de confidentialité, § 4. */
function egal_(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0); return d === 0; }
async function bilan_(env, req, json) {
  const attendu = String(env.JETON_CONSOLE || ''), donne = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (attendu.length < 32 || !egal_(donne, attendu)) return json({ erreur: 'Introuvable.' }, 404);
  const t = Date.now(), J = 86400000;
  const tot = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN maj >= ? THEN 1 ELSE 0 END) AS a7, SUM(CASE WHEN maj >= ? THEN 1 ELSE 0 END) AS a30 FROM familles').bind(t - 7 * J, t - 30 * J).first();
  const r = await env.DB.prepare('SELECT cree FROM familles WHERE cree >= ?').bind(t - 84 * J).all();
  const semaines = {};
  (r.results || []).forEach(x => {
    const d = new Date(+x.cree); if (isNaN(d)) return;
    const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const k = lundi.toISOString().slice(0, 10); semaines[k] = (semaines[k] || 0) + 1;
  });
  await enregistrerAppels_(env);
  const uj = await env.DB.prepare('SELECT jour, appels, refus, erreurs FROM usage_jour WHERE jour >= ? ORDER BY jour DESC').bind(jourParis_(t - 30 * J)).all();
  const pm = await env.DB.prepare('SELECT minute, n FROM usage_minute WHERE minute >= ? ORDER BY n DESC LIMIT 1').bind(Math.floor(t / 60000) - 1440).first();
  const jours = (uj.results || []).map(x => ({ jour: x.jour, appels: +x.appels || 0, refus: +x.refus || 0, erreurs: +x.erreurs || 0 }));
  return json({ ok: true, t, familles: +(tot && tot.n) || 0, actives7: +(tot && tot.a7) || 0, actives30: +(tot && tot.a30) || 0,
    semaines: Object.keys(semaines).sort().reverse().map(k => ({ semaine: k, n: semaines[k] })),
    drive: { jours, pointeMinute: pm ? +pm.n || 0 : 0, pointeA: pm ? new Date(pm.minute * 60000).toISOString() : '' } });
}

/* compteurs anonymes pour la console (onglet Statistiques) : l'événement et « relais », rien d'autre ; jamais bloquant */
let ADR_STATS_ = null;
async function compterRelais_(e) {
  try {
    if (ADR_STATS_ === null) {
      ADR_STATS_ = '';
      const r = await fetch('https://leian.github.io/UNIVERSALQUIZ/soccaquiz.json', { signal: AbortSignal.timeout(3000) });
      const c = r.ok ? await r.json() : {};
      if (typeof c.propositions === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.propositions)) ADR_STATS_ = c.propositions;
    }
    if (!ADR_STATS_) return;
    await fetch(ADR_STATS_, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'stat', evts: [{ e, v: 'relais' }] }), signal: AbortSignal.timeout(4000) });
  } catch (err) {}
}
