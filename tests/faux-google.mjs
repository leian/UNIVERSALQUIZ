// Simulation minimale des services Google Apps Script pour tester Code.gs en local.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import http from 'node:http';

const BUILD = process.argv[2];
const DRIVE = process.argv[3];     // dossier local qui joue le rôle de « Mon Drive »
const PORT = +process.argv[4] || 8765;
mkdirSync(DRIVE, { recursive: true });

const props = {};
const cache = {};
const sheets = {};   // id → { name, rows: [[...]] }
const partages = {};
const corbeille = new Set();
let compteur = 0;

const fichier = (chemin) => ({
  getName: () => chemin.split('/').pop(),
  getId: () => 'f:' + chemin,
  getUrl: () => 'drive://' + chemin,
  isTrashed: () => corbeille.has('f:' + chemin),
  getLastUpdated: () => new Date(statSync(chemin).mtimeMs),
  getDateCreated: () => new Date(statSync(chemin).birthtimeMs || statSync(chemin).mtimeMs),
  getBlob: () => ({ getDataAsString: () => readFileSync(chemin, 'utf8') }),
  getSharingAccess: () => partages['f:' + chemin] || 'PRIVATE',
  setSharing: (a) => { partages['f:' + chemin] = a; },
  moveTo: () => {}
});
const iter = (l) => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
const dossier = (chemin) => ({
  getId: () => 'd:' + chemin, getName: () => chemin.split('/').pop(), getUrl: () => 'drive://' + chemin,
  isTrashed: () => false,
  getFiles: () => iter(readdirSync(chemin).filter(n => statSync(join(chemin, n)).isFile()).map(n => fichier(join(chemin, n)))),
  getFilesByName: (n) => iter(existsSync(join(chemin, n)) ? [fichier(join(chemin, n))] : Object.entries(sheets).filter(([, s]) => s.name === n && s.dossier === chemin).map(([id]) => ({ id }))),
  getFoldersByName: (n) => iter(existsSync(join(chemin, n)) ? [dossier(join(chemin, n))] : []),
  createFile: (n, contenu) => { writeFileSync(join(chemin, n), contenu); return fichier(join(chemin, n)); }
});

const feuille = (s) => ({
  setName: () => {},
  getMaxRows: () => 1000,
  setFrozenRows: () => {},
  getLastRow: () => s.rows.length,
  appendRow: (r) => { s.rows.push(r.map(String)); },
  deleteRow: (i) => { s.rows.splice(i - 1, 1); },
  getRange: (r, c, nr, nc) => {
    const g = {
      setValues: (v) => { v.forEach((l, i) => { s.rows[r - 1 + i] = l.map(String); }); return g; },
      setFontWeight: () => g, setNumberFormat: () => g,
      getValues: () => s.rows.slice(r - 1, r - 1 + nr).map(l => Array.from({ length: nc }, (_, j) => l[c - 1 + j] ?? ''))
    };
    return g;
  }
});
const classeur = (id) => ({ getId: () => id, getUrl: () => 'sheets://' + id, getSheets: () => [feuille(sheets[id])] });

const ctx = {
  console,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); },
    getProperties: () => ({ ...props }), setProperties: o => Object.assign(props, o)
  }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => '' }), getScriptTimeZone: () => 'Europe/Paris' },
  Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
  MimeType: { HTML: 'text/html' },
  ScriptApp: { getService: () => ({ getUrl: () => `http://localhost:${PORT}/exec` }) },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', ANYONE: 'ANYONE' }, Permission: { VIEW: 'VIEW' },
    getRootFolder: () => dossier(DRIVE),
    createFolder: (n) => { mkdirSync(join(DRIVE, n)); return dossier(join(DRIVE, n)); },
    getFolderById: (id) => { const p = id.slice(2); if (!existsSync(p)) throw new Error('introuvable'); return dossier(p); },
    getFileById: (id) => sheets[id] ? { isTrashed: () => corbeille.has(id), moveTo: (d) => { sheets[id].dossier = d.getId().slice(2); } } : fichier(id.slice(2))
  },
  SpreadsheetApp: {
    create: (n) => { const id = 'ss' + (++compteur); sheets[id] = { name: n, rows: [] }; return classeur(id); },
    openById: (id) => { if (!sheets[id]) throw new Error('introuvable'); return classeur(id); },
    open: (f) => classeur(f.id)
  },
  HtmlService: {
    createHtmlOutputFromFile: (n) => { const c = readFileSync(join(BUILD, n + '.html'), 'utf8'); if (!/^\s*</.test(c)) throw new Error('Format du contenu HTML non valide : ' + c.slice(0, 40)); return { getContent: () => c }; },
    createHtmlOutput: (html) => { const o = { titre: '', metas: [], getContent: () => html,
      setTitle(t) { o.titre = t; return o; }, setFaviconUrl(u) { o.favicon = u; return o; }, addMetaTag(k, v) { o.metas.push([k, v]); return o; } }; return o; }
  }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(BUILD, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

// faux google.script.run injecté dans la page (comme le fait Google)
const FAUX_RUN = `<script>(function(){var f=window.fetch.bind(window);
function chaine(ok,ko){return new Proxy({},{get:function(_,k){
 if(k==='withSuccessHandler')return function(h){return chaine(h,ko)};
 if(k==='withFailureHandler')return function(h){return chaine(ok,h)};
 return function(arg){f('/rpc',{method:'POST',body:JSON.stringify({fn:k,arg:arg})}).then(function(r){return r.json()}).then(function(d){if(d.erreur_serveur){ko&&ko(new Error(d.erreur_serveur))}else{ok&&ok(d.r)}})}}})}
window.google={script:{run:chaine(null,null)}};})();</script>`;

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/exec') {
      const out = ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
      let html = out.getContent().replace(/<head\b[^>]*>/i, m => m + FAUX_RUN);
      if (!/<head/i.test(html)) html = FAUX_RUN + html;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-titre': encodeURIComponent(out.titre) });
      return res.end(html);
    }
    if (url.pathname === '/rpc') {
      let corps = ''; for await (const c of req) corps += c;
      const { fn, arg } = JSON.parse(corps);
      if (!/^api/.test(fn)) throw new Error('fonction non autorisée');
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ r: ctx[fn](arg) }));
    }
    if (url.pathname === '/eval') {      // pour les tests
      let corps = ''; for await (const c of req) corps += c;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ r: vm.runInContext(corps, ctx), sheets, props: Object.keys(props), partages }));
    }
    res.writeHead(404); res.end('404');
  } catch (e) {
    console.error(e);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ erreur_serveur: e.message }));
  }
});
serveur.listen(PORT, () => console.log('faux Google prêt sur ' + PORT));
