/* =====================================================================
   UNIVERSAL QUIZ — INSTALLATEUR EN LIGNE (100 % depuis un téléphone)
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0 — usage commercial interdit.
   ---------------------------------------------------------------------
   Ce petit site est publié UNE SEULE FOIS par l'éditeur (compte soccaquiz),
   avec « Exécuter en tant que : l'utilisateur qui accède à l'application ».
   Quand un ami l'ouvre, tout se passe donc dans SON compte Google :
     1. il crée son propre projet Apps Script « SoccaQuiz » ;
     2. il y copie la dernière version du moteur, prise dans la Release GitHub ;
     3. il le publie en site web et lui en donne l'adresse.
   « Mettre à jour » refait 2 et 3 sur le même projet : l'adresse ne change pas.
   L'installateur ne touche ni au Drive ni aux fichiers de l'ami.
   Mise en place : voir en-ligne/LISEZMOI.md
   ===================================================================== */

const SOURCE_MOTEUR = 'https://github.com/leian/UNIVERSALQUIZ/releases/latest/download/universal-quiz.json';
const API_SCRIPT = 'https://script.googleapis.com/v1/projects';
const PAGE_API = 'https://script.google.com/home/usersettings';

function doGet(e) {
  // …/exec?recommencer=1 : oublie l'installation précédente de la personne connectée
  // (pour refaire un test complet ; son ancien site n'est ni modifié ni supprimé)
  if (e && e.parameter && e.parameter.recommencer === '1') PropertiesService.getUserProperties().deleteAllProperties();
  return HtmlService.createHtmlOutput(pageHtml_())
    .setTitle('Installer SoccaQuiz')
    .setFaviconUrl('https://leian.github.io/UNIVERSALQUIZ/icone.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- appelé par la page ---------------- */

/* Ce que la page doit afficher : déjà installé ? nouvelle version ? */
function apiEtat() {
  const p = PropertiesService.getUserProperties().getProperties();
  let derniere = '';
  try { derniere = moteur_().version; } catch (e) { return { erreur: e.message }; }
  return { installe: !!p.scriptId, url: p.url || '', prenom: p.prenom || '', version: p.version || '', derniere };
}

/* Première installation (ou réinstallation si le projet a disparu). */
function apiInstaller(prenom) {
  return avecVerrou_(() => {
    const props = PropertiesService.getUserProperties();
    if (props.getProperty('scriptId')) return publier_(false);
    props.setProperty('prenom', nettoyerPrenom_(prenom));
    return publier_(false);
  });
}

/* Tout recommencer : l'installateur oublie le site de cette personne (qui n'est ni modifié ni supprimé).
   La prochaine installation créera un nouveau site, à une nouvelle adresse. */
function apiRecommencer() {
  PropertiesService.getUserProperties().deleteAllProperties();
  return { ok: true };
}

/* Mise à jour : même projet, même adresse. */
function apiMettreAJour() {
  return avecVerrou_(() => publier_(true));
}

/* ---------------- le travail ---------------- */

function publier_(maj) {
  const props = PropertiesService.getUserProperties();
  const moteur = moteur_();
  let id = props.getProperty('scriptId');
  let dep = props.getProperty('deploymentId');

  if (id) {
    try { appel_('get', '/' + id); }
    catch (e) { if (e.code === 404 || e.code === 403 && !/Apps Script API/i.test(e.message)) { id = null; dep = null; } else throw e; }
  }
  if (!id) {
    id = appel_('post', '', { title: 'SoccaQuiz' }).scriptId;
    props.setProperty('scriptId', id);
    props.deleteProperty('deploymentId');
    dep = null;
  }

  appel_('put', '/' + id + '/content', { files: fichiers_(moteur, props.getProperty('prenom') || '') });
  const description = 'SoccaQuiz ' + moteur.version;
  const version = appel_('post', '/' + id + '/versions', { description }).versionNumber;
  const config = { versionNumber: version, manifestFileName: 'appsscript', description };

  let d = null;
  if (dep) {
    try { d = appel_('put', '/' + id + '/deployments/' + dep, { deploymentConfig: Object.assign({ scriptId: id }, config) }); }
    catch (e) { if (e.code !== 404) throw e; }
  }
  if (!d) d = appel_('post', '/' + id + '/deployments', config);

  const url = urlSite_(d);
  props.setProperties({ deploymentId: d.deploymentId, url, version: moteur.version });
  return { ok: true, url, version: moteur.version, maj: !!maj && !!dep };
}

/* fichiers du moteur, avec le prénom écrit dans les réglages de Code.gs */
function fichiers_(moteur, prenom) {
  const p = String(prenom).replace(/\\/g, '').replace(/'/g, '’');
  // le site saura quelle version il porte et où proposer la mise à jour
  const ici = String(ScriptApp.getService().getUrl() || '').replace(/'/g, '');
  const version = String(moteur.version).replace(/[^\w.\-]/g, '');
  return moteur.fichiers.map(f => f.name === 'Code'
    ? { name: f.name, type: f.type, source: f.source
        .replace(/prenom: '[^'\n]*',/, "prenom: '" + p + "',")
        .replace(/version: '[^'\n]*',/, "version: '" + version + "',")
        .replace(/installateur: '[^'\n]*'/, "installateur: '" + ici + "'") }
    : f);
}

/* dernière version du moteur : fichier universal-quiz.json de la Release GitHub */
function moteur_() {
  const r = UrlFetchApp.fetch(SOURCE_MOTEUR, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('Impossible de récupérer le moteur sur GitHub (erreur ' + r.getResponseCode() + '). Réessaie dans quelques minutes.');
  const m = JSON.parse(r.getContentText('UTF-8'));
  if (!m || !Array.isArray(m.fichiers) || !m.fichiers.some(f => f.name === 'appsscript')) throw new Error('Le moteur publié sur GitHub est incomplet.');
  return m;
}

function urlSite_(d) {
  const e = (d.entryPoints || []).find(x => x.entryPointType === 'WEB_APP');
  return (e && e.webApp && e.webApp.url) || 'https://script.google.com/macros/s/' + d.deploymentId + '/exec';
}

/* appel à l'API Apps Script, au nom de la personne connectée */
function appel_(methode, chemin, corps) {
  const options = {
    method: methode,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (corps) { options.contentType = 'application/json'; options.payload = JSON.stringify(corps); }
  const r = UrlFetchApp.fetch(API_SCRIPT + chemin, options);
  const code = r.getResponseCode();
  let d = {};
  try { d = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
  if (code >= 300) {
    const e = new Error((d.error && d.error.message) || ('Erreur ' + code));
    e.code = code;
    throw e;
  }
  return d;
}

/* une seule installation à la fois par personne (double appui sur le bouton) + erreurs lisibles */
function avecVerrou_(f) {
  const verrou = LockService.getUserLock();
  if (!verrou.tryLock(1000)) return { erreur: 'Une installation est déjà en cours : patiente une minute puis recharge la page.' };
  try { return f(); }
  catch (e) { console.error(e); return traduire_(e); }
  finally { verrou.releaseLock(); }
}

function traduire_(e) {
  const m = String(e && e.message || e);
  if (/User has not enabled the Apps Script API/i.test(m)) return { erreur: 'api', message: "L'interrupteur « API Google Apps Script » n'est pas encore activé dans ton compte." };
  if (/has not been used in project|SERVICE_DISABLED/i.test(m)) return { erreur: "L'installateur n'est pas complètement configuré par son éditeur (API Apps Script du projet Google Cloud). Préviens la personne qui t'a envoyé le lien." };
  if (/version/i.test(m) && /limit|200/i.test(m)) return { erreur: 'Ton site a atteint 200 versions : ouvre le projet SoccaQuiz sur script.google.com, menu Déployer → Gérer les déploiements, et supprime les anciennes versions.' };
  return { erreur: m };
}

function nettoyerPrenom_(s) {
  return String(s || '').trim().slice(0, 40).replace(/[<>"`\\&$\r\n]/g, '');
}

/* ---------------- la page (mobile d'abord) ---------------- */
function pageHtml_() {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><base target="_top">' +
  '<style>' +
  ':root{--bg:#fff8ef;--card:#fff;--ink:#2b2350;--soft:#6b6390;--line:#eadfce;--accent:#7c3aed;--ok:#15803d;--ko:#b91c1c}' +
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
  'main{max-width:560px;margin:0 auto;padding:20px 16px 40px}h1{font-size:1.6rem;text-align:center;margin:.2em 0}' +
  '.intro{text-align:center;color:var(--soft);margin:0 0 16px}' +
  '.etape{background:var(--card);border:2px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0}' +
  '.etape.active{border-color:var(--accent)}.etape h2{font-size:1.05rem;margin:0 0 6px;display:flex;gap:10px;align-items:center}' +
  '.num{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-size:.95rem;flex:none}' +
  '.btn{display:inline-block;font:600 1rem system-ui,sans-serif;border:none;border-radius:999px;padding:12px 20px;cursor:pointer;background:var(--accent);color:#fff;text-decoration:none;margin-top:6px}' +
  '.btn.leger{background:var(--card);color:var(--ink);border:2px solid var(--line)}.btn:disabled{opacity:.6}' +
  'input{font:inherit;width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;margin:6px 0}' +
  '.petit{font-size:.9rem;color:var(--soft)}.ok{border-left:5px solid var(--ok);padding:10px 14px;background:#ecfdf3;border-radius:10px}' +
  '.ko{border-left:5px solid var(--ko);padding:10px 14px;background:#fef2f2;border-radius:10px}.cache{display:none}' +
  '.actions{display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin:8px 0}.maj{background:#eff6ff;border:2px solid #bfdbfe;border-radius:12px;padding:10px 14px;margin:10px 0}' +
  '.marque{display:flex;align-items:center;justify-content:center;gap:12px}.marque img{border-radius:13px}.marque em{font-style:normal;color:#b3001b}details.avance{margin-top:14px}details.avance summary{cursor:pointer;color:var(--soft);font-size:.9rem}details.avance a{color:var(--soft)}' +
  '</style></head><body><main>' +
  '<h1 class="marque"><img src="https://leian.github.io/UNIVERSALQUIZ/icone-96.png" width="56" height="56" alt=""><span>Socca<em>Quiz</em></span></h1><p class="intro" id="intro">Crée le site de quiz de ton enfant, dans ton propre compte Google. Gratuit, environ 5 minutes.</p>' +
  '<div id="chargement" class="petit" style="text-align:center">Chargement…</div>' +

  '<div id="nouveau" class="cache">' +
  '<section class="etape" id="e1"><h2><span class="num">1</span> Active l\'API Apps Script</h2>' +
  '<p>Une seule fois : sur la page qui s\'ouvre, mets l\'interrupteur <b>« API Google Apps Script »</b> sur <b>Activé</b>, puis reviens ici.</p>' +
  '<a class="btn leger" href="' + PAGE_API + '" target="_blank" rel="noopener">Ouvrir la page Google</a></section>' +
  '<section class="etape" id="e2"><h2><span class="num">2</span> Installe le site</h2>' +
  '<label for="prenom">Prénom de l\'enfant (facultatif)</label><input id="prenom" maxlength="40" autocomplete="off" placeholder="ex. Tom">' +
  '<button class="btn" id="installer" type="button">✨ Installer mon site</button></section>' +
  '</div>' +

  '<div id="deja" class="cache"><section class="etape">' +
  '<h2 id="deja-titre">✅ Ton site est prêt</h2>' +
  '<div id="deja-message"></div>' +
  '<div class="actions"><a class="btn" id="lien-site" href="#">▶ Accéder à mon site</a>' +
  '<a class="btn leger" id="mail-enfant" href="#">✉️ Envoyer le lien à mon enfant</a></div>' +
  '<div id="bloc-maj" class="maj cache"><p id="texte-maj" style="margin:0"></p><button class="btn" id="maj" type="button">🔄 Mettre à jour mon site</button>' +
  '<p class="petit" style="margin:6px 0 0">Ton adresse, tes quiz et tes résultats ne changent pas.</p></div>' +
  '<p id="info-version" class="petit"></p>' +
  '<details class="avance"><summary>Options avancées</summary>' +
  '<p class="petit"><a href="#" id="reinstaller">Réinstaller la dernière version</a> (si ton site fonctionne mal)</p>' +
  '<p class="petit"><a href="#" id="recommencer">Repartir de zéro (créer un nouveau site)</a></p>' +
  '<div id="confirmer" class="cache ko"><p>Ton site actuel restera en ligne, mais l\'installateur l\'oubliera : la prochaine installation créera un <b>nouveau site, à une nouvelle adresse</b>. Tes quiz et tes résultats, rangés dans ton Drive, sont conservés.</p>' +
  '<button class="btn" id="oui-recommencer" type="button">Oui, repartir de zéro</button> <button class="btn leger" id="non-recommencer" type="button">Annuler</button></div>' +
  '</details></section></div>' +

  '<div id="resultat" aria-live="polite"></div>' +
  '<p class="petit" style="text-align:center;margin-top:24px">Tes quiz et les résultats restent dans ton compte : personne d\'autre ne les voit.<br>Licence PolyForm Noncommercial — usage commercial interdit.</p>' +
  '</main><script>' + scriptPage_() + '</script></body></html>';
}

function scriptPage_() {
  return '(' + String(function () {
    var $ = function (id) { return document.getElementById(id); };
    var h = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
    var res = $('resultat');
    // première installation : l'autorisation à donner une seule fois, en ouvrant le site
    var AUTORISER = '<div class="ok"><p><b>Dernière étape, une seule fois :</b> touche « Accéder à mon site ». Google demande d\'autoriser « SoccaQuiz » :</p>' +
      '<ol><li>« Examiner les autorisations », puis choisis ton compte ;</li>' +
      '<li>« Google n\'a pas validé cette application » : touche <b>Paramètres avancés</b>, puis <b>Accéder à SoccaQuiz (non sécurisé)</b> ;</li>' +
      '<li>coche <b>Tout sélectionner</b>, puis <b>Continuer</b>.</li></ol>' +
      '<p class="petit" style="margin:0">Ce site t\'appartient : il ne se sert que de son dossier « SoccaQuiz » et de son tableau des résultats, dans ton Drive. Une fois dessus, mets-le en favori.</p></div>';
    // le lien est mis dans le mail et copié en plus. La page est dans un cadre de Google : on ouvre la messagerie
    // dans une nouvelle fenêtre (un mailto: direct y est bloqué), et on propose Gmail en ligne si rien ne s'ouvre
    var OBJET_ENFANT = 'Ton site de quiz pour réviser';
    function texteEnfant(url) { return 'Coucou !\n\nVoici ton site de quiz pour réviser tes leçons :\n' + url + '\n\nMets-le en favori pour le retrouver facilement.\n\nBonnes révisions !'; }
    function mailEnfant(url) { return 'mailto:?subject=' + encodeURIComponent(OBJET_ENFANT) + '&body=' + encodeURIComponent(texteEnfant(url)); }
    function gmailEnfant(url) { return 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(OBJET_ENFANT) + '&body=' + encodeURIComponent(texteEnfant(url)); }
    function copier(t) {
      try { navigator.clipboard.writeText(t); return; } catch (e) {}
      var x = document.createElement('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0';
      document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove();
    }
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('#mail-enfant, .mail-enfant');
      if (!a || !a.dataset.url) return;
      ev.preventDefault();
      var url = a.dataset.url;
      copier(url);
      try { window.open(mailEnfant(url), '_blank'); } catch (e) {}
      var info = a.parentNode.querySelector('.info-mail');
      if (!info) { info = document.createElement('p'); info.className = 'petit info-mail'; a.parentNode.appendChild(info); }
      info.innerHTML = '✅ Lien copié. Ta messagerie ne s\'est pas ouverte ? <a href="' + h(gmailEnfant(url)) + '" target="_blank" rel="noopener">Écrire le mail dans Gmail</a>, ou colle le lien dans un message.';
    });
    function erreur(r) {
      if (r && r.erreur === 'api') {
        $('nouveau').style.display = 'block'; $('e1').classList.add('active');
        res.innerHTML = '<div class="ko">' + h(r.message) + ' Fais l\'étape 1, attends une minute, puis réessaie.</div>';
      } else {
        res.innerHTML = '<div class="ko">😕 ' + h((r && (r.erreur || r.message)) || r) + '</div>';
      }
    }
    function lancer(fn, arg, bouton) {
      var enPlace = fn === 'apiMettreAJour';          // une mise à jour s'affiche dans la carte du site, pas en dessous
      var zone = enPlace ? $('deja-message') : res;
      bouton.disabled = true; res.innerHTML = '';
      zone.innerHTML = '<p class="petit">' + (enPlace ? 'Mise à jour' : 'Installation') + ' en cours… (environ 30 secondes, ne ferme pas la page)</p>';
      google.script.run
        .withSuccessHandler(function (r) {
          bouton.disabled = false;
          if (!r || r.erreur) { zone.innerHTML = ''; return erreur(r); }
          zone.innerHTML = ''; res.innerHTML = '';
          afficherDeja({ url: r.url, version: r.version, derniere: r.version },
            r.maj ? '🎉 Ton site est à jour' : '🎉 Ton site est créé !',
            r.maj ? '<div class="ok"><p style="margin:0">Version ' + h(r.version || '') + ' installée. Ton adresse ne change pas.</p></div>' : AUTORISER);
        })
        .withFailureHandler(function (e) { bouton.disabled = false; zone.innerHTML = ''; erreur(e && e.message); })[fn](arg);
    }
    function afficherDeja(e, titre, message) {
      $('nouveau').style.display = 'none'; $('deja').style.display = 'block';
      $('intro').textContent = 'Ton site de quiz, dans ton propre compte Google.';
      $('deja-titre').textContent = titre || '✅ Ton site est prêt';
      $('deja-message').innerHTML = message || '';
      $('lien-site').href = e.url;
      $('mail-enfant').dataset.url = e.url;
      var aJour = !e.derniere || e.version === e.derniere;
      $('bloc-maj').style.display = aJour ? 'none' : 'block';
      $('texte-maj').innerHTML = '🔄 <b>Nouvelle version disponible : ' + h(e.derniere || '') + '</b>' + (e.version ? ' (tu as la ' + h(e.version) + ')' : '');
      $('info-version').textContent = aJour ? 'Version ' + (e.version || '?') + ' : c\'est la dernière.' : '';
      var info = document.querySelector('.info-mail'); if (info) info.remove();
    }
    $('installer').onclick = function () { lancer('apiInstaller', $('prenom').value, $('installer')); };
    $('maj').onclick = function () { lancer('apiMettreAJour', null, $('maj')); };
    $('reinstaller').onclick = function (ev) { ev.preventDefault(); lancer('apiMettreAJour', null, $('maj')); };
    $('recommencer').onclick = function (ev) { ev.preventDefault(); $('confirmer').style.display = 'block'; };
    $('non-recommencer').onclick = function () { $('confirmer').style.display = 'none'; };
    $('oui-recommencer').onclick = function () {
      google.script.run.withSuccessHandler(function () {
        $('confirmer').style.display = 'none'; $('deja').style.display = 'none'; $('nouveau').style.display = 'block';
        $('intro').textContent = 'Crée le site de quiz de ton enfant, dans ton propre compte Google. Gratuit, environ 5 minutes.';
        res.innerHTML = '<p class="petit">C\'est reparti de zéro. Pour revoir aussi les écrans d\'autorisation de Google, retire d\'abord les accès « SoccaQuiz » sur myaccount.google.com/permissions.</p>';
      }).withFailureHandler(function (e) { erreur(e && e.message); }).apiRecommencer();
    };
    google.script.run
      .withSuccessHandler(function (e) {
        $('chargement').style.display = 'none';
        if (e && e.erreur) { $('nouveau').style.display = 'block'; return erreur(e); }
        if (e.installe) afficherDeja(e); else $('nouveau').style.display = 'block';
      })
      .withFailureHandler(function (e) { $('chargement').style.display = 'none'; erreur(e && e.message); })
      .apiEtat();
  }) + ')();';
}
