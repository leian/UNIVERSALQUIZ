/* =====================================================================
   ANIMATIONS — petits retours « façon Duolingo » pendant le quiz
   ---------------------------------------------------------------------
   Animations.reponse(ok, serie, theme) → après chaque réponse : rebond (bonne),
                                          secousse (mauvaise), son, vibration,
                                          pastille « 3 d'affilée » sous la barre
   Animations.fin(pct, theme)           → petite mélodie sur l'écran de résultat
   Animations.boutonSon(theme)          → bouton « Sons » de l'écran d'accueil du quiz
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
  .fx-pop { animation:fx-pop .32s ease-out; }
  .fx-secousse { animation:fx-secousse .38s ease-in-out; }
  .fx-serie { display:inline-flex; align-items:center; gap:4px; margin-left:6px; padding:1px 9px; border-radius:99px; font-size:12px; font-weight:800; line-height:18px;
    color:#9a3412; background:#ffedd5; border:1px solid #fdba74; animation:fx-entree .45s cubic-bezier(.2,.8,.3,1); }
  .fx-serie svg { width:13px; height:13px; fill:#ea580c; }
  .fx-son { margin-top:10px; display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:99px; border:1px solid #e5e7eb; background:#fff;
    color:#475569; font:inherit; font-size:13px; cursor:pointer; transition:transform .12s; }
  .fx-son:active { transform:scale(.94); }
  .fx-son svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  @media (prefers-reduced-motion: reduce) { .fx-pop, .fx-secousse, .fx-serie { animation:none; } }`;

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

  window.Animations = {
    reponse(ok, serie, theme) {
      installer();
      const q = s => document.querySelector(s);
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
