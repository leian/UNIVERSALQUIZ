// Simulation minimale des services Google Apps Script pour tester Code.gs en local.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import http from 'node:http';

const BUILD = process.argv[2];
const DRIVE = process.argv[3];     // dossier local qui joue le rôle de « Mon Drive »
const PORT = +process.argv[4] || 8765;
mkdirSync(DRIVE, { recursive: true });

const props = {};
const cache = {};
const sheets = {};   // id → { name, rows: [[...]] }
const partages = {};
// deux parents : FAUX.proprio = false → le visiteur n'est pas le parent qui a installé ; FAUX.etranger = true → aucun accès Drive
const FAUX = { proprio: true, etranger: false };
const editeurs = {};
const avecEditeurs = (id, o) => Object.assign(o, {
  getEditors: () => [...(editeurs[id] || [])].map(m => ({ getEmail: () => m })),
  addEditor: (m) => { (editeurs[id] = editeurs[id] || new Set()).add(m); },
  removeEditor: (m) => { if (editeurs[id]) editeurs[id].delete(m); }
});
const corbeille = new Set();
let compteur = 0;
const PARENT = 'parent@exemple.fr';
props.PROPRIO = PARENT;            // adresse notée par autoriser() lors de l'installation (éditeur)

/* ---------- faux services avancés Drive v3 et Sheets v4 (autorisation drive.file) ----------
   Dossiers : de vrais dossiers dans DRIVE (id « d:<chemin> ») ; tableaux : en mémoire (sheets, feuilles). */
const introuvable = id => { const e = new Error('File not found: ' + id); e.code = 404; throw e; };
const refuse = () => { if (FAUX.etranger) throw new Error('Accès refusé'); };
const chemin = id => id === 'root' ? DRIVE : String(id).slice(2);
const dossiers = (racine = DRIVE) => {
  const l = [];
  const marche = c => readdirSync(c).forEach(n => { const x = join(c, n); if (statSync(x).isDirectory()) { l.push(x); marche(x); } });
  if (existsSync(racine)) marche(racine);
  return l;
};
const metaDossier = c => ({ id: 'd:' + c, name: c.split('/').pop(), mimeType: 'application/vnd.google-apps.folder', trashed: false,
  createdTime: new Date(statSync(c).birthtimeMs || statSync(c).mtimeMs).toISOString(), modifiedTime: new Date(statSync(c).mtimeMs).toISOString(),
  parents: [c.split('/').slice(0, -1).join('/') === DRIVE ? 'root' : 'd:' + c.split('/').slice(0, -1).join('/')] });
const metaFichier = c => ({ id: 'f:' + c, name: c.split('/').pop(), mimeType: 'text/html', trashed: corbeille.has('f:' + c),
  createdTime: new Date(statSync(c).birthtimeMs || statSync(c).mtimeMs).toISOString(), modifiedTime: new Date(statSync(c).mtimeMs).toISOString(),
  parents: [c.split('/').slice(0, -1).join('/') === DRIVE ? 'root' : 'd:' + c.split('/').slice(0, -1).join('/')] });
const metaTableur = id => ({ id, name: sheets[id].name, mimeType: 'application/vnd.google-apps.spreadsheet', trashed: corbeille.has(id),
  createdTime: sheets[id].cree, modifiedTime: sheets[id].cree, parents: [sheets[id].dossier === DRIVE ? 'root' : 'd:' + sheets[id].dossier] });
const meta = id => {
  id = String(id);
  if (sheets[id]) return metaTableur(id);
  if (id === 'root') return metaDossier(DRIVE);
  const c = chemin(id);
  if (!existsSync(c)) return null;
  return statSync(c).isDirectory() ? metaDossier(c) : metaFichier(c);
};
const tout = () => [...dossiers().map(metaDossier),
  ...dossiers().concat([DRIVE]).flatMap(d => readdirSync(d).filter(n => statSync(join(d, n)).isFile()).map(n => metaFichier(join(d, n)))),
  ...Object.keys(sheets).map(metaTableur)];
// petite lecture des requêtes utilisées par Code.gs : 'x' in parents, name = 'x', mimeType = / != 'x', trashed = false
const filtre = q => {
  const conds = String(q || '').split(/\s+and\s+/).map(c => c.trim()).filter(Boolean).map(c => {
    let m;
    const val = v => v.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if ((m = c.match(/^('(?:[^'\\]|\\.)*')\s+in\s+parents$/))) { const p = val(m[1]); return x => (x.parents || []).includes(p); }
    if ((m = c.match(/^name\s*=\s*('(?:[^'\\]|\\.)*')$/))) { const n = val(m[1]); return x => x.name === n; }
    if ((m = c.match(/^mimeType\s*(!?=)\s*('(?:[^'\\]|\\.)*')$/))) { const v = val(m[2]); return m[1] === '=' ? x => x.mimeType === v : x => x.mimeType !== v; }
    if ((m = c.match(/^trashed\s*=\s*(true|false)$/))) { const v = m[1] === 'true'; return x => !!x.trashed === v; }
    throw new Error('requête Drive non simulée : ' + c);
  });
  return x => conds.every(f => f(x));
};
const Drive = {
  Files: {
    list: (o) => { refuse(); return { files: tout().filter(filtre(o && o.q)) }; },
    get: (id) => { refuse(); return meta(id) || introuvable(id); },
    create: (r) => {
      const parent = chemin((r.parents || ['root'])[0]);
      if (r.mimeType === 'application/vnd.google-apps.folder') { const c = join(parent, r.name); mkdirSync(c, { recursive: true }); return metaDossier(c); }
      if (r.mimeType === 'application/vnd.google-apps.spreadsheet') { const id = 'ss' + (++compteur); sheets[id] = { name: r.name, rows: [], dossier: parent, titre: 'Feuille 1', cree: new Date().toISOString() }; return metaTableur(id); }
      throw new Error('création non simulée : ' + r.mimeType);
    },
    update: (r, id, media, o) => {
      refuse(); const m = meta(id) || introuvable(id);
      if (sheets[id]) {
        if (r.name) sheets[id].name = r.name;
        if (r.trashed) corbeille.add(id);
        if (o && o.addParents) sheets[id].dossier = chemin(o.addParents);
        return metaTableur(id);
      }
      const c = chemin(id);
      if (r.trashed) {
        mkdirSync(join(DRIVE, '..', 'corbeille'), { recursive: true });
        if (statSync(c).isDirectory()) {
          // dossier à la corbeille : ses tableaux le suivent
          Object.values(sheets).forEach(s => { if (s.dossier === c || s.dossier.startsWith(c + '/')) s.corbeille = true; });
          Object.keys(sheets).forEach(k => { if (sheets[k].corbeille) corbeille.add(k); });
          renameSync(c, join(DRIVE, '..', 'corbeille', c.split('/').pop() + '-' + Date.now()));
        } else renameSync(c, join(DRIVE, '..', 'corbeille', c.split('/').pop()));
      }
      return m;
    }
  },
  Permissions: {
    list: (id) => ({ permissions: [...(editeurs[id] || [])].map(m => ({ id: 'p:' + m, emailAddress: m, role: 'writer' })) }),
    create: (r, id) => { (editeurs[id] = editeurs[id] || new Set()).add(r.emailAddress); return { id: 'p:' + r.emailAddress }; },
    remove: (id, pid) => { if (editeurs[id]) editeurs[id].delete(String(pid).slice(2)); }
  }
};
// onglets : le premier dans sheets[id] (rows, titre), les autres dans feuilles[id + '/' + titre]
const feuilles = {};
let numOnglet = 0;
const onglet = (id, titre) => {
  const s = sheets[id] || introuvable(id);
  if (!titre || titre === s.titre) return s;
  return feuilles[id + '/' + titre] || null;
};
const zoneA1 = (range) => {
  const m = String(range).match(/^(?:'((?:[^']|'')*)'|([^!]+?))(?:!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?)?$/);
  const col = l => l ? [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) : 1;
  return { titre: m[1] != null ? m[1].replace(/''/g, "'") : m[2], c: col(m[3]), r: m[4] ? +m[4] : 1, c2: m[5] ? col(m[5]) : null, r2: m[6] ? +m[6] : null };
};
const derniere = rows => { let n = rows.length; while (n && !(rows[n - 1] || []).some(x => x !== '' && x != null)) n--; return n; };
const Sheets = {
  Spreadsheets: {
    get: (id) => {
      refuse(); const s = sheets[id] || introuvable(id);
      const autres = Object.keys(feuilles).filter(k => k.startsWith(id + '/')).map(k => ({ properties: { sheetId: feuilles[k].sheetId, title: k.slice(id.length + 1), index: 1 } }));
      return { properties: { title: s.name }, sheets: [{ properties: { sheetId: 0, title: s.titre, index: 0 } }, ...autres] };
    },
    batchUpdate: (b, id) => {
      refuse(); const s = sheets[id] || introuvable(id);
      const ongletParId = sid => sid === 0 ? s : Object.values(feuilles).find(f => f.id === id && f.sheetId === sid);
      return { replies: b.requests.map(r => {
        if (r.addSheet) { const t = r.addSheet.properties.title, sheetId = ++numOnglet; feuilles[id + '/' + t] = { rows: [], sheetId, id }; return { addSheet: { properties: { sheetId, title: t } } }; }
        if (r.updateSheetProperties) {
          const p = r.updateSheetProperties.properties;
          if (p.title != null) {
            if (p.sheetId === 0) s.titre = p.title;
            else { const k = Object.keys(feuilles).find(k => feuilles[k].id === id && feuilles[k].sheetId === p.sheetId); feuilles[id + '/' + p.title] = feuilles[k]; delete feuilles[k]; }
          }
          return {};
        }
        if (r.deleteDimension) { const g = r.deleteDimension.range, o = ongletParId(g.sheetId); o.rows.splice(g.startIndex, g.endIndex - g.startIndex); return {}; }
        throw new Error('requête Sheets non simulée');
      }) };
    },
    Values: {
      get: (id, range) => {
        refuse(); const z = zoneA1(range), o = onglet(id, z.titre); if (!o) throw new Error('Unable to parse range: ' + range);
        const n = derniere(o.rows), fin = z.r2 ? Math.min(z.r2, n) : n;
        const v = o.rows.slice(z.r - 1, fin).map(l => { const x = (l || []).slice(z.c - 1, z.c2 ? z.c2 : undefined).map(c => c == null ? '' : String(c)); while (x.length && x[x.length - 1] === '') x.pop(); return x; });
        return v.length ? { values: v } : {};
      },
      append: (b, id, range) => {
        refuse(); const z = zoneA1(range), o = onglet(id, z.titre) || introuvable(range);
        const n = derniere(o.rows);
        b.values.forEach((l, i) => { o.rows[n + i] = l.map(x => String(x == null ? '' : x)); });
        o.rows.length = n + b.values.length;
        return { updates: { updatedRows: b.values.length } };
      },
      update: (b, id, range) => {
        refuse(); const z = zoneA1(range), o = onglet(id, z.titre) || introuvable(range);
        b.values.forEach((l, i) => { const row = o.rows[z.r - 1 + i] = (o.rows[z.r - 1 + i] || []).slice(); l.forEach((x, j) => { row[z.c - 1 + j] = String(x == null ? '' : x); }); });
        for (let i = 0; i < o.rows.length; i++) if (!o.rows[i]) o.rows[i] = [];
        return { updatedRows: b.values.length };
      },
      clear: (b, id, range) => {
        refuse(); const z = zoneA1(range), o = onglet(id, z.titre) || introuvable(range);
        for (let r = z.r; r <= (z.r2 || z.r); r++) if (o.rows[r - 1]) o.rows[r - 1] = o.rows[r - 1].map((x, j) => j + 1 >= z.c && (!z.c2 || j + 1 <= z.c2) ? '' : x);
        return {};
      }
    }
  }
};
// lecture d'un quiz pour les tests : tableau « SoccaQuiz – Quiz » d'un dossier, onglet « Fichiers »
const quizDuDossier = (c) => {
  const id = Object.keys(sheets).find(k => sheets[k].name === 'SoccaQuiz – Quiz' && sheets[k].dossier === c && !corbeille.has(k));
  return id ? sheets[id].rows.slice(1).filter(l => l && l[0]).map(l => ({ nom: l[1], contenu: l.slice(4).join('') })) : [];
};
const retirerQuiz = (c, nom) => {
  const id = Object.keys(sheets).find(k => sheets[k].name === 'SoccaQuiz – Quiz' && sheets[k].dossier === c && !corbeille.has(k));
  if (id) sheets[id].rows = sheets[id].rows.map(l => l && l[1] === nom ? [] : l);
  Object.keys(cache).forEach(k => { delete cache[k]; });
};
// dépôt direct d'un quiz dans le tableau d'un dossier (simule un quiz déjà présent, comme un fichier déposé autrefois)
const deposerQuiz = (c, nom, contenu) => {
  let id = Object.keys(sheets).find(k => sheets[k].name === 'SoccaQuiz – Quiz' && sheets[k].dossier === c && !corbeille.has(k));
  if (!id) { id = 'ss' + (++compteur); sheets[id] = { name: 'SoccaQuiz – Quiz', rows: [['id', 'nom', 'créé', 'modifié', 'contenu']], dossier: c, titre: 'Fichiers', cree: new Date().toISOString() }; }
  const t = new Date().toISOString(), m = contenu.match(/[\s\S]{1,40000}/g) || [''];
  sheets[id].rows.push(['x' + (++compteur), nom, t, t, ...m]);
  Object.keys(cache).forEach(k => { delete cache[k]; });
};

const ctx = {
  console,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); },
    getProperties: () => ({ ...props }), setProperties: o => Object.assign(props, o), deleteProperty: k => { delete props[k]; },
    deleteAllProperties: () => { Object.keys(props).forEach(k => { delete props[k]; }); }, getKeys: () => Object.keys(props)
  }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; }, removeAll: ks => ks.forEach(k => { delete cache[k]; }), putAll: o => Object.assign(cache, o), getAll: ks => Object.fromEntries(ks.filter(k => k in cache).map(k => [k, cache[k]])) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => FAUX.proprio === false ? 'autre@exemple.fr' : PARENT }), getEffectiveUser: () => ({ getEmail: () => PARENT }), getScriptTimeZone: () => 'Europe/Paris' },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (a, t) => [...createHash('sha256').update(String(t), 'utf8').digest()].map(b => b > 127 ? b - 256 : b), formatDate: d => d.toISOString().slice(0, 10), newBlob: t => ({ getBytes: () => Buffer.from(String(t)) }), getUuid: () => crypto.randomUUID() },
  MimeType: { HTML: 'text/html', PLAIN_TEXT: 'text/plain' },
  ScriptApp: { getService: () => ({ getUrl: () => `http://localhost:${PORT}/exec` }), getScriptId: () => 'projet-script', invalidateAuth: () => { FAUX.authRetiree = true; } },
  FAUX, editeurs, Drive, Sheets, quizDuDossier, deposerQuiz, retirerQuiz, feuilles, corbeille,
  ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (t) => { const o = { json: true, getContent: () => t, setMimeType() { return o; } }; return o; } },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    createHtmlOutputFromFile: (n) => { const c = readFileSync(join(BUILD, n + '.html'), 'utf8'); if (!/^\s*</.test(c)) throw new Error('Format du contenu HTML non valide : ' + c.slice(0, 40)); return { getContent: () => c }; },
    createHtmlOutput: (html) => { const o = { titre: '', metas: [], getContent: () => html,
      setTitle(t) { o.titre = t; return o; }, setFaviconUrl(u) { o.favicon = u; return o; }, addMetaTag(k, v) { o.metas.push([k, v]); return o; }, setXFrameOptionsMode(m) { o.cadre = m; return o; } }; return o; }
  }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(BUILD, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

// faux google.script.run injecté dans la page (comme le fait Google)
const FAUX_RUN = `<script>(function(){var f=window.fetch.bind(window);
function chaine(ok,ko){return new Proxy({},{get:function(_,k){
 if(k==='withSuccessHandler')return function(h){return chaine(h,ko)};
 if(k==='withFailureHandler')return function(h){return chaine(ok,h)};
 return function(arg){f('/rpc',{method:'POST',body:JSON.stringify({fn:k,arg:arg,args:[].slice.call(arguments)})}).then(function(r){return r.json()}).then(function(d){if(d.erreur_serveur){ko&&ko(new Error(d.erreur_serveur))}else{ok&&ok(d.r)}})}}})}
window.google={script:{run:chaine(null,null)}};})();</script>`;

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (typeof ctx.reinitStockage_ === 'function') ctx.reinitStockage_();     // comme Google : une exécution neuve par demande
  try {
    if (url.pathname === '/exec' && req.method === 'POST') {      // comme Google : réponse lisible depuis un autre site (CORS)
      let corps = ''; for await (const c of req) corps += c;
      const out = ctx.doPost({ postData: { contents: corps, type: req.headers['content-type'] || '' }, parameter: Object.fromEntries(url.searchParams) });
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      return res.end(out.getContent());
    }
    if (url.pathname === '/exec') {
      const out = ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
      if (out.json) { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(out.getContent()); }
      let html = out.getContent().replace(/<head\b[^>]*>/i, m => m + FAUX_RUN);
      if (!/<head/i.test(html)) html = FAUX_RUN + html;
      // comme Google : sans ALLOWALL, la page refuse d'être affichée dans un autre site
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-titre': encodeURIComponent(out.titre), ...(out.cadre === 'ALLOWALL' ? {} : { 'x-frame-options': 'SAMEORIGIN' }) });
      return res.end(html);
    }
    if (url.pathname === '/rpc') {
      let corps = ''; for await (const c of req) corps += c;
      const { fn, arg, args } = JSON.parse(corps);
      // comme Google : une page n'appelle jamais une fonction privée (nom finissant par « _ »)
      if (!/^api/.test(fn) || /_$/.test(fn)) throw new Error('fonction non autorisée');
      const r = Array.isArray(args) ? ctx[fn](...args) : ctx[fn](arg);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ r }));
    }
    if (url.pathname === '/eval') {      // pour les tests
      let corps = ''; for await (const c of req) corps += c;
      const r = vm.runInContext(corps, ctx);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ r, sheets, props: Object.keys(props), partages }));
    }
    res.writeHead(404); res.end('404');
  } catch (e) {
    console.error(e);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ erreur_serveur: e.message }));
  }
});
serveur.listen(PORT, () => console.log('faux Google prêt sur ' + PORT));
