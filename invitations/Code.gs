/* =====================================================================
   SOCCAQUIZ — ENVOI DES INVITATIONS (compte soccaquiz uniquement)
   Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
   Licence PolyForm Noncommercial 1.0.0
   ---------------------------------------------------------------------
   Une page réservée à l'éditeur (accès « Seulement moi ») : on colle la
   liste des amis, on touche « Envoyer », chacun reçoit le mail
   d'invitation mis en forme, avec son prénom.
   Le mail lui-même est lu sur GitHub Pages (docs/invitation.html) :
   une seule source, à jour dès le push.
   Installation : voir invitations/LISEZMOI.md
   ===================================================================== */

const SOURCE_INVITATION = 'https://leian.github.io/UNIVERSALQUIZ/invitation.html';
const OBJET = "SoccaQuiz : des quiz de révision à partir d'une photo de leçon";

function doGet() {
  return HtmlService.createHtmlOutput(pageHtml_())
    .setTitle('SoccaQuiz – Envoyer les invitations')
    .setFaviconUrl('https://leian.github.io/UNIVERSALQUIZ/icone.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* « Lucie <lucie@gmail.com> », « Lucie, lucie@gmail.com », « lucie@gmail.com » … une personne par ligne */
function lireListe_(texte) {
  const vus = {};
  return String(texte || '').split(/[\r\n;]+/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/);
    if (!m) return { ligne: l, erreur: 'adresse introuvable' };
    const email = m[0].toLowerCase();
    const prenom = l.replace(m[0], '').replace(/[<>,:;"()\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (vus[email]) return { ligne: l, erreur: 'en double' };
    vus[email] = true;
    return { ligne: l, email, prenom };
  });
}

const echapper_ = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* le mail tel qu'il est publié : contenu de <div id="mail"> */
function modele_() {
  // ?v=… : toujours la version publiée la plus récente (GitHub Pages garde sinon ses pages en cache une dizaine de minutes)
  const r = UrlFetchApp.fetch(SOURCE_INVITATION + '?v=' + Date.now(), { muteHttpExceptions: true, followRedirects: true, headers: { 'Cache-Control': 'no-cache' } });
  if (r.getResponseCode() !== 200) throw new Error('Impossible de lire le mail sur GitHub Pages (erreur ' + r.getResponseCode() + ').');
  const html = r.getContentText('UTF-8');
  const debut = html.indexOf('<div id="mail">'), fin = html.indexOf('<script', debut);
  if (debut < 0 || fin < 0) throw new Error('Le mail publié sur GitHub Pages a changé de forme : préviens Claude.');
  return html.slice(debut + '<div id="mail">'.length, html.lastIndexOf('</div></div>', fin));
}

function personnaliser_(modele, prenom, signature) {
  return modele
    .replace(/<span id="bonjour">[^<]*<\/span>/, prenom ? 'Bonjour ' + echapper_(prenom) + ',' : 'Bonjour,')
    .replace(/<span id="signature">[^<]*<\/span>/, echapper_(signature || ''));
}

function texteBrut_(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|div)>/gi, '\n').replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 : $1')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}

function apiEtat() {
  const p = PropertiesService.getUserProperties();
  return { quota: MailApp.getRemainingDailyQuota(), signature: p.getProperty('SIGNATURE') || '', nom: p.getProperty('NOM') || '' };
}

/* d = { liste, signature, nom, essai } — essai : envoie un seul mail, à soi-même */
function apiEnvoyer(d) {
  d = d || {};
  const signature = String(d.signature || '').trim().slice(0, 80);
  const nom = String(d.nom || '').trim().slice(0, 60) || 'SoccaQuiz';
  const p = PropertiesService.getUserProperties();
  p.setProperty('SIGNATURE', signature); p.setProperty('NOM', nom);

  const moi = Session.getEffectiveUser().getEmail();
  const liste = d.essai ? [{ ligne: moi, email: moi, prenom: 'Test' }] : lireListe_(d.liste);
  const valides = liste.filter(x => !x.erreur);
  if (!valides.length) return { erreur: 'Aucune adresse dans la liste.', lignes: liste };
  const quota = MailApp.getRemainingDailyQuota();
  if (valides.length > quota) return { erreur: 'Gmail ne permet plus que ' + quota + ' envoi(s) aujourd\'hui : retire des adresses ou attends demain.', lignes: liste };

  const modele = modele_();
  liste.forEach(x => {
    if (x.erreur) return;
    try {
      const html = personnaliser_(modele, x.prenom, signature);
      MailApp.sendEmail({ to: x.email, subject: OBJET, name: nom, htmlBody: html, body: texteBrut_(html) });
      x.ok = true;
    } catch (e) { x.erreur = String(e.message || e); }
  });
  return { ok: true, lignes: liste, quota: MailApp.getRemainingDailyQuota() };
}

function pageHtml_() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><base target="_top"><style>
:root{--bg:#fff8ef;--card:#fff;--ink:#2a1f1a;--soft:#7a6658;--line:#eadfce;--accent:#c8102e;--ok:#15803d;--ko:#b91c1c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:560px;margin:0 auto;padding:20px 16px 40px}h1{font-size:1.5rem;text-align:center;margin:.2em 0}
.etape{background:var(--card);border:2px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0}
label{font-weight:600;display:block;margin-top:8px}
input,textarea{font:inherit;width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;margin:4px 0;background:var(--bg);color:var(--ink)}
.btn{display:inline-block;font:600 1rem system-ui,sans-serif;border:none;border-radius:999px;padding:12px 20px;cursor:pointer;background:var(--accent);color:#fff;margin:8px 6px 0 0}
.btn.leger{background:var(--card);color:var(--ink);border:2px solid var(--line)}.btn:disabled{opacity:.6}
.marque{display:flex;align-items:center;justify-content:center;gap:12px;font-size:1.6rem}.marque img{border-radius:13px}.marque em{font-style:normal;color:#b3001b}.sous-titre{text-align:center;font-size:1.1rem;margin:0 0 4px}
.petit{font-size:.9rem;color:var(--soft)}ul{padding-left:20px}.ok{color:var(--ok)}.ko{color:var(--ko)}
</style></head><body><main>
<h1 class="marque"><img src="https://leian.github.io/UNIVERSALQUIZ/icone-96.png" width="56" height="56" alt=""><span>Socca<em>Quiz</em></span></h1>
<h2 class="sous-titre">✉️ Envoyer les invitations</h2>
<p class="petit" style="text-align:center">Depuis ce compte Gmail, avec le mail d'invitation mis en forme.</p>
<section class="etape">
  <label for="liste">Les amis, un par ligne</label>
  <textarea id="liste" rows="6" placeholder="Lucie lucie@gmail.com&#10;Marc, marc.dupont@orange.fr&#10;sophie@gmail.com"></textarea>
  <p class="petit">Le prénom avant l'adresse sert au « Bonjour Lucie, ». Sans prénom : « Bonjour, ».</p>
  <label for="signature">Signature, en bas du mail</label>
  <input id="signature" placeholder="ex. Yan" maxlength="80">
  <label for="nom">Nom de l'expéditeur, dans la boîte de réception</label>
  <input id="nom" placeholder="ex. Yan (SoccaQuiz)" maxlength="60">
  <button class="btn" id="envoyer" type="button">📨 Envoyer les invitations</button>
  <button class="btn leger" id="essai" type="button">M'envoyer un essai</button>
  <p class="petit" id="quota"></p>
</section>
<div id="resultat" aria-live="polite"></div>
</main><script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var h = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  function quota(n) { if (n != null) $('quota').textContent = 'Gmail autorise encore ' + n + ' envoi(s) aujourd\\'hui depuis ce compte.'; }
  google.script.run.withSuccessHandler(function (e) { $('signature').value = e.signature; $('nom').value = e.nom; quota(e.quota); }).apiEtat();
  function envoyer(essai) {
    var b1 = $('envoyer'), b2 = $('essai');
    if (!essai && !$('liste').value.trim()) { $('resultat').innerHTML = '<p class="ko">Écris au moins une adresse.</p>'; return; }
    b1.disabled = b2.disabled = true;
    $('resultat').innerHTML = '<p class="petit">Envoi en cours…</p>';
    google.script.run
      .withSuccessHandler(function (r) {
        b1.disabled = b2.disabled = false;
        var l = (r.lignes || []).map(function (x) {
          return '<li class="' + (x.ok ? 'ok' : 'ko') + '">' + (x.ok ? '✅ ' : '❌ ') + h(x.prenom ? x.prenom + ' — ' + x.email : (x.email || x.ligne)) + (x.erreur ? ' : ' + h(x.erreur) : '') + '</li>';
        }).join('');
        var n = (r.lignes || []).filter(function (x) { return x.ok; }).length;
        $('resultat').innerHTML = '<section class="etape">' + (r.erreur ? '<p class="ko">😕 ' + h(r.erreur) + '</p>' : '<p class="ok"><b>' + n + ' invitation(s) envoyée(s).</b></p>') + '<ul>' + l + '</ul></section>';
        if (!r.erreur && !essai) $('liste').value = (r.lignes || []).filter(function (x) { return !x.ok; }).map(function (x) { return x.ligne; }).join('\\n');
        quota(r.quota);
      })
      .withFailureHandler(function (e) { b1.disabled = b2.disabled = false; $('resultat').innerHTML = '<p class="ko">😕 ' + h(e.message || e) + '</p>'; })
      .apiEnvoyer({ liste: $('liste').value, signature: $('signature').value, nom: $('nom').value, essai: essai });
  }
  $('envoyer').addEventListener('click', function () { envoyer(false); });
  $('essai').addEventListener('click', function () { envoyer(true); });
})();
</script></body></html>`;
}
