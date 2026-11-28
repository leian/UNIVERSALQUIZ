/* =====================================================================
   MOTEUR DE QUIZ — commun à tous les quiz SoccaQuiz
   ---------------------------------------------------------------------
   Une page de quiz charge :
     commun/moteur-quiz.css, commun/suivi.js, commun/recompenses.js,
     commun/moteur-quiz.js
   puis appelle MoteurQuiz.lancer({ … }) avec ses données.

   CONFIGURATION
     titre, sousTitre (HTML), icone, matiere, couleur ('#0f766e')
     html (false)                textes des questions (q, opts, a, exp, hint, cat, titre…) en HTML libre ;
                                 sinon ils sont échappés (seules b, i, em, strong, u, sup, sub, br, small, mark passent)
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
     verifier(q, valeur) → bool  vérification personnalisée (défaut : comparer(), voir « correction des réponses »)
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

   APPRENTISSAGE (données posées par le serveur dans window.__UQ.maitrise)
     tirage intelligent          questions nouvelles, ratées ou de notions fragiles tirées plus souvent
     passage à l'écrit           QCM réussi 2 fois de suite → revient en réponse à écrire (bouton « Voir les propositions »)
     notions                     niveau de chaque catégorie sur l'accueil du quiz
     q.hint (indice=…)           bouton « Voir un indice » sur tous les types ; réponse juste avec l'indice = demi-réussite
     défi en famille             deux joueurs à tour de rôle sur le même appareil, sans enjeu

   Règles maison intégrées : pas de minuteur, « Question précédente »,
   touche Entrée globale, propositions mélangées, tirage aléatoire,
   récompenses, bouton « SoccaQuiz » (avec le logo), « Refaire mes erreurs »,
   envoi des résultats au suivi, défilement adapté au téléphone.
   ===================================================================== */
(function () {
  let C, state = 'start', shuffled, cur, answers, selected, nbChoisi, lastKey = null, indicesVus = new Set(), duel = null;
  let mode = 'normal', lu = null;      // mode de la partie (normal, erreurs, duel) ; question déjà lue à voix haute
  const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8'];
  /* icônes à traits (style Lucide, licence ISC), cohérentes avec le site et l'espace parent */
  const ICQ = {
    prec: '<path d="m15 18-6-6 6-6"/>',
    etoile: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    cible: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    debut: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    rejouer: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    chrono: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    liste: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    melange: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    duo: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9"/>',
    crayon: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    drapeau: '<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    trophee: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'
  };
  const ic = (n, st) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"${st ? ` style="${st}"` : ''}>${ICQ[n]}</svg>`;
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
  /* ---------- correction des réponses écrites : une seule comparaison pour tout le moteur ----------
     forme(s, niveau) : minuscules, ’ = ', œ = oe, æ = ae, − et – = -, espaces unifiés, ponctuation retirée ;
     signes gardés : - + / < > = % ² ³ ° π × ÷ ≤ ≥ ≠ √ et la virgule décimale (le point devient virgule).
       niveau {}                      tolérant : sans accents, sans apostrophes, sans espaces (cas général)
       STRICT                         accents, apostrophes et espaces comptent (trous G, quiz de français)
       SANS_ACC                       comme STRICT, accents et apostrophes en moins : repère « juste à un accent près » */
  const SIGNES = '\\-+/<>=%²³°π×÷≤≥≠√';
  const STRICT = { acc: 1, apos: 1, esp: 1 }, SANS_ACC = {};
  const RE_GARDE = new RegExp(`[^\\p{L}\\p{N}\\s'\\u0001${SIGNES}]`, 'gu'), RE_SIGNE = new RegExp(`\\s*([${SIGNES},])\\s*`, 'g');
  function forme(s, n) {
    n = n || {};
    let t = String(s ?? '').normalize('NFC').replace(/[’‘ʼ´`]/g, "'").replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
      .replace(/[−–—]/g, '-').replace(/[\u00a0\u202f]/g, ' ').toLowerCase();
    if (!n.acc) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/(\d)\s*[.,]\s*(?=\d)/g, '$1\u0001')                  // virgule (ou point) décimale
      .replace(/(\d)\s*[h:]\s*(?=\d\d(?!\d))/g, '$1h')                   // 8:30 = 8 h 30 = 8h30
      .replace(RE_GARDE, ' ').replace(/\u0001/g, ',').replace(/\s*'\s*/g, "'");
    if (!n.apos) t = t.replace(/'/g, '');
    t = t.replace(RE_SIGNE, '$1').replace(/\s+/g, ' ').trim();
    // tolérant : « arc en ciel » = « arc-en-ciel », « covid 19 » = « COVID-19 », « kmh » = « km/h »
    if (!n.esp) t = t.replace(/\s+/g, '').replace(/(\p{L})-(?=\p{L})/gu, '$1').replace(/(\p{L})-(?=\p{N})|(\p{N})-(?=\p{L})/gu, '$1$2').replace(/(\p{L})\/(?=\p{L})/gu, '$1');
    return t;
  }
  const norm = s => forme(s);              // (ancien nom, gardé pour les quiz faits à la main)
  // nombre éventuellement suivi d'une unité courante : '2,50' '12 cm' '1 000' '-3' '25 cm²' → { v, u } ; sinon null
  const UNITES = /^(?:[mcdk]?m[23]?|dam|hm|[mcdk]?g|t|[mcdh]?l|s|min|h|j|jours?|ans?|°c?|%|€|euros?|centimes?|ha|km\/h|m\/s)?$/;
  function nombre(s) {
    const t = String(s ?? '').replace(/[−–—]/g, '-').replace(/[\u00a0\u202f]/g, ' ').trim().replace(/(\d) (?=\d{3}(?!\d))/g, '$1');
    const m = t.match(/^([+-]?)\s*(\d+(?:[.,]\d+)?|[.,]\d+)\s*(.*)$/); if (!m) return null;
    const u = forme(m[3]).replace(/²/g, '2').replace(/³/g, '3');
    return UNITES.test(u) ? { v: parseFloat(m[1] + m[2].replace(',', '.')), u } : null;
  }
  // articles tolérés des deux côtés (a, an, the : quiz d'anglais seulement, « a » est aussi un verbe en français)
  function sansArticle(s, angl) {
    const t = String(s ?? '').trim().replace(/[’‘ʼ]/g, "'");
    const m = t.match(/^(les|le|la|une|un|des|du|de la|the|an|a)\s+(\S.*)$/i);
    if (m && (angl || !/^(the|an|a)$/i.test(m[1]))) return m[2];
    const l = t.match(/^(?:de )?l'\s*(\S.*)$/i);
    return l ? l[1] : t;
  }
  const estArticle = (s, angl) => { const t = String(s ?? '').trim().toLowerCase().replace(/[’‘ʼ]/g, "'"); return ['le', 'la', 'les', 'l\'', 'un', 'une', 'des', 'du', 'de la', 'de l\''].includes(t) || (angl && ['the', 'a', 'an'].includes(t)); };
  // règles d'une question : accents exigés pour les trous et en français ; mauvais choix connus (QCM d'origine)
  function regles(q) {
    const o = (q && q._orig) || q || {}, mat = o.mat || C.matiere;
    return {
      strict: typeDe(q) === 'trous' || mat === 'francais',
      angl: mat === 'anglais' || /^en/i.test(o.langue || C.langueAudio || ''),
      mauvais: (Array.isArray(o.opts) ? o.opts : []).filter(x => typeof x === 'string'), unit: q.unit
    };
  }
  // 1 = juste ; 2 = juste à un accent ou une apostrophe près (compté faux, avec un message) ; 0 = faux
  function egal(a, v, R) {
    if (!forme(a)) { const b = x => String(x ?? '').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, '').toLowerCase(); return b(a) && b(a) === b(v) ? 1 : 0; }
    const na = nombre(a), nv = nombre(v);
    if (na && nv) return Math.abs(na.v - nv.v) < 1e-9 && (nv.u === na.u || !nv.u || (!na.u && (!R.unit || nv.u === forme(R.unit)))) ? 1 : 0;
    const N = R.strict ? STRICT : {}, sa = x => sansArticle(x, R.angl);
    const paires = [[a, v]];
    // l'article est facultatif, sauf si la réponse est un article ou si un mauvais choix ne diffère que par l'article
    if (!estArticle(a, R.angl) && !R.mauvais.some(w => forme(w, N) !== forme(a, N) && forme(sa(w), N) === forme(sa(a), N))) paires.push([sa(a), sa(v)]);
    if (paires.some(([x, y]) => forme(x, N) === forme(y, N))) return 1;
    return R.strict && paires.some(([x, y]) => forme(x, SANS_ACC) === forme(y, SANS_ACC)) ? 2 : 0;
  }
  function comparer(attendus, v, R) { let r = 0; for (const a of attendus) { const x = egal(a, v, R); if (x === 1) return 1; if (x) r = x; } return r; }

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // texte venant du quiz : échappé (sauf quelques balises de mise en forme sans attribut) ; HTML libre si le quiz déclare html: true
  const BALISES = /&lt;(\/?)(b|i|em|strong|u|sup|sub|br|small|mark)\s*\/?&gt;/gi;
  const H = s => C && C.html ? String(s ?? '') : esc(s)
    .replace(/&amp;(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});/gi, '&$1;')       // &nbsp; &lt; écrits par l'auteur : rendus tels quels (sans danger)
    .replace(BALISES, '<$1$2>')
    // autres balises (span style, img…) d'un quiz fait à la main : retirées, le texte reste ;
    // un quiz créé depuis le site (texte: true) est du texte pur : « <img> » y reste une réponse visible
    .replace(C && C.texte ? /(?!)/ : /&lt;\/?[a-z][a-z0-9]*(?:\s(?:[^&]|&(?!gt;))*?)?\/?&gt;/gi, '');
  // texte seul d'un fragment HTML, sans rien exécuter ni charger
  const texteDe = h => { try { return new DOMParser().parseFromString(String(h ?? ''), 'text/html').body.textContent || ''; } catch (e) { return String(h ?? '').replace(/<[^>]*>/g, ''); } };
  const typeDe = q => { const t = q.type || q.t || 'qcm'; return t === 'saisie' ? 'input' : t; };
  const custom = q => (C.types && C.types[typeDe(q)]) || INTEGRES[typeDe(q)];
  const score = () => answers.filter(x => x && x.ok).length;

  function reponsesAcceptees(q) {
    const base = q.ans || [q.a, ...(q.alt || q.alts || []), ...(q.accept || [])];
    const list = [];
    base.filter(a => a != null && a !== '').forEach(a => { list.push(String(a)); const n = forme(a); if (q.both && n.length === 3) list.push(n.split('').reverse().join('')); });
    return list;
  }
  // 1 juste, 2 juste à un accent près (compté faux), 0 faux
  function bonneSaisie(q, val) {
    if (C.verifier && !q._ecrit) {
      if (C.verifier(q, val)) return 1;
      // vérification propre à un quiz fait à la main : on réessaie sans la ponctuation finale ajoutée par le clavier
      // (double espace = « . » sur Android) ni les guillemets
      const nu = String(val).replace(/^[\s«"“]+|[\s»"”.!?…;:,]+$/gu, '');
      return nu && nu !== val && C.verifier(q, nu) ? 1 : 0;
    }
    return comparer(reponsesAcceptees(q), val, regles(q));
  }
  function attendu(q) {
    const t = custom(q);
    if (t && t.attendu) return t.attendu(q);
    if (C.attendu) { const r = C.attendu(q); if (r != null) return r; }
    if (typeDe(q) === 'input') return q.disp ? H(q.disp) : (esc(q.a != null ? q.a : (q.ans || [])[0]) + (q.unit ? ' ' + esc(q.unit) : ''));
    return C.optionHTML ? C.optionHTML(q, q.a) : dessin(q.a) ? esc(Dessins.nom(q.a)) : H(q.a);
  }
  const texteReponse = (q, r) => r ? (r.texte != null ? r.texte : (C.texteReponse ? C.texteReponse(q, r.given) : (typeDe(q) === 'input' ? esc(r.given) : (C.optionHTML ? C.optionHTML(q, r.given) : dessin(r.given) ? esc(Dessins.nom(r.given)) : H(r.given))))) : '—';
  // dessin du catalogue (labo:becher, danger:corrosif…, voir dessins.js) : le quiz n'écrit que le nom
  const dessin = v => !!(window.Dessins && typeof v === 'string' && Dessins.existe(v));
  const optionsDessins = q => Array.isArray(q.opts) && q.opts.length > 0 && q.opts.every(o => dessin(o) && Dessins.petitPossible(o));
  const optHTML = (q, o) => C.optionHTML ? C.optionHTML(q, o) : optionsDessins(q) ? `<span class="opt-dessin">${Dessins.petit(o)}</span><span class="sr-only">${esc(Dessins.nom(o))}</span>` : dessin(o) ? esc(Dessins.nom(o)) : H(o);
  const texteQuestion = q => C.texteQuestion ? C.texteQuestion(q) : H(q.q);
  // une « phrase d'explication » : au moins 5 mots, ponctuée, nettement plus longue que les autres éléments
  const estPhraseExplication = (t, autres) => { const n = s => String(s).trim().split(/\s+/).length; return n(t) >= 5 && /[.!]$/.test(String(t).trim()) && autres.every(a => n(a) * 2 < n(t)); };

  /* ---------- profils par âge : le thème posé par le serveur sur <html data-theme> règle
     le nombre de questions, le nombre de choix, la lecture à voix haute, les animaux et les statistiques,
     ainsi que le ton des messages ---------- */
  const PROFILS = {
    // récompenses : animaux de plus en plus rares avec l'âge (la mascotte compagne réagit à chaque réponse ;
    // le saut de la mascotte dans le coin de l'écran a été retiré le 22 nov. 2026), emblèmes de niveau au collège, coche sobre au lycée
    petits:       { nb: 8,  choix: 3, lecture: 'auto', animal: 0.2 },
    lecteurs:     { nb: 10, choix: 3, lecture: 'bouton', animal: 0.15 },
    explorateurs: { animal: 0.15 },
    college:      { stats: true, animaux: false, emblemes: true },
    lycee:        { stats: true, animaux: false, coche: true },
    parent:       { stats: true, animaux: false, coche: true }
  };
  const TONS = {
    defaut:   { ok: '✅ Bonne réponse, bravo !', ko: '❌ La bonne réponse était :', fin: ['Excellent travail ! Tu maîtrises ce chapitre.', 'Bravo ! Tu connais bien ce chapitre.', 'Pas mal, mais il reste quelques points à revoir.', 'Continue à réviser, tu vas y arriver !'] },
    petits:   { ok: '🎉 Bravo, c\'est ça !', ko: '😊 Presque ! C\'était :', fin: ['Waouh ! Tu as tout compris, bravo !', 'Bravo, c\'est très bien !', 'C\'est bien ! On rejoue pour faire encore mieux ?', 'On rejoue ensemble ? Tu vas y arriver !'] },
    lecteurs: { ok: '🎉 Bravo, bonne réponse !', ko: '😊 Pas tout à fait. La bonne réponse était :', fin: ['Super ! Tu as tout compris.', 'Bravo, tu connais bien ta leçon !', 'C\'est bien parti ! Relis les erreurs et rejoue.', 'Courage ! Relis ta leçon, puis rejoue.'] },
    explorateurs: { ok: '✅ Bonne réponse, bien joué !', ko: '💡 Pas cette fois. La bonne réponse était :', fin: ['Excellent ! Tu maîtrises ce chapitre.', 'Bravo, tu connais bien ta leçon !', 'Pas mal ! Relis tes erreurs et rejoue.', 'Courage ! Relis ta leçon, puis lance « Refaire mes erreurs ».'] },
    college:  { ok: '✅ Bien joué !', ko: '❌ Raté, la réponse était :', fin: ['Chapitre maîtrisé, bien joué !', 'Bon score ! Encore quelques points à caler.', 'Pas mal, mais plusieurs notions sont à revoir.', 'À retravailler : lance « Refaire mes erreurs ».'] },
    lycee:    { ok: '✅ Correct.', ko: '❌ Réponse attendue :', fin: ['Excellent : chapitre maîtrisé.', 'Bon niveau : quelques points à consolider.', 'Bases présentes, plusieurs notions à revoir.', 'Chapitre à retravailler : commence par tes erreurs.'] }
  };
  TONS.parent = TONS.lycee;
  const themeActuel = () => document.documentElement.getAttribute('data-theme') || 'explorateurs';
  const profil = () => PROFILS[themeActuel()] || {};
  // mascotte compagne à côté de la question : maternelle, primaire, 6e et 5e
  const compagnon = () => { const t = themeActuel(); return t === 'petits' || t === 'lecteurs' || t === 'explorateurs' || (t === 'college' && /^(6e|5e)$/.test(String((window.__UQ && window.__UQ.classe) || ''))); };
  const BULLES = {
    ok: ['Exact !', 'Bien joué !', 'Oui, c\'est ça !', 'Super !', 'Bravo !', 'Tu gères !'],
    serie: ['Quelle série !', 'Rien ne t\'arrête !', 'En pleine forme !'],
    ko: ['Pas grave, on retient !', 'Presque !', 'On apprend en se trompant.', 'La prochaine sera la bonne !', 'Courage, continue !'],
    accents: ['Attention aux accents !']
  };
  // phrase stable pour une question donnée (la question peut être redessinée)
  function bulle(ok, note, serie) {
    const l = ok ? (serie >= 3 ? BULLES.serie : BULLES.ok) : note === 'accents' ? BULLES.accents : BULLES.ko;
    return l[(cur * 7 + serie) % l.length];
  }
  const ton = () => TONS[themeActuel()] || TONS.defaut;
  // questions par partie : choix du parent (Réglages, __UQ.parPartie : 10, 15, 20, 30) sinon automatique selon l'âge ;
  // jamais plus que les questions du quiz
  const nbParDefaut = () => { const f = +((window.__UQ || {}).parPartie) || 0; return Math.min(f || Math.min(C.nbQuestions, profil().nb || Infinity), C.questions.length || Infinity); };
  // lecture à voix haute de la question (petits : automatique ; lecteurs : bouton), avec les choix
  // d'un QCM (« 1 : la vache. 2 : le chat. ») et la phrase d'un texte à trous ou de mots à toucher
  function lireQuestion() {
    const q = shuffled && shuffled[cur]; if (!q || !('speechSynthesis' in window)) return;
    couperSon();
    let t = texteDe(texteQuestion(q)).trim();
    const ty = typeDe(q), point = x => x && !/[.!?…:]$/.test(x) ? x + '.' : x;
    if (ty === 'trous') t = point(t) + ' ' + String(q.texte || '').replace(/\[[^\]]*\]/g, ' … ');
    else if (ty === 'cliquer') t = point(t) + ' ' + String(q.texte || '').replace(/\*/g, '');
    else if (q.type === 'qcm' && Array.isArray(q.opts)) t = point(t) + ' ' + q.opts.map((o, i) => { const x = texteDe(optHTML(q, o)).trim(); return x ? `${i + 1} : ${point(x)}` : ''; }).filter(Boolean).join(' ');
    const u = new SpeechSynthesisUtterance(t.replace(/_{2,}/g, ' … ').trim());
    u.lang = 'fr-FR'; u.rate = 0.85;
    const v = voixListe().find(x => String(x.lang).toLowerCase().startsWith('fr')); if (v) u.voice = v;
    lancerLecture(u);
  }
  const meilleurScore = (pct) => {
    // record tiré des résultats enregistrés (le même sur tous les appareils et dans l'espace parent) ;
    // mémoire de l'appareil seulement pour un quiz ouvert hors d'un site SoccaQuiz
    if (window.Badges && Badges.meilleur && window.__UQ) return Badges.meilleur(pct);
    const k = 'sq.meilleur.' + (C.titre || '');
    let avant = null; try { avant = JSON.parse(localStorage.getItem(k)); } catch (e) {}
    try { if (avant == null || pct > avant) localStorage.setItem(k, JSON.stringify(pct)); } catch (e) {}
    return avant;
  };
  let tDebut = 0;
  // identifiant stable d'une question (même question = même clé, d'une partie et d'un quiz de révision à l'autre)
  function cleQuestion(q) {
    const src = q._orig || q;
    if (src.k) return String(src.k);
    const j = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // formule d'origine (les clés des quiz existants ne changent pas) ; contenu ajouté seulement pour les questions
    // dont le libellé seul ne suffit pas (« Relie. », « Répète. », « Que veut dire la phrase entendue ? »)
    let t = [C.titre, src.type || '', src.q || '', src.texte || '', Array.isArray(src.items) ? src.items.join('|') : ''].join('§');
    if (src.r) t += '§' + [j(src.img), j(src.notes), j(src.a)].join('§');      // exercice fabriqué par le site (ligne R) : même libellé, contenu différent
    if (['paires', 'classer', 'parler', 'clavier', 'placer'].includes(typeDe(src)) || src.dire) t += '§' + [j(src.phrase), j(src.paires), j(src.groupes), j(src.notes), j(src.dire)].join('§');
    let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return 'q' + (h >>> 0).toString(36);
  }

  /* ---------- maîtrise (calculée par le serveur à partir des résultats) ---------- */
  const NIVEAUX = ['Découverte', 'En progrès', 'Acquis', 'Maîtrisé'];
  const MAI = () => (window.__UQ || {}).maitrise || {};
  const etatQuestion = q => (MAI().q || {})[cleQuestion(q)];           // [réponses, série de bonnes réponses]
  const etatNotion = cat => (MAI().notions || {})[cat];                  // [niveau, taux %, réponses]
  // tirage intelligent : nouvelle 3, ratée la dernière fois 4, réussie 1 fois 2, 2 fois 1, 3 fois et plus 0,5 ;
  // ×0,6 si la notion est maîtrisée, ×1,4 si elle est en progrès
  function poidsQuestion(q) {
    const st = etatQuestion(q), no = etatNotion(q.cat);
    let w = !st ? 3 : st[1] === 0 ? 4 : st[1] === 1 ? 2 : st[1] === 2 ? 1 : 0.5;
    if (no) w *= no[0] === 3 ? 0.6 : no[0] === 1 ? 1.4 : 1;
    return w;
  }
  // questions d'un même fait (champ g, lignes D) : une seule par partie, tant qu'il en reste assez d'autres
  const tirer = (pool, n) => {
    const tri = pool.map(q => ({ q, c: Math.pow(Math.random(), 1 / poidsQuestion(q)) })).sort((a, b) => b.c - a.c).map(x => x.q);
    const vus = new Set(), pris = [], apres = [];
    tri.forEach(q => { if (q.g && vus.has(q.g)) apres.push(q); else { if (q.g) vus.add(q.g); pris.push(q); } });
    return pris.concat(apres).slice(0, n);
  };
  // passage à l'écrit : un QCM réussi 2 fois de suite revient sans les choix, si la réponse s'écrit facilement
  // et si la question se comprend sans les propositions
  const SANS_CHOIX_IMPOSSIBLE = /parmi|laquelle|lequel|lesquel|quelle (phrase|proposition|réponse|écriture)|ci-dessous|suivant|intrus|correcte?\b|juste|bien écrit|choisis|entoure|vrai|faux/i;
  function versEcrit(p) {
    const o = p._orig || p, st = etatQuestion(p);
    if (!st || st[1] < 2 || p.type !== 'qcm' || typeDe(o) !== 'qcm' || themeActuel() === 'petits') return false;
    if (C.optionHTML || C.texteQuestion || p.garderOrdre || p.fixed || typeof p.a !== 'string' || dessin(p.a)) return false;
    const a = p.a.trim();
    if (!a || /[<>]/.test(a) || a.length > 25 || a.split(/\s+/).length > 3) return false;
    // pas d'écrit si un mauvais choix serait accepté comme bonne réponse (« a » pour « à » hors français…)
    const R = regles(p), bonnes = [p.a, ...(p.alt || p.alts || [])];
    if ((Array.isArray(o.opts) ? o.opts : p.opts || []).some(w => w !== p.a && comparer(bonnes, w, R) === 1)) return false;
    return !SANS_CHOIX_IMPOSSIBLE.test(texteDe(p.q));
  }
  function enEcrit(p) {
    const e = Object.assign({}, p, { type: 'input', ans: [p.a, ...(p.alt || p.alts || [])], _ecrit: true, _qcm: p });
    delete e.opts;
    Object.defineProperty(e, '_orig', { value: p._orig || p, enumerable: false, configurable: true });
    return e;
  }

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
    const zoneOuLegende = typeDe(q) === 'zone' || typeDe(q) === 'legende';
    const svg = (C.figure && C.figure(q)) || (q.svg && !zoneOuLegende ? (C.html ? q.svg : svgSur(q.svg)) : '') || (C.illustrations && C.illustrations[q.cat]);
    if (svg) return `<div class="fig-box">${svg}</div>`;
    if (q.fig && window.Dessins && Dessins.geo) { const g = Dessins.geo(q.fig); if (g) return `<div class="fig-box dessin geo" role="img" aria-label="Figure de géométrie">${g}</div>`; }
    if (dessin(q.img)) return `<div class="fig-box dessin" role="img" aria-label="${esc(Dessins.nom(q.img))}">${Dessins.grand(q.img)}</div>`;
    // grande image seulement si la question en a une utile (img=🐘 : objet ou être concret) ;
    // sinon rien : la question monte et l'emoji de la catégorie reste en petit dans l'étiquette
    if (q.img) return `<div class="emo-box">${C.deco || DECO_DEFAUT}${emojiImg(q.img, 'emo-grand')}</div>`;
    return C.deco ? `<div class="deco-box">${C.deco}</div>` : '';
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
    if (montrerSuivant && !TACTILE) {              // téléphone : voir enregistrer() (pas de défilement pendant que le clavier se ferme)
      const nb = appli().querySelector('.next-btn');
      if (nb && nb.getBoundingClientRect().bottom > window.innerHeight) nb.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  /* ---------- accueil ---------- */
  // niveau de chaque notion (catégorie) du quiz, dès qu'au moins une a été travaillée
  function blocNotions() {
    const cats = [...new Set(C.questions.map(q => q && q.cat).filter(Boolean))];
    if (!cats.length || !cats.some(etatNotion)) return '';
    const nbM = cats.filter(c => (etatNotion(c) || [0])[0] === 3).length;
    return `<div class="notions"><div class="notions-t">${ic('cible')} Tes notions <small>${nbM} sur ${cats.length} maîtrisée${nbM > 1 ? 's' : ''}</small></div><div class="notions-l">${cats.map(c => {
      const v = etatNotion(c) || [0];
      const emb = profil().emblemes ? `<img class="embleme" src="https:\/\/leian.github.io/UNIVERSALQUIZ/themes/recompenses/niveau-${v[0]}.webp" alt="">` : '';
      return `<span class="notion n${v[0]}${emb ? ' avec-embleme' : ''}"${v[2] ? ` title="${v[1]} % sur les dernières réponses"` : ''}>${emb}${C.icones && C.icones[c] && !emb ? emojiImg(C.icones[c]) + ' ' : ''}${esc(c)}<b>${NIVEAUX[v[0]]}</b></span>`;
    }).join('')}</div></div>`;
  }

  /* ---------- défi en famille : deux joueurs à tour de rôle sur le même appareil ---------- */
  const PRENOM_ENFANT = '{{PRENOM}}';
  function renderFamille() {
    enQuestion(false);
    state = 'famille';
    quitter();
    let noms = []; try { noms = JSON.parse(localStorage.getItem('sq.famille')) || []; } catch (e) {}
    const maxN = Math.floor(C.questions.length / 2), choix = [3, 5, 10].filter(k => k <= maxN);
    if (!choix.length) choix.push(maxN);
    const n = duel && choix.includes(duel.n) ? duel.n : choix.includes(5) ? 5 : choix[choix.length - 1];
    appli().innerHTML = `
      <div class="start-card">
        <div class="start-top">${MES_QUIZ}</div>
        <div class="start-icon">${emojiImg(C.icone || '📝')}</div>
        <div class="start-title">Défi en famille</div>
        <div class="start-subtitle">Chacun son tour sur le même appareil, chacun ses questions. Pour le plaisir !</div>
        <div class="famille-noms">
          <label class="j0">Joueur 1<input id="fam-0" maxlength="20" value="${esc(noms[0] || PRENOM_ENFANT)}"></label>
          <label class="j1">Joueur 2<input id="fam-1" maxlength="20" value="${esc(noms[1] || '')}" placeholder="Papa, maman, un frère…"></label>
        </div>
        <div class="start-choice"><b>Questions par joueur</b><div>${choix.map(k => `<button class="choice-btn ${k === n ? 'on' : ''}" onclick="this.parentNode.querySelectorAll('.on').forEach(b=>b.classList.remove('on'));this.classList.add('on')" data-n="${k}">${k}</button>`).join('')}</div></div>
        <button class="start-btn" onclick="MoteurQuiz.duel()">▶ C'est parti !</button>
        <div><button class="btn-famille" onclick="MoteurQuiz.home()">${ic('prec')} Jouer seul</button></div>
      </div>`;
    defiler('famille');
  }
  function lancerDuel(memes) {
    if (!memes) {
      const lire = i => (document.getElementById('fam-' + i) || {}).value || '';
      const noms = [lire(0).trim() || 'Joueur 1', lire(1).trim() || 'Joueur 2'];
      const on = appli().querySelector('.choice-btn.on');
      duel = { noms, n: on ? +on.dataset.n : 5 };
      try { localStorage.setItem('sq.famille', JSON.stringify(noms)); } catch (e) {}
    }
    duel.n = Math.min(duel.n, Math.floor(C.questions.length / 2));
    startQuiz(shuffle(C.questions).slice(0, duel.n * 2), true);
  }
  const joueur = i => i % 2;
  const scoreDe = j => answers.filter((x, i) => x && x.ok && joueur(i) === j).length;

  function renderStart() {
    enQuestion(false);
    state = 'start';
    duel = null;
    quitter();
    const n = nbChoisi || nbParDefaut();
    const pills = [`${ic('cible')} ${n} questions`, `${ic('liste')} ${C.questions.length} questions au total`, `${ic('melange')} Tirage aléatoire`, ...(C.pills || [])];
    const choix = C.choixNombre ? `<div class="start-choice"><b>Combien de questions ?</b><div>${C.choixNombre.map(k =>
      `<button class="choice-btn ${k === n ? 'on' : ''}" onclick="MoteurQuiz.nombre(${k})">${k}</button>`).join('')}</div></div>` : '';
    appli().innerHTML = `
      <div class="start-card">
        <div class="start-top">${MES_QUIZ}</div>
        <div class="start-icon">${emojiImg(C.icone || '📝')}</div>
        <div class="start-title">${H(C.titre)}</div>
        <div class="start-subtitle">${C.sousTitre || ''}</div>
        <div class="start-infos">${pills.map(p => `<span class="info-pill">${p}</span>`).join('')}</div>
        ${choix}
        <button class="start-btn" onclick="MoteurQuiz.start()">▶ Commencer le quiz</button>
        ${C.questions.length >= 4 && C.famille !== false ? `<div><button class="btn-famille" onclick="MoteurQuiz.famille()">${ic('duo')} Défi en famille</button></div>` : ''}
        ${blocNotions()}
        ${window.Animations ? Animations.boutonSon(themeActuel()) : ''}
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
    if (t === 'qcm' && Array.isArray(q.opts)) {
      if (q.garderOrdre || q.fixed) return { ...q, type: 'qcm', opts: [...q.opts] };
      // petits et lecteurs : moins de choix (la bonne réponse est toujours gardée)
      const max = profil().choix, autres = q.opts.filter(o => o !== q.a);
      const opts = max && q.opts.length > max && autres.length < q.opts.length ? [q.a, ...shuffle(autres).slice(0, max - 1)] : q.opts;
      return { ...q, type: 'qcm', opts: shuffle(opts) };
    }
    return { ...q, type: t };
  }

  function startQuiz(liste, enDuel, m) {
    if (state === 'q' && tropTot()) return;          // double toucher sur « Rejouer » / « Commencer »
    quitter();
    if (!enDuel) duel = null;
    mode = enDuel ? 'duel' : m || 'normal';
    tQuestion = Date.now(); lu = null;
    const n = Math.min(nbChoisi || nbParDefaut(), C.questions.length);
    tDebut = Date.now();
    const base = liste || (C.preparer ? C.preparer(n) : shuffle(tirer(C.questions, n)));
    // partie normale : jusqu'à un tiers des QCM déjà réussis 2 fois de suite passent à l'écrit
    let ecrits = 0; const maxEcrits = liste ? 0 : Math.ceil(base.length / 3);
    shuffled = base.map(q => { const p = preparerQuestion(q); if (ecrits < maxEcrits && versEcrit(p)) { ecrits++; return enEcrit(p); } return p; });
    cur = 0; answers = []; selected = null; indicesVus = new Set();
    state = 'q';
    if (window.Suivi) Suivi.debut();
    renderQuestion();
  }

  /* ---------- réponses ---------- */
  // note : 'accents' quand la réponse n'est fausse que par les accents ou l'apostrophe
  function enregistrer(donne, ok, texte, note) {
    if (selected !== null || tropTot()) return;
    // téléphone : le champ de réponse a encore le clavier (et parfois un mot en cours de saisie, souligné) ;
    // le retirer de la page sans le quitter d'abord peut figer les touchers sur Android jusqu'à ce qu'on change
    // d'application. On le quitte proprement avant de réafficher la question.
    const champ = document.activeElement;
    if (TACTILE && champ && /^(INPUT|TEXTAREA)$/.test(champ.tagName)) try { champ.blur(); } catch (e) {}
    selected = donne === undefined ? '' : donne;
    answers[cur] = { given: donne, ok: !!ok, texte, i: indicesVus.has(cur), note: ok ? '' : note || '' };
    tQuestion = Date.now();                         // un second toucher rapide ne saute pas la correction
    renderQuestion();
    // la correction et le bouton « suivant » sous le pouce : on les fait apparaître s'ils sont sous l'écran
    const suite = appli().querySelector('.next-btn');
    const montrer = () => { const nb = appli().querySelector('.next-btn'); if (nb && nb.getBoundingClientRect().bottom > window.innerHeight) nb.scrollIntoView({ block: 'end' }); };
    // téléphone : un défilement pendant que le clavier se ferme, au moment où l'enfant touche déjà « Question suivante »,
    // laisse le toucher coincé sur Android (plus rien ne répond jusqu'à un changement d'application). On attend que
    // le clavier soit fermé, on ne défile que si le bouton est encore caché et qu'aucun doigt n'est posé, sans animation.
    if (!TACTILE) montrer();
    else { const q0 = cur; setTimeout(() => { if (cur === q0 && state === 'q' && !doigtPose) montrer(); }, champ && /^(INPUT|TEXTAREA)$/.test(champ.tagName) ? 500 : 0); }
    // lecteur d'écran : résultat annoncé, focus sur « suivant » (Entrée ou Espace pour continuer)
    annoncer(texteDe((appli().querySelector('.explanation') || {}).innerHTML));
    // (au clavier et pour les lecteurs d'écran ; pas sur écran tactile, où donner le focus juste après la fermeture du clavier fige Android)
    if (suite && !TACTILE) try { suite.focus({ preventScroll: true }); } catch (e) {}
    if (ok) recompenseReponse();
    if (window.Animations) Animations.reponse(!!ok, duel ? 0 : serieEnCours(), themeActuel());
  }
  // bonnes réponses d'affilée jusqu'à la question en cours
  function serieEnCours() { let n = 0; for (let i = cur; i >= 0 && answers[i] && answers[i].ok; i--) n++; return n; }
  function annoncer(t) {
    let z = document.getElementById('mq-annonce');
    if (!z) { z = document.createElement('div'); z.id = 'mq-annonce'; z.className = 'sr-only'; z.setAttribute('aria-live', 'polite'); z.setAttribute('role', 'status'); document.body.appendChild(z); }
    z.textContent = ''; setTimeout(() => { z.textContent = String(t || '').replace(/\s+/g, ' ').trim(); }, 60);
  }
  function recompenseReponse() {
    const p = profil();
    if (p.animaux !== false && window.celebrate && Math.random() < (p.animal == null ? 1 : p.animal)) celebrate();
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
    const r = bonneSaisie(q, val);
    enregistrer(val, r === 1, undefined, r === 2 ? 'accents' : '');
  }
  function montrerIndice() { indicesVus.add(cur); const h = document.getElementById('hint-text'), b = document.getElementById('hint-btn'); if (h) h.style.display = ''; if (b) b.remove(); }
  // réponse à écrire trop difficile : on revient aux propositions, sans pénalité
  function voirPropositions() { const q = shuffled && shuffled[cur]; if (!q || !q._qcm || selected !== null) return; shuffled[cur] = q._qcm; renderQuestion(); }

  /* ---------- écoute : phrase lue (synthèse vocale) et notes de musique ---------- */
  const LETTRES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FR = { DO: 'C', UT: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
  // 'C4', 'F#4', 'Bb3' (notation internationale) ou 'do3', 'fa#3' (notation française : do3 = C4)
  // suffixes : *2 (deux fois plus long), *0.5 (deux fois plus court), ^ (fort), _ (doux) — ex. C4*2^
  function lireNote(n) {
    let t = String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/♯/g, '#').replace(/♭/g, 'b').trim(), dur = 1, vol = 1;
    const mod = t.match(/^(.*?)(?:\*(\d*\.?\d+))?([\^_])?$/);
    if (mod) { t = mod[1]; if (mod[2]) dur = Math.min(4, Math.max(0.25, +mod[2])); vol = mod[3] === '^' ? 2.2 : mod[3] === '_' ? 0.3 : 1; }
    let m = t.match(/^([A-Ga-g])([#b]?)(\d)?$/), dec = 0;
    if (!m) { m = t.match(/^(do|ut|re|mi|fa|sol|la|si)([#b]?)(\d)?$/i); if (!m) return null; m = [m[0], FR[m[1].toUpperCase()], m[2], m[3]]; dec = 1; }
    const L = m[1].toUpperCase(), oct = (m[3] == null ? 4 : +m[3] + dec), alt = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return { midi: 12 * (oct + 1) + LETTRES[L] + alt, pas: oct * 7 + 'CDEFGAB'.indexOf(L), alt, dur, vol };
  }
  const sequence = q => (Array.isArray(q.notes) ? q.notes : []).map(x => (Array.isArray(x) ? x : [x]).map(lireNote).filter(Boolean)).filter(a => a.length);
  // sons à comparer : notes=C4 / G4 → boutons « Son 1 », « Son 2 » ; - = silence (-*2 : deux temps)
  function groupesSons(q) {
    const g = [[]];
    (Array.isArray(q.notes) ? q.notes : []).forEach(x => {
      const arr = Array.isArray(x) ? x : [x], t0 = String(arr[0]).trim();
      if (t0 === '/') { g.push([]); return; }
      const r = /^-(?:\*(\d*\.?\d+))?$/.exec(t0);
      if (r) { g[g.length - 1].push({ silence: true, dur: r[1] ? Math.min(4, Math.max(0.25, +r[1])) : 1 }); return; }
      const ns = arr.map(lireNote).filter(Boolean);
      if (ns.length) g[g.length - 1].push({ notes: ns, dur: Math.max(...ns.map(n => n.dur)), vol: Math.max(...ns.map(n => n.vol)) });
    });
    return g.filter(x => x.some(e => e.notes));
  }

  let actx = null, sons = [];
  let dernierCancel = 0, voixCache = [];
  // liste des voix lue une fois puis gardée (relue seulement quand le navigateur annonce un changement)
  function voixListe() { if (!voixCache.length) try { voixCache = speechSynthesis.getVoices() || []; } catch (e) {} return voixCache; }
  try { if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => { voixCache = []; }); } catch (e) {}
  // lecture lancée un peu après une coupure : sur Android, speak() juste après cancel() est parfois ignoré,
  // et l'enfant retouche le bouton en boucle
  function lancerLecture(u) {
    const attente = Math.max(0, 120 - (Date.now() - dernierCancel));
    if (!attente) { try { speechSynthesis.speak(u); } catch (e) {} return; }   // tout de suite : iOS veut la lecture dans le toucher
    setTimeout(() => { try { speechSynthesis.speak(u); } catch (e) {} }, attente);
  }
  function couperSon() {
    // Android : cancel() et getVoices() passent par le moteur de synthèse du téléphone et peuvent bloquer la page
    // un instant ; on ne coupe que si une lecture est en cours ou en attente
    try { if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) { speechSynthesis.cancel(); dernierCancel = Date.now(); } } catch (e) {}
    sons.forEach(o => { try { o.stop(); } catch (e) {} }); sons = [];
  }
  function jouerNotes(q, groupe) {
    couperSon();
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
    const pas = 0.55, tous = groupesSons(q), liste = groupe != null ? [tous[groupe] || []] : tous;
    let t = actx.currentTime + 0.06;
    liste.forEach((g, gi) => {
      if (gi) t += pas * 1.2;                                   // petit silence entre deux sons à comparer
      g.forEach(ev => {
        if (ev.notes) ev.notes.forEach(n => {
          const f = 440 * Math.pow(2, (n.midi - 69) / 12), fin = pas * ev.dur;
          [[1, 1], [2, 0.28], [3, 0.1]].forEach(([k, a]) => {       // fondamentale + deux harmoniques : son doux, proche d'un piano
            const o = actx.createOscillator(), gn = actx.createGain();
            o.type = 'sine'; o.frequency.value = f * k;
            gn.gain.setValueAtTime(0.0001, t);
            gn.gain.exponentialRampToValueAtTime(Math.min(0.6, 0.22 * a * ev.vol / Math.sqrt(ev.notes.length)), t + 0.012);
            gn.gain.setValueAtTime(Math.min(0.6, 0.22 * a * ev.vol / Math.sqrt(ev.notes.length)) * 0.7, t + Math.max(0.05, fin * 0.8));
            gn.gain.exponentialRampToValueAtTime(0.0001, t + fin + pas * 0.9);
            o.connect(gn); gn.connect(actx.destination); o.start(t); o.stop(t + fin + pas); sons.push(o);
          });
        });
        t += pas * ev.dur;
      });
    });
  }
  // langue réellement lue : dans un quiz d'anglais, une phrase anglaise marquée langue=fr-FR (erreur de l'IA,
  // vue sur des quiz de maternelle) est lue en anglais, et une consigne française marquée en anglais est lue en français
  const MOTS_EN = /(^|[^\p{L}'])(i|i'm|you|he|she|it|we|they|the|is|are|am|isn't|aren't|don't|doesn't|do|does|like|likes|have|has|my|your|his|her|what|where|who|how|can|this|that|and|not|yes|no|please|thank)(?=$|[^\p{L}'])/giu;
  const MOTS_FR = /(^|[^\p{L}'])(le|la|les|un|une|des|est|et|tu|je|il|elle|nous|vous|comment|quel|quelle|dit-on|c'est|qu'est-ce|veut|dire|écoute|ecoute)(?=$|[^\p{L}'])/giu;
  function langueLue(q) {
    const langue = q.langue || C.langueAudio || 'en-GB', t = String(q.dire || '');
    if (C.matiere !== 'anglais') return langue;
    const en = (t.match(MOTS_EN) || []).length, fr = (t.match(MOTS_FR) || []).length + (/[àâçéèêëîïôûùœ]/i.test(t) ? 2 : 0);
    if (/^fr/i.test(langue) && en > fr) return 'en-GB';
    if (/^en/i.test(langue) && fr > en) return 'fr-FR';
    return langue;
  }
  // voix de la langue (exacte, sinon même langue de base) ; sans voix choisie, Android et Brave lisent avec la voix
  // par défaut du téléphone, souvent française (« I » dit « i ») : on attend que la liste des voix soit chargée
  function voixPour(langue) {
    const voix = voixListe(), base = langue.slice(0, 2).toLowerCase(), l = x => String(x.lang).replace('_', '-').toLowerCase();
    return voix.find(x => l(x) === langue.toLowerCase() && x.localService) || voix.find(x => l(x) === langue.toLowerCase())
      || voix.find(x => l(x).startsWith(base) && x.localService) || voix.find(x => l(x).startsWith(base)) || null;
  }
  try { if ('speechSynthesis' in window) speechSynthesis.getVoices(); } catch (e) {}       // lance le chargement des voix dès l'ouverture
  let lectureEnCours = 0;
  function direPhrase(q, lent) {
    couperSon();
    if (!('speechSynthesis' in window)) return;
    const langue = langueLue(q), moi = ++lectureEnCours;      // une lecture demandée plus tard annule celle qui attend
    const parler = () => {
      if (moi !== lectureEnCours) return;
      const u = new SpeechSynthesisUtterance(String(q.dire));
      u.lang = langue; u.rate = lent ? 0.6 : 0.9;
      const v = voixPour(langue); if (v) try { u.voice = v; } catch (e) {}
      lancerLecture(u);
    };
    if (voixListe().length) return parler();
    let fait = false;
    const une = () => { if (!fait) { fait = true; parler(); } };
    try { speechSynthesis.addEventListener('voiceschanged', une, { once: true }); } catch (e) {}
    setTimeout(une, 1200);                                   // liste jamais annoncée (certains navigateurs) : on lit quand même
  }
  // aucune voix de la langue sur l'appareil (fréquent pour l'anglais sur Android) : on le dit au lieu de lire avec une voix française
  const NOMS_LANGUES = { en: 'anglaise', fr: 'française', es: 'espagnole', de: 'allemande', it: 'italienne', pt: 'portugaise', nl: 'néerlandaise', zh: 'chinoise', ar: 'arabe', ru: 'russe', ja: 'japonaise' };
  function verifierVoix(langue) {
    if (!('speechSynthesis' in window)) return;
    const base = String(langue).slice(0, 2).toLowerCase();
    const test = () => {
      const voix = voixListe(); if (!voix.length) return false;
      const el = document.getElementById('voix-note');
      if (el && !voix.some(x => String(x.lang).replace('_', '-').toLowerCase().startsWith(base))) { el.textContent = `Pas de voix ${NOMS_LANGUES[base] || 'pour cette langue'} sur cet appareil : demande à quelqu'un de lire la phrase.`; el.hidden = false; }
      return true;
    };
    if (!test()) try { speechSynthesis.addEventListener('voiceschanged', test, { once: true }); } catch (e) {}
  }
  // iOS ignore la synthèse vocale tant qu'aucune lecture n'a été lancée par un toucher : on en lance une muette au toucher de « Commencer »
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let voixDebloquee = false;
  function debloquerVoix() {
    if (voixDebloquee || !IOS || !('speechSynthesis' in window)) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); voixDebloquee = true; } catch (e) {}
  }
  function ecouter(quoi) {
    const q = shuffled && shuffled[cur]; if (!q) return;
    // clavier ouvert (champ de réponse) : on le ferme d'abord et on lit une fois l'écran stabilisé
    const a = document.activeElement, clavier = a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && TACTILE;
    if (clavier) a.blur();
    const go = () => { if (/^notes/.test(quoi || '')) jouerNotes(q, /^notes:\d+$/.test(quoi) ? +quoi.slice(6) : null); else direPhrase(q, quoi === 'lent'); };
    if (clavier && !IOS) setTimeout(go, 350); else go();       // iOS : la lecture doit partir dans le toucher
  }
  const TACTILE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
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
    if (q.portee && q.notes && typeDe(q) !== 'placer') h += porteeSVG(q);
    const b = [], voix = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;   // sans synthèse vocale (certaines WebView) : pas de bouton muet
    if (voix && profil().lecture && !repondu) b.push(`<button class="ecoute-btn" onclick="MoteurQuiz.lire()">🔊 Lire la question</button>`);
    if (voix && q.dire) b.push(`<button class="ecoute-btn" onclick="MoteurQuiz.ecouter()">🔊 ${repondu ? 'Réécouter' : 'Écouter'}</button><button class="ecoute-btn lent" onclick="MoteurQuiz.ecouter('lent')">🐢 Lentement</button>`);
    const gs = q.notes && q.portee !== 'seule' && typeDe(q) !== 'placer' ? groupesSons(q) : [];
    if (gs.length > 1) gs.forEach((_, i) => b.push(`<button class="ecoute-btn" onclick="MoteurQuiz.ecouter('notes:${i}')">🎵 Son ${i + 1}</button>`));
    else if (gs.length) b.push(`<button class="ecoute-btn" onclick="MoteurQuiz.ecouter('notes')">🎵 ${repondu ? 'Réécouter' : 'Écouter'}</button>`);
    return h + (b.length ? `<div class="ecoute-row">${b.join('')}</div>` : '') + (voix && q.dire ? '<div class="input-note" id="voix-note" role="status" hidden></div>' : '');
  }

  /* ---------- types d'exercices intégrés (format en lignes : G, O, A, C, X, N, P, K) ----------
     Tout se fait en touchant l'écran (pas de glisser-déposer, pénible sur téléphone).
     E garde l'état de l'exercice en cours ; MoteurQuiz._ex(action, n) le modifie puis réaffiche. */
  let E = null;
  const etat = (q, init) => { if (!E || E.q !== q) E = Object.assign({ q }, init()); return E; };
  const ex = (action, n) => `MoteurQuiz._ex('${action}'${n === undefined ? '' : ',' + n})`;
  const NOMS_NOTES = ['do', 'do♯', 'ré', 'ré♯', 'mi', 'fa', 'fa♯', 'sol', 'sol♯', 'la', 'la♯', 'si'];
  const nomNote = m => NOMS_NOTES[((m % 12) + 12) % 12];
  // mélange qui ne redonne pas la bonne réponse (comparée sur les textes : « la … la » échangés restent dans l'ordre)
  const melangeDifferent = (n, textes) => { const idx = [...Array(n).keys()]; if (n < 2) return idx; const t = textes || idx; let m, k = 0; do { m = shuffle(idx); } while (m.every((v, i) => t[v] === t[i]) && ++k < 50); return m; };
  // ✓ / ✗ lus par les lecteurs d'écran (en plus de la couleur et du signe dessiné en CSS)
  const SR = cls => /(^|\s)ok(\s|$)/.test(cls || '') ? '<span class="sr-only"> (juste)</span>' : /(^|\s)ko(\s|$)/.test(cls || '') ? '<span class="sr-only"> (faux)</span>' : /manque/.test(cls || '') ? '<span class="sr-only"> (oublié)</span>' : '';
  const puce = (txt, cls, action, n, off) => `<button type="button" class="ex-puce ${cls || ''}" data-f="${action}:${n}"${/choisi/.test(cls || '') ? ' aria-pressed="true"' : ''} ${off ? 'disabled' : `onclick="${ex(action, n)}"`}>${txt}${SR(cls)}</button>`;
  // le bouton Valider est toujours visible : grisé, il dit ce qui manque (un bouton qui apparaît d'un coup ne se devine pas)
  const valider = (pret, action, manque) => pret ? `<button class="validate-btn ex-valider" onclick="${ex(action)}">Valider ✓</button>`
    : manque ? `<button class="validate-btn ex-valider attente" disabled>${manque}</button>` : '';
  const aPlacer = (n, mot) => `Encore ${n} ${mot}${n > 1 ? 's' : ''} à placer`;
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
  const motsNorm = s => String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘]/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  function ressemblance(cible, dit) {                    // part des mots de la phrase modèle retrouvés, dans l'ordre
    const a = motsNorm(cible), b = motsNorm(dit); if (!a.length) return b.length ? 1 : 0;
    let j = 0, ok = 0; a.forEach(m => { const k = b.indexOf(m, j); if (k >= 0) { ok++; j = k + 1; } });
    // la reconnaissance vocale colle ou coupe parfois les mots (« goodnight » pour « good night », « every day » / « everyday ») :
    // mêmes lettres dans le même ordre, sans tenir compte des espaces = phrase bien dite
    if (ok < a.length && b.length && b.join('').indexOf(a.join('')) >= 0) return 1;
    return ok / a.length;
  }
  // Brave (comme Firefox) n'a pas le service de reconnaissance vocale de Google : on y propose seulement l'auto-évaluation
  // Sur iPhone et iPad, seul Safari reconnaît la voix : Chrome, Firefox, Edge et les navigateurs des applis (Gmail…)
  // montrent l'interface mais elle ne marche jamais (bug WebKit 239816) ; même chose pour la vue web des applis Android.
  const Reco = () => navigator.brave || ['ios-autre', 'appli', 'firefox', 'opera', 'edge-mobile'].indexOf(navigateurMicro()) >= 0 ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
  // navigateur et appareil, pour expliquer comment activer le micro (ou pourquoi c'est impossible)
  function navigateurMicro() {
    const ua = navigator.userAgent || '';
    if (navigator.brave) return 'brave';
    if (IOS) return /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram/.test(ua) || !/Version\/[\d.]+.*Safari/.test(ua) ? 'ios-autre' : 'safari-ios';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/OPR\/|Opera|OPT\//.test(ua)) return 'opera';
    if (/EdgA\//.test(ua)) return 'edge-mobile';
    if (/SamsungBrowser/.test(ua)) return 'samsung';
    if (/Android/.test(ua) && /; wv\)/.test(ua)) return 'appli';
    if (/Android/.test(ua) && /Chrome\//.test(ua)) return 'chrome-android';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Chrome\//.test(ua)) return 'chrome';
    if (/Safari\//.test(ua)) return 'safari-mac';
    return 'autre';
  }
  const AILLEURS = 'Pour parler au micro, ouvre ce quiz dans <b>Chrome</b> (téléphone Android ou ordinateur), <b>Samsung Internet</b> ou <b>Safari</b> (iPhone, iPad). Sinon, dis la phrase à voix haute et touche « Je l\'ai bien dit » ou « À retravailler ».';
  const AIDES_MICRO = {
    brave: ['Pourquoi le micro ne marche pas ?', '<p><b>Brave ne laisse pas les sites reconnaître la voix</b> : il coupe le service de Google qui transforme la voix en texte, pour protéger la vie privée. Ce n\'est pas réglable dans Brave.</p><p>' + AILLEURS + '</p>'],
    'ios-autre': ['Pourquoi le micro ne marche pas ?', '<p><b>Sur iPhone et iPad, seul Safari sait reconnaître la voix sur un site.</b> Chrome, Firefox, Edge et les navigateurs intégrés aux applis (Gmail, Messenger…) ne le peuvent pas : c\'est une limite d\'Apple.</p><p>Copie le lien du quiz et ouvre-le dans <b>Safari</b>. Sinon, dis la phrase à voix haute et touche « Je l\'ai bien dit » ou « À retravailler ».</p>'],
    appli: ['Pourquoi le micro ne marche pas ?', '<p>Le quiz est ouvert <b>dans le navigateur d\'une appli</b> (Gmail, Messenger…), qui ne sait pas reconnaître la voix.</p><p>Touche <b>⋮</b> en haut à droite, puis <b>« Ouvrir dans Chrome »</b> (ou « Ouvrir dans le navigateur »).</p>'],
    firefox: ['Pourquoi le micro ne marche pas ?', '<p><b>Firefox ne sait pas reconnaître la voix sur un site.</b></p><p>' + AILLEURS + '</p>'],
    opera: ['Pourquoi le micro ne marche pas ?', '<p><b>Opera ne sait pas reconnaître la voix sur un site.</b></p><p>' + AILLEURS + '</p>'],
    'edge-mobile': ['Pourquoi le micro ne marche pas ?', '<p><b>Edge sur téléphone ne sait pas reconnaître la voix sur un site.</b></p><p>' + AILLEURS + '</p>'],
    autre: ['Pourquoi le micro ne marche pas ?', '<p><b>Ce navigateur ne sait pas reconnaître la voix sur un site.</b></p><p>' + AILLEURS + '</p>'],
    'chrome-android': ['Comment activer le micro ?', '<ol>' +
      '<li>Il faut <b>internet</b> : c\'est Google qui reconnaît la voix.</li>' +
      '<li>Touche « Parler ». Une page « SoccaQuiz — Parler » peut s\'ouvrir : touche « Parler » dessus, puis <b>« Autoriser »</b> quand Chrome demande le micro.</li>' +
      '<li>Chrome ne demande rien, ou tu as refusé ? Sur cette page, touche l\'<b>icône à gauche de l\'adresse</b> → <b>Autorisations</b> → <b>Micro</b> → Autoriser. Autre chemin : <b>⋮</b> → <b>Paramètres</b> → <b>Paramètres des sites</b> → <b>Micro</b>, puis débloque <i>leian.github.io</i> et <i>script.google.com</i>.</li>' +
      '<li>Toujours rien ? Dans les <b>Paramètres du téléphone</b> → <b>Applications</b> → <b>Chrome</b> → <b>Autorisations</b> → <b>Micro</b> → « Autoriser seulement si l\'appli est en cours d\'utilisation ».</li></ol>'],
    samsung: ['Comment activer le micro ?', '<ol>' +
      '<li>Il faut <b>internet</b>.</li>' +
      '<li>Touche « Parler », puis <b>« Autoriser »</b> quand Samsung Internet demande le micro (sur la page « SoccaQuiz — Parler » si elle s\'ouvre).</li>' +
      '<li>Tu as refusé ? Dans les réglages de Samsung Internet, cherche les <b>autorisations des sites</b> → <b>Micro</b>, et débloque <i>leian.github.io</i>.</li>' +
      '<li>Toujours rien ? <b>Paramètres du téléphone</b> → <b>Applications</b> → <b>Samsung Internet</b> → <b>Autorisations</b> → <b>Micro</b> → Autoriser.</li></ol>'],
    'safari-ios': ['Comment activer le micro ?', '<ol>' +
      '<li>Safari utilise la reconnaissance vocale d\'Apple : <b>Siri ou la dictée</b> doivent être activés (<b>Réglages</b> → <b>Général</b> → <b>Clavier</b> → <b>Activer la dictée</b>). Il faut aussi internet.</li>' +
      '<li>Touche « Parler », puis <b>« Autoriser »</b> quand Safari demande le micro et la reconnaissance vocale.</li>' +
      '<li>Tu as refusé ? Sur la page, touche le <b>bouton à gauche de l\'adresse</b> (aA ou ☰) → <b>Réglages du site web</b> → <b>Micro</b> → Autoriser, puis recharge la page. Autre chemin : <b>Réglages</b> → <b>Apps</b> → <b>Safari</b> → <b>Micro</b> → Autoriser.</li>' +
      '<li>Le micro ne marche pas depuis une icône ajoutée à l\'écran d\'accueil : ouvre le lien dans Safari.</li></ol>'],
    chrome: ['Comment activer le micro ?', '<ol>' +
      '<li>Il faut <b>internet</b> : c\'est Google qui reconnaît la voix.</li>' +
      '<li>Clique sur « Parler », puis <b>« Autoriser »</b> quand Chrome demande le micro (sur la page « SoccaQuiz — Parler » si elle s\'ouvre).</li>' +
      '<li>Tu as refusé ? Clique sur l\'<b>icône à gauche de l\'adresse</b> → <b>Micro</b> → Autoriser, puis recharge la page.</li>' +
      '<li>Toujours rien ? Vérifie que l\'ordinateur laisse Chrome utiliser le micro (Windows : <b>Paramètres</b> → <b>Confidentialité et sécurité</b> → <b>Microphone</b>).</li></ol>'],
    edge: ['Comment activer le micro ?', '<p>Clique sur « Parler », puis « Autoriser ». Si rien ne se passe, Edge ne reconnaît pas la voix sur cet ordinateur : ouvre ce quiz dans <b>Chrome</b>.</p>'],
    'safari-mac': ['Comment activer le micro ?', '<ol>' +
      '<li>Active la <b>dictée</b> : <b>Réglages Système</b> → <b>Clavier</b> → <b>Dictée</b>.</li>' +
      '<li>Clique sur « Parler », puis « Autoriser ».</li>' +
      '<li>Tu as refusé ? <b>Safari</b> → <b>Réglages</b> → <b>Sites web</b> → <b>Micro</b> → Autoriser pour ce site.</li></ol>']
  };
  function aideMicro() {
    const n = navigateurMicro(), a = AIDES_MICRO[n] || AIDES_MICRO.autre, impossible = !Reco();
    return `<details class="aide-micro"${impossible ? ' open' : ''}><summary>🎤 ${impossible ? AIDES_MICRO[n] && /Pourquoi/.test(a[0]) ? a[0] : 'Pourquoi le micro ne marche pas ?' : a[0]}</summary>${impossible && !/Pourquoi/.test(a[0]) ? '<p>' + AILLEURS + '</p>' : a[1]}</details>`;
  }
  // Sur Google Apps Script, la page est dans un cadre où Google ne délègue pas le micro : Chrome refuse sans rien demander.
  // On écoute alors dans une page à part (GitHub Pages, hors du cadre), qui renvoie ce qu'elle a entendu par postMessage.
  const PAGE_PARLER = 'https:\/\/leian.github.io/UNIVERSALQUIZ/parler.html', ORIGINE_PARLER = 'https:\/\/leian.github.io';
  let relaisMicro = false;
  try { relaisMicro = window.top !== window && localStorage.getItem('uq-relais-micro') === '1'; } catch (e) {}
  const MESSAGE_MICRO = /Android/i.test(navigator.userAgent)
    ? 'Le micro est bloqué. Dans Chrome : ⋮ → Commandes du site → Autorisations → Micro → Autoriser, puis recharge la page. Sinon, utilise les boutons ci-dessous.'
    : 'Le micro est bloqué. Dans Chrome : touche l\'icône à gauche de l\'adresse → Micro → Autoriser, puis recharge la page. Sinon, utilise les boutons ci-dessous.';
  function resultatParler(q, s, alts) {                  // commun au micro direct et à la page d'écoute
    alts = (Array.isArray(alts) ? alts : []).map(a => String(a).slice(0, 300)).slice(0, 5);
    const meilleur = alts.reduce((b, t) => ressemblance(q.phrase, t) > ressemblance(q.phrase, b) ? t : b, alts[0] || '');
    s.entendu = meilleur; s.ecoute = false; s.attente = false;
    const ok = q.phrase === '*' ? !!meilleur.trim() : ressemblance(q.phrase, meilleur) >= 0.75;
    if (ok) return enregistrer(meilleur, true, esc(meilleur));
    s.erreur = meilleur ? 'Presque ! Réécoute le modèle, puis réessaie.' : 'Je n\'ai rien entendu. Réessaie, ou utilise les boutons ci-dessous.'; renderQuestion();
  }
  function ouvrirPageParler(q, s) {
    const id = Math.random().toString(36).slice(2, 10);
    const w = window.open(PAGE_PARLER + '#' + encodeURIComponent(JSON.stringify({ p: q.phrase, l: q.langue || C.langueAudio || 'en-GB', id })), '_blank');
    if (!w) { s.erreur = 'La page d\'écoute n\'a pas pu s\'ouvrir. Utilise les boutons ci-dessous.'; return; }
    s.relaisId = id; s.attente = true; s.erreur = '';
    const ecoute = e => {
      if (e.origin !== ORIGINE_PARLER || !e.data || e.data.uq !== 'parler' || e.data.id !== s.relaisId) return;
      window.removeEventListener('message', ecoute); clearInterval(s.veille); s.relaisId = null;
      if (E !== s) return;                                  // l'enfant est passé à une autre question entre-temps
      resultatParler(q, s, e.data.alts);
    };
    window.addEventListener('message', ecoute);
    clearInterval(s.veille);
    s.veille = setInterval(() => {                        // page fermée sans résultat : on revient à l'état normal
      let ferme = true; try { ferme = w.closed; } catch (e) {}
      if (ferme) { clearInterval(s.veille); setTimeout(() => { if (s.attente) { s.attente = false; window.removeEventListener('message', ecoute); if (E === s) renderQuestion(); } }, 800); }
    }, 700);
  }

  /* Schéma SVG d'un quiz créé par l'IA : déjà nettoyé par le serveur, reconstruit ici une seconde fois avec la même liste
     blanche (balises de dessin, attributs simples, aucune adresse ni script). Les éléments avec un id sont les zones. */
  const SVG_OK = ['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan'];
  const SVG_ATTR_OK = ['id', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'fill', 'stroke', 'stroke-width',
    'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'font-size', 'font-weight', 'text-anchor', 'transform', 'viewBox', 'dx', 'dy'];
  const NS_SVG = 'http:\/\/www.w3.org/2000/svg';
  function svgSur(source) {
    try {
      const t = String(source || '').replace(/^\s*<svg\b(?![^>]*xmlns=)/i, '<svg xmlns="' + NS_SVG + '"');
      const doc = new DOMParser().parseFromString(t, 'image/svg+xml'), racine = doc.documentElement;
      if (!racine || racine.nodeName.toLowerCase() !== 'svg') return '';
      const copier = (n, profondeur) => {
        if (n.nodeType === 3) return document.createTextNode(String(n.nodeValue).slice(0, 80));
        if (n.nodeType !== 1 || profondeur > 12) return null;
        const nom = n.nodeName.toLowerCase();
        if (SVG_OK.indexOf(nom) < 0) return null;
        const e = document.createElementNS(NS_SVG, nom);
        for (const a of Array.from(n.attributes)) {
          if (SVG_ATTR_OK.indexOf(a.name) < 0 || /url\s*\(|javascript|expression|[<>&]/i.test(a.value)) continue;
          e.setAttribute(a.name, a.value);
        }
        for (const k of Array.from(n.childNodes)) { if (n.nodeType === 1 && k.nodeType === 3 && !/^(text|tspan)$/.test(nom)) continue; const c = copier(k, profondeur + 1); if (c) e.appendChild(c); }
        return e;
      };
      const propre = copier(racine, 0);
      if (!propre || !propre.getAttribute('viewBox')) return '';
      propre.setAttribute('role', 'img'); propre.setAttribute('aria-label', 'Schéma');
      return new XMLSerializer().serializeToString(propre);
    } catch (e) { return ''; }
  }
  const zonesDe = q => { const l = []; String(q.svg || '').replace(/\sid="([\w-]{1,30})"/g, (t, id) => { if (l.indexOf(id) < 0) l.push(id); return t; }); return l; };
  // relie les zones du schéma affiché aux actions (toucher), et les colore selon l'état
  function monterSchema(q, c, action, etatZone) {
    const boite = document.querySelector('.ex-schema'); if (!boite) return;
    const ids = zonesDe(q), svg = boite.querySelector('svg'); if (!svg) return;
    ids.forEach((id, i) => {
      const el = svg.querySelector('[id="' + id + '"]'); if (!el) return;
      const cls = etatZone(id);
      el.classList.add('sq-zone'); if (cls) el.classList.add(cls);
      if (!c.repondu && cls !== 'neutre') {
        el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
        el.addEventListener('click', () => actionExercice(action, i));
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); actionExercice(action, i); } });
      }
    });
  }
  // pastille numérotée au centre d'une zone (légendes posées)
  function pastilleZone(svg, id, texte, cls) {
    const el = svg.querySelector('[id="' + id + '"]'); if (!el || !el.getBBox) return;
    let b; try { b = el.getBBox(); } catch (e) { return; }
    const vb = (svg.getAttribute('viewBox') || '0 0 300 200').split(/[\s,]+/).map(Number), r = Math.max(8, (vb[2] || 300) / 28);
    const g = document.createElementNS(NS_SVG, 'g'); g.setAttribute('class', 'sq-pastille ' + (cls || ''));
    const ci = document.createElementNS(NS_SVG, 'circle'); ci.setAttribute('cx', b.x + b.width / 2); ci.setAttribute('cy', b.y + b.height / 2); ci.setAttribute('r', r);
    const t = document.createElementNS(NS_SVG, 'text'); t.setAttribute('x', b.x + b.width / 2); t.setAttribute('y', b.y + b.height / 2); t.setAttribute('dy', '.35em');
    t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', r * 1.15); t.textContent = texte;
    g.appendChild(ci); g.appendChild(t); svg.appendChild(g);
  }

  const INTEGRES = {
    // Z : toucher la bonne zone d'un schéma — F|corps|<svg …>…</svg> puis Z|Touche le cœur.|coeur|explication|sch=corps
    zone: {
      corps(q, c) {
        return `${c.repondu ? '' : '<div class="ex-legende">Touche la bonne zone sur le schéma.</div>'}<div class="ex-schema">${svgSur(q.svg)}</div>`;
      },
      monter(q, c) {
        monterSchema(q, c, 'zone', id => c.repondu ? (id === q.zone ? 'ok' : id === c.donne ? 'ko' : '') : '');
      },
      attendu: () => 'la zone en vert sur le schéma'
    },
    // E : légender un schéma — E|Légende le schéma.|coeur=Cœur|poumons=Poumons|explication|sch=corps
    legende: {
      corps(q, c) {
        const s = etat(q, () => ({ ordre: melangeDifferent(q.legendes.length, q.legendes.map(l => l[1])), sel: null, place: {} }));
        const place = c.repondu ? (c.donne && typeof c.donne === 'object' ? c.donne : {}) : s.place;
        const numDe = {}; Object.keys(place).forEach(z => { numDe[place[z]] = z; });
        const etiquettes = s.ordre.map(i => {
          const pose = numDe[i] != null, cls = c.repondu ? (pose && q.legendes.some(l => l[0] === numDe[i] && l[1] === q.legendes[i][1]) ? 'ok' : 'ko') : s.sel === i ? 'choisi' : pose ? 'pose' : '';
          return puce((pose ? `<span class="ex-num">${s.ordre.indexOf(i) + 1}</span>` : '') + esc(q.legendes[i][1]), cls, 'legende-choisir', i, c.repondu);
        }).join('');
        return `${c.repondu ? '' : '<div class="ex-legende">Touche une étiquette, puis sa place sur le schéma. Touche une zone déjà légendée pour la libérer.</div>'}<div class="ex-schema">${svgSur(q.svg)}</div><div class="ex-ligne">${etiquettes}</div>` +
          valider(!c.repondu && Object.keys(s.place).length === q.legendes.length, 'legende-valider', !c.repondu && aPlacer(q.legendes.length - Object.keys(s.place).length, 'étiquette'));
      },
      monter(q, c) {
        const s = E && E.q === q ? E : { ordre: [], place: {} };
        const place = c.repondu ? (c.donne && typeof c.donne === 'object' ? c.donne : {}) : s.place;
        const zones = q.legendes.map(l => l[0]), juste = z => place[z] != null && q.legendes[place[z]] && q.legendes.some(l => l[0] === z && l[1] === q.legendes[place[z]][1]);
        monterSchema(q, c, 'legende-poser', id => zones.indexOf(id) < 0 ? 'neutre' : c.repondu ? (juste(id) ? 'ok' : 'ko') : place[id] != null ? 'pose' : '');
        const svg = document.querySelector('.ex-schema svg'); if (!svg) return;
        Object.keys(place).forEach(z => pastilleZone(svg, z, String(s.ordre.indexOf(place[z]) + 1), c.repondu ? (juste(z) ? 'ok' : 'ko') : ''));   // même numéro que l'étiquette
      },
      attendu: q => q.legendes.map(l => '<b>' + esc(l[1]) + '</b>').join(', ') + ' (chacune à sa place sur le schéma)'
    },

    // G : texte à trous — G|Il [a] faim et [est;était] fatigué.|explication
    trous: {
      corps(q, c) {
        let k = 0;
        const parts = trousDe(q), nb = parts.filter(p => p.rep).length;
        // même largeur pour tous les trous : la taille de la case ne trahit pas la longueur de la réponse
        const larg = Math.max(5, ...parts.filter(p => p.rep).map(p => Math.max(...p.rep.map(r => r.length)) + 2));
        const html = parts.map(p => {
          if (p.txt != null) return esc(p.txt);
          const i = k++;
          if (!c.repondu) return `<input class="ex-trou" data-i="${i}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="${i + 1 < nb ? 'next' : 'done'}" aria-label="Trou ${i + 1}" style="width:${larg}ch">`;
          const donne = (Array.isArray(c.donne) ? c.donne : [])[i] || '', bon = comparer(p.rep, donne, regles(q)) === 1;
          return `<span class="ex-mot ${bon ? 'ok' : 'ko'}">${esc(donne || '…')}${SR(bon ? 'ok' : 'ko')}</span>`;
        }).join('');
        return `<div class="ex-texte">${html}</div>${c.repondu ? '' : `<button class="validate-btn ex-valider" onclick="${ex('trous')}">Valider ✓</button>`}`;
      },
      monter(q, c) { if (!c.repondu && !q.dire) { const i = document.querySelector('.ex-trou'); if (i) setTimeout(() => i.focus(), 30); } },
      entree: () => {   // Entrée : passe au trou vide suivant, valide quand tout est rempli
        const t = [...document.querySelectorAll('.ex-trou')], i = t.indexOf(document.activeElement);
        const suivant = t.slice(i + 1).concat(t.slice(0, i + 1)).find(x => !x.value.trim());
        if (suivant && suivant !== document.activeElement) return suivant.focus();
        actionExercice('trous');
      },
      attendu: q => trousDe(q).map(p => p.txt != null ? esc(p.txt) : `<b>${esc(p.rep[0])}</b>`).join('')
    },
    // O : remettre dans l'ordre — O|consigne|élément 1|élément 2|élément 3 (écrits dans le bon ordre)
    ordre: {
      corps(q, c) {
        const s = etat(q, () => ({ melange: melangeDifferent(q.items.length, q.items), choisis: [] }));
        const choix = c.repondu ? (Array.isArray(c.donne) ? c.donne : []) : s.choisis;
        const rep = choix.map((i, p) => puce(esc(q.items[i]), c.repondu ? (q.items[i] === q.items[p] ? 'ok' : 'ko') : 'pose', 'ordre-retirer', p, c.repondu)).join('');
        const reste = c.repondu ? '' : s.melange.filter(i => !s.choisis.includes(i)).map(i => puce(esc(q.items[i]), '', 'ordre-ajouter', i)).join('');
        return `<div class="ex-zone"><div class="ex-legende">Ta réponse (touche un élément pour le retirer)</div><div class="ex-ligne ordre">${rep || '<span class="ex-vide">Touche les éléments dans l\'ordre…</span>'}</div></div>` +
          (reste ? `<div class="ex-ligne">${reste}</div>` : '') + valider(!c.repondu && s.choisis.length === q.items.length, 'ordre-valider', !c.repondu && aPlacer(q.items.length - s.choisis.length, 'élément'));
      },
      attendu: q => q.items.map(esc).join(' → ')
    },
    // A : associer — A|consigne|dog=chien|cat=chat
    paires: {
      corps(q, c) {
        const s = etat(q, () => ({ droite: melangeDifferent(q.paires.length, q.paires.map(p => p[1])), sel: null, selD: null, lien: {} }));
        const juste = (g, d) => g === d || (q.paires[g] && q.paires[d] && q.paires[g][1] === q.paires[d][1]);   // deux fois le même mot à droite
        const lien = c.repondu ? (c.donne && typeof c.donne === 'object' ? c.donne : {}) : s.lien;
        const numDroite = {}; Object.keys(lien).forEach(g => { numDroite[lien[g]] = +g; });
        const gauche = q.paires.map((p, i) => {
          const lie = lien[i] != null, cls = c.repondu ? (lie && juste(i, lien[i]) ? 'ok' : 'ko') : (s.sel === i ? 'choisi' : lie ? 'pose' : '');
          return puce((lie ? `<span class="ex-num">${i + 1}</span>` : '') + esc(p[0]), cls, 'paire-g', i, c.repondu);
        }).join('');
        const droite = s.droite.map(j => {
          const g = numDroite[j], cls = c.repondu ? (g == null ? '' : juste(g, j) ? 'ok' : 'ko') : s.selD === j ? 'choisi' : g != null ? 'pose' : '';
          return puce((g != null ? `<span class="ex-num">${g + 1}</span>` : '') + esc(q.paires[j][1]), cls, 'paire-d', j, c.repondu);
        }).join('');
        return `${c.repondu ? '' : '<div class="ex-legende">Touche un élément, puis celui qui va avec dans l\'autre colonne.</div>'}<div class="ex-paires"><div class="ex-col">${gauche}</div><div class="ex-col">${droite}</div></div>` +
          valider(!c.repondu && Object.keys(s.lien).length === q.paires.length, 'paire-valider', !c.repondu && `Encore ${q.paires.length - Object.keys(s.lien).length} paire${q.paires.length - Object.keys(s.lien).length > 1 ? 's' : ''} à former`);
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
          const dedans = s.ordre.filter(i => place[i] === gi).map(i => puce(esc(tous[i].t), c.repondu ? (tous[i].gi === gi || g.items.includes(tous[i].t) ? 'ok' : 'ko') : 'pose', 'classer-retirer', i, c.repondu)).join('');
          // toute la case se touche ; au clavier, un vrai bouton « Ranger ici » apparaît dès qu'un élément est choisi
          const ranger = !c.repondu && s.sel != null ? `<button type="button" class="ex-case-btn" data-f="classer-poser:${gi}" onclick="${ex('classer-poser', gi)}" aria-label="Ranger dans « ${esc(g.nom)} »">Ranger ici</button>` : '';
          return `<div class="ex-case" ${c.repondu ? '' : `onclick="if(!event.target.closest('.ex-puce, .ex-case-btn'))${ex('classer-poser', gi)}"`}><div class="ex-case-nom">${esc(g.nom)}</div><div class="ex-ligne">${dedans}</div>${ranger}</div>`;
        }).join('');
        return `${c.repondu ? '' : '<div class="ex-legende">Touche un élément, puis la case où il va. Touche un élément rangé pour le déplacer.</div>'}${libres ? `<div class="ex-ligne">${libres}</div>` : ''}<div class="ex-cases${!c.repondu && s.sel != null ? ' pret' : ''}">${cases}</div>` +
          valider(!c.repondu && Object.keys(s.place).length === tous.length, 'classer-valider', !c.repondu && aPlacer(tous.length - Object.keys(s.place).length, 'élément'));
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
          return `<button type="button" class="ex-motbtn ${cls}" data-f="cliquer:${i}"${!c.repondu && pris ? ' aria-pressed="true"' : ''} ${c.repondu ? 'disabled' : `onclick="${ex('cliquer', i)}"`}>${esc(m.mot)}${SR(cls)}</button>`;
        }).join(' ');
        return `<div class="ex-texte">${mots}</div>` + valider(!c.repondu && s.sel.length > 0, 'cliquer-valider', !c.repondu && 'Touche au moins un mot');
      },
      attendu: q => motsDe(q).filter(m => m.bon).map(m => '<b>' + esc(m.mot) + '</b>').join(', ')
    },
    // N : nombre avec tolérance — N|√2 ≈ ?|1,414|0,01|explication
    nombre: {
      corps(q, c) {
        return `<div class="input-row"><input id="ans-input" class="ans-input ${c.repondu ? (c.ok ? 'ok' : 'ko') : ''}" inputmode="${parseFloat(String(q.a).replace(',', '.')) < 0 ? 'text' : 'decimal'}" enterkeyhint="done" autocomplete="off" value="${c.repondu ? esc(c.donne) : ''}" ${c.repondu ? 'disabled' : ''} placeholder="Ta réponse…">` +
          `${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ''}${c.repondu ? '' : `<button class="validate-btn" onclick="${ex('nombre')}">Valider ✓</button>`}</div>`;
      },
      monter(q, c) { if (!c.repondu && !q.dire) { const i = document.getElementById('ans-input'); if (i) setTimeout(() => i.focus(), 30); } },
      entree: () => actionExercice('nombre'),
      attendu: q => esc(String(q.a).replace('.', ',')) + (q.tol ? ' (à ' + esc(String(q.tol).replace('.', ',')) + ' près)' : '') + (q.unit ? ' ' + esc(q.unit) : '')
    },
    // P : parler au micro — P|Répète.|I would like a glass of water.  (* = réponse libre)
    parler: {
      corps(q, c) {
        const s = etat(q, () => ({ ecoute: false, entendu: '', erreur: '' }));
        const libre = q.phrase === '*';
        if (c.repondu) return `<div class="ex-zone">${c.donne ? `<div class="ex-legende">J'ai entendu :</div><div class="ex-entendu">« ${esc(c.donne)} »</div>` : ''}</div>`;
        const micro = Reco() ? `<button class="ecoute-btn ex-micro ${s.ecoute || s.attente ? 'actif' : ''}" onclick="${ex('parler')}">${s.ecoute ? '🎙️ Je t\'écoute…' : s.attente ? '🎤 Parle dans l\'autre page…' : '🎤 Parler'}</button>` : '';
        return (libre ? '' : `<div class="ex-phrase">${esc(q.phrase)}</div>`) +
          `<div class="ecoute-row">${micro}</div>` +
          (s.entendu ? `<div class="ex-legende">J'ai entendu :</div><div class="ex-entendu">« ${esc(s.entendu)} »</div>` : '') +
          (s.erreur ? `<div class="input-note">${esc(s.erreur)}</div>` : '') +
          // auto-évaluation : d'emblée si ce navigateur ne reconnaît pas la voix ; sinon seulement après un essai raté au micro
          // (micro bloqué, rien entendu, phrase pas reconnue), pour ne jamais rester bloqué sur la question
          ((!Reco() || s.entendu || s.erreur) ?
            `<div class="ex-legende">${Reco() ? 'Le micro ne t\'a pas compris ? ' : ''}Dis-le à voix haute, puis indique si tu as réussi :</div>` +
            `<div class="ecoute-row"><button type="button" class="ex-puce ex-auto ex-auto-oui" onclick="${ex('parler-auto', 1)}">👍 Je l'ai bien dit</button><button type="button" class="ex-puce ex-auto" onclick="${ex('parler-auto', 0)}">🔁 À retravailler</button></div>` : '') +
          aideMicro();
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
        const rendu = joue.map((m, i) => { const k = c.repondu ? (m === cible[i] ? 'ok' : 'ko') : ''; return `<span class="ex-mot ${k}">${nomNote(m)}${SR(k)}</span>`; }).join(' ');
        return `<div class="ex-zone"><div class="ex-legende">Tes notes (${joue.length}/${cible.length})</div><div class="ex-texte">${rendu || '<span class="ex-vide">Touche les notes du clavier…</span>'}</div></div>` +
          (c.repondu ? '' : `<div class="ex-clavier" style="grid-template-columns:repeat(${Math.min(touches.length, 8)},1fr)">${touches.map(m => `<button type="button" class="ex-touche ${[1, 3, 6, 8, 10].includes(m % 12) ? 'noire' : ''}" data-f="touche:${m}" onclick="${ex('touche', m)}">${nomNote(m)}</button>`).join('')}</div>` +
            (s.joue.length ? `<button class="ex-puce" data-f="effacer:" onclick="${ex('effacer')}">↺ Effacer</button>` : ''));
      },
      attendu: q => sequence(q).map(a => nomNote(a[0].midi)).join(' ')
    },
    // L : placer une note sur la portée — L|Place le sol|G4 ; on touche une ligne ou un interligne, puis Valider
    placer: {
      corps(q, c) {
        const cible = (sequence(q)[0] || [])[0]; if (!cible) return '';
        const s = etat(q, () => ({ pos: null }));
        const pos = c.repondu ? (typeof c.donne === 'number' ? c.donne : null) : s.pos;
        const bas = 120, demi = 9, X0 = 120, X1 = 400, xn = 300, PMIN = 26, PMAX = 42;    // pas 26 = la3 … 42 = do6 ; 30 = mi4 (1re ligne)
        let sv = '';
        for (let i = 0; i < 5; i++) sv += `<line x1="20" x2="${X1}" y1="${bas - i * 2 * demi}" y2="${bas - i * 2 * demi}" stroke="#334155" stroke-width="1.6"/>`;
        sv += `<text x="24" y="${bas + 11}" font-size="100" fill="#1e293b" font-family="'Noto Music','Segoe UI Symbol','Apple Symbols','Bravura',serif">𝄞</text>`;
        const tete = (p, coul) => {
          const y = bas - (p - 30) * demi; let t = '';
          for (let l = 28; l >= p; l -= 2) t += `<line x1="${xn - 20}" x2="${xn + 20}" y1="${bas - (l - 30) * demi}" y2="${bas - (l - 30) * demi}" stroke="#334155" stroke-width="1.6"/>`;
          for (let l = 40; l <= p; l += 2) t += `<line x1="${xn - 20}" x2="${xn + 20}" y1="${bas - (l - 30) * demi}" y2="${bas - (l - 30) * demi}" stroke="#334155" stroke-width="1.6"/>`;
          return t + `<ellipse cx="${xn}" cy="${y}" rx="12" ry="8.5" fill="${coul}" transform="rotate(-18 ${xn} ${y})"/>`;
        };
        if (c.repondu) { if (pos != null && pos !== cible.pas) sv += tete(pos, '#dc2626'); sv += tete(cible.pas, '#16a34a'); }
        else if (pos != null) sv += tete(pos, '#1e293b');
        if (!c.repondu) for (let p = PMIN; p <= PMAX; p++) {
          const y = bas - (p - 30) * demi;
          sv += `<rect x="${X0}" y="${y - demi / 2}" width="${X1 - X0}" height="${demi}" fill="transparent" style="cursor:pointer" data-f="placer:${p}" onclick="${ex('placer', p)}"><title>${NOMS_PAS[p % 7]}</title></rect>`;
        }
        const nomPos = pos == null ? '' : NOMS_PAS[pos % 7];
        return `<div class="ex-zone portee placer"><svg viewBox="0 0 420 ${bas + 60}" xmlns="http:\/\/www.w3.org/2000/svg" role="img" aria-label="Portée en clé de sol${nomPos ? ' : note placée sur ' + nomPos : ''}">${sv}</svg></div>` +
          (c.repondu ? '' : `<div class="ecoute-row"><button class="ex-puce" data-f="placer-haut:" onclick="${ex('placer-haut')}" aria-label="Monter la note">▲ Monter</button><button class="ex-puce" data-f="placer-bas:" onclick="${ex('placer-bas')}" aria-label="Descendre la note">▼ Descendre</button></div>` +
            valider(pos != null, 'placer-ok', 'Touche la portée pour placer la note'));
      },
      attendu: q => { const n = (sequence(q)[0] || [])[0]; return n ? NOMS_PAS[n.pas % 7] : ''; }
    }
  };
  const NOMS_PAS = ['do', 'ré', 'mi', 'fa', 'sol', 'la', 'si'];

  // un toucher trop rapide juste après le changement de question (double toucher sur « Question suivante ») est ignoré
  let toucher = false, tQuestion = 0;
  let doigtPose = false;
  document.addEventListener('pointerdown', e => { toucher = e.pointerType === 'touch'; doigtPose = true; }, true);
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { doigtPose = false; }, true));
  const tropTot = () => toucher && !navigator.webdriver && Date.now() - tQuestion < 400;   // (les tests automatiques enchaînent vite)
  function clignoter(sel) { const el = appli().querySelector(sel); if (!el) return; el.classList.remove('clignote'); void el.offsetWidth; el.classList.add('clignote'); }
  function actionExercice(action, n) {
    const q = shuffled && shuffled[cur]; if (!q || selected !== null || tropTot()) return;
    const s = E && E.q === q ? E : null;
    switch (action) {
      case 'trous': {
        const vals = [...document.querySelectorAll('.ex-trou')].map(i => i.value.trim());
        const vide = [...document.querySelectorAll('.ex-trou')].find(i => !i.value.trim());
        if (vide) { vide.focus(); return; }
        const reps = trousDe(q).filter(p => p.rep), R = regles(q);
        const res = vals.map((v, i) => reps[i] ? comparer(reps[i].rep, v, R) : 0);
        return enregistrer(vals, res.every(x => x === 1), vals.map(esc).join(' / '), res.every(x => x) && res.includes(2) ? 'accents' : '');
      }
      case 'ordre-ajouter': s.choisis.push(n); break;
      case 'ordre-retirer': s.choisis.splice(n, 1); break;
      case 'ordre-valider': return enregistrer(s.choisis.slice(), s.choisis.every((i, p) => q.items[i] === q.items[p]), s.choisis.map(i => esc(q.items[i])).join(' → '));
      // paires dans les deux sens : on peut commencer à gauche ou à droite ; toucher un élément déjà relié le détache et le choisit
      case 'paire-g': {
        if (s.selD != null) { Object.keys(s.lien).forEach(k => { if (s.lien[k] === s.selD) delete s.lien[k]; }); s.lien[n] = s.selD; s.selD = null; break; }
        if (s.sel === n) { s.sel = null; break; }
        delete s.lien[n]; s.sel = n; break;
      }
      case 'paire-d': {
        if (s.sel != null) { Object.keys(s.lien).forEach(k => { if (s.lien[k] === n) delete s.lien[k]; }); s.lien[s.sel] = n; s.sel = null; break; }
        if (s.selD === n) { s.selD = null; break; }
        Object.keys(s.lien).forEach(k => { if (s.lien[k] === n) delete s.lien[k]; }); s.selD = n; break;
      }
      case 'paire-valider': return enregistrer(Object.assign({}, s.lien), q.paires.every((p, i) => s.lien[i] === i || q.paires[s.lien[i]] && q.paires[s.lien[i]][1] === p[1]),
        q.paires.map((p, i) => esc(p[0]) + ' = ' + esc(q.paires[s.lien[i]][1])).join(' ; '));
      case 'zone': { const id = zonesDe(q)[n]; if (!id) return; return enregistrer(id, id === q.zone, id === q.zone ? 'la bonne zone' : 'une autre zone'); }
      case 'legende-choisir': s.sel = s.sel === n ? null : n; break;
      case 'legende-poser': {
        const id = zonesDe(q)[n]; if (!id || !q.legendes.some(l => l[0] === id)) return;
        if (s.sel == null) { if (s.place[id] != null) { s.sel = s.place[id]; delete s.place[id]; break; } return clignoter('.ex-legende'); }
        Object.keys(s.place).forEach(z => { if (s.place[z] === s.sel) delete s.place[z]; });
        s.place[id] = s.sel; s.sel = null; break;
      }
      case 'legende-valider': {
        const juste = q.legendes.every(l => s.place[l[0]] != null && q.legendes[s.place[l[0]]][1] === l[1]);
        return enregistrer(Object.assign({}, s.place), juste, q.legendes.map(l => esc(l[1]) + ' → ' + (s.place[l[0]] != null && q.legendes[s.place[l[0]]][1] === l[1] ? 'bien placé' : 'mal placé')).join(' ; '));
      }
      case 'classer-choisir': s.sel = s.sel === n ? null : n; break;
      case 'classer-poser': if (s.sel == null) return clignoter('.ex-legende'); s.place[s.sel] = n; s.sel = null; break;
      case 'classer-retirer': delete s.place[n]; s.sel = n; break;      // un élément mal rangé est repris en main : un toucher sur la bonne case suffit
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
        const x = parseFloat(v.replace(/\s/g, '').replace(',', '.').replace(/[−–]/, '-')), a = parseFloat(String(q.a).replace(/\s/g, '').replace(',', '.').replace(/[−–]/, '-')), tol = Math.abs(parseFloat(String(q.tol || 0).replace(',', '.'))) || 0;
        return enregistrer(v, isFinite(x) && Math.abs(x - a) <= tol + 1e-9);
      }
      case 'parler': {
        const R = Reco(); if (!R || !s) return;
        if (relaisMicro) { couperSon(); ouvrirPageParler(q, s); break; }
        if (s.ecoute) { try { s.reco && s.reco.stop(); } catch (e) {} return; }
        couperSon();
        const r = new R(); s.reco = r; r.lang = q.langue || C.langueAudio || 'en-GB'; r.interimResults = false; r.maxAlternatives = 3;
        r.onresult = e => resultatParler(q, s, [...e.results[0]].map(a => a.transcript));
        r.onerror = e => {
          s.ecoute = false;
          if ((e.error === 'not-allowed' || e.error === 'service-not-allowed') && window.top !== window) {
            // dans le cadre de Google : on passe à la page d'écoute (un nouveau toucher est nécessaire pour ouvrir un onglet)
            relaisMicro = true; try { localStorage.setItem('uq-relais-micro', '1'); } catch (x) {}
            s.erreur = 'Touche encore « Parler » : une page va s\'ouvrir pour t\'écouter.';
          } else s.erreur = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? MESSAGE_MICRO : e.error === 'network' ? 'La reconnaissance vocale a besoin d\'internet et de Chrome. Utilise les boutons ci-dessous.' : 'Je n\'ai rien entendu. Réessaie, ou utilise les boutons ci-dessous.';
          renderQuestion();
        };
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
      case 'placer': s.pos = n; jouerMidi(lireNote('CDEFGAB'[n % 7] + Math.floor(n / 7)).midi); break;
      case 'placer-haut': case 'placer-bas': s.pos = Math.max(26, Math.min(42, (s.pos == null ? 30 : s.pos) + (action === 'placer-haut' ? 1 : -1))); jouerMidi(lireNote('CDEFGAB'[s.pos % 7] + Math.floor(s.pos / 7)).midi); break;
      case 'placer-ok': { const c0 = (sequence(q)[0] || [])[0]; if (s.pos == null || !c0) return; return enregistrer(s.pos, s.pos === c0.pas, NOMS_PAS[s.pos % 7]); }
      default: return;
    }
    // au clavier : le focus reste sur l'élément touché (ou sur un voisin s'il a changé de place) au lieu de repartir du haut
    const actif = document.activeElement, f = actif && appli().contains(actif) && actif.getAttribute('data-f');
    renderQuestion();
    if (f) {
      const z = appli(), cible = z.querySelector(`[data-f="${f}"]:not([disabled])`) || z.querySelector(`[data-f^="${f.split(':')[0]}:"]:not([disabled])`)
        || z.querySelector('.ex-case-btn, .ex-valider:not([disabled]), .ex-puce:not([disabled])');
      if (cible) try { cible.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  // partie commencée (question affichée) : quitter par le logo en haut à gauche ou par le lien « Espace parent » en bas
  // demande TOUJOURS confirmation, dans une vraie fenêtre (pas de bulle qui disparaît, pas de « second toucher qui quitte »).
  // « Quitter » rejoue ensuite le clic d'origine : le lien suit son chemin habituel (pont, appli, nouvel onglet…).
  let sortieOk = false, lienSortie = null;
  const enPartie = () => state === 'q';
  function quitterQuiz(e) {
    if (!enPartie() || sortieOk) return true;
    if (e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
    lienSortie = e && e.currentTarget && e.currentTarget.tagName === 'A' ? e.currentTarget : (e && e.target && e.target.closest ? e.target.closest('a') : null);
    let d = document.getElementById('mq-quitter');
    if (!d) {
      d = document.createElement('div'); d.id = 'mq-quitter';
      d.innerHTML = '<div class="mq-q-boite" role="alertdialog" aria-modal="true" aria-labelledby="mq-q-titre" aria-describedby="mq-q-texte">' +
        '<button type="button" class="mq-q-croix mq-q-non" aria-label="Fermer">×</button>' +
        '<p id="mq-q-titre" class="mq-q-titre">Quitter le quiz ?</p><p id="mq-q-texte">Ta partie en cours ne sera pas enregistrée.</p>' +
        '<div class="mq-q-btns"><button type="button" class="mq-q-non">Continuer</button><button type="button" class="mq-q-oui">Quitter</button></div></div>';
      document.body.appendChild(d);
      d.addEventListener('click', ev => {
        if (ev.target === d || ev.target.closest('.mq-q-non')) return fermerQuitter();
        if (ev.target.closest('.mq-q-oui')) {
          const l = lienSortie; fermerQuitter(); sortieOk = true;
          if (l) l.click(); else location.href = 'index.html';
          setTimeout(() => { sortieOk = false; }, 1500);
        }
      });
      d.addEventListener('keydown', ev => { if (ev.key === 'Escape') fermerQuitter(); });
    }
    d.className = 'visible';
    setTimeout(() => { const b = d.querySelector('.mq-q-btns .mq-q-non'); if (b) b.focus(); }, 30);
    return false;
  }
  // le lien « Espace parent » en bas de page (ajouté par le pont) : même confirmation (écouteur posé avant ceux du pont)
  try {
    window.addEventListener('click', e => {
      const a = e.target && e.target.closest ? e.target.closest('#porte-parent a') : null;
      if (a && enPartie() && !sortieOk) quitterQuiz({ preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation(), stopImmediatePropagation: () => e.stopImmediatePropagation(), currentTarget: a, target: a });
    }, true);
  } catch (e) {}
  function fermerQuitter() { const d = document.getElementById('mq-quitter'); if (d) d.className = ''; lienSortie = null; }
  function enQuestion(oui) {
    document.body.classList.toggle('en-question', !!oui);
    if (!oui) fermerQuitter();
  }
  function quitter() { couperSon(); if (E && E.reco) try { E.reco.abort(); } catch (e) {} if (C && C.quitterQuestion) try { C.quitterQuestion(); } catch (e) {} }

  // revenir en arrière réaffiche la question telle qu'elle a été répondue, en lecture seule : la première réponse compte
  const repondue = i => answers[i] ? (answers[i].given === undefined ? '' : answers[i].given) : null;
  function prevQuestion() {
    if (cur === 0) return;
    quitter();
    cur--; selected = repondue(cur);
    renderQuestion();
  }
  function next() {
    if (tropTot()) return;                           // double toucher : la correction reste visible
    quitter();
    if (cur + 1 >= shuffled.length) { renderResult(); return; }
    cur++; selected = repondue(cur); tQuestion = Date.now();
    renderQuestion();
  }

  function ctxDe(q) {
    const r = answers[cur];
    return { q, repondu: selected !== null, donne: r ? r.given : null, ok: !!(r && r.ok), repondre: enregistrer, rafraichir: renderQuestion };
  }

  function renderQuestion() {
    enQuestion(true);
    const q = shuffled[cur];
    const pct = ((cur + 1) / shuffled.length) * 100;
    const dots = shuffled.map((_, i) => { const r = answers[i]; return `<div class="streak-dot ${r ? (r.ok ? 'correct' : 'wrong') : ''}"></div>`; }).join('');
    const answered = selected !== null;
    const ok = answered && answers[cur] && answers[cur].ok;
    const T = custom(q);
    const indice = q.hint && !answered
      ? (C.indicesVisibles ? `<div class="input-hint">💡 ${H(q.hint)}</div>`
        : `<button class="hint-btn" id="hint-btn" onclick="MoteurQuiz.indice()">💡 Voir un indice</button><div id="hint-text" class="input-hint" style="display:none">💡 ${H(q.hint)}</div>`) : '';

    let body;
    if (T) body = T.corps(q, ctxDe(q));
    else if (q.type === 'qcm') {
      body = `<div class="options-grid ${C.classeOptions ? (C.classeOptions(q) || '') : optionsDessins(q) ? 'opts-dessins' : ''}">${q.opts.map((opt, i) => {
        let cls = 'opt-btn';
        if (answered) cls += opt === q.a ? ' correct' : opt === selected ? ' wrong' : ' neutral';
        return `<button class="${cls}" ${answered ? 'disabled' : ''} onclick="MoteurQuiz.answer(${i})"><span class="opt-letter">${NUMS[i]}</span><span class="opt-body">${optHTML(q, opt)}</span>${answered ? SR(opt === q.a ? 'ok' : opt === selected ? 'ko' : '') : ''}</button>`;
      }).join('')}</div>`;
    } else {
      body = `${q._ecrit && !answered ? `<div class="ecrit-tag">${ic('crayon')} Niveau supérieur : écris la réponse !</div>` : ''}<div class="input-row">
          <input id="ans-input" class="ans-input ${answered ? (ok ? 'ok' : 'ko') : ''}" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            placeholder="${esc(C.placeholder || 'Ta réponse…')}" value="${answered ? esc(selected) : ''}" ${answered ? 'disabled' : ''}>
          ${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ''}
          ${answered ? '' : '<button class="validate-btn" onclick="MoteurQuiz.validate()">Valider ✓</button>'}
        </div>
        ${q._ecrit && !answered ? '<button class="hint-btn btn-props" onclick="MoteurQuiz.propositions()">Voir les propositions</button>' : ''}
        ${!answered && C.noteSaisie ? `<div class="input-note">${typeof C.noteSaisie === 'function' ? C.noteSaisie(q) : C.noteSaisie}</div>` : ''}`;
    }
    let expBlock = '';
    if (answered) {
      const att = String(attendu(q)).replace(/\s+$/, ''), fin = /[.!?…»]$/.test(att.replace(/<[^>]*>/g, '')) ? '' : '.';
      const accents = !ok && answers[cur] && answers[cur].note === 'accents';
      const intro = ok ? ton().ok : accents ? `⚠️ Attention à l'orthographe (accents, apostrophes, traits d'union) : la bonne réponse s'écrit <strong>${att}</strong>${fin}` : `${ton().ko} <strong>${att}</strong>${fin}`;
      const exp = H(q.exp || q.e || '');
      expBlock = ok ? `<div class="explanation" role="status" aria-live="polite">${intro}${exp ? '<br>' + exp : ''}</div>`
        : compagnon() ? `<div class="explanation" role="status" aria-live="polite">${intro}${exp ? '<br>' + exp : ''}</div>`
        : `<div class="explanation avec-mascotte" role="status" aria-live="polite"><span class="mascotte m-encouragement" aria-hidden="true"></span><div>${intro}${exp ? '<br>' + exp : ''}</div></div>`;
    }
    const nextLabel = cur + 1 >= shuffled.length ? 'Voir le résultat ›' : duel ? `Au tour de ${esc(duel.noms[joueur(cur + 1)])} ›` : 'Question suivante ›';
    const points = duel ? `<span class="score-badge duel"><span class="j0">${esc(duel.noms[0])} ${scoreDe(0)}</span><span class="j1">${esc(duel.noms[1])} ${scoreDe(1)}</span></span>`
      : `<span class="score-badge">${ic('etoile', 'fill:#e8a83a;stroke:#e8a83a')} ${score()} pts</span>`;

    appli().innerHTML = `
      <div class="barre-quiz">
        <a class="btn-myquiz ib" href="index.html" title="Retour à SoccaQuiz" aria-label="Retour à SoccaQuiz" onclick="return MoteurQuiz.quitterQuiz(event)"><img src="https:\/\/leian.github.io/UNIVERSALQUIZ/icone-96.png" width="26" height="26" alt=""></a>
        <button class="btn-prev ib" onclick="MoteurQuiz.prev()" ${cur === 0 ? 'disabled' : ''} title="Question précédente" aria-label="Question précédente">${ic('prec')}</button>
        <div class="prog"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div><span class="counter">Question ${cur + 1} / ${shuffled.length}</span></div>
        ${points}
      </div>
      <div class="streak-bar">${dots}</div>
      <div class="question-card">
        ${duel ? `<div class="duel-tour j${joueur(cur)}">${ic('duo')} À toi, ${esc(duel.noms[joueur(cur)])} !</div>` : ''}
        <span class="cat-tag">${C.icones && C.icones[q.cat] ? emojiImg(C.icones[q.cat]) + ' ' : ''}${H(q.cat || '')}</span>
        ${visuel(q)}
        ${compagnon() ? `<div class="q-compagnon"><span class="mascotte compagnon ${answered ? (ok ? 'm-bravo' : 'm-encouragement') : 'm-reflexion'}" aria-hidden="true"></span><div class="q-compagnon-texte">${answered && !duel ? `<div class="bulle" aria-hidden="true">${esc(bulle(ok, answers[cur] && answers[cur].note, serieEnCours()))}</div>` : ''}<div class="question-text">${texteQuestion(q)}</div></div></div>`
          : `<div class="question-text">${texteQuestion(q)}</div>`}
        ${C.blocQuestion ? (C.blocQuestion(q, answered) || '') : ''}
        ${blocEcoute(q, answered)}
        ${body}
        ${indice}
        ${expBlock}
      </div>
      ${answered ? `<div class="clearfix"><button class="next-btn" onclick="MoteurQuiz.next()">${nextLabel}</button></div>` : ''}`;
    defiler('q' + cur, answered);
    if (T && T.monter) T.monter(q, ctxDe(q));
    if (q.dire) verifierVoix(langueLue(q));
    if (!answered) {
      // phrase à écouter : pas de clavier ouvert d'office (sur Android, le clavier qui se ferme pendant la lecture fige la page)
      if (q.type === 'input' && !q.dire) { const inp = document.getElementById('ans-input'); if (inp) setTimeout(() => inp.focus(), 30); }
      if (C.avantQuestion) try { C.avantQuestion(q); } catch (e) { console.warn(e); }
      // petits : question lue une seule fois (pas à chaque toucher dans un exercice) ; tout de suite si l'affichage
      // vient d'un toucher (iOS refuse une lecture lancée plus tard), sinon après un court délai
      if (profil().lecture === 'auto' && !q.dire && !duel && lu !== q) {
        lu = q;
        if (navigator.userActivation && navigator.userActivation.isActive) lireQuestion(); else setTimeout(lireQuestion, 250);
      }
    }
  }

  /* ---------- résultats ---------- */
  function renderResultDuel() {
    enQuestion(false);
    const s = [scoreDe(0), scoreDe(1)], N = duel.noms, n = duel.n;
    const titre = s[0] === s[1] ? 'Égalité, belle équipe !' : `Bravo ${esc(N[s[0] > s[1] ? 0 : 1])} !`;
    const msg = s[0] === s[1] ? 'Vous êtes aussi forts l\'un que l\'autre.' : `${esc(N[s[0] > s[1] ? 1 : 0])}, une revanche ?`;
    const wrong = shuffled.map((q, i) => ({ q, i, r: answers[i] })).filter(x => !x.r || !x.r.ok);
    appli().innerHTML = `
      <div class="result-card">
        <div class="fin-mascotte"><span class="mascotte m-bravo" aria-hidden="true"></span><span class="fin-emoji">${s[0] === s[1] ? '🤝' : '🏆'}</span></div>
        <div class="result-msg" style="font-size:22px;font-weight:700">${titre}</div>
        <div class="duel-scores">${[0, 1].map(j => `<div class="j${j}${s[j] > s[1 - j] ? ' gagne' : ''}"><b>${s[j]}<small>/${n}</small></b><span>${esc(N[j])}</span></div>`).join('')}</div>
        <div class="result-msg">${msg}</div>
        <div class="result-btns">
          <button class="btn-replay" onclick="MoteurQuiz.revanche()">${ic('rejouer')} Revanche</button>
          <button class="btn-home" onclick="MoteurQuiz.famille()">${ic('duo')} Changer les joueurs</button>
          <button class="btn-home" onclick="MoteurQuiz.home()">${ic('debut')} Jouer seul</button>
        </div>
        ${wrong.length ? `<div class="review-section"><div class="review-title">Les questions à revoir ensemble</div>${wrong.map(x => `<div class="review-item">
          <div class="review-item-num"><span class="duel-nom j${joueur(x.i)}">${esc(N[joueur(x.i)])}</span> · ${H(x.q.cat || '')}</div>
          <div class="review-item-q">${texteQuestion(x.q)}</div>
          <div class="review-item-answers"><div class="review-ans correct-ans"><span class="review-ans-label">Bonne réponse</span><span>${attendu(x.q)}</span></div></div>
          ${x.q.exp ? `<div class="review-exp">💡 ${H(x.q.exp)}</div>` : ''}</div>`).join('')}</div>` : ''}
      </div>`;
    defiler('result');
    if (s[0] !== s[1] && window.celebrate && profil().animaux !== false) celebrate();
    // l'enfant (joueur 1 avec son prénom) : ses réponses comptent pour ses révisions et sa maîtrise
    // (sans prénom dans les réglages : seulement si « Joueur 1 » n'a pas été renommé, un parent peut jouer en premier)
    if (window.Suivi && N[0] === (PRENOM_ENFANT || 'Joueur 1')) {
      const miens = shuffled.map((q, i) => ({ q, i })).filter(x => joueur(x.i) === 0);
      Suivi.enregistrer({ titre: C.titre, matiere: C.matiere, score: s[0], total: miens.length, mode: 'duel', questions: miens.map(x => resumeQuestion(x.q, x.i)) });
    }
  }
  // ce qu'on envoie au suivi pour une question (la question entière si elle est ratée, pour « Mes révisions »)
  function resumeQuestion(q, i) {
    const ok = !!(answers[i] && answers[i].ok), k = cleQuestion(q);
    let o = '';
    if (!ok && !C.texteQuestion && !C.figure) { try { const src = q._orig || q; o = JSON.stringify(Object.assign({}, src, { k, src: src.src || C.titre, mat: src.mat || C.matiere, ico: src.ico || (C.icones && C.icones[q.cat]) || '' })); if (o.length > 6000) o = ''; } catch (e) { o = ''; } }
    return { q: texteQuestion(q), cat: q.cat, donne: answers[i] ? texteReponse(q, answers[i]) : '', attendu: attendu(q), ok, k, o, i: !!(answers[i] && answers[i].i) };
  }

  /* ---------- signaler une erreur (site de l'enfant) ----------
     Sous chaque question à réviser et sous « À retenir » : l'enfant dit ce qui ne va pas ; le signalement va à son
     parent (onglet Résultats de l'espace parent), qui corrige le quiz ou l'envoie à SoccaQuiz. */
  const peutSignaler = () => !!(window.__UQ && __UQ.espace === 'enfant' && window.google && google.script && google.script.run);
  const sansBalises = h => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  function boutonSignaler(i) {
    return peutSignaler() ? `<div class="signaler-zone" data-i="${i}"><button type="button" class="signaler" onclick="MoteurQuiz.signaler(${i}, this)">${ic('drapeau')} Signaler une erreur</button></div>` : '';
  }
  function signaler(i, bouton) {
    const zone = bouton && bouton.closest('.signaler-zone');
    if (!zone || zone.querySelector('form')) return;
    const q = i >= 0 ? shuffled[i] : null;
    const motifs = q ? [['reponse', 'La bonne réponse est fausse'], ['question', 'La question est mal écrite ou je ne la comprends pas'], ['autre', 'Autre chose']]
      : [['rappel', 'Un rappel de la leçon est faux'], ['autre', 'Autre chose']];
    zone.insertAdjacentHTML('beforeend', `<form class="signaler-form" onsubmit="return false">
        <fieldset><legend>Qu'est-ce qui ne va pas ?</legend>
          ${motifs.map((m, k) => `<label><input type="radio" name="motif-${i}" value="${m[0]}" ${k ? '' : 'checked'}> ${m[1]}</label>`).join('')}</fieldset>
        <label class="signaler-rq">Tu peux expliquer (si tu veux)<textarea maxlength="300" rows="2"></textarea></label>
        <div class="signaler-bts"><button type="button" class="signaler-non">Annuler</button><button type="button" class="signaler-oui">Envoyer</button></div>
        <p class="signaler-msg" role="status" aria-live="polite"></p></form>`);
    bouton.hidden = true;
    const f = zone.querySelector('form'), msg = f.querySelector('.signaler-msg');
    f.querySelector('.signaler-non').onclick = () => { f.remove(); bouton.hidden = false; bouton.focus(); };
    f.querySelector('.signaler-oui').onclick = () => {
      const ok = f.querySelector('.signaler-oui'); ok.disabled = true; msg.textContent = 'Envoi…';
      const src = q ? (q._orig || q) : null;
      let memo = ''; if (!q) { try { memo = typeof C.memo === 'function' ? C.memo() : (C.memo || ''); } catch (e) {} }
      google.script.run
        .withSuccessHandler(r => {
          if (!r || r.erreur) { ok.disabled = false; msg.textContent = (r && r.erreur) || 'Envoi impossible. Réessaie plus tard.'; return; }
          f.innerHTML = `<p class="signaler-merci">${ic('check')} Merci ! Ton parent va regarder ça.</p>`;
        })
        .withFailureHandler(() => { ok.disabled = false; msg.textContent = 'Envoi impossible (connexion ?). Réessaie plus tard.'; })
        .apiSignaler({
          page: (window.__UQ && __UQ.page) || '', titre: (src && src.src) || C.titre,
          question: q ? sansBalises(texteQuestion(q)) : 'À retenir : ' + sansBalises(memo).replace(/^📝\s*À retenir\s*/, '').slice(0, 300),
          attendu: q ? sansBalises(attendu(q)) : '', k: q ? cleQuestion(q) : '',
          motif: (f.querySelector('input[type=radio]:checked') || {}).value || 'autre', remarque: f.querySelector('textarea').value
        });
    };
    const premier = f.querySelector('input'); if (premier) premier.focus();
  }

  function renderResult() {
    enQuestion(false);
    state = 'result';
    if (duel) return renderResultDuel();
    const sc = score(), n = shuffled.length, pct = Math.round((sc / n) * 100);
    let msg, emoji;
    const T0 = ton().fin;
    if (pct >= 85) { msg = C.msgExcellent || T0[0]; emoji = '🏅'; }
    else if (pct >= 60) { msg = C.msgBien || T0[1]; emoji = '👍'; }
    else if (pct >= 40) { msg = T0[2]; emoji = '📖'; }
    else { msg = T0[3]; emoji = '💪'; }
    // partie normale : ni « Refaire mes erreurs », ni « Mes révisions » / défi du mois (seule elle compte pour le badge et le record)
    const normale = mode === 'normal' && !pageRevision();
    // collège, lycée, parent : durée et meilleur score sur ce quiz
    const avant = normale ? meilleurScore(pct) : null;
    let stats = '';
    if (profil().stats) {
      const sec = Math.max(1, Math.round((Date.now() - (tDebut || Date.now())) / 1000));
      const duree = sec < 60 ? sec + ' s' : Math.floor(sec / 60) + ' min' + (sec % 60 ? ' ' + (sec % 60) + ' s' : '');
      stats = `<div class="result-stats"><span>${ic('chrono')} ${duree} · ${Math.round(sec / n)} s par question</span>` +
        (normale ? `<span>${ic('trophee')} ${avant == null ? 'Premier essai sur ce quiz' : pct > avant ? `Nouveau record (avant : ${avant} %)` : `Meilleur score : ${avant} %`}</span>` : '') + '</div>';
    }

    const catStats = {};
    shuffled.forEach((q, i) => { const c = q.cat || '—'; catStats[c] = catStats[c] || { ok: 0, total: 0 }; catStats[c].total++; if (answers[i] && answers[i].ok) catStats[c].ok++; });
    const catRows = Object.entries(catStats).map(([cat, s]) => {
      const p = Math.round((s.ok / s.total) * 100), color = p >= 70 ? '#16a34a' : p >= 40 ? '#d97706' : '#dc2626';
      return `<tr><td>${H(cat)}</td><td>${s.ok}/${s.total}</td><td><div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:${color}"></div></div></td></tr>`;
    }).join('');

    const wrong = shuffled.map((q, i) => ({ q, i, r: answers[i] })).filter(x => !x.r || !x.r.ok);
    const wrongHtml = wrong.map(item => {
      const svg = (C.figure && C.figure(item.q)) || item.q.svg;
      const exp = H(item.q.exp || item.q.e || '');
      return `<div class="review-item">
          <div class="review-item-num">Question ${item.i + 1} · ${H(item.q.cat || '')}</div>
          ${svg ? `<div class="review-fig">${svg}</div>` : ''}
          <div class="review-item-q">${texteQuestion(item.q)}</div>
          <div class="review-item-answers">
            <div class="review-ans wrong-ans"><span class="review-ans-label">Ta réponse</span><span>${texteReponse(item.q, item.r)}</span></div>
            <div class="review-ans correct-ans"><span class="review-ans-label">Bonne réponse</span><span>${attendu(item.q)}</span></div>
          </div>
          ${exp ? `<div class="review-exp">💡 ${exp}</div>` : ''}
        ${boutonSignaler(item.i)}</div>`;
    }).join('');
    const reviewSection = wrong.length === 0
      ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:1rem;text-align:center;margin-top:2rem;color:#14532d;font-weight:600;">🎉 Parfait ! Aucune erreur à réviser.</div>`
      : `<div class="review-section"><div class="review-title">❌ ${wrong.length} question${wrong.length > 1 ? 's' : ''} à réviser</div>${wrongHtml}</div>`;
    let memo = '';
    try { memo = typeof C.memo === 'function' ? C.memo() : (C.memo || ''); } catch (e) { console.warn('memo', e); }

    appli().innerHTML = `
      <div class="result-card">
        <div class="fin-mascotte"><span class="mascotte ${pct >= 60 ? 'm-bravo' : 'm-encouragement'}" aria-hidden="true"></span><span class="fin-emoji">${emoji}</span></div>
        ${profil().coche && pct >= 60 ? '<svg class="coche-fin" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>' : ''}
        <div class="result-score">${sc}<span style="font-size:28px;color:#6b7280">/${n}</span></div>
        <div class="result-label">${pct}% de bonnes réponses</div>
        <div class="result-msg">${msg}</div>
        ${stats}
        <table class="cat-table"><thead><tr><th>Thème</th><th>Score</th><th>Résultat</th></tr></thead><tbody>${catRows}</tbody></table>
        <p style="font-size:13px;color:#6b7280;margin-bottom:0.5rem">Les questions changent à chaque partie !</p>
        <div class="result-btns">
          <button class="btn-replay" onclick="MoteurQuiz.start()">${ic('rejouer')} Rejouer</button>
          ${wrong.length ? `<button class="btn-home" onclick="MoteurQuiz.erreurs()">${ic('cible')} Refaire mes erreurs (${wrong.length})</button>` : ''}
          <button class="btn-home" onclick="MoteurQuiz.home()">${ic('debut')} Début du quiz</button>
          ${MES_QUIZ}
        </div>
        ${reviewSection}
        ${memo}${memo ? boutonSignaler(-1) : ''}
      </div>`;
    envelopperLarges(appli());
    defiler('result');

    if (window.Suivi) noteEnvoi(Suivi.enregistrer({
      titre: C.titre, matiere: C.matiere, score: sc, total: n, mode: mode !== 'normal' ? mode : pageRevision() ? 'revision' : 'normal',
      questions: shuffled.map((q, i) => resumeQuestion(q, i))
    }));
    if (sc === n && normale && window.Badges && Badges.gagner()) {
      const msgEl = appli().querySelector('.result-msg');
      if (msgEl) msgEl.insertAdjacentHTML('afterend', `<div class="bp-nouveau">${Badges.badgeHTML()}<div><b>Nouveau badge gagné !</b>Sans aucune faute : le badge « ${esc(Badges.titre()) || H(C.titre)} » rejoint tes récompenses.</div></div>`);
    }
    const P = profil();
    // primaire : la scène du capybara devient une surprise rare (une partie parfaite sur trois)
    const capy = P.animal != null ? pct === 100 && Math.random() < 1 / 3 : (n - sc) / n < 0.25;
    if (capy && window.showCapybara && P.animaux !== false) setTimeout(showCapybara, 500);
    if (window.Animations) Animations.fin(pct, themeActuel());
  }
  // pages « Mes révisions » et défi du mois, fabriquées par le serveur
  const pageRevision = () => { let p = (window.__UQ && window.__UQ.page) || ''; if (!p) try { p = decodeURIComponent(location.pathname.split('/').pop() || ''); } catch (e) {} return /^(revisions|defi)$/i.test(String(p).replace(/\.html?$/i, '')); };
  // résultat pas encore parti (hors ligne…) : petite note sur l'écran de fin
  function noteEnvoi(envoi) {
    if (!window.Suivi || !Suivi.enAttente) return;
    Promise.resolve(envoi).then(() => {
      if (state !== 'result' || !Suivi.enAttente() || appli().querySelector('.attente-envoi')) return;
      const b = appli().querySelector('.result-btns');
      if (b) b.insertAdjacentHTML('beforebegin', '<p class="attente-envoi" role="status">Résultat gardé sur cet appareil : il sera envoyé dès que la connexion reviendra.</p>');
    }).catch(() => {});
  }
  function refaireErreurs() {
    // repart des questions d'origine, en remettant à zéro les états de manipulation (rangement, clic…)
    const liste = shuffled.filter((q, i) => !(answers[i] && answers[i].ok)).map(q => {
      const o = { ...(q._orig || q) };
      ['picked', 'built'].forEach(k => { if (Array.isArray(o[k])) o[k] = []; });
      if ('clicked' in o) o.clicked = null;
      return o;
    });
    if (liste.length) startQuiz(liste, false, 'erreurs');
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
    // un bouton ou un lien qui a le focus garde son action (« Défi en famille », « ‹ », lien de retour…)
    if (e.target && e.target.closest && e.target.closest('button, a[href], [role=button], select, textarea, summary')) return;
    if (state === 'start') { e.preventDefault(); debloquerVoix(); startQuiz(); return; }
    if (state === 'famille') { e.preventDefault(); lancerDuel(); return; }
    if (state !== 'q') return;
    const q = shuffled[cur], T = custom(q);
    if (selected !== null) { e.preventDefault(); next(); return; }
    if (T) { if (T.entree) { e.preventDefault(); T.entree(ctxDe(q)); } return; }
    if (q.type === 'input') { e.preventDefault(); validateInput(); }
  });

  window.MoteurQuiz = {
    lancer(cfg) {
      C = Object.assign({ nbQuestions: 20 }, cfg);
      if (/^#7c3aed$/i.test(String(C.couleur || ''))) C.couleur = '#2563eb';   // ancien violet du français (charte SoccaQuiz : plus de violet)
      C.questions.forEach(q => {
        if (!q || typeof q !== 'object') return;
        Object.defineProperty(q, '_orig', { value: q, enumerable: false, configurable: true });
        // X dont tous les mots sont à toucher = phrase à reconstituer : on la joue en « remettre dans l'ordre », mots mélangés
        if (q.type === 'cliquer') { const m = motsDe(q); if (m.length >= 2 && m.length <= 8 && m.every(x => x.bon)) { q.type = 'ordre'; q.items = m.map(x => x.mot); } }
        // O : une explication recopiée par l'IA comme dernier élément redevient l'explication
        if (q.type === 'ordre' && Array.isArray(q.items) && q.items.length >= 3) { const der = String(q.items[q.items.length - 1]); if (estPhraseExplication(der, q.items.slice(0, -1))) { q.items = q.items.slice(0, -1); if (!q.exp) q.exp = der; } }
      });
      if (C.titre) document.title = 'Quiz – ' + C.titre.replace(/<[^>]+>/g, '');
      appliquerCouleur(C.couleur);
      if (!document.getElementById('app')) { const d = document.createElement('div'); d.className = 'container'; d.id = 'app'; document.body.prepend(d); }
      renderStart();
      chargerBadges();
    },
    start: () => { debloquerVoix(); startQuiz(); }, home: renderStart, answer: handleAnswer, validate: validateInput, prev: prevQuestion, next,
    ecouter, lire: lireQuestion, indice: montrerIndice, erreurs: refaireErreurs, repondre: (d, ok, t) => enregistrer(d, ok, t),
    nombre(k) { nbChoisi = k; renderStart(); },
    famille: renderFamille, duel: () => { debloquerVoix(); lancerDuel(); }, revanche: () => lancerDuel(true), propositions: voirPropositions,
    rafraichir: () => renderQuestion(), quitterQuiz, fermerQuitter, signaler,
    _ex: (action, n) => actionExercice(action, n),
    angle: s => `<span class="ang">${s}</span>`,           // notation d'angle avec chapeau
    shuffle, norm, esc, forme, comparer: (attendus, v, q) => comparer([].concat(attendus), v, regles(q || {})),
    _etat: () => ({ state, shuffled, cur, answers, selected, duel, pool: C ? C.questions.length : 0, questions: C ? C.questions : [] }),
    _poids: q => poidsQuestion(q), _cle: q => cleQuestion(q), _ressemblance: ressemblance      // pour les tests
  };
})();
