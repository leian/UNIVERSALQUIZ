/* =====================================================================
   ANIMATIONS — petits retours « façon Duolingo » pendant le quiz
   ---------------------------------------------------------------------
   Animations.reponse(ok, serie, theme) → après chaque réponse : rebond (bonne),
                                          secousse (mauvaise), son, vibration,
                                          pastille « 3 d'affilée » sous la barre
   Animations.fin(pct, theme)           → petite mélodie sur l'écran de résultat
   Animations.boutonSon(theme)          → bouton « Sons » de l'écran d'accueil du quiz
   Animations.panneauPoses(el)          → collège : « Mes postures » sur l'accueil (postures gagnées,
                                          rejouées en grand au toucher de leur icône)
   Postures du collège : bandes de 6 images (docs/themes/poses/<id>.webp, poses-f/, poses-m/),
   une posture gagnée jouée à chaque bonne réponse ; seules celles listées par le serveur
   (__UQ.poses, POSES_DESSINEES de Code.gs) existent. Déblocage : bonnes réponses enregistrées.
   Rien ici ne dépend du contenu du quiz : ajouter un effet ne coûte aucun
   token à la création d'un quiz. Fichier autonome (il injecte son CSS),
   ajouté automatiquement après moteur-quiz.js par le serveur.
   Aucune animation ne recouvre les boutons ; « Réduire les animations »
   du téléphone coupe les mouvements (les sons restent, réglables).
   ===================================================================== */
(function () {
  const CSS = `
  @keyframes fx-pop { 0% { transform:scale(1); } 40% { transform:scale(1.06); } 100% { transform:scale(1); } }
  @keyframes fx-secousse { 0%,100% { transform:translateX(0); } 20% { transform:translateX(-7px); } 40% { transform:translateX(6px); } 60% { transform:translateX(-4px); } 80% { transform:translateX(2px); } }
  @keyframes fx-entree { 0% { opacity:0; transform:translateY(4px) scale(.85); } 60% { opacity:1; transform:translateY(0) scale(1.08); } 100% { transform:scale(1); } }
  @keyframes fx-bond { 0%,100% { transform:none; } 25% { transform:scale(1.1,.85); } 55% { transform:translateY(-12px) scale(.95,1.06); } 80% { transform:scale(1.05,.93); } }
  @keyframes fx-penche { 0%,100% { transform:none; } 30% { transform:rotate(-8deg); } 65% { transform:rotate(5deg); } }
  .fx-bond { animation:fx-bond .5s ease-out !important; }
  .fx-penche { animation:fx-penche .55s ease-in-out !important; }
  .fx-pop { animation:fx-pop .32s ease-out; }
  .fx-secousse { animation:fx-secousse .38s ease-in-out; }
  .fx-serie { display:inline-flex; align-items:center; gap:4px; margin-left:6px; padding:1px 9px; border-radius:99px; font-size:12px; font-weight:800; line-height:18px;
    color:#9a3412; background:#ffedd5; border:1px solid #fdba74; animation:fx-entree .45s cubic-bezier(.2,.8,.3,1); }
  .fx-serie svg { width:13px; height:13px; fill:#ea580c; }
  .fx-son { margin-top:10px; display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:99px; border:1px solid #e5e7eb; background:#fff;
    color:#475569; font:inherit; font-size:13px; cursor:pointer; transition:transform .12s; }
  .fx-son:active { transform:scale(.94); }
  .fx-son svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

  .fx-pose { display:block; aspect-ratio:1; background:no-repeat 0 0 / 600% 100%; }
  .fx-pose.go { animation:fx-pose-img .9s steps(5, jump-none) var(--tours, 2); }
  @keyframes fx-pose-img { from { background-position:0 0; } to { background-position:100% 0; } }
  #fx-pose-coin { position:fixed; right:10px; bottom:10px; z-index:60; height:clamp(100px, 22vw, 150px); pointer-events:none; opacity:0; }
  #fx-pose-coin.go { animation:fx-pose-img .9s steps(5, jump-none) 2, fx-pose-vu 1.9s ease forwards; }
  @keyframes fx-pose-vu { 0% { opacity:0; transform:translateY(20px); } 12%, 85% { opacity:1; transform:none; } 100% { opacity:0; } }
  .compagnon.fx-pose-en-cours { background-size:600% 100% !important; background-position:0 0; animation:fx-pose-img .9s steps(5, jump-none) 2 !important; transform:scale(1.35); }
  .fx-poses h3 { margin:0 0 4px; font-size:1rem; display:flex; align-items:center; gap:8px; }
  .fx-poses h3 span { margin-left:auto; font-size:.85rem; color:var(--soft); font-weight:600; }
  .fx-poses p { margin:0 0 10px; font-size:.82rem; color:var(--soft); }
  .fx-scene { aspect-ratio:2 / 1; display:flex; justify-content:center; align-items:flex-end; margin-bottom:8px; border-radius:12px;
    background:radial-gradient(ellipse at 50% 92%, color-mix(in srgb, var(--line) 70%, transparent) 0 22%, transparent 23%); }
  .fx-scene .fx-pose { height:100%; }
  .fx-grille { display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; }
  .fx-grille button { position:relative; aspect-ratio:1; padding:0; border:2px solid var(--line); border-radius:12px; background:var(--card); cursor:pointer; overflow:hidden; }
  .fx-grille button i { position:absolute; inset:6%; background:no-repeat 0 0 / 600% 100%; }
  .fx-grille button.verrou { cursor:default; }
  .fx-grille button.verrou i { filter:grayscale(1) brightness(1.2); opacity:.25; }
  .fx-grille button.verrou::after { content:"🔒"; position:absolute; inset:0; display:grid; place-items:center; font-size:15px; }
  .fx-grille button.choisi { border-color:var(--dore, #e8a83a); }
  .fx-grille button.neuf { animation:fx-entree .6s cubic-bezier(.2,.8,.3,1) both; }
  .fx-grille button:focus-visible { outline:3px solid var(--dore, #e8a83a); outline-offset:1px; }
  .fx-info { margin-top:8px; font-size:.85rem; min-height:1.2em; }
  @media (prefers-reduced-motion: reduce) { .fx-pop, .fx-secousse, .fx-serie, .fx-bond, .fx-penche, .fx-pose.go, .fx-grille button.neuf { animation:none !important; }
    .fx-pose.go, .compagnon.fx-pose-en-cours { background-position:40% 0 !important; animation:none !important; } #fx-pose-coin { display:none; } }`;

  // lycée et parent : sobre (pas de pastille de série, sons coupés par défaut)
  const SOBRE = { lycee: 1, parent: 1 };
  const PALIERS = [3, 5, 10, 15, 20, 30];
  const FLAMME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.3-5 .2 1.6 1 2.7 2.2 3C11 8 11.4 5 12 2z"/></svg>';
  const HP = '<path d="M4 9v6h4l5 4V5L8 9z"/>';
  const HP_ON = HP + '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>';
  const HP_OFF = HP + '<path d="m17 9 5 6m0-6-5 6"/>';

  let pret = false, actx = null;
  function installer() {
    if (pret) return; pret = true;
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  }
  const calme = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function sonsActifs(theme) {
    let v = null; try { v = localStorage.getItem('uq-sons'); } catch (e) {}
    return v === null ? !SOBRE[theme] : v === '1';
  }

  /* ---------- sons : synthétisés par le navigateur, aucun fichier à charger ---------- */
  function jouer(notes, volume) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
      let t = actx.currentTime + 0.02;
      notes.forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(volume, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d * 1.6);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d * 1.7);
        t += d;
      });
    } catch (e) {}
  }
  const SON_OK = [[659, 0.09], [988, 0.16]];            // mi – si : clair et bref
  const SON_KO = [[311, 0.12], [262, 0.18]];            // deux notes graves et douces, jamais un buzzer
  const SON_FIN = [[523, 0.11], [659, 0.11], [784, 0.11], [1047, 0.3]];
  const SON_FIN_DOUX = [[523, 0.14], [659, 0.26]];
  function vibrer(motif) { try { if (navigator.vibrate) navigator.vibrate(motif); } catch (e) {} }

  function animer(el, cls) {
    if (!el || calme()) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  /* ---------- postures du collège : récompense gagnée avec les bonnes réponses ----------
     Ordre de déblocage ; noms affichés. Une posture : bande de 6 images 384 × 384 (outils/pose-planche.py). */
  const POSES = [['six-seven', 'Six-Seven (67)'], ['moue', 'La moue'], ['for-sure', 'For sure'], ['je-men-fous', 'Je m’en fous'],
    ['retourne', 'Le regard qui se retourne'], ['clin-doeil', 'Clin d’œil pistolet'], ['mewing', 'Mewing'], ['toc-toc', 'Toc toc'],
    ['aura', 'Battle d’aura'], ['sigma', 'Sigma'], ['duckface', 'Duckface'], ['soupir', 'Le soupir à la française'],
    ['pas-french', 'I don’t wanna be French'], ['spiki', 'Spiki'], ['ehho', 'Ehho Ehho'], ['ours', 'L’ours polaire'],
    ['last-dance', 'The Last Dance'], ['uk', 'U+K'], ['babydoll', 'Babydoll'], ['cri', 'Cri de victoire']];
  const PREMIERE = 10, PAS = 25;        // 1re posture à 10 bonnes réponses, puis une toutes les 25
  const IMAGES = 'https:\/\/leian.github.io/UNIVERSALQUIZ/themes/';
  function etatPoses() {
    const U = window.__UQ || {}, P = U.poses;
    if (!P) return null;
    // aperçu pour les parents : app.soccaquiz.fr/?s=…&poses=1 débloque tout sur cet appareil (poses=0 l'arrête)
    let apercu = false; try { apercu = localStorage.getItem('uq-apercu-poses') === '1'; } catch (e) {}
    if (P.college === false && !apercu) return null;
    const allure = P.allure === 'f' || P.allure === 'm' ? P.allure : '';
    const liste = POSES.map(([id, nom]) => {
      const dossier = allure && (P[allure] || []).indexOf(id) >= 0 ? 'poses-' + allure : (P.n || []).indexOf(id) >= 0 ? 'poses' : '';
      return dossier ? { id, nom, src: IMAGES + dossier + '/' + id + '.webp' } : null;
    }).filter(Boolean);
    if (!liste.length) return null;
    // bonnes réponses des parties enregistrées (le duel se joue à deux : il ne compte pas)
    const bonnes = (U.resultats || []).reduce((n, r) => n + (r && r.mode !== 'duel' ? Math.max(0, +r.score || 0) : 0), 0);
    liste.forEach((p, k) => { p.seuil = PREMIERE + k * PAS; p.ok = apercu || bonnes >= p.seuil; });
    return { liste, bonnes, apercu, gagnees: liste.filter(p => p.ok) };
  }
  function jouerPose(el, p, tours) {
    if (!el || !p) return;
    el.style.backgroundImage = 'url("' + p.src + '")';
    el.classList.remove('go');
    if (!tours) return;                              // image fixe (première image)
    el.style.setProperty('--tours', tours);
    void el.offsetWidth; el.classList.add('go');
  }
  // à chaque bonne réponse : une posture gagnée au hasard ; 6e-5e dans la mascotte compagne, sinon dans le coin
  function poseReponse() {
    const E = etatPoses(); if (!E || !E.gagnees.length) return false;
    const p = E.gagnees[Math.floor(Math.random() * E.gagnees.length)];
    const comp = document.querySelector('.q-compagnon .compagnon');
    if (comp) {
      comp.style.backgroundImage = 'url("' + p.src + '")';
      comp.classList.remove('fx-pose-en-cours'); void comp.offsetWidth; comp.classList.add('fx-pose-en-cours');
      return true;
    }
    let m = document.getElementById('fx-pose-coin');
    if (!m) { m = document.createElement('span'); m.id = 'fx-pose-coin'; m.className = 'fx-pose'; m.setAttribute('aria-hidden', 'true'); document.body.appendChild(m); }
    m.style.backgroundImage = 'url("' + p.src + '")';
    m.classList.remove('go'); void m.offsetWidth; m.classList.add('go');
    return true;
  }
  function panneauPoses(el) {
    installer();
    const E = etatPoses(); if (!el) return;
    if (!E) { el.innerHTML = ''; return; }
    let vu = 0; try { vu = +localStorage.getItem('sq.poses') || 0; } catch (e) {}
    const n = E.gagnees.length, neufs = Math.max(0, n - vu);
    try { localStorage.setItem('sq.poses', n); } catch (e) {}
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const prochaine = E.liste.find(p => !p.ok), reste = prochaine ? prochaine.seuil - E.bonnes : 0;
    const pl = k => k + ' bonne' + (k > 1 ? 's' : '') + ' réponse' + (k > 1 ? 's' : '');
    const msg = !n ? 'Encore ' + pl(reste) + ' pour gagner ta première posture !'
      : (neufs ? (neufs > 1 ? neufs + ' nouvelles postures' : 'Nouvelle posture') + ' ! ' : '') + 'Touche une posture pour la voir.' + (prochaine ? ' Prochaine dans ' + pl(reste) + '.' : ' Tu les as toutes !');
    el.innerHTML = '<div class="panneau fx-poses"><h3>🕺 Mes postures <span>' + n + '/' + E.liste.length + '</span></h3><p>' + esc(E.apercu ? 'Aperçu : toutes les postures sont débloquées sur cet appareil. Touche une posture pour la voir.' : msg) + '</p>' +
      (n ? '<div class="fx-scene"><span class="fx-pose" role="img"></span></div>' : '') +
      '<div class="fx-grille">' + E.liste.map((p, k) => '<button type="button" data-k="' + k + '" class="' + (p.ok ? (k >= n - neufs ? 'neuf' : '') : 'verrou') + '"' +
        ' aria-label="' + esc(p.ok ? p.nom : 'Posture à gagner') + '" title="' + esc(p.ok ? p.nom : 'À gagner : ' + pl(p.seuil - E.bonnes) + ' de plus') + '">' +
        '<i style="background-image:url(&quot;' + esc(p.src) + '&quot;)"></i></button>').join('') + '</div><div class="fx-info" aria-live="polite"></div></div>';
    const scene = el.querySelector('.fx-scene .fx-pose'), info = el.querySelector('.fx-info');
    const montrer = (k, tours) => {
      const p = E.liste[k];
      el.querySelectorAll('.fx-grille button').forEach(b => b.classList.toggle('choisi', +b.dataset.k === k && p.ok));
      if (!p.ok) { info.textContent = 'À gagner : encore ' + pl(p.seuil - E.bonnes) + '.'; return; }
      scene.setAttribute('aria-label', p.nom); info.innerHTML = '<b>' + esc(p.nom) + '</b>';
      jouerPose(scene, p, tours);
    };
    el.querySelector('.fx-grille').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) montrer(+b.dataset.k, 3); });
    if (n) montrer(n - 1, neufs ? 3 : 0);      // la dernière gagnée, jouée si elle est nouvelle
  }

  window.Animations = {
    reponse(ok, serie, theme) {
      installer();
      const q = s => document.querySelector(s);
      const pose = ok && poseReponse();
      if (!pose) animer(q('.compagnon'), ok ? 'fx-bond' : 'fx-penche');
      if (ok) {
        animer(q('.opt-btn.correct') || q('.explanation'), 'fx-pop');
        animer(q('.score-badge'), 'fx-pop');
      } else {
        animer(q('.opt-btn.wrong') || q('#ans-input') || q('.explanation'), 'fx-secousse');
      }
      if (sonsActifs(theme)) { jouer(ok ? SON_OK : SON_KO, ok ? 0.12 : 0.08); vibrer(ok ? 12 : [30, 50, 30]); }
      if (ok && !SOBRE[theme] && PALIERS.indexOf(serie) >= 0) {
        const barre = q('.streak-bar');
        if (barre) {
          const p = document.createElement('span');
          p.className = 'fx-serie'; p.setAttribute('role', 'status');
          p.innerHTML = FLAMME + serie + ' d’affilée !';
          barre.appendChild(p);
        }
      }
    },
    panneauPoses,
    _etatPoses: etatPoses,
    fin(pct, theme) {
      if (sonsActifs(theme)) setTimeout(() => jouer(pct >= 60 ? SON_FIN : SON_FIN_DOUX, 0.1), 250);
    },
    boutonSon(theme) {
      installer();
      const on = sonsActifs(theme);
      return `<div><button type="button" class="fx-son" aria-pressed="${on}" onclick="Animations.basculerSon(this)">` +
        `<svg viewBox="0 0 24 24" aria-hidden="true">${on ? HP_ON : HP_OFF}</svg><span>${on ? 'Sons activés' : 'Sons coupés'}</span></button></div>`;
    },
    basculerSon(btn) {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      try { localStorage.setItem('uq-sons', on ? '1' : '0'); } catch (e) {}
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('svg').innerHTML = on ? HP_ON : HP_OFF;
      btn.querySelector('span').textContent = on ? 'Sons activés' : 'Sons coupés';
      if (on) jouer(SON_OK, 0.12);
    }
  };
})();
