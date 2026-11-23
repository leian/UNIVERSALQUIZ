/* =====================================================================
   RELAIS SOCCAQUIZ (voie 2, « sans installation ») — début de l'assemblage
   Le fichier final (relais/dist/worker.js, fabriqué par relais/construire.mjs) est :
     coque-debut.js  +  build/Code.gs (le programme de la famille, INCHANGÉ)  +  coque-fin.js
   Code.gs a été écrit pour Google Apps Script : il appelle des services synchrones (Drive, Sheets,
   PropertiesService…). Ici, ces services sont IMITÉS EN MÉMOIRE : au début de chaque demande, le relais
   charge (de façon asynchrone) toutes les données de la famille, fait tourner Code.gs d'un trait, puis
   enregistre ce qui a changé (fichiers du Drive de la famille, réglages dans D1).
   ===================================================================== */

/* services vus par Code.gs : remplis par preparer_() avant chaque demande */
let Drive, Sheets, PropertiesService, CacheService, LockService, Session, Utilities, ScriptApp, ContentService, HtmlService;
let LIB_FICHIERS_ = {};      // pages lib/*.html (remplies par l'assemblage)
const MimeType = { HTML: 'text/html', PLAIN_TEXT: 'text/plain', JSON: 'application/json', JAVASCRIPT: 'application/javascript', GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet', FOLDER: 'application/vnd.google-apps.folder' };

/* ---------- SHA-256 synchrone (Utilities.computeDigest) ---------- */
function sha256Octets_(texte) {
  const m = new TextEncoder().encode(texte), K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const l = m.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n);
  b.set(m); b[l] = 0x80;
  const dv = new DataView(b.buffer);
  dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) W[i] = (W[i - 16] + (r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3)) + W[i - 7] + (r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10))) >>> 0;
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const s = new Uint8Array(32), sv = new DataView(s.buffer);
  H.forEach((x, i) => sv.setUint32(i * 4, x));
  return s;
}

/* ---------- requêtes du Drive (sous-ensemble utilisé par Code.gs) ----------
   'X' in parents | name = 'X' | mimeType = 'X' | trashed = false|true, reliés par « and » */
function lireRequeteDrive_(q) {
  const conds = [], s = String(q || '');
  let i = 0;
  const blanc = () => { while (s[i] === ' ') i++; };
  const chaine = () => {
    if (s[i] !== "'") throw new Error('Requête Drive illisible : ' + s);
    let r = ''; i++;
    while (i < s.length && s[i] !== "'") { if (s[i] === '\\') i++; r += s[i++]; }
    i++; return r;
  };
  const mot = () => { const m = s.slice(i).match(/^[A-Za-z]+/); if (!m) throw new Error('Requête Drive illisible : ' + s); i += m[0].length; return m[0]; };
  while (i < s.length) {
    blanc();
    if (s[i] === "'") { const v = chaine(); blanc(); mot(); blanc(); const champ = mot(); conds.push({ champ, op: 'in', v }); }
    else { const champ = mot(); blanc(); if (s[i] !== '=') throw new Error('Requête Drive illisible : ' + s); i++; blanc(); const v = s[i] === "'" ? chaine() : mot(); conds.push({ champ, op: '=', v }); }
    blanc();
    if (i < s.length) { const et = mot(); if (et !== 'and') throw new Error('Requête Drive illisible : ' + s); }
  }
  return f => conds.every(c => c.op === 'in' ? (f.parents || []).indexOf(c.v) >= 0
    : c.champ === 'trashed' ? !!f.trashed === (c.v === 'true') : String(f[c.champ]) === c.v);
}

/* ---------- zones A1 des tableaux ---------- */
function lireZone_(z) {
  let s = String(z), titre, reste = '';
  if (s[0] === "'") {
    let i = 1; titre = '';
    while (i < s.length) { if (s[i] === "'" && s[i + 1] === "'") { titre += "'"; i += 2; } else if (s[i] === "'") { i++; break; } else titre += s[i++]; }
    reste = s.slice(i);
  } else { const k = s.indexOf('!'); titre = k < 0 ? s : s.slice(0, k); reste = k < 0 ? '' : s.slice(k); }
  reste = reste.replace(/^!/, '');
  const col = t => t.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const m = reste.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
  if (!m) return { titre, r1: 1, c1: 1, r2: Infinity, c2: Infinity };
  return { titre, c1: col(m[1]), r1: m[2] ? +m[2] : 1, c2: m[3] ? col(m[3]) : col(m[1]), r2: m[4] ? +m[4] : (m[3] ? Infinity : (m[2] ? +m[2] : Infinity)) };
}

/* ---------- magasin de la famille ----------
   { dossiers: { id: meta }, tableurs: { id: meta + feuilles: [{ sheetId, title, index, frozen, lignes: [[…]] }] }, permissions: { id: [...] } }
   Les identifiants sont tirés au hasard par le relais (« d… » dossier, « t… » tableau). */
const MIME_D_ = 'application/vnd.google-apps.folder', MIME_T_ = 'application/vnd.google-apps.spreadsheet';
function creerServices_(ctx) {
  const M = ctx.magasin, sale = ctx.sale;          // sale : ids des tableaux (ou 'index') à réenregistrer
  const maintenant = () => new Date().toISOString();
  const nouvelId = p => p + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const meta = id => M.dossiers[id] || M.tableurs[id] || null;
  const introuvable = id => { const e = new Error('File not found: ' + id); e.code = 404; throw e; };
  const copie = m => { const r = {}; ['id', 'name', 'mimeType', 'trashed', 'createdTime', 'modifiedTime', 'parents'].forEach(k => { if (m[k] !== undefined) r[k] = Array.isArray(m[k]) ? m[k].slice() : m[k]; }); return r; };
  const toucher = id => { const m = meta(id); if (m) m.modifiedTime = maintenant(); sale.add(M.tableurs[id] ? id : 'index'); if (M.tableurs[id]) sale.add('index'); };
  const feuille = (sid, titre) => {
    const t = M.tableurs[sid] || introuvable(sid);
    const f = t.feuilles.find(x => x.title === titre);
    if (!f) throw new Error('Unable to parse range: ' + titre);
    return f;
  };
  const derniere = l => { let n = l.length; while (n && !(l[n - 1] || []).some(x => x !== '' && x != null)) n--; return n; };
  const texte = v => v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);

  Drive = {
    Files: {
      list: (o) => {
        const ok = lireRequeteDrive_(o && o.q);
        return { files: Object.values(M.dossiers).concat(Object.values(M.tableurs)).filter(ok).map(copie) };
      },
      get: (id) => { const m = meta(String(id)); if (!m) introuvable(id); return copie(m); },
      create: (m) => {
        const t = maintenant(), base = { name: String(m.name || ''), mimeType: m.mimeType, trashed: false, createdTime: t, modifiedTime: t, parents: m.parents && m.parents.length ? m.parents.slice() : ['root'] };
        if (m.mimeType === MIME_D_) { const id = nouvelId('d'); M.dossiers[id] = Object.assign({ id }, base); sale.add('index'); return copie(M.dossiers[id]); }
        if (m.mimeType === MIME_T_) {
          const id = nouvelId('t');
          M.tableurs[id] = Object.assign({ id }, base, { feuilles: [{ sheetId: 0, title: 'Feuille 1', index: 0, lignes: [] }] });
          sale.add(id); sale.add('index');
          return copie(M.tableurs[id]);
        }
        throw new Error('Type de fichier non pris en charge par le relais : ' + m.mimeType);
      },
      update: (m, id, blob, o) => {
        const x = meta(String(id)) || introuvable(id);
        if (m && m.name != null) x.name = String(m.name);
        if (m && m.trashed != null) x.trashed = !!m.trashed;
        if (o && o.removeParents) { const r = String(o.removeParents).split(','); x.parents = (x.parents || []).filter(p => r.indexOf(p) < 0); }
        if (o && o.addParents) String(o.addParents).split(',').forEach(p => { if (x.parents.indexOf(p) < 0) x.parents.push(p); });
        toucher(x.id);
        return copie(x);
      }
    },
    Permissions: {
      list: (id) => ({ permissions: (M.permissions[id] || []).slice() }),
      create: (p, id) => { const l = M.permissions[id] = M.permissions[id] || []; const n = Object.assign({ id: nouvelId('p') }, p); l.push(n); sale.add('index'); return n; },
      remove: (id, pid) => { M.permissions[id] = (M.permissions[id] || []).filter(p => p.id !== pid); sale.add('index'); }
    }
  };

  Sheets = {
    Spreadsheets: {
      get: (sid) => {
        const t = M.tableurs[sid] || introuvable(sid);
        return { properties: { title: t.name }, sheets: t.feuilles.map(f => ({ properties: { sheetId: f.sheetId, title: f.title, index: f.index } })) };
      },
      batchUpdate: (corps, sid) => {
        const t = M.tableurs[sid] || introuvable(sid);
        const replies = (corps.requests || []).map(rq => {
          if (rq.updateSheetProperties) {
            const p = rq.updateSheetProperties.properties, f = t.feuilles.find(x => x.sheetId === p.sheetId);
            if (f && p.title != null) f.title = String(p.title);
            if (f && p.gridProperties) f.frozen = p.gridProperties.frozenRowCount;
            return {};
          }
          if (rq.deleteDimension) {
            const r = rq.deleteDimension.range, f = t.feuilles.find(x => x.sheetId === r.sheetId);
            if (f && r.dimension === 'ROWS') f.lignes.splice(r.startIndex, r.endIndex - r.startIndex);
            return {};
          }
          if (rq.addSheet) {
            const id = t.feuilles.reduce((m, f) => Math.max(m, f.sheetId), 0) + 1;
            const f = { sheetId: id, title: String(rq.addSheet.properties.title), index: t.feuilles.length, lignes: [] };
            t.feuilles.push(f);
            return { addSheet: { properties: { sheetId: f.sheetId, title: f.title, index: f.index } } };
          }
          throw new Error('Demande Sheets non prise en charge par le relais.');
        });
        toucher(sid);
        return { replies };
      },
      Values: {
        get: (sid, zone) => {
          const z = lireZone_(zone), f = feuille(sid, z.titre), fin = Math.min(z.r2, derniere(f.lignes));
          const values = [];
          for (let r = z.r1; r <= fin; r++) {
            const l = f.lignes[r - 1] || [], c2 = Math.min(z.c2, l.length);
            const v = []; for (let c = z.c1; c <= c2; c++) v.push(texte(l[c - 1]));
            while (v.length && v[v.length - 1] === '') v.pop();
            values.push(v);
          }
          while (values.length && !values[values.length - 1].length) values.pop();
          return values.length ? { values } : {};
        },
        update: (corps, sid, zone) => {
          const z = lireZone_(zone), f = feuille(sid, z.titre);
          (corps.values || []).forEach((v, i) => {
            const l = f.lignes[z.r1 - 1 + i] || (f.lignes[z.r1 - 1 + i] = []);
            for (let k = 0; k < z.r1 - 1 + i; k++) if (!f.lignes[k]) f.lignes[k] = [];
            v.forEach((x, j) => { l[z.c1 - 1 + j] = texte(x); });
          });
          toucher(sid);
          return {};
        },
        append: (corps, sid, zone) => {
          const z = lireZone_(zone), f = feuille(sid, z.titre);
          let n = derniere(f.lignes);
          (corps.values || []).forEach(v => { f.lignes[n++] = v.map(texte); });
          toucher(sid);
          return {};
        },
        clear: (corps, sid, zone) => {
          const z = lireZone_(zone), f = feuille(sid, z.titre);
          for (let r = z.r1; r <= Math.min(z.r2, f.lignes.length); r++) {
            const l = f.lignes[r - 1]; if (!l) continue;
            for (let c = z.c1; c <= Math.min(z.c2, l.length); c++) l[c - 1] = '';
          }
          toucher(sid);
          return {};
        }
      }
    }
  };

  const P = ctx.props;
  const proprietes = {
    getProperty: k => Object.prototype.hasOwnProperty.call(P, k) ? P[k] : null,
    setProperty: (k, v) => { P[k] = String(v); ctx.propsSales = true; return proprietes; },
    deleteProperty: k => { delete P[k]; ctx.propsSales = true; return proprietes; },
    getProperties: () => Object.assign({}, P),
    setProperties: (t, effacer) => { if (effacer) Object.keys(P).forEach(k => delete P[k]); Object.keys(t).forEach(k => { P[k] = String(t[k]); }); ctx.propsSales = true; return proprietes; },
    deleteAllProperties: () => { Object.keys(P).forEach(k => delete P[k]); ctx.propsSales = true; return proprietes; },
    getKeys: () => Object.keys(P)
  };
  PropertiesService = { getScriptProperties: () => proprietes, getUserProperties: () => proprietes, getDocumentProperties: () => null };

  const C = ctx.cache, t0 = Date.now();
  const lc = k => { const x = C[k]; if (!x) return null; if (x.exp < Date.now()) { delete C[k]; return null; } return x.v; };
  const cache = {
    get: k => lc(k),
    put: (k, v, d) => { C[k] = { v: String(v), exp: t0 + 1000 * Math.min(21600, d || 600) }; },
    remove: k => { delete C[k]; },
    removeAll: l => (l || []).forEach(k => { delete C[k]; }),
    getAll: l => { const r = {}; (l || []).forEach(k => { const v = lc(k); if (v != null) r[k] = v; }); return r; },
    putAll: (t, d) => Object.keys(t).forEach(k => cache.put(k, t[k], d))
  };
  CacheService = { getScriptCache: () => cache, getUserCache: () => cache, getDocumentCache: () => null };

  const verrou = { tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true };
  LockService = { getScriptLock: () => verrou, getUserLock: () => verrou, getDocumentLock: () => verrou };

  Session = {
    getActiveUser: () => ({ getEmail: () => ctx.visiteur || '' }),
    getEffectiveUser: () => ({ getEmail: () => ctx.email || '' }),
    getScriptTimeZone: () => 'Europe/Paris'
  };

  const deux = n => String(n).padStart(2, '0');
  Utilities = {
    getUuid: () => crypto.randomUUID(),
    formatDate: (d, tz, fmt) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(d)).map(x => [x.type, x.value]));
      return String(fmt).replace(/yyyy|MM|dd|HH|mm|ss/g, t => ({ yyyy: p.year, MM: p.month, dd: p.day, HH: deux(p.hour), mm: p.minute, ss: p.second })[t]);
    },
    computeDigest: (alg, t) => Array.from(sha256Octets_(String(t)), o => (o > 127 ? o - 256 : o)),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' }
  };

  ScriptApp = {
    getService: () => ({ getUrl: () => ctx.adresse }),
    getScriptId: () => ctx.famille,
    invalidateAuth: () => { ctx.revoquer = true; },
    requireAllScopes: () => {},
    AuthMode: { FULL: 'FULL' }
  };

  ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: t => { const o = { contenu: String(t), type: 'text/plain', setMimeType: m => { o.type = m; return o; }, getContent: () => o.contenu }; return o; }
  };

  const sortieHtml = h => { const o = { html: String(h), getContent: () => o.html, setTitle: () => o, addMetaTag: () => o, setFaviconUrl: () => o, setXFrameOptionsMode: () => o, setSandboxMode: () => o, append: x => { o.html += x; return o; } }; return o; };
  HtmlService = {
    createHtmlOutput: h => sortieHtml(h || ''),
    createHtmlOutputFromFile: n => {
      const c = LIB_FICHIERS_[String(n).replace(/^lib\//, '')];
      if (c == null) throw new Error('Fichier introuvable dans le relais : ' + n);
      return sortieHtml(c);
    },
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    SandboxMode: { IFRAME: 'IFRAME' }
  };
}
