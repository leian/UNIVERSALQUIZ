/* =====================================================================
   DESSINS — catalogue de dessins appelés par leur nom (aucun coût en tokens pour l'IA)
   ---------------------------------------------------------------------
   Un quiz écrit seulement le nom : img=labo:becher sur une question, ou des propositions
   de QCM « labo:becher », « labo:ballon »… ; le moteur dessine.
     labo:<nom>        matériel de chimie (tube, fiole, erlenmeyer, becher, eprouvette, agitateur, ballon,
                       cristallisoir, montre, spatule, entonnoir, verrepied)
     danger:<nom>      pictogrammes de danger (explosif, inflammable, comburant, gaz, corrosif, toxique, nocif,
                       sante, environnement, laser, uv, electrique)
     protection:<nom>  équipements obligatoires (blouse, gants, lunettes, masque, lunettesuv)
     etat:<nom>        modèle particulaire (solide, liquide, gaz)
     heure:3h45        horloge à aiguilles (plusieurs : heure:7h20,9h05)
     nombre:4293876    tableau de numération (jusqu'à 12 chiffres)
   Dessins du matériel et des pictogrammes repris des quiz de lana-quizz.
   Dessins.grand(code) → SVG de la grande image ; Dessins.petit(code) → SVG d'une proposition ;
   Dessins.nom(code) → nom lisible (lecteur d'écran, correction) ; Dessins.existe(code).
   ===================================================================== */
(function () {
  const D = {"labo":{"tube":{"n":"Tube à essais","s":"<path d=\"M-8,-52 L-8,40 A8,8 0 0 0 8,40 L8,-52\"/>"},"fiole":{"n":"Fiole jaugée","s":"<path d=\"M-5,-58 L-5,-5 C-32,10 -32,55 0,55 C32,55 32,10 5,-5 L5,-58\"/><line x1=\"-10\" y1=\"-32\" x2=\"10\" y2=\"-32\"/>"},"erlenmeyer":{"n":"Erlenmeyer","s":"<path d=\"M-8,-55 L-8,-20 L-36,50 L36,50 L8,-20 L8,-55\"/>"},"becher":{"n":"Bécher","s":"<path d=\"M-30,-45 L-30,50 L30,50 L30,-40 Q30,-47 37,-50\"/>"},"eprouvette":{"n":"Éprouvette graduée","s":"<path d=\"M-14,-58 Q-10,-56 -10,-50 L-10,50 M10,-58 L10,50 M-26,54 L26,54\"/><path d=\"M-10,-30 L-2,-30 M-10,-10 L-2,-10 M-10,10 L-2,10 M-10,30 L-2,30\"/>"},"agitateur":{"n":"Agitateur","s":"<line x1=\"-42\" y1=\"-44\" x2=\"42\" y2=\"44\" stroke-width=\"7\" stroke-linecap=\"round\"/>"},"ballon":{"n":"Ballon à fond plat","s":"<path d=\"M-7,-58 L-7,-18 A32,32 0 1 0 7,-18 L7,-58\"/><line x1=\"-12\" y1=\"45\" x2=\"12\" y2=\"45\"/>"},"cristallisoir":{"n":"Cristallisoir","s":"<path d=\"M-60,-15 L-60,35 L60,35 L60,-15\"/>"},"montre":{"n":"Verre de montre","s":"<path d=\"M-48,-5 Q0,40 48,-5\"/>"},"spatule":{"n":"Spatule","s":"<path d=\"M48,-38 L-24,24 Q-38,36 -48,26\"/>"},"entonnoir":{"n":"Entonnoir","s":"<path d=\"M-42,-48 L-6,4 L-6,52 M42,-48 L6,4 L6,52\"/>"},"verrepied":{"n":"Verre à pied","s":"<path d=\"M-36,-48 L-10,46 M36,-48 L10,46 M-26,48 L26,48\"/>"}},"danger":{"explosif":{"n":"Explosif","f":"d","s":"<circle cx=\"-8\" cy=\"12\" r=\"13\" fill=\"#111\"/>\n      <g stroke=\"#111\" stroke-width=\"4\" stroke-linecap=\"round\"><line x1=\"4\" y1=\"-2\" x2=\"14\" y2=\"-12\"/><line x1=\"8\" y1=\"6\" x2=\"24\" y2=\"4\"/><line x1=\"0\" y1=\"-6\" x2=\"2\" y2=\"-24\"/><line x1=\"-12\" y1=\"-6\" x2=\"-20\" y2=\"-20\"/></g>\n      <polygon points=\"18,-18 24,-24 26,-14\" fill=\"#111\"/><polygon points=\"26,8 32,2 30,12\" fill=\"#111\"/>\n      <circle cx=\"-24\" cy=\"-6\" r=\"2.5\" fill=\"#111\"/><circle cx=\"12\" cy=\"-26\" r=\"2.5\" fill=\"#111\"/>"},"inflammable":{"n":"Inflammable","f":"d","s":"<path d=\"M0,-28 C10,-16 16,-6 13,8 C11,17 5,22 0,22 C-8,22 -14,15 -13,5 C-12,-4 -6,-8 -5,-17 C-1,-11 2,-9 2,-3 C6,-10 4,-19 0,-28Z\" fill=\"#111\"/><rect x=\"-22\" y=\"26\" width=\"44\" height=\"4\" fill=\"#111\"/>"},"comburant":{"n":"Comburant","f":"d","s":"<g transform=\"translate(0,-12) scale(0.75)\"><path d=\"M0,-28 C10,-16 16,-6 13,8 C11,17 5,22 0,22 C-8,22 -14,15 -13,5 C-12,-4 -6,-8 -5,-17 C-1,-11 2,-9 2,-3 C6,-10 4,-19 0,-28Z\" fill=\"#111\"/></g>\n      <circle cx=\"0\" cy=\"14\" r=\"12\" fill=\"none\" stroke=\"#111\" stroke-width=\"6\"/><rect x=\"-22\" y=\"30\" width=\"44\" height=\"4\" fill=\"#111\"/>"},"gaz":{"n":"Gaz sous pression","f":"d","s":"<g transform=\"rotate(-35)\"><rect x=\"-28\" y=\"-9\" width=\"46\" height=\"18\" rx=\"8\" fill=\"#111\"/><rect x=\"18\" y=\"-5\" width=\"10\" height=\"10\" rx=\"1\" fill=\"#111\"/></g>"},"corrosif":{"n":"Corrosif","f":"d","s":"<g transform=\"rotate(35 -14 -18)\"><rect x=\"-19\" y=\"-32\" width=\"10\" height=\"24\" rx=\"3\" fill=\"#111\"/></g>\n      <g transform=\"rotate(-35 14 -18)\"><rect x=\"9\" y=\"-32\" width=\"10\" height=\"24\" rx=\"3\" fill=\"#111\"/></g>\n      <circle cx=\"-18\" cy=\"-2\" r=\"2.5\" fill=\"#111\"/><circle cx=\"-18\" cy=\"6\" r=\"2\" fill=\"#111\"/>\n      <circle cx=\"18\" cy=\"-2\" r=\"2.5\" fill=\"#111\"/><circle cx=\"18\" cy=\"6\" r=\"2\" fill=\"#111\"/>\n      <path d=\"M-30,14 L-4,14 L-4,24 L-30,24 Z\" fill=\"#111\"/><circle cx=\"-18\" cy=\"14\" r=\"4\" fill=\"white\"/>\n      <path d=\"M4,16 L28,16 Q30,16 30,18 L30,24 L4,24 Z\" fill=\"#111\"/>\n      <rect x=\"8\" y=\"11\" width=\"3\" height=\"6\" fill=\"#111\"/><rect x=\"13\" y=\"10\" width=\"3\" height=\"7\" fill=\"#111\"/><rect x=\"18\" y=\"11\" width=\"3\" height=\"6\" fill=\"#111\"/>\n      <circle cx=\"18\" cy=\"16\" r=\"3.5\" fill=\"white\"/>"},"toxique":{"n":"Toxique","f":"d","s":"<g stroke=\"#111\" stroke-width=\"6\" stroke-linecap=\"round\"><line x1=\"-20\" y1=\"8\" x2=\"20\" y2=\"28\"/><line x1=\"20\" y1=\"8\" x2=\"-20\" y2=\"28\"/></g>\n      <circle cx=\"0\" cy=\"-12\" r=\"15\" fill=\"#111\"/><rect x=\"-8\" y=\"-2\" width=\"16\" height=\"10\" rx=\"2\" fill=\"#111\"/>\n      <circle cx=\"-6\" cy=\"-13\" r=\"4.5\" fill=\"white\"/><circle cx=\"6\" cy=\"-13\" r=\"4.5\" fill=\"white\"/><polygon points=\"0,-6 -2,-2 2,-2\" fill=\"white\"/>"},"nocif":{"n":"Nocif / irritant","f":"d","s":"<rect x=\"-6\" y=\"-32\" width=\"12\" height=\"38\" rx=\"5\" fill=\"#111\"/><circle cx=\"0\" cy=\"20\" r=\"7\" fill=\"#111\"/>"},"sante":{"n":"Dangereux pour la santé","f":"d","s":"<circle cx=\"0\" cy=\"-22\" r=\"9\" fill=\"#111\"/><path d=\"M-22,30 C-24,2 -12,-10 0,-10 C12,-10 24,2 22,30 Z\" fill=\"#111\"/>\n      <polygon points=\"0,0 3,8 11,8 5,13 7,21 0,16 -7,21 -5,13 -11,8 -3,8\" fill=\"white\"/>"},"environnement":{"n":"Dangereux pour l'environnement","f":"d","s":"<line x1=\"-30\" y1=\"20\" x2=\"30\" y2=\"20\" stroke=\"#111\" stroke-width=\"3\"/>\n      <g stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"><path d=\"M-14,20 L-14,-28\"/><path d=\"M-14,-8 L-26,-20\"/><path d=\"M-14,-14 L-4,-26\"/><path d=\"M-14,2 L-2,-6\"/></g>\n      <ellipse cx=\"8\" cy=\"28\" rx=\"10\" ry=\"5\" fill=\"#111\"/><polygon points=\"17,28 23,24 23,32\" fill=\"#111\"/>"},"laser":{"n":"Danger du laser","f":"t","s":"<line x1=\"-14\" y1=\"20\" x2=\"36\" y2=\"20\" stroke=\"#111\" stroke-width=\"4\"/><circle cx=\"-14\" cy=\"20\" r=\"7\" fill=\"#111\"/><line x1=\"-4.0\" y1=\"20.0\" x2=\"6.0\" y2=\"20.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-5.9\" y1=\"25.9\" x2=\"2.2\" y2=\"31.8\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-10.9\" y1=\"29.5\" x2=\"-7.8\" y2=\"39.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-17.1\" y1=\"29.5\" x2=\"-20.2\" y2=\"39.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-22.1\" y1=\"25.9\" x2=\"-30.2\" y2=\"31.8\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-24.0\" y1=\"20.0\" x2=\"-34.0\" y2=\"20.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-22.1\" y1=\"14.1\" x2=\"-30.2\" y2=\"8.2\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-17.1\" y1=\"10.5\" x2=\"-20.2\" y2=\"1.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-10.9\" y1=\"10.5\" x2=\"-7.8\" y2=\"1.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-5.9\" y1=\"14.1\" x2=\"2.2\" y2=\"8.2\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/>"},"uv":{"n":"Rayonnements UV","f":"t","s":"<circle cx=\"0\" cy=\"18\" r=\"9\" fill=\"#111\"/><line x1=\"13.0\" y1=\"18.0\" x2=\"22.0\" y2=\"18.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"11.3\" y1=\"24.5\" x2=\"19.1\" y2=\"29.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"6.5\" y1=\"29.3\" x2=\"11.0\" y2=\"37.1\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"0.0\" y1=\"31.0\" x2=\"0.0\" y2=\"40.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-6.5\" y1=\"29.3\" x2=\"-11.0\" y2=\"37.1\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-11.3\" y1=\"24.5\" x2=\"-19.1\" y2=\"29.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-13.0\" y1=\"18.0\" x2=\"-22.0\" y2=\"18.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-11.3\" y1=\"11.5\" x2=\"-19.1\" y2=\"7.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-6.5\" y1=\"6.7\" x2=\"-11.0\" y2=\"-1.1\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-0.0\" y1=\"5.0\" x2=\"-0.0\" y2=\"-4.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"6.5\" y1=\"6.7\" x2=\"11.0\" y2=\"-1.1\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"11.3\" y1=\"11.5\" x2=\"19.1\" y2=\"7.0\" stroke=\"#111\" stroke-width=\"3\" stroke-linecap=\"round\"/>"},"electrique":{"n":"Danger électrique","f":"t","s":"<path d=\"M4,-16 L-12,14 L-1,14 L-8,42 L14,6 L3,6 L10,-16 Z\" fill=\"#111\"/>"}},"protection":{"blouse":{"n":"Port de la blouse","f":"c","s":"<path d=\"M-24,-26 L-8,-30 L0,-14 L8,-30 L24,-26 L34,10 L24,12 L22,-4 L22,32 L-22,32 L-22,-4 L-24,12 L-34,10 Z\" fill=\"white\"/>\n      <circle cx=\"0\" cy=\"-2\" r=\"2.5\" fill=\"#1D4ED8\"/><circle cx=\"0\" cy=\"10\" r=\"2.5\" fill=\"#1D4ED8\"/><circle cx=\"0\" cy=\"22\" r=\"2.5\" fill=\"#1D4ED8\"/>"},"gants":{"n":"Port des gants","f":"c","s":"<g fill=\"white\"><rect x=\"-14\" y=\"-6\" width=\"34\" height=\"32\" rx=\"8\"/><rect x=\"-14\" y=\"-30\" width=\"7\" height=\"30\" rx=\"3.5\"/><rect x=\"-5\" y=\"-35\" width=\"7\" height=\"34\" rx=\"3.5\"/>\n      <rect x=\"4\" y=\"-33\" width=\"7\" height=\"32\" rx=\"3.5\"/><rect x=\"13\" y=\"-27\" width=\"7\" height=\"28\" rx=\"3.5\"/>\n      <rect x=\"-30\" y=\"-4\" width=\"8\" height=\"22\" rx=\"4\" transform=\"rotate(-40 -26 14)\"/><rect x=\"-12\" y=\"26\" width=\"30\" height=\"12\" rx=\"2\"/></g>"},"lunettes":{"n":"Port des lunettes de sécurité","f":"c","s":"<path d=\"M-40,-2 Q0,-16 40,-2\" stroke=\"white\" stroke-width=\"5\" fill=\"none\"/>\n      <rect x=\"-34\" y=\"-6\" width=\"30\" height=\"22\" rx=\"9\" fill=\"white\"/><rect x=\"4\" y=\"-6\" width=\"30\" height=\"22\" rx=\"9\" fill=\"white\"/><rect x=\"-6\" y=\"0\" width=\"12\" height=\"5\" fill=\"white\"/>"},"masque":{"n":"Port du masque","f":"c","s":"<ellipse cx=\"0\" cy=\"-2\" rx=\"24\" ry=\"32\" fill=\"white\"/><circle cx=\"-9\" cy=\"-14\" r=\"3.5\" fill=\"#1D4ED8\"/><circle cx=\"9\" cy=\"-14\" r=\"3.5\" fill=\"#1D4ED8\"/>\n      <path d=\"M-24,2 Q0,-6 24,2 L22,18 Q0,34 -22,18 Z\" fill=\"#93C5FD\" stroke=\"#1D4ED8\" stroke-width=\"2\"/>\n      <line x1=\"-24\" y1=\"4\" x2=\"-34\" y2=\"-6\" stroke=\"white\" stroke-width=\"3\"/><line x1=\"24\" y1=\"4\" x2=\"34\" y2=\"-6\" stroke=\"white\" stroke-width=\"3\"/>"},"lunettesuv":{"n":"Port des lunettes de protection UV","f":"c","s":"<circle cx=\"0\" cy=\"-30\" r=\"5\" fill=\"white\"/><line x1=\"8.0\" y1=\"-30.0\" x2=\"13.0\" y2=\"-30.0\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"5.7\" y1=\"-24.3\" x2=\"9.2\" y2=\"-20.8\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"0.0\" y1=\"-22.0\" x2=\"0.0\" y2=\"-17.0\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-5.7\" y1=\"-24.3\" x2=\"-9.2\" y2=\"-20.8\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-8.0\" y1=\"-30.0\" x2=\"-13.0\" y2=\"-30.0\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-5.7\" y1=\"-35.7\" x2=\"-9.2\" y2=\"-39.2\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"-0.0\" y1=\"-38.0\" x2=\"-0.0\" y2=\"-43.0\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"5.7\" y1=\"-35.7\" x2=\"9.2\" y2=\"-39.2\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n      <path d=\"M-40,4 Q0,-10 40,4\" stroke=\"white\" stroke-width=\"5\" fill=\"none\"/>\n      <rect x=\"-34\" y=\"0\" width=\"30\" height=\"22\" rx=\"9\" fill=\"white\"/><rect x=\"4\" y=\"0\" width=\"30\" height=\"22\" rx=\"9\" fill=\"white\"/>\n      <rect x=\"-30\" y=\"4\" width=\"22\" height=\"14\" rx=\"6\" fill=\"#172554\"/><rect x=\"8\" y=\"4\" width=\"22\" height=\"14\" rx=\"6\" fill=\"#172554\"/><rect x=\"-6\" y=\"6\" width=\"12\" height=\"5\" fill=\"white\"/>"}},"formes":{"d":"<polygon points=\"0,-58 58,0 0,58 -58,0\" fill=\"white\" stroke=\"#dc2626\" stroke-width=\"6\" stroke-linejoin=\"round\"/>","t":"<polygon points=\"0,-54 60,50 -60,50\" fill=\"#FACC15\" stroke=\"#111\" stroke-width=\"6\" stroke-linejoin=\"round\"/>","c":"<circle r=\"56\" fill=\"#1D4ED8\"/>"}};
  const NS = 'http:\/\/www.w3.org/2000/svg';
  const svg = (vb, corps) => `<svg viewBox="${vb}" xmlns="${NS}" role="img" aria-hidden="true">${corps}</svg>`;
  const ETATS = {
    solide: { n: 'Solide', p: [[-30,-30],[-10,-30],[10,-30],[30,-30],[-30,-10],[-10,-10],[10,-10],[30,-10],[-30,10],[-10,10],[10,10],[30,10],[-30,30],[-10,30],[10,30],[30,30]] },
    liquide: { n: 'Liquide', p: [[-34,34],[-14,36],[6,33],[26,35],[-26,16],[-6,18],[14,15],[33,18],[-35,0],[-16,-1],[4,1],[24,-2],[-24,-18],[0,-16],[30,-17]] },
    gaz: { n: 'Gaz', p: [[-30,-34],[18,-28],[-6,-8],[32,4],[-34,18],[6,30],[-14,38],[28,36]] }
  };
  function etat(nom) {
    const e = ETATS[nom]; if (!e) return '';
    const fond = `<rect x="-50" y="-50" width="100" height="100" rx="6" fill="#F8FAFC" stroke="#475569" stroke-width="3"/>`;
    return fond + e.p.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#38BDF8" stroke="#0369A1" stroke-width="2"/>`).join('');
  }
  function horloge(h, m, cx, cy, r) {
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="#111" stroke-width="2.5"/>`;
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30, gros = i % 5 === 0, r1 = r - (gros ? 8 : 4), r2 = r - 1;
      s += `<line x1="${cx + r1 * Math.sin(a)}" y1="${cy - r1 * Math.cos(a)}" x2="${cx + r2 * Math.sin(a)}" y2="${cy - r2 * Math.cos(a)}" stroke="#111" stroke-width="${gros ? 2 : 1}"/>`;
    }
    for (let n = 1; n <= 12; n++) { const a = n * Math.PI / 6, rr = r - 18; s += `<text x="${cx + rr * Math.sin(a)}" y="${cy - rr * Math.cos(a) + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#374151" font-family="system-ui,sans-serif">${n}</text>`; }
    const am = m * Math.PI / 30, ah = ((h % 12) + m / 60) * Math.PI / 6;
    s += `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.5 * Math.sin(ah)}" y2="${cy - r * 0.5 * Math.cos(ah)}" stroke="#111" stroke-width="5" stroke-linecap="round"/>`;
    s += `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.8 * Math.sin(am)}" y2="${cy - r * 0.8 * Math.cos(am)}" stroke="#0E7490" stroke-width="3" stroke-linecap="round"/>`;
    return s + `<circle cx="${cx}" cy="${cy}" r="4" fill="#111"/>`;
  }
  const heures = v => String(v).split(',').slice(0, 4).map(x => { const m = /^(\d{1,2})h(\d{2})$/.exec(x.trim()); return m && +m[1] < 24 && +m[2] < 60 ? [+m[1], +m[2]] : null; });
  function numeration(chiffres) {
    const d = chiffres.padStart(12, ' ').split(''), cls = ['Milliards', 'Millions', 'Mille', 'Unités'], cw = 48, x0 = 32;
    let s = '';
    cls.forEach((c, i) => {
      const x = x0 + i * 3 * cw;
      s += `<rect x="${x}" y="10" width="${3 * cw}" height="30" fill="${i % 2 ? '#CFFAFE' : '#ECFEFF'}" stroke="#0E7490"/><text x="${x + 1.5 * cw}" y="30" text-anchor="middle" font-size="13" font-weight="600" fill="#155E75" font-family="system-ui,sans-serif">${c}</text>`;
      ['C', 'D', 'U'].forEach((u, j) => {
        const xx = x + j * cw, ch = d[i * 3 + j];
        s += `<rect x="${xx}" y="40" width="${cw}" height="26" fill="white" stroke="#9CA3AF"/><text x="${xx + cw / 2}" y="58" text-anchor="middle" font-size="12" fill="#6b7280" font-family="system-ui,sans-serif">${u}</text><rect x="${xx}" y="66" width="${cw}" height="44" fill="white" stroke="#9CA3AF"/>`;
        if (ch.trim()) s += `<text x="${xx + cw / 2}" y="98" text-anchor="middle" font-size="24" font-weight="700" fill="#111" font-family="system-ui,sans-serif">${ch}</text>`;
      });
      s += `<rect x="${x}" y="10" width="${3 * cw}" height="100" fill="none" stroke="#0E7490" stroke-width="2.5"/>`;
    });
    return s;
  }
  // code → { genre, nom } ou null
  function lire(code) {
    const m = /^(labo|danger|protection|etat|heure|nombre):(.+)$/.exec(String(code || '').trim());
    if (!m) return null;
    const [, g, v] = m;
    if (g === 'labo' || g === 'danger' || g === 'protection') return D[g][v] ? { g, v, nom: D[g][v].n } : null;
    if (g === 'etat') return ETATS[v] ? { g, v, nom: 'État ' + ETATS[v].n.toLowerCase() } : null;
    if (g === 'heure') { const h = heures(v); return h.length && h.every(Boolean) ? { g, v: h, nom: h.map(([a, b]) => a + ' h ' + String(b).padStart(2, '0')).join(', ') } : null; }
    if (g === 'nombre') return /^\d{1,12}$/.test(v) ? { g, v, nom: 'Tableau de numération : ' + v } : null;
    return null;
  }
  const picto = (g, v) => D.formes[D[g][v].f] + D[g][v].s;
  const verre = v => `<g fill="none" stroke="#111" stroke-width="3" stroke-linejoin="round">${D.labo[v].s}</g>`;
  function grand(code) {
    const x = lire(code); if (!x) return '';
    if (x.g === 'labo') return svg('0 0 640 140', `<rect width="640" height="140" fill="#F0FDFA"/><g transform="translate(320 72)">${verre(x.v)}</g>`);
    if (x.g === 'danger' || x.g === 'protection') return svg('0 0 640 140', `<rect width="640" height="140" fill="#FFF7ED"/><g transform="translate(320 70)">${picto(x.g, x.v)}</g>`);
    if (x.g === 'etat') return svg('0 0 640 140', `<rect width="640" height="140" fill="#EFF6FF"/><g transform="translate(320 70) scale(1.15)">${etat(x.v)}</g>`);
    if (x.g === 'heure') { const n = x.v.length, pas = 640 / (n + 1); return svg('0 0 640 150', x.v.map(([h, m], i) => horloge(h, m, pas * (i + 1), 72, 62)).join('')); }
    return svg('0 0 640 120', numeration(x.v));
  }
  function petit(code) {
    const x = lire(code); if (!x) return '';
    if (x.g === 'labo') return svg('-70 -66 140 132', verre(x.v).replace('stroke-width="3"', 'stroke-width="4"'));
    if (x.g === 'danger' || x.g === 'protection') return svg('-64 -64 128 128', picto(x.g, x.v));
    if (x.g === 'etat') return svg('-56 -56 112 112', etat(x.v));
    if (x.g === 'heure') return svg('0 0 140 140', horloge(x.v[0][0], x.v[0][1], 70, 70, 64));
    return '';                                      // tableau de numération : trop large pour une proposition
  }
  /* ---------- géométrie décrite en quelques mots (champ fig=) ----------
     fig=A(1,1) B(8,1) C(3,5); [AB]; (AC); [BC); angle ABC 40°; droit ABC; cercle(A,3); cercle(O,A); poly ABC; [AB]=5 cm; code [AB] [AC]; (AB)=d; grille
     coordonnées de 0 à 12 (repère mathématique : y vers le haut) ; un nom de point = une majuscule, suivie d'un chiffre ou de ' */
  const echapper = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function geo(texte) {
    const src = String(texte || '').slice(0, 600), P = {};
    src.replace(/([A-Z][0-9']?)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g, (m, n, x, y) => { P[n] = [Math.max(-2, Math.min(14, +x)), Math.max(-2, Math.min(14, +y))]; return ''; });
    const noms = Object.keys(P); if (!noms.length) return '';
    const ordres = src.replace(/([A-Z][0-9']?)\s*\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/g, ' ').split(/[;\n]/).map(t => t.trim()).filter(Boolean);
    const pt = n => P[n];
    const deux = t => { const m = t.match(/[A-Z][0-9']?/g) || []; return m.every(pt) ? m : null; };
    // cadre : points et cercles
    let xs = noms.map(n => P[n][0]), ys = noms.map(n => P[n][1]);
    const cercles = [];
    ordres.forEach(o => {
      let m = o.match(/^cercle\s*\(?\s*([A-Z][0-9']?)\s*[, ]\s*(\d+(?:\.\d+)?|[A-Z][0-9']?)\s*\)?$/i);
      if (m && pt(m[1])) { const c = pt(m[1]), r = /\d/.test(m[2][0]) ? +m[2] : pt(m[2]) ? Math.hypot(pt(m[2])[0] - c[0], pt(m[2])[1] - c[1]) : 0; if (r > 0) { cercles.push([c, r]); xs.push(c[0] - r, c[0] + r); ys.push(c[1] - r, c[1] + r); } }
    });
    const grille = ordres.some(o => /^grille$/i.test(o));
    let x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    if (x1 - x0 < 4) { const c = (x0 + x1) / 2; x0 = c - 2; x1 = c + 2; }
    if (y1 - y0 < 3) { const c = (y0 + y1) / 2; y0 = c - 1.5; y1 = c + 1.5; }
    const k = Math.min(600 / (x1 - x0), 260 / (y1 - y0)), L = (x1 - x0) * k, H = (y1 - y0) * k;
    const X = x => (x - x0) * k, Y = y => (y1 - y) * k, f = v => Math.round(v * 10) / 10;
    const trait = 'stroke="#1e293b" stroke-width="2.2" stroke-linecap="round"';
    let fond = '', s = '', etiq = '';
    if (grille) { for (let gx = Math.ceil(x0); gx <= x1; gx++) fond += `<line x1="${f(X(gx))}" y1="0" x2="${f(X(gx))}" y2="${f(H)}" stroke="#e2e8f0" stroke-width="1"/>`; for (let gy = Math.ceil(y0); gy <= y1; gy++) fond += `<line x1="0" y1="${f(Y(gy))}" x2="${f(L)}" y2="${f(Y(gy))}" stroke="#e2e8f0" stroke-width="1"/>`; }
    const prolonger = (a, b, deuxSens) => {           // demi-droite ou droite : jusqu'au bord du dessin
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, g = (x1 - x0 + y1 - y0) * 2;
      const fin = [b[0] + dx / n * g, b[1] + dy / n * g], debut = deuxSens ? [a[0] - dx / n * g, a[1] - dy / n * g] : a;
      return `<line x1="${f(X(debut[0]))}" y1="${f(Y(debut[1]))}" x2="${f(X(fin[0]))}" y2="${f(Y(fin[1]))}" ${trait}/>`;
    };
    const centre = [noms.reduce((t, n) => t + P[n][0], 0) / noms.length, noms.reduce((t, n) => t + P[n][1], 0) / noms.length];
    ordres.forEach(o => {
      let m;
      if ((m = o.match(/^\[\s*([A-Z][0-9']?)\s*([A-Z][0-9']?)\s*\](?:\s*=\s*(.{1,12}))?$/)) && pt(m[1]) && pt(m[2])) {          // [AB] ou [AB]=5 cm
        const a = pt(m[1]), b = pt(m[2]);
        s += `<line x1="${f(X(a[0]))}" y1="${f(Y(a[1]))}" x2="${f(X(b[0]))}" y2="${f(Y(b[1]))}" ${trait}/>`;
        if (m[3]) { const mx = (X(a[0]) + X(b[0])) / 2, my = (Y(a[1]) + Y(b[1])) / 2, dx = X(b[0]) - X(a[0]), dy = Y(b[1]) - Y(a[1]), n = Math.hypot(dx, dy) || 1; let nx = -dy / n, ny = dx / n; if ((mx - X(centre[0])) * nx + (my - Y(centre[1])) * ny < 0) { nx = -nx; ny = -ny; } etiq += `<text x="${f(mx + nx * 16)}" y="${f(my + ny * 16 + 5)}" text-anchor="middle" font-size="15" fill="#0f766e" font-weight="600">${echapper(m[3].trim())}</text>`; }
      } else if ((m = o.match(/^\[\s*([A-Z][0-9']?)\s*([A-Z][0-9']?)\s*\)$/)) && pt(m[1]) && pt(m[2])) s += prolonger(pt(m[1]), pt(m[2]), false);   // [AB)
      else if ((m = o.match(/^\(\s*([A-Z][0-9']?)\s*([A-Z][0-9']?)\s*\)(?:\s*=\s*\(?([a-z][0-9']?)\)?)?$/)) && pt(m[1]) && pt(m[2])) {            // (AB) ou (AB)=d
        s += prolonger(pt(m[1]), pt(m[2]), true);
        if (m[3]) { const b = pt(m[2]), a = pt(m[1]), t = 0.9; etiq += `<text x="${f(X(b[0] + (b[0] - a[0]) * t * 0.3) + 8)}" y="${f(Y(b[1] + (b[1] - a[1]) * t * 0.3) - 8)}" font-size="15" fill="#1e293b" font-style="italic">(${echapper(m[3])})</text>`; }
      } else if ((m = o.match(/^(angle|droit)\s+([A-Z][0-9']?)\s*([A-Z][0-9']?)\s*([A-Z][0-9']?)(?:\s+(.{1,10}))?$/i)) && pt(m[2]) && pt(m[3]) && pt(m[4])) {
        const a = pt(m[2]), o2 = pt(m[3]), c = pt(m[4]);
        const u = [a[0] - o2[0], a[1] - o2[1]], v = [c[0] - o2[0], c[1] - o2[1]], nu = Math.hypot(...u) || 1, nv = Math.hypot(...v) || 1;
        const ox = X(o2[0]), oy = Y(o2[1]);
        if (/droit/i.test(m[1])) {
          const r = 14, p1 = [ox + u[0] / nu * r, oy - u[1] / nu * r], p3 = [ox + v[0] / nv * r, oy - v[1] / nv * r], p2 = [p1[0] + v[0] / nv * r, p1[1] - v[1] / nv * r];
          s += `<path d="M${f(p1[0])},${f(p1[1])} L${f(p2[0])},${f(p2[1])} L${f(p3[0])},${f(p3[1])}" fill="none" stroke="#dc2626" stroke-width="2"/>`;
        } else {
          const r = 30, a1 = Math.atan2(u[1], u[0]), a2 = Math.atan2(v[1], v[0]);
          let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          const ps = [ox + r * Math.cos(a1), oy - r * Math.sin(a1)], pe = [ox + r * Math.cos(a1 + d), oy - r * Math.sin(a1 + d)];
          s += `<path d="M${f(ps[0])},${f(ps[1])} A${r},${r} 0 0 ${d > 0 ? 0 : 1} ${f(pe[0])},${f(pe[1])}" fill="rgba(220,38,38,.08)" stroke="#dc2626" stroke-width="2"/>`;
          if (m[5]) { const am = a1 + d / 2; etiq += `<text x="${f(ox + (r + 18) * Math.cos(am))}" y="${f(oy - (r + 18) * Math.sin(am) + 5)}" text-anchor="middle" font-size="15" fill="#dc2626" font-weight="600">${echapper(m[5].trim())}</text>`; }
        }
      } else if ((m = o.match(/^poly\s+((?:[A-Z][0-9']?){3,8})$/i)) && deux(m[1])) {
        const l = deux(m[1]);
        fond += `<polygon points="${l.map(n => f(X(P[n][0])) + ',' + f(Y(P[n][1]))).join(' ')}" fill="rgba(15,118,110,.08)" stroke="#1e293b" stroke-width="2.2" stroke-linejoin="round"/>`;
      } else if ((m = o.match(/^code\s+(.+)$/i))) {                                  // code [AB] [AC] : segments de même longueur
        (m[1].match(/\[\s*[A-Z][0-9']?\s*[A-Z][0-9']?\s*\]/g) || []).forEach(t => { const l = deux(t); if (!l) return; const a = P[l[0]], b = P[l[1]], mx = (X(a[0]) + X(b[0])) / 2, my = (Y(a[1]) + Y(b[1])) / 2, dx = X(b[0]) - X(a[0]), dy = Y(b[1]) - Y(a[1]), n = Math.hypot(dx, dy) || 1; s += `<line x1="${f(mx - dy / n * 7 - dx / n * 3)}" y1="${f(my + dx / n * 7 - dy / n * 3)}" x2="${f(mx + dy / n * 7 + dx / n * 3)}" y2="${f(my - dx / n * 7 + dy / n * 3)}" stroke="#0f766e" stroke-width="2.4"/>`; });
      }
    });
    cercles.forEach(([c, r]) => { s += `<circle cx="${f(X(c[0]))}" cy="${f(Y(c[1]))}" r="${f(r * k)}" fill="none" ${trait}/>`; });
    noms.forEach(n => {                                  // points : croix et nom, écarté du centre de la figure
      const [px, py] = [X(P[n][0]), Y(P[n][1])], dx = px - X(centre[0]), dy = py - Y(centre[1]), d = Math.hypot(dx, dy) || 1;
      const lx = d < 1 ? px - 14 : px + dx / d * 16, ly = d < 1 ? py - 12 : py + dy / d * 16;
      s += `<path d="M${f(px - 5)},${f(py - 5)} L${f(px + 5)},${f(py + 5)} M${f(px - 5)},${f(py + 5)} L${f(px + 5)},${f(py - 5)}" stroke="#1e293b" stroke-width="2"/>`;
      etiq += `<text x="${f(lx)}" y="${f(ly + 6)}" text-anchor="middle" font-size="17" font-weight="700" fill="#1e293b" font-family="system-ui,sans-serif">${echapper(n)}</text>`;
    });
    const m0 = 24;
    return `<svg viewBox="${-m0} ${-m0} ${f(L + 2 * m0)} ${f(H + 2 * m0)}" xmlns="${NS}" role="img" aria-hidden="true" style="overflow:hidden"><defs><clipPath id="geo-cadre"><rect x="${-m0}" y="${-m0}" width="${f(L + 2 * m0)}" height="${f(H + 2 * m0)}"/></clipPath></defs><rect x="${-m0}" y="${-m0}" width="${f(L + 2 * m0)}" height="${f(H + 2 * m0)}" fill="#fff"/><g clip-path="url(#geo-cadre)">${fond}${s}</g><g font-family="system-ui,sans-serif">${etiq}</g></svg>`;
  }
  window.Dessins = { geo, lire, grand, petit, nom: code => (lire(code) || {}).nom || String(code || ''), existe: code => !!lire(code), petitPossible: code => !!petit(code) };
})();
