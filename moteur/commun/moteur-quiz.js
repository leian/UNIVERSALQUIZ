/* =====================================================================
   MOTEUR DE QUIZ — commun à tous les quiz SoccaQuiz
   ---------------------------------------------------------------------
   Une page de quiz charge :
     commun/moteur-quiz.css, commun/suivi.js, commun/recompenses.js,
     commun/moteur-quiz.js
   puis appelle MoteurQuiz.lancer({ … }) avec ses données.

   CONFIGURATION
     titre, sousTitre (HTML), icone, matiere, couleur ('#0f766e')
     nbQuestions (20)            nombre de questions tirées par partie
     choixNombre [20,50,100]     (option) laisse choisir le nombre sur l'accueil
     questions [ … ]             le pool
     preparer()                  (option) renvoie la liste des questions d'une partie
     pills [ '…' ]               pastilles en plus sur l'accueil
     accueilHTML                 (option) bloc HTML en plus sur l'accueil
     memo                        HTML ou fonction → HTML (fiche récap de fin)
     msgExcellent, msgBien       messages de résultat

   AFFICHAGE
     figure(q) → SVG/HTML        illustration propre à une question
     illustrations { cat: SVG }  illustration par thème (repli)
     deco                        décor par défaut (sans texte)
     texteQuestion(q) → HTML     (défaut : q.q)
     blocQuestion(q, repondu)    HTML inséré sous l'énoncé (ex. boutons d'écoute)
     optionHTML(q, opt) → HTML   contenu d'une proposition de QCM (ex. image)
     classeOptions(q) → 'classe' classe en plus sur la grille des propositions
     attendu(q) → HTML           affichage de la bonne réponse
     texteReponse(q, donne)      affichage de la réponse donnée (bilan, suivi)

   SAISIE
     verifier(q, valeur) → bool  vérification personnalisée (défaut : tolérante)
     indicesVisibles (false)     indice affiché d'office au lieu d'un bouton
     noteSaisie, placeholder

   TYPES DE QUESTIONS (champ type ou t)
     'qcm'  : opts, a                     'vf' : a = 'Vrai' | 'Faux'
     'input' / 'saisie' : ans [ … ]  ou  a + alt / alts / accept ; both, disp, hint
     types personnalisés : types: { nom: {
         corps(q, ctx) → HTML,  monter(q, ctx),  entree(ctx),  attendu(q) } }
       ctx = { q, repondu, donne, ok, repondre(donne, ok, texte) }

   ÉCOUTE ET MUSIQUE (intégrés, sur n'importe quel type de question)
     q.dire  : 'How are you?'    phrase lue à voix haute (boutons Écouter / Lentement)
     q.langue: 'en-GB'           langue de lecture (défaut : langueAudio du quiz, sinon en-GB)
     q.notes : ['C4','E4','G4']  notes jouées l'une après l'autre (C4 = do du milieu ;
                                 '#' ou 'b' acceptés ; ['C4','E4','G4'] imbriqué = accord ; '-' = silence)
     q.portee: true              dessine aussi ces notes sur une portée en clé de sol
     q.portee: 'seule'           portée sans bouton d'écoute (lecture de notes)

   CROCHETS
     avantQuestion(q)            après affichage d'une question non répondue
     quitterQuestion()           avant de quitter une question (ex. couper le son)

   Règles maison intégrées : pas de minuteur, « Question précédente »,
   touche Entrée globale, propositions mélangées, tirage aléatoire,
   récompenses, bouton « SoccaQuiz » (avec le logo), « Refaire mes erreurs »,
   envoi des résultats au suivi, défilement adapté au téléphone.
   ===================================================================== */
(function () {
  let C, state = 'start', shuffled, cur, answers, selected, nbChoisi, lastKey = null;
  const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const MES_QUIZ = `<a class="btn-myquiz" href="index.html"><img src="https:\/\/leian.github.io/UNIVERSALQUIZ/icone-96.png" width="20" height="20" alt="" style="vertical-align:middle;border-radius:4px"> SoccaQuiz</a>`;

  const DECO_DEFAUT = `<svg viewBox="0 0 640 90" xmlns="http:\/\/www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect width="640" height="90" fill="var(--main-bg)"/>
    <circle cx="80" cy="45" r="28" fill="var(--main-light)"/><circle cx="560" cy="45" r="22" fill="var(--main-light)"/>
    <rect x="250" y="25" width="140" height="40" rx="20" fill="var(--main-light)"/>
    <circle cx="200" cy="30" r="6" fill="var(--main-border)"/><circle cx="440" cy="62" r="8" fill="var(--main-border)"/></svg>`;

  /* ---------- outils ---------- */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // comparaison tolérante : accents, majuscules, espaces, ponctuation ; virgule = point
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/\./g, ',').replace(/[^A-Z0-9,]/g, '');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const typeDe = q => { const t = q.type || q.t || 'qcm'; return t === 'saisie' ? 'input' : t; };
  const custom = q => (C.types && C.types[typeDe(q)]) || INTEGRES[typeDe(q)];
  const score = () => answers.filter(x => x && x.ok).length;

  function reponsesAcceptees(q) {
    const base = q.ans || [q.a, ...(q.alt || q.alts || []), ...(q.accept || [])];
    const list = [];
    base.filter(a => a != null && a !== '').forEach(a => { const n = norm(a); list.push(n); if (q.both && n.length === 3) list.push(n.split('').reverse().join('')); });
    return list;
  }
  function bonneSaisie(q, val) { return C.verifier ? !!C.verifier(q, val) : reponsesAcceptees(q).includes(norm(val)); }
  function attendu(q) {
    const t = custom(q);
    if (t && t.attendu) return t.attendu(q);
    if (C.attendu) { const r = C.attendu(q); if (r != null) return r; }
    if (typeDe(q) === 'input') return q.disp || (esc(q.a != null ? q.a : (q.ans || [])[0]) + (q.unit ? ' ' + q.unit : ''));
    return C.optionHTML ? C.optionHTML(q, q.a) : q.a;
  }
  const texteReponse = (q, r) => r ? (r.texte != null ? r.texte : (C.texteReponse ? C.texteReponse(q, r.given) : (typeDe(q) === 'input' ? esc(r.given) : (C.optionHTML ? C.optionHTML(q, r.given) : r.given)))) : '—';
  const texteQuestion = q => C.texteQuestion ? C.texteQuestion(q) : q.q;

  function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(hex, t, base) { const a = hexToRgb(hex), b = base || [255, 255, 255]; return '#' + a.map((v, i) => Math.round(v * (1 - t) + b[i] * t).toString(16).padStart(2, '0')).join(''); }
  function appliquerCouleur(c) {
    if (!c) return;
    const r = document.documentElement.style;
    r.setProperty('--main', c); r.setProperty('--main-dark', mix(c, 0.25, [0, 0, 0]));
    r.setProperty('--main-bg', mix(c, 0.95)); r.setProperty('--main-light', mix(c, 0.85)); r.setProperty('--main-border', mix(c, 0.6));
  }
  // Emoji dessiné (Twemoji, libre de droits, servi gratuitement par jsDelivr) : même rendu sur tous les appareils ;
  // si l'image ne vient pas (hors ligne), l'emoji du téléphone prend sa place.
  const codeEmoji = e => { const cps = [...String(e)].map(c => c.codePointAt(0).toString(16)); return (cps.includes('200d') ? cps : cps.filter(c => c !== 'fe0f')).join('-'); };
  const emojiImg = (e, cls) => e ? `<img class="emo ${cls || ''}" src="https:\/\/cdn.jsdelivr.net/npm/@twemoji/svg@15.0.0/${codeEmoji(e)}.svg" alt="${esc(e)}" draggable="false" onerror="const s=document.createElement('span');s.className=this.className;s.textContent=this.alt;this.replaceWith(s)">` : '';
  function visuel(q) {
    const svg = (C.figure && C.figure(q)) || q.svg || (C.illustrations && C.illustrations[q.cat]);
    if (svg) return `<div class="fig-box">${svg}</div>`;
    // image de la question (img=🐘) ou, à défaut, emoji de sa catégorie (## Catégorie|✂️)
    const ico = C.icones && C.icones[q.cat], emo = q.img || ico;
    if (emo) return `<div class="emo-box">${C.deco || DECO_DEFAUT}${emojiImg(emo, 'emo-grand')}${q.img && ico && ico !== q.img ? emojiImg(ico, 'emo-coin') : ''}</div>`;
    return `<div class="deco-box">${C.deco || DECO_DEFAUT}</div>`;
  }
  const appli = () => document.getElementById('app');

  // grands schémas de la fiche récap : défilables sur petit écran
  function envelopperLarges(root) {
    root.querySelectorAll('svg[viewBox]').forEach(s => {
      if (s.closest('.fig-box, .deco-box, .rw-scroll, .opt-btn, .review-fig, .no-scroll')) return;
      const vb = s.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || vb[2] < 600) return;
      const box = document.createElement('div'); box.className = 'rw-scroll';
      const hint = document.createElement('div'); hint.className = 'rw-hint'; hint.textContent = '👉 Fais glisser de gauche à droite';
      s.parentNode.insertBefore(hint, s); s.parentNode.insertBefore(box, s); box.appendChild(s);
    });
  }
  function defiler(cle, montrerSuivant) {
    if (cle !== lastKey) { lastKey = cle; window.scrollTo(0, 0); return; }
    if (montrerSuivant) {
      const nb = appli().querySelector('.next-btn');
      if (nb && nb.getBoundingClientRect().bottom > window.innerHeight) nb.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  /* ---------- accueil ---------- */
  function renderStart() {
    state = 'start';
    quitter();
    const n = nbChoisi || C.nbQuestions;
    const pills = [`🎯 ${n} questions`, `🃏 ${C.questions.length} questions au total`, '🔀 Tirage aléatoire', ...(C.pills || [])];
    const choix = C.choixNombre ? `<div class="start-choice"><b>Combien de questions ?</b><div>${C.choixNombre.map(k =>
      `<button class="choice-btn ${k === n ? 'on' : ''}" onclick="MoteurQuiz.nombre(${k})">${k}</button>`).join('')}</div></div>` : '';
    appli().innerHTML = `
      <div class="start-card">
        <div class="start-top">${MES_QUIZ}</div>
        <div class="start-icon">${emojiImg(C.icone || '📝')}</div>
        <div class="start-title">${C.titre}</div>
        <div class="start-subtitle">${C.sousTitre || ''}</div>
        <div class="start-infos">${pills.map(p => `<span class="info-pill">${p}</span>`).join('')}</div>
        ${choix}
        <button class="start-btn" onclick="MoteurQuiz.start()">▶ Commencer le quiz</button>
        <div class="start-hint">Astuce : la touche Entrée valide et passe à la suite.</div>
        ${typeof C.accueilHTML === 'function' ? C.accueilHTML() : (C.accueilHTML || '')}
      </div>`;
    envelopperLarges(appli());
    defiler('start');
  }

  function preparerQuestion(q) {
    const p = preparerQuestion0(q);
    Object.defineProperty(p, '_orig', { value: q._orig || q, enumerable: false, configurable: true });
    return p;
  }
  function preparerQuestion0(q) {
    const t = typeDe(q);
    if (t === 'vf') return { ...q, type: 'qcm', opts: shuffle(['Vrai', 'Faux']), a: q.a === true ? 'Vrai' : q.a === false ? 'Faux' : q.a };
    if (t === 'qcm' && Array.isArray(q.opts)) return { ...q, type: 'qcm', opts: (q.garderOrdre || q.fixed) ? [...q.opts] : shuffle(q.opts) };
    return { ...q, type: t };
  }

  function startQuiz(liste) {
    quitter();
    const n = Math.min(nbChoisi || C.nbQuestions, C.questions.length);
    const base = liste || (C.preparer ? C.preparer(n) : shuffle(C.questions).slice(0, n));
    shuffled = base.map(preparerQuestion);
    cur = 0; answers = []; selected = null;
    state = 'q';
    if (window.Suivi) Suivi.debut();
    renderQuestion();
  }

  /* ---------- réponses ---------- */
  function enregistrer(donne, ok, texte) {
    if (selected !== null) return;
    selected = donne === undefined ? '' : donne;
    answers[cur] = { given: donne, ok: !!ok, texte };
    renderQuestion();
    if (ok && window.celebrate) celebrate();
  }
  function handleAnswer(idx) {
    if (selected !== null) return;
    const q = shuffled[cur], opt = q.opts[idx];
    enregistrer(opt, opt === q.a);
  }
  function validateInput() {
    if (selected !== null) return;
    const q = shuffled[cur], inp = document.getElementById('ans-input');
    if (!inp) return;
    const val = inp.value.trim();
    if (!val) { inp.focus(); return; }
    enregistrer(val, bonneSaisie(q, val));
  }
  function montrerIndice() { const h = document.getElementById('hint-text'), b = document.getElementById('hint-btn'); if (h) h.style.display = ''; if (b) b.remove(); }

  /* ---------- écoute : phrase lue (synthèse vocale) et notes de musique ---------- */
  const LETTRES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FR = { DO: 'C', UT: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
  // 'C4', 'F#4', 'Bb3' (notation internationale) ou 'do3', 'fa#3' (notation française : do3 = C4)
  function lireNote(n) {
    const t = String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/♯/g, '#').replace(/♭/g, 'b').trim();
    let m = t.match(/^([A-Ga-g])([#b]?)(\d)?$/), dec = 0;
    if (!m) { m = t.match(/^(do|ut|re|mi|fa|sol|la|si)([#b]?)(\d)?$/i); if (!m) return null; m = [m[0], FR[m[1].toUpperCase()], m[2], m[3]]; dec = 1; }
    const L = m[1].toUpperCase(), oct = (m[3] == null ? 4 : +m[3] + dec), alt = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return { midi: 12 * (oct + 1) + LETTRES[L] + alt, pas: oct * 7 + 'CDEFGAB'.indexOf(L), alt };
  }
  const sequence = q => (Array.isArray(q.notes) ? q.notes : []).map(x => (Array.isArray(x) ? x : [x]).map(lireNote).filter(Boolean));

  let actx = null, sons = [];
  function couperSon() {
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
    sons.forEach(o => { try { o.stop(); } catch (e) {} }); sons = [];
  }
  function jouerNotes(q) {
    couperSon();
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
    const pas = 0.55; let t = actx.currentTime + 0.06;
    sequence(q).forEach(accord => {
      accord.forEach(n => {
        const f = 440 * Math.pow(2, (n.midi - 69) / 12);
        [[1, 1], [2, 0.28], [3, 0.1]].forEach(([k, a]) => {       // fondamentale + deux harmoniques : son doux, proche d'un piano
          const o = actx.createOscillator(), g = actx.createGain();
          o.type = 'sine'; o.frequency.value = f * k;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.22 * a / Math.sqrt(accord.length), t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + pas * 1.7);
          o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + pas * 1.8); sons.push(o);
        });
      });
      t += pas;
    });
  }
  function direPhrase(q, lent) {
    couperSon();
    if (!('speechSynthesis' in window)) return;
    const langue = q.langue || C.langueAudio || 'en-GB';
    const u = new SpeechSynthesisUtterance(String(q.dire));
    u.lang = langue; u.rate = lent ? 0.6 : 0.9;
    const voix = speechSynthesis.getVoices(), base = langue.slice(0, 2).toLowerCase();
    const v = voix.find(x => x.lang.replace('_', '-').toLowerCase() === langue.toLowerCase()) || voix.find(x => x.lang.toLowerCase().startsWith(base));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  function ecouter(quoi) {
    const q = shuffled && shuffled[cur]; if (!q) return;
    if (quoi === 'notes') jouerNotes(q); else direPhrase(q, quoi === 'lent');
  }
  function porteeSVG(q) {
    const seq = sequence(q); if (!seq.length) return '';
    const bas = 92, demi = 7, x0 = 96, dx = Math.min(64, 300 / seq.length);        // bas = ligne du mi (E4), demi = demi-interligne
    let s = '';
    for (let i = 0; i < 5; i++) s += `<line x1="16" x2="${Math.max(420, x0 + dx * seq.length + 10)}" y1="${bas - i * 2 * demi}" y2="${bas - i * 2 * demi}" stroke="#334155" stroke-width="1.4"/>`;
    s += `<text x="20" y="${bas + 9}" font-size="78" fill="#1e293b" font-family="'Noto Music','Segoe UI Symbol','Apple Symbols','Bravura',serif">𝄞</text>`;
    seq.forEach((accord, i) => accord.forEach(n => {
      const p = n.pas - 30, x = x0 + i * dx, y = bas - p * demi;                   // 30 = pas du mi4
      for (let l = -2; l >= p; l -= 2) s += `<line x1="${x - 16}" x2="${x + 16}" y1="${bas - l * demi}" y2="${bas - l * demi}" stroke="#334155" stroke-width="1.4"/>`;
      for (let l = 10; l <= p; l += 2) s += `<line x1="${x - 16}" x2="${x + 16}" y1="${bas - l * demi}" y2="${bas - l * demi}" stroke="#334155" stroke-width="1.4"/>`;
      if (n.alt) s += `<text x="${x - 26}" y="${y + 6}" font-size="20" fill="#1e293b">${n.alt > 0 ? '♯' : '♭'}</text>`;
      s += `<ellipse cx="${x}" cy="${y}" rx="9.5" ry="6.8" fill="#1e293b" transform="rotate(-18 ${x} ${y})"/>`;
      s += p < 4 ? `<line x1="${x + 8.6}" x2="${x + 8.6}" y1="${y - 2}" y2="${y - 44}" stroke="#1e293b" stroke-width="2"/>`
                 : `<line x1="${x - 8.6}" x2="${x - 8.6}" y1="${y + 2}" y2="${y + 44}" stroke="#1e293b" stroke-width="2"/>`;
    }));
    return `<div class="portee"><svg viewBox="0 0 ${Math.max(440, x0 + dx * seq.length + 30)} 150" xmlns="http:\/\/www.w3.org/2000/svg" role="img" aria-label="Portée en clé de sol">${s}</svg></div>`;
  }
  function blocEcoute(q, repondu) {
    let h = '';
    if (q.portee && q.notes) h += porteeSVG(q);
    const b = [];
    if (q.dire) b.push(`<button class="ecoute-btn" onclick="MoteurQuiz.ecouter()">🔊 ${repondu ? 'Réécouter' : 'Écouter'}</button><button class="ecoute-btn lent" onclick="MoteurQuiz.ecouter('lent')">🐢 Lentement</button>`);
    if (q.notes && q.portee !== 'seule' && sequence(q).length) b.push(`<button class="ecoute-btn" onclick="MoteurQuiz.ecouter('notes')">🎵 ${repondu ? 'Réécouter' : 'Écouter'}</button>`);
    return h + (b.length ? `<div class="ecoute-row">${b.join('')}</div>` : '');
  }

  /* ---------- types d'exercices intégrés (format en lignes : G, O, A, C, X, N, P, K) ----------
     Tout se fait en touchant l'écran (pas de glisser-déposer, pénible sur téléphone).
     E garde l'état de l'exercice en cours ; MoteurQuiz._ex(action, n) le modifie puis réaffiche. */
  let E = null;
  const etat = (q, init) => { if (!E || E.q !== q) E = Object.assign({ q }, init()); return E; };
  const ex = (action, n) => `MoteurQuiz._ex('${action}'${n === undefined ? '' : ',' + n})`;
  const NOMS_NOTES = ['do', 'do♯', 'ré', 'ré♯', 'mi', 'fa', 'fa♯', 'sol', 'sol♯', 'la', 'la♯', 'si'];
  const nomNote = m => NOMS_NOTES[((m % 12) + 12) % 12];
  const melangeDifferent = n => { const idx = [...Array(n).keys()]; if (n < 2) return idx; let m; do { m = shuffle(idx); } while (m.every((v, i) => v === i)); return m; };
  const puce = (txt, cls, action, n, off) => `<button type="button" class="ex-puce ${cls || ''}" ${off ? 'disabled' : `onclick="${ex(action, n)}"`}>${txt}</button>`;
  const valider = (pret, action) => pret ? `<button class="validate-btn ex-valider" onclick="${ex(action)}">Valider ✓</button>` : '';
  const trousDe = q => { const parts = []; String(q.texte || '').split(/\[([^\]]+)\]/).forEach((p, i) => parts.push(i % 2 ? { rep: p.split(';').map(s => s.trim()).filter(Boolean) } : { txt: p })); return parts; };
  const motsDe = q => { const t = []; String(q.texte || '').replace(/\*([^*]+)\*|([^\s*]+)/g, (m, bon, autre) => { t.push({ mot: bon || autre, bon: !!bon }); }); return t; };
  function jouerMidi(m) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + 0.02, f = 440 * Math.pow(2, (m - 69) / 12);
    [[1, 1], [2, 0.28], [3, 0.1]].forEach(([k, a]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f * k;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * a, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 1); sons.push(o);
    });
  }
  const motsNorm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  function ressemblance(cible, dit) {                    // part des mots de la phrase modèle retrouvés, dans l'ordre
    const a = motsNorm(cible), b = motsNorm(dit); if (!a.length) return b.length ? 1 : 0;
    let j = 0, ok = 0; a.forEach(m => { const k = b.indexOf(m, j); if (k >= 0) { ok++; j = k + 1; } });
    return ok / a.length;
  }
  // Brave (comme Firefox) n'a pas le service de reconnaissance vocale de Google : on y propose seulement l'auto-évaluation
  const Reco = () => navigator.brave ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);

  const INTEGRES = {
    // G : texte à trous — G|Il [a] faim et [est;était] fatigué.|explication
    trous: {
      corps(q, c) {
        let k = 0;
        const html = trousDe(q).map(p => {
          if (p.txt != null) return esc(p.txt);
          const i = k++;
          if (!c.repondu) return `<input class="ex-trou" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:${Math.max(4, p.rep[0].length + 2)}ch">`;
          const donne = (Array.isArray(c.donne) ? c.donne : [])[i] || '', bon = p.rep.map(norm).includes(norm(donne));
          return `<span class="ex-mot ${bon ? 'ok' : 'ko'}">${esc(donne || '…')}</span>`;
        }).join('');
        return `<div class="ex-texte">${html}</div>${c.repondu ? '' : `<button class="validate-btn ex-valider" onclick="${ex('trous')}">Valider ✓</button>`}`;
      },
      monter(q, c) { if (!c.repondu) { const i = document.querySelector('.ex-trou'); if (i) setTimeout(() => i.focus(), 30); } },
      entree: () => actionExercice('trous'),
      attendu: q => trousDe(q).map(p => p.txt != null ? esc(p.txt) : `<b>${esc(p.rep[0])}</b>`).join('')
    },
    // O : remettre dans l'ordre — O|consigne|élément 1|élément 2|élément 3 (écrits dans le bon ordre)
    ordre: {
      corps(q, c) {
        const s = etat(q, () => ({ melange: melangeDifferent(q.items.length), choisis: [] }));
        const choix = c.repondu ? (Array.isArray(c.donne) ? c.donne : []) : s.choisis;
        const rep = choix.map((i, p) => puce(esc(q.items[i]), c.repondu ? (i === p ? 'ok' : 'ko') : 'pose', 'ordre-retirer', p, c.repondu)).join('');
        const reste = c.repondu ? '' : s.melange.filter(i => !s.choisis.includes(i)).map(i => puce(esc(q.items[i]), '', 'ordre-ajouter', i)).join('');
        return `<div class="ex-zone"><div class="ex-legende">Ta réponse (touche un élément pour le retirer)</div><div class="ex-ligne ordre">${rep || '<span class="ex-vide">Touche les éléments dans l\'ordre…</span>'}</div></div>` +
          (reste ? `<div class="ex-ligne">${reste}</div>` : '') + valider(!c.repondu && s.choisis.length === q.items.length, 'ordre-valider');
      },
      attendu: q => q.items.map(esc).join(' → ')
    },
    // A : associer — A|consigne|dog=chien|cat=chat
    paires: {
      corps(q, c) {
        const s = etat(q, () => ({ droite: melangeDifferent(q.paires.length), sel: null, lien: {} }));
        const lien = c.repondu ? (c.donne && typeof c.donne === 'object' ? c.donne : {}) : s.lien;
        const numDroite = {}; Object.keys(lien).forEach(g => { numDroite[lien[g]] = +g; });
        const gauche = q.paires.map((p, i) => {
          const lie = lien[i] != null, cls = c.repondu ? (lien[i] === i ? 'ok' : 'ko') : (s.sel === i ? 'choisi' : lie ? 'pose' : '');
          return puce((lie ? `<span class="ex-num">${i + 1}</span>` : '') + esc(p[0]), cls, 'paire-g', i, c.repondu);
        }).join('');
        const droite = s.droite.map(j => {
          const g = numDroite[j], cls = c.repondu ? (g === j ? 'ok' : g == null ? '' : 'ko') : g != null ? 'pose' : '';
          return puce((g != null ? `<span class="ex-num">${g + 1}</span>` : '') + esc(q.paires[j][1]), cls, 'paire-d', j, c.repondu);
        }).join('');
        return `${c.repondu ? '' : '<div class="ex-legende">Touche un élément à gauche, puis celui qui va avec à droite.</div>'}<div class="ex-paires"><div class="ex-col">${gauche}</div><div class="ex-col">${droite}</div></div>` +
          valider(!c.repondu && Object.keys(s.lien).length === q.paires.length, 'paire-valider');
      },
      attendu: q => q.paires.map(p => esc(p[0]) + ' = ' + esc(p[1])).join(' ; ')
    },
    // C : classer — C|consigne|Noms: table;chat|Verbes: courir;lire
    classer: {
      corps(q, c) {
        const tous = []; q.groupes.forEach((g, gi) => g.items.forEach(t => tous.push({ t, gi })));
        const s = etat(q, () => ({ ordre: shuffle([...tous.keys()]), sel: null, place: {} }));
        const place = c.repondu ? (c.donne && typeof c.donne === 'object' ? c.donne : {}) : s.place;
        const libres = c.repondu ? '' : s.ordre.filter(i => place[i] == null).map(i => puce(esc(tous[i].t), s.sel === i ? 'choisi' : '', 'classer-choisir', i)).join('');
        const cases = q.groupes.map((g, gi) => {
          const dedans = s.ordre.filter(i => place[i] === gi).map(i => puce(esc(tous[i].t), c.repondu ? (tous[i].gi === gi ? 'ok' : 'ko') : 'pose', 'classer-retirer', i, c.repondu)).join('');
          return `<div class="ex-case" ${c.repondu ? '' : `onclick="if(event.target===this||event.target.classList.contains('ex-case-nom'))${ex('classer-poser', gi)}"`}><div class="ex-case-nom">${esc(g.nom)}</div><div class="ex-ligne">${dedans}</div></div>`;
        }).join('');
        return `${c.repondu ? '' : '<div class="ex-legende">Touche un élément, puis la case où il va.</div>'}${libres ? `<div class="ex-ligne">${libres}</div>` : ''}<div class="ex-cases">${cases}</div>` +
          valider(!c.repondu && Object.keys(s.place).length === tous.length, 'classer-valider');
      },
      attendu: q => q.groupes.map(g => '<b>' + esc(g.nom) + '</b> : ' + g.items.map(esc).join(', ')).join(' ; ')
    },
    // X : toucher les mots demandés — X|Touche les verbes.|Le chat *dort* et *ronronne*.|explication
    cliquer: {
      corps(q, c) {
        const s = etat(q, () => ({ sel: [] }));
        const sel = c.repondu ? (Array.isArray(c.donne) ? c.donne : []) : s.sel;
        const mots = motsDe(q).map((m, i) => {
          const pris = sel.includes(i);
          const cls = c.repondu ? (m.bon && pris ? 'ok' : m.bon ? 'manque' : pris ? 'ko' : '') : pris ? 'choisi' : '';
          return `<button type="button" class="ex-motbtn ${cls}" ${c.repondu ? 'disabled' : `onclick="${ex('cliquer', i)}"`}>${esc(m.mot)}</button>`;
        }).join(' ');
        return `<div class="ex-texte">${mots}</div>` + valider(!c.repondu && s.sel.length > 0, 'cliquer-valider');
      },
      attendu: q => motsDe(q).filter(m => m.bon).map(m => '<b>' + esc(m.mot) + '</b>').join(', ')
    },
    // N : nombre avec tolérance — N|√2 ≈ ?|1,414|0,01|explication
    nombre: {
      corps(q, c) {
        return `<div class="input-row"><input id="ans-input" class="ans-input ${c.repondu ? (c.ok ? 'ok' : 'ko') : ''}" inputmode="decimal" autocomplete="off" value="${c.repondu ? esc(c.donne) : ''}" ${c.repondu ? 'disabled' : ''} placeholder="Ta réponse…">` +
          `${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ''}${c.repondu ? '' : `<button class="validate-btn" onclick="${ex('nombre')}">Valider ✓</button>`}</div>`;
      },
      monter(q, c) { if (!c.repondu) { const i = document.getElementById('ans-input'); if (i) setTimeout(() => i.focus(), 30); } },
      entree: () => actionExercice('nombre'),
      attendu: q => esc(String(q.a).replace('.', ',')) + (q.tol ? ' (à ' + esc(String(q.tol).replace('.', ',')) + ' près)' : '') + (q.unit ? ' ' + esc(q.unit) : '')
    },
    // P : parler au micro — P|Répète.|I would like a glass of water.  (* = réponse libre)
    parler: {
      corps(q, c) {
        const s = etat(q, () => ({ ecoute: false, entendu: '', erreur: '' }));
        const libre = q.phrase === '*';
        if (c.repondu) return `<div class="ex-zone">${c.donne ? `<div class="ex-legende">J'ai entendu :</div><div class="ex-entendu">« ${esc(c.donne)} »</div>` : ''}</div>`;
        const micro = Reco() ? `<button class="ecoute-btn ex-micro ${s.ecoute ? 'actif' : ''}" onclick="${ex('parler')}">${s.ecoute ? '🎙️ Je t\'écoute…' : '🎤 Parler'}</button>` : '';
        return (libre ? '' : `<div class="ex-phrase">${esc(q.phrase)}</div>`) +
          `<div class="ecoute-row">${micro}</div>` +
          (s.entendu ? `<div class="ex-legende">J'ai entendu :</div><div class="ex-entendu">« ${esc(s.entendu)} »</div>` : '') +
          (s.erreur ? `<div class="input-note">${esc(s.erreur)}</div>` : '') +
          `<div class="ex-legende">${Reco() ? 'Le micro ne marche pas ? ' : ''}Dis-le à voix haute, puis indique si tu as réussi :</div>` +
          `<div class="ecoute-row"><button class="ex-puce ok" onclick="${ex('parler-auto', 1)}">✅ Je l'ai bien dit</button><button class="ex-puce" onclick="${ex('parler-auto', 0)}">🔁 À retravailler</button></div>`;
      },
      attendu: q => q.phrase === '*' ? 'une réponse à voix haute' : esc(q.phrase)
    },
    // K : rejouer une mélodie — K|Rejoue la mélodie.|C4 D4 E4
    clavier: {
      corps(q, c) {
        const cible = sequence(q).map(a => a[0].midi);
        const s = etat(q, () => ({ joue: [] }));
        const joue = c.repondu ? (Array.isArray(c.donne) ? c.donne : []) : s.joue;
        const alt = sequence(q).some(a => a.some(n => n.alt));
        const bas = Math.floor(Math.min(...cible, 60) / 12) * 12, haut = Math.max(Math.ceil((Math.max(...cible, 71) + 1) / 12) * 12 - 1, bas + 11);
        const touches = []; for (let m = bas; m <= haut; m++) if (alt || ![1, 3, 6, 8, 10].includes(m % 12)) touches.push(m);
        const rendu = joue.map((m, i) => `<span class="ex-mot ${c.repondu ? (m === cible[i] ? 'ok' : 'ko') : ''}">${nomNote(m)}</span>`).join(' ');
        return `<div class="ex-zone"><div class="ex-legende">Tes notes (${joue.length}/${cible.length})</div><div class="ex-texte">${rendu || '<span class="ex-vide">Touche les notes du clavier…</span>'}</div></div>` +
          (c.repondu ? '' : `<div class="ex-clavier" style="grid-template-columns:repeat(${Math.min(touches.length, 8)},1fr)">${touches.map(m => `<button type="button" class="ex-touche ${[1, 3, 6, 8, 10].includes(m % 12) ? 'noire' : ''}" onclick="${ex('touche', m)}">${nomNote(m)}</button>`).join('')}</div>` +
            (s.joue.length ? `<button class="ex-puce" onclick="${ex('effacer')}">↺ Effacer</button>` : ''));
      },
      attendu: q => sequence(q).map(a => nomNote(a[0].midi)).join(' ')
    }
  };

  function actionExercice(action, n) {
    const q = shuffled && shuffled[cur]; if (!q || selected !== null) return;
    const s = E && E.q === q ? E : null;
    switch (action) {
      case 'trous': {
        const vals = [...document.querySelectorAll('.ex-trou')].map(i => i.value.trim());
        const vide = [...document.querySelectorAll('.ex-trou')].find(i => !i.value.trim());
        if (vide) { vide.focus(); return; }
        const reps = trousDe(q).filter(p => p.rep);
        return enregistrer(vals, vals.every((v, i) => reps[i] && reps[i].rep.map(norm).includes(norm(v))), vals.map(esc).join(' / '));
      }
      case 'ordre-ajouter': s.choisis.push(n); break;
      case 'ordre-retirer': s.choisis.splice(n, 1); break;
      case 'ordre-valider': return enregistrer(s.choisis.slice(), s.choisis.every((i, p) => q.items[i] === q.items[p]), s.choisis.map(i => esc(q.items[i])).join(' → '));
      case 'paire-g': if (s.lien[n] != null) { delete s.lien[n]; s.sel = null; } else s.sel = s.sel === n ? null : n; break;
      case 'paire-d': {
        if (s.sel == null) { const g = Object.keys(s.lien).find(k => s.lien[k] === n); if (g != null) delete s.lien[g]; break; }
        Object.keys(s.lien).forEach(k => { if (s.lien[k] === n) delete s.lien[k]; });
        s.lien[s.sel] = n; s.sel = null; break;
      }
      case 'paire-valider': return enregistrer(Object.assign({}, s.lien), q.paires.every((p, i) => s.lien[i] === i || q.paires[s.lien[i]] && q.paires[s.lien[i]][1] === p[1]),
        q.paires.map((p, i) => esc(p[0]) + ' = ' + esc(q.paires[s.lien[i]][1])).join(' ; '));
      case 'classer-choisir': s.sel = s.sel === n ? null : n; break;
      case 'classer-poser': if (s.sel == null) return; s.place[s.sel] = n; s.sel = null; break;
      case 'classer-retirer': delete s.place[n]; break;
      case 'classer-valider': {
        const tous = []; q.groupes.forEach((g, gi) => g.items.forEach(t => tous.push({ t, gi })));
        return enregistrer(Object.assign({}, s.place), tous.every((x, i) => s.place[i] === x.gi || q.groupes[s.place[i]].items.includes(x.t)),
          q.groupes.map((g, gi) => '<b>' + esc(g.nom) + '</b> : ' + tous.filter((x, i) => s.place[i] === gi).map(x => esc(x.t)).join(', ')).join(' ; '));
      }
      case 'cliquer': { const k = s.sel.indexOf(n); k >= 0 ? s.sel.splice(k, 1) : s.sel.push(n); break; }
      case 'cliquer-valider': {
        const mots = motsDe(q), bons = mots.map((m, i) => m.bon ? i : -1).filter(i => i >= 0);
        return enregistrer(s.sel.slice(), bons.length === s.sel.length && bons.every(i => s.sel.includes(i)), s.sel.map(i => esc(mots[i].mot)).join(', ') || '—');
      }
      case 'nombre': {
        const inp = document.getElementById('ans-input'), v = inp ? inp.value.trim() : '';
        if (!v) { if (inp) inp.focus(); return; }
        const x = parseFloat(v.replace(/\s/g, '').replace(',', '.')), a = parseFloat(String(q.a).replace(',', '.')), tol = Math.abs(parseFloat(String(q.tol || 0).replace(',', '.'))) || 0;
        return enregistrer(v, isFinite(x) && Math.abs(x - a) <= tol + 1e-9);
      }
      case 'parler': {
        const R = Reco(); if (!R || !s) return;
        if (s.ecoute) { try { s.reco && s.reco.stop(); } catch (e) {} return; }
        couperSon();
        const r = new R(); s.reco = r; r.lang = q.langue || C.langueAudio || 'en-GB'; r.interimResults = false; r.maxAlternatives = 3;
        r.onresult = e => {
          const alts = [...e.results[0]].map(a => a.transcript);
          const meilleur = alts.reduce((b, t) => ressemblance(q.phrase, t) > ressemblance(q.phrase, b) ? t : b, alts[0] || '');
          s.entendu = meilleur; s.ecoute = false;
          const ok = q.phrase === '*' ? !!meilleur.trim() : ressemblance(q.phrase, meilleur) >= 0.75;
          if (ok) return enregistrer(meilleur, true, esc(meilleur));
          s.erreur = 'Presque ! Réécoute le modèle, puis réessaie.'; renderQuestion();
        };
        r.onerror = e => { s.ecoute = false; s.erreur = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Le micro est bloqué. Dans Chrome : touche le cadenas (ou ⓘ) à gauche de l\'adresse → Micro → Autoriser, puis recharge la page. Sinon, utilise les boutons ci-dessous.' : e.error === 'network' ? 'La reconnaissance vocale a besoin d\'internet et de Chrome. Utilise les boutons ci-dessous.' : 'Je n\'ai rien entendu. Réessaie, ou utilise les boutons ci-dessous.'; renderQuestion(); };
        r.onend = () => { if (s.ecoute) { s.ecoute = false; renderQuestion(); } };
        s.ecoute = true; s.erreur = ''; try { r.start(); } catch (e) { s.ecoute = false; }
        break;
      }
      case 'parler-auto': return enregistrer(s && s.entendu || '', !!n, n ? 'réussi (auto-évaluation)' : 'à retravailler (auto-évaluation)');
      case 'touche': {
        jouerMidi(n); s.joue.push(n);
        const cible = sequence(q).map(a => a[0].midi);
        if (s.joue.length >= cible.length) return enregistrer(s.joue.slice(), s.joue.every((m, i) => m === cible[i]), s.joue.map(nomNote).join(' '));
        break;
      }
      case 'effacer': s.joue = []; break;
      default: return;
    }
    renderQuestion();
  }

  function quitter() { couperSon(); if (E && E.reco) try { E.reco.abort(); } catch (e) {} if (C && C.quitterQuestion) try { C.quitterQuestion(); } catch (e) {} }

  function prevQuestion() {
    if (cur === 0) return;
    quitter();
    cur--; answers = answers.slice(0, cur); selected = null;
    renderQuestion();
  }
  function next() {
    quitter();
    if (cur + 1 >= shuffled.length) { renderResult(); return; }
    cur++; selected = null;
    renderQuestion();
  }

  function ctxDe(q) {
    const r = answers[cur];
    return { q, repondu: selected !== null, donne: r ? r.given : null, ok: !!(r && r.ok), repondre: enregistrer, rafraichir: renderQuestion };
  }

  function renderQuestion() {
    const q = shuffled[cur];
    const pct = ((cur + 1) / shuffled.length) * 100;
    const dots = shuffled.map((_, i) => { const r = answers[i]; return `<div class="streak-dot ${r ? (r.ok ? 'correct' : 'wrong') : ''}"></div>`; }).join('');
    const answered = selected !== null;
    const ok = answered && answers[cur] && answers[cur].ok;
    const T = custom(q);

    let body;
    if (T) body = T.corps(q, ctxDe(q));
    else if (q.type === 'qcm') {
      body = `<div class="options-grid ${C.classeOptions ? (C.classeOptions(q) || '') : ''}">${q.opts.map((opt, i) => {
        let cls = 'opt-btn';
        if (answered) cls += opt === q.a ? ' correct' : opt === selected ? ' wrong' : ' neutral';
        return `<button class="${cls}" ${answered ? 'disabled' : ''} onclick="MoteurQuiz.answer(${i})"><span class="opt-letter">${NUMS[i]}</span><span class="opt-body">${C.optionHTML ? C.optionHTML(q, opt) : opt}</span></button>`;
      }).join('')}</div>`;
    } else {
      const indice = q.hint && !answered
        ? (C.indicesVisibles ? `<div class="input-hint">💡 ${q.hint}</div>`
          : `<button class="hint-btn" id="hint-btn" onclick="MoteurQuiz.indice()">💡 Voir un indice</button><div id="hint-text" class="input-hint" style="display:none">💡 ${q.hint}</div>`) : '';
      body = `<div class="input-row">
          <input id="ans-input" class="ans-input ${answered ? (ok ? 'ok' : 'ko') : ''}" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            placeholder="${esc(C.placeholder || 'Ta réponse…')}" value="${answered ? esc(selected) : ''}" ${answered ? 'disabled' : ''}>
          ${q.unit ? `<span class="unit">${q.unit}</span>` : ''}
          ${answered ? '' : '<button class="validate-btn" onclick="MoteurQuiz.validate()">Valider ✓</button>'}
        </div>
        ${indice}
        ${!answered && C.noteSaisie ? `<div class="input-note">${typeof C.noteSaisie === 'function' ? C.noteSaisie(q) : C.noteSaisie}</div>` : ''}`;
    }
    let expBlock = '';
    if (answered) {
      const intro = ok ? '✅ Bonne réponse, bravo !' : `❌ La bonne réponse était : <strong>${attendu(q)}</strong>.`;
      const exp = q.exp || q.e || '';
      expBlock = `<div class="explanation">${intro}${exp ? '<br>' + exp : ''}</div>`;
    }
    const nextLabel = cur + 1 >= shuffled.length ? 'Voir le résultat ›' : 'Question suivante ›';

    appli().innerHTML = `
      <div class="top-bar"><span class="counter">Question ${cur + 1} / ${shuffled.length}</span><span class="score-badge">⭐ ${score()} pts</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="ctrl-bar">
        <button class="btn-prev" onclick="MoteurQuiz.prev()" ${cur === 0 ? 'disabled' : ''}>◀ Question précédente</button>
        ${MES_QUIZ}
      </div>
      <div class="streak-bar">${dots}</div>
      <div class="question-card">
        <span class="cat-tag">${q.cat || ''}</span>
        ${visuel(q)}
        <div class="question-text">${texteQuestion(q)}</div>
        ${C.blocQuestion ? (C.blocQuestion(q, answered) || '') : ''}
        ${blocEcoute(q, answered)}
        ${body}
        ${expBlock}
      </div>
      ${answered ? `<div class="clearfix"><button class="next-btn" onclick="MoteurQuiz.next()">${nextLabel}</button></div>` : ''}`;
    defiler('q' + cur, answered);
    if (T && T.monter) T.monter(q, ctxDe(q));
    if (!answered) {
      if (q.type === 'input') { const inp = document.getElementById('ans-input'); if (inp) setTimeout(() => inp.focus(), 30); }
      if (C.avantQuestion) try { C.avantQuestion(q); } catch (e) { console.warn(e); }
    }
  }

  /* ---------- résultats ---------- */
  function renderResult() {
    state = 'result';
    const sc = score(), n = shuffled.length, pct = Math.round((sc / n) * 100);
    let msg, emoji;
    if (pct >= 85) { msg = C.msgExcellent || 'Excellent travail ! Tu maîtrises ce chapitre.'; emoji = '🏅'; }
    else if (pct >= 60) { msg = C.msgBien || 'Bravo ! Tu connais bien ce chapitre.'; emoji = '👍'; }
    else if (pct >= 40) { msg = 'Pas mal, mais il reste quelques points à revoir.'; emoji = '📖'; }
    else { msg = 'Continue à réviser, tu vas y arriver !'; emoji = '💪'; }

    const catStats = {};
    shuffled.forEach((q, i) => { const c = q.cat || '—'; catStats[c] = catStats[c] || { ok: 0, total: 0 }; catStats[c].total++; if (answers[i] && answers[i].ok) catStats[c].ok++; });
    const catRows = Object.entries(catStats).map(([cat, s]) => {
      const p = Math.round((s.ok / s.total) * 100), color = p >= 70 ? '#16a34a' : p >= 40 ? '#d97706' : '#dc2626';
      return `<tr><td>${cat}</td><td>${s.ok}/${s.total}</td><td><div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:${color}"></div></div></td></tr>`;
    }).join('');

    const wrong = shuffled.map((q, i) => ({ q, i, r: answers[i] })).filter(x => !x.r || !x.r.ok);
    const wrongHtml = wrong.map(item => {
      const svg = (C.figure && C.figure(item.q)) || item.q.svg;
      const exp = item.q.exp || item.q.e || '';
      return `<div class="review-item">
          <div class="review-item-num">Question ${item.i + 1} · ${item.q.cat || ''}</div>
          ${svg ? `<div class="review-fig">${svg}</div>` : ''}
          <div class="review-item-q">${texteQuestion(item.q)}</div>
          <div class="review-item-answers">
            <div class="review-ans wrong-ans"><span class="review-ans-label">Ta réponse</span><span>${texteReponse(item.q, item.r)}</span></div>
            <div class="review-ans correct-ans"><span class="review-ans-label">Bonne réponse</span><span>${attendu(item.q)}</span></div>
          </div>
          ${exp ? `<div class="review-exp">💡 ${exp}</div>` : ''}
        </div>`;
    }).join('');
    const reviewSection = wrong.length === 0
      ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:1rem;text-align:center;margin-top:2rem;color:#14532d;font-weight:600;">🎉 Parfait ! Aucune erreur à réviser.</div>`
      : `<div class="review-section"><div class="review-title">❌ ${wrong.length} question${wrong.length > 1 ? 's' : ''} à réviser</div>${wrongHtml}</div>`;
    let memo = '';
    try { memo = typeof C.memo === 'function' ? C.memo() : (C.memo || ''); } catch (e) { console.warn('memo', e); }

    appli().innerHTML = `
      <div class="result-card">
        <div style="font-size:3rem;margin-bottom:0.5rem">${emoji}</div>
        <div class="result-score">${sc}<span style="font-size:28px;color:#6b7280">/${n}</span></div>
        <div class="result-label">${pct}% de bonnes réponses</div>
        <div class="result-msg">${msg}</div>
        <table class="cat-table"><thead><tr><th>Thème</th><th>Score</th><th>Résultat</th></tr></thead><tbody>${catRows}</tbody></table>
        <p style="font-size:13px;color:#6b7280;margin-bottom:0.5rem">Les questions changent à chaque partie !</p>
        <div class="result-btns">
          <button class="btn-replay" onclick="MoteurQuiz.start()">🔄 Rejouer</button>
          ${wrong.length ? `<button class="btn-home" onclick="MoteurQuiz.erreurs()">🎯 Refaire mes erreurs (${wrong.length})</button>` : ''}
          <button class="btn-home" onclick="MoteurQuiz.home()">↩ Début du quiz</button>
          ${MES_QUIZ}
        </div>
        ${reviewSection}
        ${memo}
      </div>`;
    envelopperLarges(appli());
    defiler('result');

    if (window.Suivi) Suivi.enregistrer({
      titre: C.titre, matiere: C.matiere, score: sc, total: n,
      questions: shuffled.map((q, i) => ({ q: texteQuestion(q), cat: q.cat, donne: answers[i] ? texteReponse(q, answers[i]) : '', attendu: attendu(q), ok: !!(answers[i] && answers[i].ok) }))
    });
    if (sc === n && window.Badges && Badges.gagner()) {
      const msgEl = appli().querySelector('.result-msg');
      if (msgEl) msgEl.insertAdjacentHTML('afterend', `<div class="bp-nouveau">${Badges.badgeHTML()}<div><b>Nouveau badge gagné !</b>Sans aucune faute : le badge « ${Badges.titre() || C.titre} » rejoint tes récompenses.</div></div>`);
    }
    if ((n - sc) / n < 0.25 && window.showCapybara) setTimeout(showCapybara, 500);
  }
  function refaireErreurs() {
    // repart des questions d'origine, en remettant à zéro les états de manipulation (rangement, clic…)
    const liste = shuffled.filter((q, i) => !(answers[i] && answers[i].ok)).map(q => {
      const o = { ...(q._orig || q) };
      ['picked', 'built'].forEach(k => { if (Array.isArray(o[k])) o[k] = []; });
      if ('clicked' in o) o.clicked = null;
      return o;
    });
    if (liste.length) startQuiz(liste);
  }

  /* ---------- badges (section « Mes récompenses ») ---------- */
  function script(src) {
    return new Promise(ok => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ok; document.head.appendChild(s); });
  }
  async function chargerBadges() {
    if (C.badges === false) return;
    const base = (document.querySelector('script[src*="moteur-quiz.js"]') || {}).src || 'commun/moteur-quiz.js';
    const dossier = base.replace(/moteur-quiz\.js.*$/, '');
    if (!window.QUIZ) await script(dossier + 'catalogue.js');
    if (!window.Badges) await script(dossier + 'badges.js');
    if (window.Badges) Badges.monter();
  }

  /* ---------- touche Entrée (écouteur global) ---------- */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.repeat || !C) return;
    const capy = document.getElementById('capy-overlay');
    if (capy) { e.preventDefault(); if (window.closeCapybara) closeCapybara(); else capy.remove(); return; }
    if (state === 'start') { e.preventDefault(); startQuiz(); return; }
    if (state !== 'q') return;
    const q = shuffled[cur], T = custom(q);
    if (selected !== null) { e.preventDefault(); next(); return; }
    if (T) { if (T.entree) { e.preventDefault(); T.entree(ctxDe(q)); } return; }
    if (q.type === 'input') { e.preventDefault(); validateInput(); }
  });

  window.MoteurQuiz = {
    lancer(cfg) {
      C = Object.assign({ nbQuestions: 20 }, cfg);
      C.questions.forEach(q => {
        if (!q || typeof q !== 'object') return;
        Object.defineProperty(q, '_orig', { value: q, enumerable: false, configurable: true });
        // X dont tous les mots sont à toucher = phrase à reconstituer : on la joue en « remettre dans l'ordre », mots mélangés
        if (q.type === 'cliquer') { const m = motsDe(q); if (m.length >= 2 && m.length <= 8 && m.every(x => x.bon)) { q.type = 'ordre'; q.items = m.map(x => x.mot); } }
      });
      if (C.titre) document.title = 'Quiz – ' + C.titre.replace(/<[^>]+>/g, '');
      appliquerCouleur(C.couleur);
      if (!document.getElementById('app')) { const d = document.createElement('div'); d.className = 'container'; d.id = 'app'; document.body.prepend(d); }
      renderStart();
      chargerBadges();
    },
    start: () => startQuiz(), home: renderStart, answer: handleAnswer, validate: validateInput, prev: prevQuestion, next,
    ecouter, indice: montrerIndice, erreurs: refaireErreurs, repondre: (d, ok, t) => enregistrer(d, ok, t),
    nombre(k) { nbChoisi = k; renderStart(); },
    rafraichir: () => renderQuestion(),
    _ex: (action, n) => actionExercice(action, n),
    angle: s => `<span class="ang">${s}</span>`,           // notation d'angle avec chapeau
    shuffle, norm, esc,
    _etat: () => ({ state, shuffled, cur, answers, selected, pool: C ? C.questions.length : 0 })      // pour les tests
  };
})();
