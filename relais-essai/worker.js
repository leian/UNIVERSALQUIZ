// Relais d'essai SoccaQuiz (étude « sans installation », 22 nov. 2026).
// But : vérifier qu'une clé durable de Google (refresh token, autorisation drive.file seule)
// permet au relais de lire et d'écrire dans le Drive du parent quand celui-ci n'est plus là.
// ESSAI SEULEMENT : la clé de l'enfant contient la clé durable chiffrée (pas de stockage).
// Secret à poser dans Cloudflare : GOOGLE_CLIENT_SECRET. Variable : GOOGLE_CLIENT_ID (wrangler.toml).

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const NOM_FICHIER = 'SoccaQuiz essai relais.txt';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (!env.GOOGLE_CLIENT_SECRET) return page('Réglage manquant', '<p class="ko">Le secret GOOGLE_CLIENT_SECRET n\'est pas encore posé dans Cloudflare.</p>');
      switch (url.pathname) {
        case '/': return accueil();
        case '/connexion': return connexion(url, env);
        case '/retour': return await retour(req, url, env);
        case '/enfant': return await enfant(url, env);
        case '/oublier': return await oublier(url, env);
        default: return new Response('Introuvable', { status: 404 });
      }
    } catch (e) {
      return page('Erreur', '<p class="ko">' + esc(e.message || String(e)) + '</p>', 500);
    }
  }
};

function accueil() {
  return page('Relais d\'essai', `
    <p>Étape 1 : le parent se connecte une fois. Le relais reçoit une clé durable, limitée aux fichiers créés par SoccaQuiz, et crée un fichier d'essai dans le Drive.</p>
    <p><a class="bouton" href="/connexion">Commencer avec Google</a></p>`);
}

function connexion(url, env) {
  const etat = aleatoire(16);
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: url.origin + '/retour',
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: etat
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Set-Cookie': `st=${etat}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    }
  });
}

async function retour(req, url, env) {
  if (url.searchParams.get('error')) return page('Connexion annulée', '<p class="ko">' + esc(url.searchParams.get('error')) + '</p>');
  const cookie = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)st=([^;]+)/);
  if (!cookie || cookie[1] !== url.searchParams.get('state')) return page('Erreur', '<p class="ko">Vérification de sécurité échouée (state). Recommence depuis la page d\'accueil du relais.</p>', 400);

  const jetons = await jsonOk(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code'),
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: url.origin + '/retour',
      grant_type: 'authorization_code'
    })
  }), 'échange du code');
  if (!jetons.refresh_token) return page('Erreur', '<p class="ko">Google n\'a pas donné de clé durable (refresh_token absent).</p>', 500);

  const acces = jetons.access_token;
  const moi = await jsonOk(await drive('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', acces), 'lecture du compte');
  const contenu = 'Créé par le relais pendant la connexion du parent : ' + heure() + '\n';
  const fichier = await creerFichier(acces, contenu);

  const cle = await chiffrer(env, { r: jetons.refresh_token, f: fichier.id, m: moi.user.emailAddress });
  const lien = url.origin + '/enfant?e=' + cle;
  return page('Connexion réussie', `
    <ol>
      <li class="ok">Clé durable reçue de Google.</li>
      <li class="ok">Compte : ${esc(moi.user.emailAddress)}</li>
      <li class="ok">Fichier « ${NOM_FICHIER} » créé dans le Drive.</li>
    </ol>
    <p><strong>Lien « enfant » à ouvrir plus tard, sans être connecté :</strong></p>
    <p><input id="l" readonly value="${esc(lien)}"></p>
    <p><button onclick="navigator.clipboard.writeText(document.getElementById('l').value).then(()=>this.textContent='Copié')">Copier le lien</button></p>
    <p class="note">Ferme ensuite cette page, et même le navigateur.</p>`);
}

async function enfant(url, env) {
  const d = await dechiffrer(env, url.searchParams.get('e'));
  const acces = await accesFrais(env, d.r);
  const avant = await texteOk(await drive('https://www.googleapis.com/drive/v3/files/' + d.f + '?alt=media', acces), 'lecture du fichier');
  const apres = avant + 'Partie enregistrée par le relais, parent absent : ' + heure() + '\n';
  await jsonOk(await drive('https://www.googleapis.com/upload/drive/v3/files/' + d.f + '?uploadType=media', acces, {
    method: 'PATCH', headers: { 'Content-Type': 'text/plain; charset=UTF-8' }, body: apres
  }), 'écriture du fichier');
  const relu = await texteOk(await drive('https://www.googleapis.com/drive/v3/files/' + d.f + '?alt=media', acces), 'relecture');
  return page('Relais : lecture et écriture', `
    <ol>
      <li class="ok">Nouvel accès obtenu de Google avec la clé durable (parent absent).</li>
      <li class="ok">Fichier lu dans le Drive de ${esc(d.m)}.</li>
      <li class="${relu === apres ? 'ok' : 'ko'}">Ligne ajoutée et relue ${relu === apres ? 'à l\'identique' : '— DIFFÉRENCE'}.</li>
    </ol>
    <p><strong>Contenu du fichier :</strong></p>
    <pre>${esc(relu)}</pre>
    <p class="note">Recharge la page pour ajouter une ligne. Pour finir l'essai : <a href="/oublier?e=${esc(url.searchParams.get('e'))}">retirer l'accès</a>.</p>`);
}

async function oublier(url, env) {
  const d = await dechiffrer(env, url.searchParams.get('e'));
  const r = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: d.r })
  });
  return page('Accès retiré', r.ok
    ? '<p class="ok">Google a retiré l\'accès de SoccaQuiz essai. Le lien « enfant » ne marche plus. Le fichier d\'essai reste dans le Drive.</p>'
    : '<p class="ko">Retrait refusé par Google (' + r.status + ').</p>');
}

// ---------- Google ----------
function drive(adresse, acces, options = {}) {
  options.headers = Object.assign({ Authorization: 'Bearer ' + acces }, options.headers || {});
  return fetch(adresse, options);
}

async function accesFrais(env, refresh) {
  const j = await jsonOk(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token'
    })
  }), 'nouvel accès (clé durable)');
  return j.access_token;
}

async function creerFichier(acces, contenu) {
  const limite = 'sq' + aleatoire(8);
  const corps = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: NOM_FICHIER, mimeType: 'text/plain' }) +
    `\r\n--${limite}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${contenu}\r\n--${limite}--`;
  return jsonOk(await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', acces, {
    method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + limite }, body: corps
  }), 'création du fichier');
}

async function jsonOk(r, etape) {
  const t = await r.text();
  if (!r.ok) throw new Error(etape + ' : ' + r.status + ' ' + t.slice(0, 300));
  return JSON.parse(t);
}
async function texteOk(r, etape) {
  const t = await r.text();
  if (!r.ok) throw new Error(etape + ' : ' + r.status + ' ' + t.slice(0, 300));
  return t;
}

// ---------- chiffrement (AES-GCM, clé tirée du secret) ----------
async function cleAes(env) {
  const brut = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('soccaquiz-relais-essai|' + env.GOOGLE_CLIENT_SECRET));
  return crypto.subtle.importKey('raw', brut, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function chiffrer(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleAes(env), new TextEncoder().encode(JSON.stringify(obj))));
  const tout = new Uint8Array(iv.length + ct.length);
  tout.set(iv); tout.set(ct, iv.length);
  return b64u(tout);
}
async function dechiffrer(env, e) {
  if (!e) throw new Error('Lien incomplet (paramètre e absent).');
  const tout = deb64u(e);
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: tout.slice(0, 12) }, await cleAes(env), tout.slice(12));
  return JSON.parse(new TextDecoder().decode(clair));
}

// ---------- utilitaires ----------
function aleatoire(n) { return b64u(crypto.getRandomValues(new Uint8Array(n))); }
function b64u(octets) { let s = ''; for (const o of octets) s += String.fromCharCode(o); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function deb64u(t) { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
function heure() { return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function page(titre, corps, statut = 200) {
  return new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titre)}</title>
<style>body{font-family:system-ui,sans-serif;background:#FFF8EE;color:#2b1d14;margin:0;padding:24px 16px}main{max-width:560px;margin:0 auto}h1{color:#C8102E;font-size:1.35rem}
.bouton,button{display:inline-block;background:#C8102E;color:#fff;border:0;border-radius:999px;padding:12px 20px;font-size:1rem;font-weight:600;text-decoration:none;cursor:pointer}
.ok{color:#1b7a3a}.ko{color:#C8102E;font-weight:600}.note{font-size:.9rem;color:#6b5444}input{width:100%;padding:8px;box-sizing:border-box}pre{white-space:pre-wrap;background:#fff;padding:10px;border-radius:8px}</style>
</head><body><main><h1>SoccaQuiz — ${esc(titre)}</h1>${corps}</main></body></html>`, {
    status: statut,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  });
}
