/* =====================================================================
   BADGES — un badge rond par quiz, gagné quand le quiz a été réussi
   au moins une fois à 100 %.
   ---------------------------------------------------------------------
   Badges.monter()              → panneau « Mes récompenses » :
        - dans un quiz : fixé à droite sur grand écran, en bas sur téléphone
        - sur la page d'accueil « SoccaQuiz » : dans l'élément #recompenses s'il existe
   Badges.gagner(cleQuiz) → bool  appelé par le moteur à 100 % ; renvoie
                                  true si le badge est nouveau
   Sources : historique local de l'appareil + résultats enregistrés sur
   Cloudflare (/api/resultats). Les emblèmes sont dans commun/catalogue.js.
   ===================================================================== */
(function () {
  const COUL = { francais: '#7c3aed', maths: '#ea580c', sciences: '#0891b2', anglais: '#b91c1c', histoire: '#a16207', geographie: '#15803d', musique: '#db2777', autre: '#475569' };
  const cle = f => { try { return decodeURIComponent(String(f || '').split('/').pop()).replace(/\.html$/i, ''); } catch (e) { return String(f); } };
  const gagnes = new Map();          // cle → date ISO de la première réussite à 100 %
  let panneau = null, dernierNouveau = null;

  const CSS = `
  .badges-panel { box-sizing: border-box; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 12px 12px 14px; font-family: system-ui, sans-serif; color: #111; }
  .badges-panel h3 { margin: 0 0 2px; font-size: 15px; display: flex; align-items: center; gap: 6px; }
  .badges-panel .bp-count { font-size: 12px; color: #6b7280; margin-bottom: 10px; }
  .badges-panel .bp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); gap: 8px; }
  .badges-panel .bp-badge { display: block; position: relative; text-decoration: none; border-radius: 50%; transition: transform .15s; }
  .badges-panel .bp-badge:hover { transform: scale(1.08); }
  .badges-panel .bp-badge svg { width: 100%; height: auto; display: block; }
  .badges-panel .bp-badge.verrou { filter: grayscale(1); opacity: .32; }
  .badges-panel .bp-badge.pop { animation: bp-pop 1.2s cubic-bezier(.2,1.6,.4,1) 2; }
  .badges-panel .bp-vide { font-size: 12px; color: #6b7280; margin-top: 8px; line-height: 1.4; }
  @keyframes bp-pop { 0% { transform: scale(.4) rotate(-20deg); } 60% { transform: scale(1.25) rotate(8deg); } 100% { transform: scale(1); } }
  /* Dans un quiz : en bas (téléphone, petit écran)… */
  body.avec-badges { flex-wrap: wrap; align-content: flex-start; }
  .badges-panel.bp-quiz { width: 100%; max-width: 700px; margin: 1.5rem auto 0; }
  /* … et fixé à droite sur grand écran */
  @media (min-width: 1180px) {
    .badges-panel.bp-quiz { position: fixed; right: 16px; top: 16px; width: 200px; max-height: calc(100vh - 32px); overflow-y: auto; margin: 0; z-index: 5; }
  }
  @media (max-width: 480px) { .badges-panel .bp-grid { grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 6px; } }
  .bp-nouveau { margin: 1rem auto 0; max-width: 420px; display: flex; align-items: center; gap: 12px; text-align: left; background: #fffbeb; border: 2px solid #f5c542; border-radius: 14px; padding: 10px 14px; color: #78350f; font-size: 14px; }
  .bp-nouveau svg { width: 56px; height: 56px; flex-shrink: 0; animation: bp-pop 1.2s cubic-bezier(.2,1.6,.4,1); }
  .bp-nouveau b { display: block; font-size: 16px; color: #92400e; }`;

  function svgBadge(q, uid) {
    const c = COUL[q.matiere] || COUL.autre;
    const id = 'bp' + uid;
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="${id}a" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fdf3dc"/></radialGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".8"/><stop offset="1" stop-color="${c}"/></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#${id}b)"/>
      <circle cx="50" cy="50" r="43" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="2.5 4"/>
      <circle cx="50" cy="50" r="35" fill="url(#${id}a)" stroke="#f5c542" stroke-width="3.5"/>
      <text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-size="34">${q.badge || '⭐'}</text>
      <path d="M50 88l2.6 5.2 5.7.8-4.1 4 1 5.7L50 101l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="#f5c542" transform="translate(0 -9) scale(1 .9)"/>
      <ellipse cx="38" cy="26" rx="12" ry="5" fill="#fff" opacity=".35" transform="rotate(-25 38 26)"/>
    </svg>`;
  }
  const liste = () => (window.QUIZ || []).filter(q => /\.html$/i.test(q.fichier));
  const fmt = d => { try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } };

  function noter(quiz, score, total, date) {
    if (!total || score < total) return;
    const k = cle(quiz);
    if (!gagnes.has(k) || (date && date < gagnes.get(k))) gagnes.set(k, date || new Date().toISOString());
  }
  function chargerLocal() {
    try { (JSON.parse(localStorage.getItem('uqSuivi.local')) || []).forEach(r => noter(r.quiz, r.score, r.total, r.date)); } catch (e) {}
  }
  async function chargerDistant() {
    if (!/^https?:/.test(location.protocol)) return;
    try {
      const r = await fetch('/api/resultats', { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return;
      ((await r.json()).resultats || []).forEach(x => noter(x.quiz, x.score, x.total, x.date));
    } catch (e) {}
  }

  function rendre() {
    if (!panneau) return;
    const L = liste();
    const n = L.filter(q => gagnes.has(cle(q.fichier))).length;
    const ici = cle(location.pathname);
    // badges gagnés d'abord, puis ceux à gagner
    const tri = [...L].sort((a, b) => (gagnes.has(cle(b.fichier)) - gagnes.has(cle(a.fichier))) || ((cle(a.fichier) === ici) ? -1 : (cle(b.fichier) === ici) ? 1 : 0));
    panneau.innerHTML = `<h3>🏅 Mes récompenses</h3>
      <div class="bp-count">${n} badge${n > 1 ? 's' : ''} sur ${L.length}</div>
      <div class="bp-grid">${tri.map((q, i) => {
        const k = cle(q.fichier), g = gagnes.has(k);
        const titre = g ? `Badge « ${q.titre} » — gagné le ${fmt(gagnes.get(k))}` : `« ${q.titre} » : réussis ce quiz à 100 % pour gagner ce badge`;
        return `<a class="bp-badge ${g ? '' : 'verrou'} ${k === dernierNouveau ? 'pop' : ''}" href="${encodeURI(q.fichier)}" title="${titre.replace(/"/g, '&quot;')}" aria-label="${titre.replace(/"/g, '&quot;')}">${svgBadge(q, i)}</a>`;
      }).join('')}</div>
      ${n === 0 ? '<div class="bp-vide">Réussis un quiz sans aucune faute pour gagner ton premier badge !</div>' : ''}`;
  }

  window.Badges = {
    async monter() {
      if (!document.getElementById('badges-css')) { const st = document.createElement('style'); st.id = 'badges-css'; st.textContent = CSS; document.head.appendChild(st); }
      const cible = document.getElementById('recompenses');
      panneau = document.createElement('section');
      panneau.className = 'badges-panel' + (cible ? '' : ' bp-quiz');
      panneau.setAttribute('aria-label', 'Mes récompenses');
      if (cible) cible.appendChild(panneau);
      else { document.body.classList.add('avec-badges'); document.body.appendChild(panneau); }
      chargerLocal(); rendre();
      await chargerDistant(); rendre();
    },
    gagner(quiz) {
      const k = cle(quiz || location.pathname);
      const nouveau = !gagnes.has(k);
      if (nouveau) { gagnes.set(k, new Date().toISOString()); dernierNouveau = k; rendre(); }
      return nouveau;
    },
    badgeHTML(quiz) {
      const k = cle(quiz || location.pathname);
      const q = liste().find(x => cle(x.fichier) === k);
      return q ? svgBadge(q, 'n') : '';
    },
    titre(quiz) { const k = cle(quiz || location.pathname); const q = liste().find(x => cle(x.fichier) === k); return q ? q.titre : ''; }
  };
})();
