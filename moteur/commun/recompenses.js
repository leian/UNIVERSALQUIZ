/* =====================================================================
   RÉCOMPENSES — module commun à tous les quiz Universal Quiz (version 2,
   illustrations SVG articulées : 40 animaux, 10 scènes capybara)
   ---------------------------------------------------------------------
   celebrate()     → bonne réponse : feu d'artifice + un animal (bulle en bas)
   fireworks()     → feu d'artifice seul
   showCapybara()  → fin de quiz réussi (< 25 % d'erreurs)
   closeCapybara() → ferme la fenêtre capybara
   Ce fichier est autonome : il injecte lui-même son CSS et crée les
   éléments #fx-canvas et #animal-toast. Pour changer les animations de
   tous les quiz du moteur commun, il suffit de remplacer ce fichier.
   Banc d'essai : commun/banc-essai-recompenses.html
   ===================================================================== */
(function () {
const CSS = String.raw`
  /* Module de récompense. Les mouvements des SVG ne touchent qu'aux transformations et à l'opacité. */
  #fx-canvas { position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:200; }
  #animal-toast { box-sizing:border-box; position:fixed; left:50%; bottom:max(12px, env(safe-area-inset-bottom)); z-index:210; display:flex; align-items:center; gap:12px; width:max-content; max-width:calc(100vw - 24px); padding:7px 14px 7px 8px; color:#134e4a; border:1px solid #9cd5c9; border-radius:18px; background:#fffdf7; box-shadow:0 8px 26px #193b392b; pointer-events:none; opacity:0; transform:translate(-50%, 12px); transition:opacity .18s, transform .24s cubic-bezier(.2,.8,.3,1); }
  #animal-toast.show { opacity:1; transform:translate(-50%, 0); }
  .anim-stage { width:clamp(105px,34vw,148px); flex:none; }
  .anim-stage svg,.capy-scene svg { width:100%; height:auto; display:block; }
  .anim-text { font:700 16px/1.25 system-ui,sans-serif; }
  .anim-text small { display:block; margin-top:4px; font-size:13px; font-weight:450; }
  #capy-overlay { box-sizing:border-box; position:fixed; inset:0; width:100%; height:100%; max-width:none; max-height:none; padding:12px; margin:0; border:0; background:transparent; color:#134e4a; z-index:220; }
  #capy-overlay[open] { display:grid; place-items:center; }
  #capy-overlay::backdrop { background:#143f3b80; }
  .capy-box { box-sizing:border-box; width:min(100%,390px); max-height:100%; overflow:auto; border-radius:20px; padding:16px; text-align:center; background:#fffdf7; box-shadow:0 20px 50px #0003; font-family:system-ui,sans-serif; }
  .capy-box h2 { margin:0 0 4px; font-size:22px; }
  .capy-box p { margin:0 0 12px; font-size:14px; }
  .capy-scene { overflow:hidden; border-radius:12px; margin-bottom:12px; }
  .capy-close { border:0; border-radius:10px; padding:10px 24px; font:600 15px system-ui,sans-serif; background:#0f766e; color:white; cursor:pointer; }
  /* Les groupes imbriqués dissocient le déplacement, la respiration et les articulations. */
  .anim-joint,.capy-joint { transform-box:view-box; transform-origin:var(--pivot, 0px 0px); animation:var(--cycle) infinite; }
  @keyframes anim-breathe { 50% { transform:scale(1.015,1.032); } }
  @keyframes anim-blink { 0%,74%,88%,100% { transform:scaleY(1); } 80%,82% { transform:scaleY(.09); } }
  @keyframes anim-turn { 0%,100% { transform:rotate(var(--from,0deg)); } 50% { transform:rotate(var(--to,8deg)); } }
  @keyframes anim-jump {
    0%,100% { transform:none; }
    16% { transform:scale(1.12,.81); animation-timing-function:cubic-bezier(.15,.62,.35,1); }
    49% { transform:translate(var(--drift,0px),-31px) scale(.95,1.06); animation-timing-function:cubic-bezier(.62,.06,.9,.55); }
    77% { transform:scale(1.10,.86); }
    88% { transform:scale(.99,1.035); }
  }
  @keyframes anim-shadow { 0%,100% { opacity:.75; } 49% { opacity:.30; transform:scaleX(.72); } }
  @keyframes anim-chew { 0%,100% { transform:rotate(0deg); } 40% { transform:rotate(11deg) translateY(1px); } }
  @keyframes anim-purr { 25% { transform:translate(.6px,-.6px); } 75% { transform:translate(-.6px,.35px); } }
  @keyframes anim-step { 25% { transform:rotate(-14deg) translateY(-2.5px); } 68% { transform:rotate(13deg); } }
  @keyframes anim-travel { from { transform:translateX(-11px); } to { transform:translateX(12px); } }
  @keyframes anim-roll {
    0% { transform:translateX(-23px); }
    18% { transform:translateX(-22px) rotate(-9deg) scale(1.05,.92); animation-timing-function:cubic-bezier(.5,.1,.45,1); }
    85%,100% { transform:translateX(25px) rotate(360deg); }
  }
  @keyframes anim-dive {
    0%,100% { transform:translate(-32px,15px) rotate(-23deg); opacity:0; }
    12% { opacity:1; }
    44% { transform:translate(0,-23px) rotate(3deg); }
    78% { transform:translate(37px,23px) rotate(38deg); opacity:1; }
    91% { transform:translate(41px,36px) rotate(43deg); opacity:0; }
  }
  @keyframes anim-visit {
    0%,100% { transform:translate(-15px,-8px) rotate(-8deg); }
    26% { transform:translate(5px,-17px) rotate(7deg); }
    48% { transform:translate(27px,4px) rotate(12deg); }
    68% { transform:translate(30px,11px) rotate(0deg); }
    83% { transform:translate(7px,4px) rotate(-10deg); }
  }
  @keyframes anim-flutter { 50% { transform:scaleX(.34) rotate(var(--to, 5deg)); } }
  @keyframes anim-hover { 25% { transform:translate(-10px,-12px) rotate(-8deg); } 65% { transform:translate(12px,-5px) rotate(8deg); } }
  @keyframes anim-bob { 50% { transform:translateY(-5px) rotate(var(--to,4deg)); } }
  @keyframes anim-drops { 0%,16%,100% { opacity:0; } 30% { opacity:1; } 75% { transform:translate(var(--dx,7px),var(--dy,-13px)) scale(.75); opacity:0; } }
  @keyframes anim-splash { 0%,64%,100% { opacity:0; } 72% { opacity:1; transform:scale(.45); } 88% { opacity:.85; transform:translateY(-11px) scale(1.12); } }
  @keyframes anim-roar { 0%,100% { transform:scaleY(.13); } 20% { transform:scale(.8,.19); } 40%,65% { transform:scale(1.06,1.14); } 82% { transform:scaleY(.3); } }
  @keyframes anim-ripple { 0% { transform:scale(.76,.85); opacity:.28; } 100% { transform:scale(1.14,1.06); opacity:0; } }
  @keyframes capy-rise { 0%,100% { opacity:.12; } 35% { opacity:.9; } 95% { transform:translate(8px,-17px) scale(1.13); opacity:0; } }
  @keyframes capy-drift { 25% { transform:translate(-10px,-4px) rotate(-3deg); } 75% { transform:translate(10px,2px) rotate(3deg); } }
  @keyframes capy-dance { 0%,100% { transform:rotate(-6deg); } 23% { transform:translateY(-7px); } 50% { transform:rotate(6deg); } 76% { transform:translateY(-7px); } }
  @keyframes capy-ear { 68% { transform:none; } 74%,84% { transform:rotate(-12deg); } 79%,92% { transform:rotate(5deg); } }
  @keyframes capy-hop { 22% { transform:scale(1.08,.88); } 46% { transform:translateY(-11px) rotate(-6deg); } 70% { transform:scale(1.04,.92); } }
  @media (prefers-reduced-motion:reduce) {
    #animal-toast { transition:none; }
    .anim-joint,.capy-joint { animation:none !important; }
  }
  /* Articulations et trajectoires des nouvelles récompenses. */
  @keyframes anim-toss {
    0%,100% { transform:none; }
    14% { transform:translateY(4px) scale(1.08,.9); animation-timing-function:cubic-bezier(.16,.6,.3,1); }
    48% { transform:translate(-7px,-37px); animation-timing-function:cubic-bezier(.65,.05,.9,.6); }
    82% { transform:translateY(2px) scale(1.06,.94); }
  }
  @keyframes anim-fish {
    0%,100% { transform:rotate(-4deg); }
    24% { transform:rotate(-10deg); }
    67%,79% { transform:rotate(48deg) translateY(5px); }
  }
  @keyframes anim-wheel { to { transform:rotate(-360deg); } }
  @keyframes anim-climb {
    from { transform:translate(-10px,5px) rotate(4deg); }
    to { transform:translate(12px,-10px) rotate(-7deg); }
  }
  @keyframes anim-yawn {
    0%,100% { transform:none; }
    22% { transform:rotate(-3deg); }
    54%,70% { transform:rotate(20deg); }
    88% { transform:rotate(2deg); }
  }
  @keyframes anim-dart {
    0%,100% { transform:translate(-10px,-3px); }
    34% { transform:translate(-12px,-5px) rotate(-5deg); animation-timing-function:cubic-bezier(.58,0,.22,1); }
    61% { transform:translate(18px,-15px) rotate(10deg); }
    83% { transform:translate(14px,-12px) rotate(-3deg); }
  }
  @keyframes anim-takeoff {
    0%,100% { transform:none; }
    25% { transform:scale(1.05,.91); animation-timing-function:cubic-bezier(.2,.68,.3,1); }
    57% { transform:translate(12px,-29px) rotate(10deg); }
    86% { transform:translate(5px,-1px) scale(1.04,.93); }
  }
  @keyframes anim-elytron {
    0%,18%,93%,100% { transform:none; }
    34%,72% { transform:rotate(var(--to)); }
  }
  @keyframes anim-lady-wings {
    0%,20%,90%,100% { opacity:0; transform:scaleX(.2); }
    37%,53%,70% { opacity:.92; transform:scaleX(1); }
    45%,61%,78% { opacity:.55; transform:scaleX(.43); }
  }
  @keyframes capy-sniff {
    0%,100% { transform:none; }
    36%,72% { transform:rotate(-3deg) translateX(4px); }
    47%,62% { transform:rotate(-1.5deg) translateX(3px); }
  }
  @keyframes capy-snow {
    0%,100% { opacity:.15; }
    20%,73% { opacity:.95; }
    95% { transform:translate(8px,37px) rotate(50deg); opacity:0; }
  }
  @media (prefers-reduced-motion:reduce) {
    .anim-joint[style*="anim-lady-wings"] { opacity:0; }
  }
`;
function installer() {
  if (!document.getElementById('recompenses-css')) {
    const st = document.createElement('style'); st.id = 'recompenses-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  if (!document.getElementById('fx-canvas')) {
    const c = document.createElement('canvas'); c.id = 'fx-canvas'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c);
  }
  if (!document.getElementById('animal-toast')) {
    const t = document.createElement('div'); t.className = 'animal-toast'; t.id = 'animal-toast';
    t.setAttribute('role', 'status'); t.setAttribute('aria-atomic', 'true'); document.body.appendChild(t);
  }
}
if (document.body) installer(); else document.addEventListener('DOMContentLoaded', installer);

/* ===== Module à intégrer : illustrations SVG, effets et trois fonctions publiques ===== */
const PRAISE = ['Bien joué !', 'Bravo !', 'Super, {{PRENOM}} !', 'Génial !', 'Quel talent !', 'Impeccable !', 'Chapeau !', 'Tu gères !'];

/* Les tracés sont dans un repère de 160 × 112. Chaque articulation a son propre pivot. */
const quizArt = (() => {
  const ink = '#49312d';
  const p = (d, fill, stroke = 'none', width = 1.3) =>
    `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const e = (x,y,rx,ry,fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
  const line = (d, color = ink, width = 1.25) => p(d, 'none', color, width);
  const joint = (content, x, y, cycle, vars = '', prefix = 'anim') =>
    `<g class="${prefix}-joint" style="--pivot:${x}px ${y}px;--cycle:${cycle};${vars}">${content}</g>`;
  const turn = (content,x,y,from,to,time,delay = '0s') =>
    joint(content,x,y,`anim-turn ${time} ease-in-out ${delay}`,`--from:${from}deg;--to:${to}deg`);
  const breathe = (content,x,y) => joint(content,x,y,'anim-breathe 2.35s ease-in-out');
  const move = (content,x,y) => `<g transform="translate(${x} ${y})">${content}</g>`;
  const eye = (x,y,s = 1) => joint(
    e(x,y,2.65*s,3.5*s,'#342923')+e(x+.75*s,y-1.15*s,.8*s,.9*s,'#fff6e5'),
    x,y,'anim-blink 1.85s ease-in-out');
  const ground = (x=80,y=97,w=39) => e(x,y,w,4.6,'#66574430')+e(x,y,w*.75,2.7,'#66574425');
  const marks = (d,color='#fff2d1') => `<g opacity=".48">${line(d,color,1.1)}</g>`;
  const water = (x=80,y=91,w=56) => e(x,y,w,10,'#b8dedb')+
    joint(e(x,y,w*.83,6,'none').replace('/>',' stroke="#f9ffef" stroke-width="1.1"/>'),x,y,'anim-ripple 1.65s ease-out');
  const drops = (coords) => coords.map(([x,y]) =>
    p(`M${x} ${y} q-4 6 0 7 q4 -1 0 -7Z`,'#5fa9bd')).join('');
  const shell = (id, palette, content, view='0 0 160 112') =>
    `<svg viewBox="${view}" aria-hidden="true" focusable="false"><defs>${palette.map(([a,b],i) =>
      `<linearGradient id="quiz-${id}-${i}" x2=".25" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
    ).join('')}</defs>${content}</svg>`;
  const tone = (id,i=0) => `url(#quiz-${id}-${i})`;
  return { p,e,line,joint,turn,breathe,move,eye,ground,marks,water,drops,shell,tone };
})();

const ANIMALS = (() => {
  const {p,e,line,joint,turn,breathe,move,eye,ground,marks,water,drops,shell,tone} = quizArt;
  const animal = (id, name, t, palette, draw) => ({
    id, name, t, svg: () => shell(id,palette,draw(tone(id),tone(id,1)))
  });
  return [
    // Grenouille : compression au sol, détente des pattes arrière et réception.
    animal('frog','Grenouille','La grenouille saute de joie !',[['#b9ce71','#61894e'],['#f7e8ad','#c0c783']], (fur,bib) =>
      joint(ground(),80,97,'anim-shadow 1.03s ease-in-out') +
      joint(
        turn(p('M65 75C48 65 42 83 57 91L47 95Q45 100 68 97L77 80Z',fur),69,81,0,-23,'1.03s')+
        turn(p('M96 76C114 68 118 86 101 92L114 96Q116 100 92 97L86 80Z',fur),94,80,0,23,'1.03s')+
        breathe(e(81,78,28,17,fur)+e(81,83,16,10,bib)+
          p('M54 67Q53 56 61 53Q62 42 71 43Q79 43 81 51Q89 49 94 43Q105 42 108 54Q120 67 106 75Q81 86 59 74Z',fur)+
          eye(72,55,1.15)+eye(98,55,1.15)+line('M73 68Q84 75 97 66','#495b37')+
          e(65,66,4,2,'#dbaf80')+e(104,65,4,2,'#dbaf80'),81,94)+
        turn(line('M69 79Q67 90 71 94l6 1M96 79q4 10 0 15l-6 1','#608350',4),82,82,-7,12,'1.03s'),81,96,'anim-jump 1.03s ease-in-out')),

    // Chat : la queue ondule en deux segments, la tête frémit au rythme du ronronnement.
    animal('cat','Chat','Le chat ronronne de plaisir…',[['#e7b581','#b9734b'],['#fff0cf','#e5be94']], (fur,cream) =>
      ground(80,94,53)+
      turn(p('M59 78C43 80 35 70 30 62Q24 58 23 66C23 83 43 92 63 87Z',fur)+
        turn(line('M31 68Q20 56 16 63','#bd8059',7),30,66,-16,20,'.88s'),58,81,-12,12,'1.15s')+
      breathe(p('M43 76C49 58 74 59 99 68Q122 72 119 87Q107 97 54 92Q42 89 43 76Z',fur)+
        p('M99 78q19 1 25 11q-2 5-26 3l-15-5Z',cream)+marks('M51 73q5-6 13-7m-7 11 10-5m-5 10 9-4'),74,93)+
      joint(p('M87 64L88 43Q91 37 102 51Q111 48 121 52Q132 40 135 45L134 67Q133 82 111 84Q89 82 87 64Z',fur)+
        p('M92 46l7 8-8 4ZM131 47l-7 8 7 4Z','#d3918b')+e(113,74,13,8,cream)+
        eye(103,65,.87)+eye(123,65,.87)+p('M109 71q4-3 8 0l-4 4Z','#985854')+
        line('M113 75q-4 5-7 1m7-1q4 4 7 0M100 73l-13-2m13 6-12 2m37-6 13-2m-13 6 11 2','#755142',.9),110,76,'anim-purr .18s ease-in-out')),

    // Chien : la mâchoire et l’os bougent de concert, sous les pattes posées.
    animal('dog','Chien','Le chien ronge son os !',[['#d8a878','#a66e49'],['#fff0d3','#e4c09c']],(fur,cream) =>
      ground(77,95,50)+turn(line('M45 77Q29 75 27 61','#a97652',8),45,77,-9,12,'.74s')+
      breathe(p('M38 81C38 64 58 58 77 64L104 76Q113 83 104 93H45Q36 91 38 81Z',fur)+
        p('M67 80q12-9 22 1l15 8q5 6-8 6H63q-11-5 4-15Z',cream),65,94)+
      turn(p('M77 62Q76 47 94 46Q111 45 119 61L133 68Q137 79 123 83L93 80Z',fur)+
        turn(p('M82 48Q71 51 74 66Q78 85 88 78Q93 69 89 54Z','#81553e'),83,52,-6,9,'.64s')+
        joint(p('M111 74Q125 75 133 72Q135 83 120 86L111 82Z',cream)+
          p('M108 80q-7-6-9 0q-2 4 3 6q-2 6 3 7q4 1 7-4l17-3q4 5 8 2q4-3 0-7q3-5-2-7q-5-1-7 5Z','#ffedcd','#b59778'),111,76,'anim-chew .36s ease-in-out')+
        p('M105 67Q122 65 132 68Q136 76 122 78Q111 78 105 67Z',cream)+e(131,69,5,4,'#4e3930')+eye(111,61),90,68,-3,3,'.72s')),

    // Lapin : propulsion arrière, oreilles en retard sur le corps.
    animal('rabbit','Lapin','Le lapin fait des bonds !',[['#d9c5b4','#a88c7d'],['#f6e6d7','#d5bcab']],(fur,cream) =>
      joint(ground(),80,97,'anim-shadow .91s ease-in-out')+
      joint(e(47,75,10,9,cream)+breathe(p('M51 80Q51 62 75 64Q96 67 103 82Q103 94 70 94Q52 94 51 80Z',fur),74,93)+
        turn(p('M54 81Q60 66 74 73Q83 80 75 89Q95 88 92 96H57Q48 92 54 81Z',fur)+marks('M57 84q3-7 9-8'),68,83,0,-22,'.91s')+
        turn(line('M95 78l4 14 10 1','#a98e80',5),96,77,6,-24,'.91s')+
        turn(p('M90 62C76 56 71 39 77 36Q85 33 98 56Z',fur)+p('M85 59C79 46 81 33 87 32Q94 32 95 56Z',fur)+
          p('M87 54Q83 38 87 37Q91 39 92 53Z','#dca4a3')+
          p('M86 65Q89 52 104 55Q115 57 119 69L125 74Q122 84 103 84Q88 82 86 65Z',fur)+
          e(115,75,9,6,cream)+eye(108,66)+e(123,74,2.6,1.8,'#976869')+line('M118 77l-11 1m10 1-8 3','#91786c',.8),97,69,6,-12,'.91s'),76,96,'anim-jump .91s ease-in-out','--drift:13px')),

    // Manchot : appuis alternés et ailes qui compensent le déplacement du poids.
    animal('penguin','Manchot','Le manchot se dandine !',[['#57686d','#283b43'],['#fff7df','#dfdbcf']],(fur,cream) =>
      ground(80,96,28)+
      turn(e(67,93,11,4,'#e6a05e'),70,90,-8,12,'.66s')+turn(e(93,93,11,4,'#e6a05e'),89,90,12,-8,'.66s')+
      turn(turn(p('M65 55q-13 0-19 21q6 6 20-8Z',fur),65,56,4,-15,'.66s')+
        turn(p('M96 55q13 0 19 21q-6 6-20-8Z',fur),96,56,-15,4,'.66s')+
        breathe(p('M56 72C55 58 64 49 63 42C64 18 95 18 99 41C98 51 107 59 105 74Q102 93 80 93Q59 93 56 72Z',fur)+
          p('M65 72Q65 59 76 51Q63 51 69 39Q76 32 81 42Q87 32 94 39Q100 49 87 51Q98 58 97 73Q97 89 81 89Q65 89 65 72Z',cream)+
          eye(74,43,.82)+eye(88,43,.82)+p('M76 49Q81 46 87 49Q85 55 81 56Z','#e4a15f')+marks('M67 34q5-8 11-8'),81,91),80,90,-12,12,'.66s')),

    // Tortue : quatre pattes déphasées, cou mobile et écailles de la carapace.
    animal('turtle','Tortue','La tortue avance… tranquillement !',[['#c5ac70','#80714f'],['#b2c581','#748f63']],(shellColor,skin) =>
      joint(ground(78,94,41)+
        [49,65,88,101].map((x,i)=>joint(p(`M${x} 79q10 0 9 7l-3 7q-5 4-12 0l2-9Z`,i%2?skin:'#738363'),x,81,`anim-step 1s ease-in-out -${i*.25}s`)).join('')+
        turn(p('M98 76q11 1 14-9q0-10 12-11q14-1 16 8q4 13-13 14l-11 8-16 0Z',skin)+eye(129,64,.8)+line('M130 71q5 1 8-2','#617653'),105,82,0,-9,'1s')+
        breathe(p('M36 82C38 59 54 42 77 44Q102 44 112 80Q88 93 36 82Z',shellColor)+
          line('M39 77Q76 86 108 76M54 79q-3-14 10-27l17 2 14 11-3 15M64 52l-1-5m18 7 6-7m8 18 9-2','#786449',1.6)+
          marks('M45 69q8-13 15-15m11 4 8 1m-8 3 10 2'),76,84),80,94,'anim-travel 2.05s ease-in-out alternate')),

    // Renard : base de la queue et extrémité déphasées.
    animal('fox','Renard','Le renard remue la queue !',[['#efa862','#b96642'],['#fff2d6','#e6c1a0']],(fur,cream) =>
      ground(80,96,51)+
      turn(p('M69 81Q57 63 42 65Q29 67 16 60Q17 81 35 89Q51 96 73 91Z',fur)+
        turn(p('M16 60Q28 67 37 65l-3 8 7 3-7 3 4 10Q19 84 16 60Z',cream),35,77,6,-10,'.69s'),68,85,-18,13,'.69s')+
      breathe(p('M58 78Q64 59 91 64L109 77Q120 94 94 95L65 94Q56 90 58 78Z',fur)+
        p('M90 72q20 0 25 13q0 10-17 9l-9-5Z',cream)+e(79,92,11,3.5,'#89523f'),85,95)+
      turn(p('M83 65L82 42Q83 36 101 50Q108 47 115 49L129 39L131 61Q129 72 144 77Q140 86 121 87Q98 88 83 65Z',fur)+
        p('M87 44l12 9-10 5Zm39-1-9 10 10 4Z','#b76e61')+
        p('M89 68q16 1 24 8q11-3 21-3l10 4q-8 13-27 9Q101 84 89 68Z',cream)+
        eye(116,64)+e(141,77,3.5,2.6,'#49332c')+line('M138 81q-5 4-10 2')+marks('M94 61l8-3m-7 6 6-2'),101,72,1,-6,'1.38s')),

    // Panda : roulade groupée, pattes rabattues et silhouette presque circulaire.
    animal('panda','Panda','Le panda fait une roulade !',[['#fff9eb','#dcd3c8'],['#61585b','#302c34']],(cream,fur) =>
      ground(80,96,57)+joint(
        breathe(e(80,67,23,25,cream)+e(75,61,22,11,fur),81,89)+
        turn(e(68,84,9,9,fur)+e(96,79,10,9,fur),81,73,-6,19,'1.94s')+
        turn(e(67,46,8,8,fur)+e(94,47,8,8,fur)+e(80,56,22,17,cream)+
          p('M67 54q8-5 10 1q2 6-6 9q-6 1-4-10m19 1q4-5 10 0q4 9-4 9q-7-2-6-9',fur)+
          e(73,56,2.8,2.8,'#fff9e9')+e(91,56,2.8,2.8,'#fff9e9')+eye(73,56,.62)+eye(91,56,.62)+
          p('M78 62q4-2 8 0l-4 4Z','#403238')+line('M82 66q3 3 6 0'),80,62,0,16,'1.94s'),80,68,'anim-roll 1.94s ease-out')),

    // Koala : les bras s’ouvrent puis se referment autour d’un cœur.
    animal('koala','Koala','Le koala te fait un câlin !',[['#c5c6bf','#828b85'],['#f9e9da','#d8c6b8']],(fur,cream) =>
      ground(80,97,29)+breathe(e(80,78,24,19,fur)+e(81,83,14,12,cream)+e(65,93,9,5,fur)+e(96,93,9,5,fur),80,95)+
      p('M81 88C54 70 70 56 81 68C93 56 108 70 81 88Z','#cc766e')+marks('M70 70q3-4 6-1')+
      turn(line('M62 70Q49 77 65 83L76 79','#929994',9),62,70,49,-4,'1.3s')+
      turn(line('M100 70Q114 77 98 83L87 79','#929994',9),100,70,-49,4,'1.3s')+
      turn(e(58,52,15,13,fur)+e(103,51,15,13,fur)+e(58,52,9,8,cream)+e(103,51,9,8,cream)+
        e(81,56,24,19,fur)+e(81,65,13,9,cream)+eye(72,54)+eye(91,54)+
        p('M78 51q5-5 8 1l2 8q-3 7-11 1Z','#50423d')+line('M79 66q3 3 7 0'),80,67,-5,7,'1.3s')),

    // Chouette : tête sur un cou bas, disques faciaux et serres sur la branche.
    animal('owl','Chouette','La chouette hoche la tête pour t’applaudir !',[['#c69f74','#875e45'],['#fbefd0','#dbc49b']],(fur,cream) =>
      ground(80,99,43)+line('M36 94Q79 92 126 95M49 94l-7-7m66 7 9-8','#8e7453',3)+
      breathe(e(80,75,24,18,fur)+e(80,77,16,14,cream)+
        turn(p('M61 64Q49 70 60 88Q70 81 67 69Z',fur),64,68,0,8,'1.13s')+
        turn(p('M100 64Q111 71 100 87Q90 81 94 69Z',fur),96,68,-8,0,'1.13s')+
        marks('M74 77l2 3 2-3m4 0 2 3 2-3m-9 7 2 2 2-2','#a47c59'),80,90)+
      line('M72 91v5m4-5v5m8-5v5m4-5v5','#ba8a4c',2)+
      turn(p('M55 52Q53 40 63 35L58 28Q68 29 73 34Q80 31 89 34L101 28L98 38Q107 45 106 56Q101 72 79 71Q58 69 55 52Z',fur)+
        e(70,52,13,13,cream)+e(91,52,13,13,cream)+
        e(71,52,6,7,'#cf9e53')+e(91,52,6,7,'#cf9e53')+eye(71,52,1.4)+eye(91,52,1.4)+
        p('M77 58Q81 54 85 58L81 65Z','#b97a40')+marks('M71 38l5 2m10-2-4 2'),80,66,-7,11,'1.05s')),

    // Dauphin : le dos perce l'eau, les nageoires suivent l'arc, puis l'écume jaillit.
    animal('dolphin','Dauphin','Le dauphin plonge dans les vagues !',[['#92bdca','#527c98'],['#d8e8df','#9dc0c9']],(skin,bib) =>
      water(82,93,67)+joint(
        turn(p('M47 69q-8-11-18-8l7 9-10 9q14 3 23-3Z',skin),47,70,-10,13,'.72s')+
        breathe(p('M44 69C57 56 67 47 86 46Q93 34 105 36Q99 41 99 47Q119 47 126 60L137 63Q139 69 125 71Q104 82 83 77L47 77Z',skin)+
          p('M58 75Q77 63 102 69Q118 71 134 65Q121 79 95 79Z',bib)+eye(118,60,.78)+
          line('M125 68q5-1 8-3','#4c6f83')+marks('M77 55q11-5 23-4'),85,76)+
        turn(p('M94 68q-4 17-17 18l5-15Z',skin),93,69,-14,12,'.75s'),83,68,'anim-dive 1.72s ease-in-out')+
      joint(drops([[112,82],[123,75],[134,79],[143,84]])+
        line('M104 92q13-8 25 0q12 3 20-3','#fcfff1',2),124,94,'anim-splash 1.72s ease-out')),

    // Abeille : vol en lacets, décélération devant les pétales, ailes indépendantes.
    animal('bee','Abeille','L’abeille butine de fleur en fleur !',[['#f6d27a','#cb8a46'],['#f2fbf1','#9dc6c8']],(gold,wing) =>
      ground(115,101,27)+line('M118 99Q127 86 116 69','#68906a',3)+
      p('M120 95Q128 84 141 85Q137 95 120 95ZM121 92Q107 81 101 87Q103 95 121 92Z','#87a46f')+
      [[107,69],[114,60],[126,64],[129,75],[118,79]].map(([x,y])=>e(x,y,7,6,'#ce8390')).join('')+
      e(118,70,6.5,6.5,gold)+
      joint(
        joint(p('M62 50Q44 22 57 26Q75 28 73 50Z',wing)+line('M60 31q6 5 9 14','#a1bcb9'),71,50,'anim-flutter .12s ease-in-out')+
        joint(p('M70 49Q69 19 83 26Q91 33 77 53Z',wing),74,50,'anim-flutter .14s ease-in-out','--to:-9deg')+
        breathe(p('M48 53Q62 40 79 51Q85 61 74 67Q53 71 48 57L43 56Z',gold)+
          p('M57 48l6-2q-5 11 2 21l-6-1q-6-8-2-18m11-2 6 1q-4 10 3 17l-5 2q-6-8-4-20','#604a3b')+
          e(83,55,10,9,gold)+eye(88,54,.72)+line('M86 48q2-7 7-7M84 47q-1-7 3-8M88 59q3 1 4-1','#654f3d')+
          turn(line('M75 63l-2 7m9-8 1 6','#685043'),76,62,0,20,'.31s'),72,63),75,57,'anim-visit 1.58s ease-in-out')),

    // Papillon : deux ailes nervurées, battues autour de l'axe du thorax.
    animal('butterfly','Papillon','Le papillon volette !',[['#f4bd7c','#bd737e'],['#ffe8b9','#df926f']],(wing,spot) =>
      ground(80,100,33)+
      joint(
        joint(p('M80 61C68 39 42 31 37 42C32 52 48 70 61 70C51 71 47 81 55 89Q67 98 80 72Z',wing,'#805463')+
          p('M75 62Q50 40 42 44Q42 54 55 62Q65 66 75 62ZM72 72Q53 75 56 84Q63 88 72 72Z',spot)+
          line('M77 65Q57 62 47 51m29 18-15 12','#925c68',.85)+e(51,52,3.5,4.5,'#fff1d1'),80,64,'anim-flutter .24s ease-in-out')+
        joint(p('M80 61C92 37 117 30 123 42C128 52 111 70 99 70C109 71 113 81 105 89Q94 98 80 72Z',wing,'#805463')+
          p('M85 62Q110 40 118 44Q118 54 105 62Q95 66 85 62ZM88 72Q107 75 104 84Q97 88 88 72Z',spot)+
          line('M83 65Q103 62 113 51m-29 18 15 12','#925c68',.85)+e(109,52,3.5,4.5,'#fff1d1'),80,64,'anim-flutter .24s ease-in-out','--to:-5deg')+
        breathe(e(80,68,3.5,12,'#75535a')+e(80,55,5,5,'#75535a')+eye(78,54,.42)+eye(82,54,.42)+
          line('M78 52q-4-10-9-10m13 10q4-10 9-10','#75535a',.9),80,70),80,66,'anim-hover 1.42s ease-in-out')),

    // Singe : la main reste accrochée au pivot de la branche.
    animal('monkey','Singe','Le singe se balance à sa branche !',[['#bd926e','#855e49'],['#f5d7a7','#d5a580']],(fur,cream) =>
      ground(80,101,33)+line('M26 24Q61 12 136 24m-25-4 13-10','#826347',5)+
      p('M123 12q8-12 20-6q-5 8-20 6m-85 9q-15 1-21-8q12-3 21 8','#8ca269')+
      turn(turn(line('M87 81q38 6 30-16q-2-6-8-2','#946b51',5),88,81,12,-26,'1.13s')+
        turn(line('M72 78q-12 15 0 16m15-15q10 16 16 11','#91674e',7),79,78,-16,12,'1.13s')+
        breathe(e(80,70,17,17,fur)+e(81,73,11,10,cream),81,83)+
        turn(line('M88 62q16 3 22-13','#9c7256',7),88,62,13,-12,'1.13s')+
        line('M74 63Q67 47 80 22','#a37859',7)+e(80,21,5,4,cream)+
        turn(e(64,49,6,7,fur)+e(95,49,6,7,fur)+e(80,48,17,16,fur)+
          p('M68 47Q70 40 80 45Q91 39 93 49Q95 60 81 62Q67 61 68 47Z',cream)+
          eye(75,49,.72)+eye(85,49,.72)+e(81,54,2.5,1.3,'#9b6f59')+line('M77 57q5 3 9-1'),80,59,-6,11,'1.13s'),
        80,21,-25,25,'1.13s')),

    // Éléphant : deux segments de trompe, oreille souple et gouttes projetées.
    animal('elephant','Éléphant','L’éléphant t’arrose de bravos !',[['#b5bdc1','#7d8e9a'],['#d9b7b7','#a58492']],(fur,ear) =>
      ground(75,96,49)+turn(line('M44 71q-14 6-15 14','#8797a0',3),44,71,2,-16,'1.5s')+
      [45,56,74,87].map((x,i)=>turn(p(`M${x} 75l12 0-2 18q-6 5-12 0Z`,i%2?fur:'#80919d'),x+4,77,-2,5,'1.5s')).join('')+
      breathe(e(66,70,32,23,fur)+marks('M42 62q10-13 21-13'),66,94)+
      turn(p('M91 44Q114 41 118 63Q119 76 107 82L89 77Q78 57 91 44Z',fur)+
        turn(p('M97 47Q72 39 72 58Q71 82 90 80Q102 73 101 55Z',fur)+
          p('M94 52Q77 46 77 60Q77 78 88 74Q98 67 94 52Z',ear),96,51,-6,14,'1.36s')+
        eye(110,59)+line('M111 66q7 0 10 6','#f4e2bb',2)+
        turn(p('M110 68Q119 67 118 77Q120 84 126 78L132 81Q132 92 120 92Q108 91 108 75Z',fur)+
          turn(line('M126 80q6-2 5-10','#8999a4',6),125,81,1,-19,'1.36s'),111,70,6,-27,'1.36s'),91,72,-3,3,'1.36s')+
      joint(drops([[127,58],[136,53],[143,62],[147,71]]),128,64,'anim-drops 1.36s ease-out','--dx:7px;--dy:-16px')),

    // Lion : le poitrail se gonfle, la mâchoire s'ouvre et la crinière réagit.
    animal('lion','Lion','Le lion pousse un grand rugissement !',[['#e9b978','#bf8b52'],['#c88b5d','#935739']],(fur,mane) =>
      ground(81,97,51)+turn(line('M55 81Q29 86 25 67','#b98151',4)+e(25,65,5,7,mane),55,81,0,17,'1.48s')+
      breathe(p('M45 83Q48 62 77 65L102 77Q112 90 101 95H52Q44 93 45 83Z',fur)+
        p('M56 84q11-9 21 5l11 3q3 4-5 5H54Z',fur)+e(103,93,12,4,fur),73,95)+
      turn(joint(p('M89 44Q91 33 104 38Q119 31 125 44Q137 46 133 57Q142 67 133 75Q134 86 122 87Q116 98 104 91Q92 96 87 85Q72 84 77 72Q69 61 81 53Q79 46 89 44Z',mane)+
        marks('M85 62q-6 5-3 11m5 2q-3 7 4 10m35-31q6 7 2 12m-8 11q-1 9-7 11'),104,72,'anim-purr .31s ease-in-out')+
        e(91,50,7,7,fur)+e(121,49,7,7,fur)+e(107,62,21,18,fur)+
        e(110,69,16,11,'#f3d5a3')+joint(e(112,75,9.5,9.5,'#653d36')+e(113,79,4.5,3,'#cf8b85'),111,71,'anim-roar 1.48s ease-in-out')+
        eye(101,61,.85)+eye(120,60,.86)+p('M106 66q5-4 10 0l-5 5Z','#6d463c')+line('M98 68l-7 1m8 1-8 3m28-5 8 1'),104,81,3,-9,'1.48s')),

    // Écureuil : une noisette tenue à deux pattes, petites morsures et queue souple.
    animal('squirrel','Écureuil','L’écureuil grignote une noisette !',[['#d89861','#aa6449'],['#f5d8ab','#d6a77d']],(fur,cream) =>
      ground(80,97,47)+turn(p('M67 90C40 99 20 83 24 61C26 43 39 30 52 39Q63 48 48 60Q34 78 69 79Z',fur)+
        marks('M32 69q-2-15 11-23m-9 28q2-13 9-20m-7 23 8 6'),63,85,-7,11,'1.1s')+
      breathe(e(74,77,20,20,fur)+e(86,77,12,17,cream)+e(77,93,18,4,fur),75,95)+
      turn(p('M80 57L76 40Q78 34 89 47Q101 44 108 57L117 64Q115 73 101 75Q83 73 80 57Z',fur)+
        p('M79 41l8 8-6 4Z','#d39b88')+e(107,66,10,6,cream)+eye(101,57)+e(115,64,3,2,'#694435')+
        joint(line('M104 68q6 4 10-1','#8c5b49'),104,67,'anim-chew .29s ease-in-out'),92,69,-4,4,'.58s')+
      turn(line('M84 81q9-3 14-10m-6 11 9-9','#a6674b',5)+
        p('M101 66q7-3 10 2q5 9-5 12q-8-2-7-10Z','#a27146')+
        p('M99 70q0-7 10-6l4 5q-7-1-14 1Z','#79583c')+marks('M104 72l1 4'),90,79,-4,9,'.58s')),

    // Escargot : pied allongé et antennes articulées autour de leurs racines.
    animal('snail','Escargot','L’escargot glisse, tout doucement !',[['#d2a77e','#9e6b55'],['#b7c792','#7f9c77']],(fur,skin) =>
      ground(79,96,48)+
      joint(breathe(p('M36 88Q64 81 91 84Q102 84 107 72Q112 62 123 65Q133 66 134 76Q133 89 118 92Q84 98 37 94Q29 92 36 88Z',skin)+
        turn(line('M112 70q-4-12-8-17','#809a71',2.4)+e(104,53,2.4,2.5,'#809a71'),112,70,-12,10,'1.14s')+
        turn(line('M122 69q6-10 11-15','#809a71',2.4)+e(133,54,2.5,2.7,'#809a71'),122,69,10,-14,'1.14s')+
        eye(123,74,.68)+line('M123 80q4 2 8-2','#5f785d'),94,93)+
        turn(p('M46 84C38 70 46 49 62 43C84 34 102 49 103 65Q108 87 87 91Q57 95 46 84Z',fur)+
          line('M53 80C43 65 57 46 76 47C97 48 103 72 87 81C68 92 54 74 62 61C68 51 86 55 88 67C90 76 76 80 70 72Q65 66 74 62','#885e4f',2)+
          marks('M55 61q6-10 17-10m-7 32 10 3'),75,90,-3,3,'1.25s'),80,96,'anim-travel 2.2s ease-in-out alternate')),

    // Canard : pattes sous l'eau, corps flottant et bec qui vient à la surface.
    animal('duck','Canard','Le canard barbote !',[['#f7e7b2','#d3b782'],['#9eb39d','#648e7f']],(fur,head) =>
      water(82,91,63)+
      turn(line('M78 86l-9 10-10 1m32-11-3 11 10 2','#c9915c',4),81,87,-20,17,'.75s')+
      joint(p('M102 72Q70 65 45 75L29 70Q38 94 74 95Q101 98 112 85Z',fur)+
        turn(p('M50 78Q66 69 91 78Q82 92 63 89Z',fur,'#c0a376')+marks('M58 81q10-5 21-1m-16 4 10-1'),79,80,-8,7,'.75s')+
        turn(p('M90 81Q92 69 94 57C96 42 115 42 123 53Q129 67 116 73L112 83Z',head)+
          p('M121 58q10 4 19 1q0 10-18 10Z','#dca65d')+
          line('M122 65q11 0 15-2','#ae784e')+eye(117,55)+line('M93 72q10 7 22 2','#f9edcc',3),103,80,-12,21,'.75s'),80,91,'anim-bob .75s ease-in-out')+
      joint(drops([[125,80],[135,76],[141,83]]),129,89,'anim-drops .75s ease-out')),

    // Pieuvre : huit bras distincts en deux plans, décalés comme une vague.
    animal('octopus','Pieuvre','La pieuvre danse avec ses huit bras !',[['#d8a5b5','#a26b8b'],['#e5bbbd','#b27693']],(fur,arm) => {
      const arms = [
        ['M62 71Q45 60 31 72Q23 78 17 69',62,71],
        ['M65 75Q48 76 38 88Q29 95 20 86',65,75],
        ['M68 77Q61 93 46 94Q37 94 36 102',68,77],
        ['M74 79Q77 92 64 98Q55 104 61 108',74,79],
        ['M85 79Q83 92 96 98Q104 104 99 108',85,79],
        ['M92 77Q102 92 113 94Q124 95 123 101',92,77],
        ['M96 75Q113 75 121 86Q130 95 140 86',96,75],
        ['M99 71Q116 58 130 71Q139 77 145 69',99,71]
      ];
      const limb = ([d,x,y],i) => turn(line(d,i%2 ? '#b781a0' : '#a97795',8)+line(d,'#f2c9ce',1),x,y,-12,13,'.92s',`-${i*.115}s`);
      return water(80,96,62)+joint(arms.map(limb).join('')+
        breathe(p('M54 65C54 44 65 33 80 33C99 33 108 47 108 65Q106 83 81 85Q58 84 54 65Z',fur)+
          e(81,74,20,9,arm)+eye(71,61)+eye(91,61)+e(65,69,4,2.2,'#e0a1a7')+e(97,69,4,2.2,'#e0a1a7')+
          line('M77 69q5 5 10-1','#7d5068')+marks('M62 55q5-13 16-15'),81,80),81,78,'anim-bob 1.25s ease-in-out');
    }),

    // Phoque : une nageoire lève le ballon pendant que l'autre garde l'équilibre.
    animal('seal','Phoque','Le phoque fait rebondir son ballon !',[['#b7c3c3','#71868e'],['#f2bb8d','#cd7e74']],(fur,ball)=>
      ground(79,96,51)+turn(p('M51 83Q27 87 21 73Q35 71 41 79Q45 70 52 72Z',fur),49,82,-10,14,'.95s')+
      breathe(p('M36 87Q43 73 72 74Q82 69 87 54Q96 43 110 50Q127 56 123 69Q116 75 110 75Q103 96 64 96Q42 96 36 87Z',fur)+
        e(112,66,10,6,'#d4d7cb')+eye(109,57)+e(120,62,3,2,'#59616a')+
        line('M112 68l-10 1m10 1-9 4m13-5 9 3','#748087',.85)+marks('M53 85l3-2m4 0 3-2m5 1 4-2'),78,94)+
      turn(p('M94 76q13 8 24 2q-2 10-14 12Z',fur,'#85999d'),94,77,15,-26,'.95s')+
      joint(e(127,73,8,8,ball)+p('M122 67q7 0 10 10l-3 3q-2-8-9-10Z','#ffe1a6'),126,81,'anim-toss .95s ease-in-out')),

    // Hérisson : museau et pattes fouillent la litière, le manteau de piquants respire.
    animal('hedgehog','Hérisson','Le hérisson fouille sous les feuilles !',[['#bc9a76','#785846'],['#f3d9b0','#c59b7b']],(quills,fur)=>
      ground(80,97,52)+
      turn(p('M116 92q13-15 28-9q-5 13-28 9Z','#c68c54')+line('M117 92l21-6','#936648'),118,92,0,-24,'.72s')+
      turn(p('M42 93q-11-14-22-6q4 7 22 6Z','#a6ac70'),39,92,-6,8,'1.1s')+
      breathe(p('M35 88L30 80L37 79L32 73L40 71L37 64L46 63L44 56L54 56L55 50L64 53L69 47L76 52L84 49L89 56L98 55L99 64L108 65L107 75L114 80L107 91Q75 102 35 88Z',quills)+
        marks('M44 76l10-7m-5 13 12-10m-1-5 9-7m-5 22 10-9m1-4 9-6m-3 18 12-10m-46-6 7-4'),75,94)+
      turn(p('M84 73Q98 61 109 71L131 87Q128 95 104 94Q84 92 84 73Z',fur)+e(98,73,5,6,fur)+e(98,73,2.3,3.2,'#c99881')+
        eye(112,80,.85)+e(130,87,3.5,3,'#634a43')+line('M126 91q-5 2-9 0','#926b55'),97,82,-8,12,'.72s')+
      turn(line('M91 89q6 7 12 3','#b28669',5),92,89,-9,13,'.72s')),

    // Girafe : le cou s'incline vers les feuilles et la mâchoire mâchonne.
    animal('giraffe','Girafe','La girafe cueille une feuille tendre !',[['#efcb8c','#c38d57'],['#c49061','#a46e49']],(fur,spots)=>
      ground(73,99,46)+line('M148 20q-13 1-26 9','#8c7858',3)+
      turn(p('M130 24q-9-10-16-5q4 7 16 5m-3 3q-11 1-14 7q9 3 14-7m9-6q-3-11 6-13q3 6-6 13','#8ea373'),130,24,0,14,'1.42s')+
      [49,58,80,90].map((x,i)=>turn(line(`M${x} 75l-1 22h6`,i%2?'#c89057':'#b68356',5),x,75,-4,5,'1.42s')).join('')+
      turn(line('M48 72q-16 3-17 12','#ad7b55',2)+e(31,85,2.7,4,spots),47,72,-12,13,'1.2s')+
      breathe(e(69,72,25,13,fur)+p('M47 70l7-6 6 5-3 6-8 1m14-12 9-1 5 6-4 4-9-1m9 6 8-4 7 4-6 5Z',spots),68,85)+
      turn(p('M77 77Q81 65 87 47L96 26L109 31Q101 55 100 74Q91 88 77 77Z',fur)+
        p('M82 67l8-4 6 5-2 7-10 3m7-22 1-8 7-2 2 7-5 6m1-21 4-8 6 2-3 8Z',spots)+
        turn(p('M95 28Q86 19 86 15Q97 14 103 23Z',fur),100,24,-8,15,'1.42s')+
        line('M101 24l-1-12m8 11 3-11','#b78153',3.5)+e(100,11,3,2.6,spots)+e(111,12,3,2.6,spots)+
        p('M94 27Q101 18 112 24L126 30Q131 37 121 42L104 39Q94 37 94 27Z',fur)+
        joint(p('M114 32q10-4 15 0q4 7-6 9l-9-1Z','#f1d6a6')+e(126,34,2,1.3,'#98704f'),115,34,'anim-chew .43s ease-in-out')+
        eye(110,29,.83),88,74,-10,10,'1.42s')),

    // Zèbre : deux paires de pattes diagonales pour un petit trot.
    animal('zebra','Zèbre','Le zèbre part au petit trot !',[['#f4eddd','#c0b8ad'],['#756569','#453f4a']],(fur,dark)=>
      ground(82,98,55)+joint(
        [49,60,81,91].map((x,i)=>joint(line(`M${x} 76l2 9-4 9h8`,i%2?'#e4d8cc':'#a59a9a',5)+
          line(`M${x-2} 94h7`,'#5e5259',3),x,76,`anim-step .59s ease-in-out ${i===0||i===3?'-.295s':'0s'}`)).join('')+
        turn(line('M48 68q-12-3-15 15','#74636a',2)+e(32,85,2.8,5,dark),47,68,-10,18,'.59s')+
        breathe(p('M39 71Q44 56 67 62L86 58Q96 61 102 74Q99 86 76 85L53 84Q40 82 39 71Z',fur)+
          p('M46 64q-3 9 5 18l4 1q-7-11-4-21Zm11-2q4 9 3 22h4q0-15-3-22Zm15 1q1 10 5 22l4 0q-4-13-4-23Zm13-4q2 14 7 24l4-2q-5-11-5-21Z',dark),70,84)+
        turn(p('M81 68q8-23 11-29l7 1-7 31Z',dark)+
          p('M84 72q8-24 15-31l15 5q-10 9-11 29Z',fur)+p('M91 56l18-5-3 6-17 4m-2 4 17-4-2 5-16 4Z',dark)+
          p('M99 45q-8-14-1-15q5 1 7 11q7-11 12-8q1 5-5 12L126 56q5 9-7 11l-17-9Z',fur)+
          p('M113 51l7 2-10 9-4-3Zm7 3q10 2 10 8q-4 8-14 3Z',dark)+eye(112,49,.8)+e(125,60,1.7,1.3,'#9a8580'),93,69,-7,7,'.59s'),
        78,94,'anim-bob .59s ease-in-out','--to:0deg')),

    // Raton laveur : les deux pattes plongent puis ressortent de l'eau.
    animal('raccoon','Raton laveur','Le raton laveur trempe ses pattes !',[['#b8b2a9','#7c7b79'],['#f3e8d6','#c4b9ad']],(fur,cream)=>
      ground(72,97,47)+turn(p('M59 87Q37 99 17 88Q11 81 20 77Q39 77 61 75Z',fur)+
        p('M23 77l7 1q-5 7 3 15l-7-2q-6-7-3-14m15 0 7-1q-4 7 2 17l-6 1q-5-8-3-17','#65616a'),56,83,-9,10,'.96s')+
      breathe(e(73,76,27,21,fur)+e(89,78,13,14,cream),75,95)+water(116,96,30)+
      turn(line('M87 78q5 15 19 12m-10-13q7 12 18 11','#78747a',6),91,78,-15,12,'.96s')+
      turn(e(84,54,9,8,fur)+e(113,53,9,8,fur)+e(84,54,4.7,4.5,'#917f81')+e(113,53,4.7,4.5,'#917f81')+
        p('M78 65Q80 50 99 50Q118 51 123 65L104 80Q96 83 78 65Z',cream)+
        p('M78 64Q86 56 94 59L100 65Q108 57 122 63Q115 73 106 72L100 69Q89 76 78 64Z','#655d68')+
        eye(90,64,.85)+eye(111,64,.85)+e(101,73,4.5,3,'#514651')+line('M99 78q3 2 7-1','#8b7470'),99,75,-5,9,'.96s')+
      joint(drops([[108,84],[118,80],[126,85]]),116,92,'anim-drops .96s ease-out')),

    // Loutre : sur le dos, la pierre suit les pattes et frappe le coquillage.
    animal('otter','Loutre','La loutre ouvre un coquillage sur son ventre !',[['#bf9877','#815d49'],['#f2dbb3','#c8a281']],(fur,cream)=>
      water(79,94,64)+joint(
        turn(p('M106 83q22-11 36-3q-14 7-31 12Z',fur),107,85,-16,10,'1.2s')+
        breathe(p('M52 80Q59 64 90 66Q112 67 117 83Q107 96 75 95Q55 94 52 80Z',fur)+e(84,75,23,10,cream),81,93)+
        turn(e(113,79,10,5,fur)+e(111,86,9,5,fur),105,84,11,-13,'.9s')+
        turn(e(45,74,19,16,fur)+e(33,67,5,6,fur)+e(54,63,5,5,fur)+e(44,72,12,9,cream)+
          eye(36,69,.76)+eye(51,67,.76)+e(43,73,3.7,2.3,'#69483d')+line('M39 79q5 2 9-1'),55,78,-9,9,'1.2s')+
        p('M80 69q4-8 14-5q8 6 1 11l-13-1Z','#c68183')+line('M83 71l4-5m0 7 5-6','#f5c3ab',.9)+
        turn(line('M67 79q3-9 12-17','#a67d63',7)+e(80,60,5,3.6,'#898b83'),68,78,-20,24,'.6s'),
        79,91,'anim-bob 1.2s ease-in-out')),

    // Baleine : le souffle monte en éventail et retombe en gouttelettes.
    animal('whale','Baleine','La baleine souffle un joli jet d’eau !',[['#96b2c3','#536e8e'],['#e1ede7','#a2bfc9']],(skin,cream)=>
      water(82,94,69)+joint(
        turn(p('M111 77Q130 64 141 58L136 69L148 67Q143 80 124 85Z',skin),115,78,7,-13,'1.55s')+
        breathe(p('M26 72Q28 54 58 54Q80 55 99 69Q113 78 131 75Q122 95 86 97Q46 101 30 87Q24 81 26 72Z',skin)+
          p('M28 79Q59 91 89 86Q115 84 128 79Q115 96 81 97Q39 98 28 79Z',cream)+
          eye(47,72)+line('M31 79q15 8 29 1m-20 7q19 7 38 4','#6b8b9e')+marks('M38 64q12-7 25-5'),79,94)+
        turn(p('M80 78q18 3 20 12q-14 3-24-6Z',skin),80,80,-10,16,'1.55s'),
        81,91,'anim-bob 1.55s ease-in-out','--to:0deg')+
      joint(line('M59 55q-3-14-15-17m15 17q6-19 20-18m-21 17q-1-16 2-23','#84b8c3',2)+
        drops([[43,29],[59,24],[79,29],[68,34]]),59,56,'anim-drops 1.55s ease-out','--dx:0px;--dy:-12px')),

    // Flamant rose : le cou plonge, la patte libre se replie et le bec touche l'eau.
    animal('flamingo','Flamant rose','Le flamant rose pêche dans l’eau peu profonde !',[['#e9b4af','#c87f8b'],['#f4cec1','#ce8b94']],(fur,wing)=>
      water(83,98,60)+line('M71 66l-2 20 9 12h9','#b78181',3)+
      turn(line('M81 69l8 16-14 6','#c88d8c',3),81,68,-7,13,'1.45s')+
      breathe(p('M42 55Q56 43 75 51Q88 50 101 58Q104 74 76 75Q53 73 42 55Z',fur)+
        turn(p('M52 57Q67 49 90 57Q84 70 62 65Z',wing)+marks('M59 57q10-3 20 1m-16 2 13 1'),79,58,-6,8,'1.45s'),73,72)+
      joint(p('M92 58Q107 61 111 45Q117 30 126 36Q135 42 129 47Q125 49 121 46Q117 71 98 71Z',fur)+
        p('M127 39Q142 39 138 50L134 55L128 46Z','#f1d3bc')+p('M138 45q4 4-4 10l-2-5Z','#655563')+
        eye(126,41,.7),96,62,'anim-fish 1.45s ease-in-out')+
      joint(drops([[118,91],[128,87],[137,91]]),127,96,'anim-splash 1.45s ease-out')),

    // Perroquet : il déploie une aile, puis salue avec la tête.
    animal('parrot','Perroquet','Le perroquet déploie son aile pour te saluer !',[['#b8c985','#678f75'],['#9dbfc0','#557e91']],(fur,wing)=>
      ground(81,102,44)+line('M41 91q35-3 79 1m-16-2 11-7','#8d7358',4)+
      turn(p('M69 72Q54 85 48 103Q64 97 79 78Z',wing),70,74,-10,9,'1.2s')+
      breathe(p('M63 64Q65 47 88 46Q106 50 101 70Q97 86 76 88Q63 81 63 64Z',fur)+
        e(93,66,9,14,'#e2c18c'),82,86)+
      turn(p('M77 56Q61 53 44 62Q50 77 71 79Q81 73 77 56Z',wing)+
        line('M49 65q10-3 20 3m-16 2q7-2 14 1m-9 4 9-1','#6d96a1'),76,60,-12,34,'1.2s')+
      turn(e(94,44,18,15,fur)+e(103,44,9,10,'#f3e9ca')+
        p('M109 44q15-3 16 7q-2 7-9 8l1-6-8 1Z','#a58465')+eye(105,43)+marks('M84 38q3-5 11-5'),90,54,0,13,'1.2s')+
      line('M78 86l-2 7m6-7-1 7m10-7-1 7','#aa8667',2)),

    // Hamster : la roue tourne autour de son axe, les pieds courent en sens inverse.
    animal('hamster','Hamster','Le hamster court dans sa roue !',[['#e2af7b','#ba815d'],['#fff0d1','#dbb797']],(fur,cream)=>
      ground(80,102,45)+line('M67 98h34m-25-4 5-39 8 43','#97a394',3)+
      joint(`<circle cx="81" cy="57" r="38" fill="#e9eddf" fill-opacity=".5" stroke="#a5b1a1" stroke-width="4"/>`+
        line('M81 21v72M45 57h72M56 32l50 50m-50 0 50-50','#bdc5b6',1.5),81,57,'anim-wheel 2s linear')+
      joint([68,78,89,96].map((x,i)=>joint(line(`M${x} 82l-3 7h7`,'#b9866c',3.6),x,82,`anim-step .34s ease-in-out ${i%2?'-.17s':'0s'}`)).join('')+
        breathe(e(74,78,17,11,fur)+e(81,82,12,6,cream),76,87)+
        turn(e(85,68,6,6,fur)+e(85,68,3,3,'#d49b8d')+e(93,74,13,10,fur)+e(100,78,8,6,cream)+
          eye(98,72,.79)+e(105,76,2.5,2,'#915c54')+line('M101 80l8 1m-9 1 7 2','#a27965',.8),89,79,-5,5,'.34s'),
        82,88,'anim-bob .34s ease-in-out','--to:0deg')),

    // Chauve-souris : les ailes membraneuses s'ouvrent et se replient autour des épaules.
    animal('bat','Chauve-souris','La chauve-souris voltige au clair de lune !',[['#b19ca7','#746377'],['#c6adb9','#9b7f9b']],(fur,wing)=>{
      const membrane=p('M77 61Q65 45 46 40Q30 35 17 49Q34 47 39 64Q49 58 55 74Q62 68 73 78Z',wing,'#92778e')+
        line('M74 68Q62 47 40 43m32 26Q56 53 39 64m32 6q-11-9-16 4','#947b90',1);
      return e(123,31,17,17,'#f3e8be')+e(118,25,17,17,'#fffdf7')+ground(80,96,34)+
        joint(joint(membrane,74,65,'anim-flutter .29s ease-in-out')+
          joint(`<g transform="translate(160 0) scale(-1 1)">${membrane}</g>`,86,65,'anim-flutter .29s ease-in-out','--to:-5deg')+
          breathe(e(80,68,12,15,fur)+p('M69 58Q64 43 69 43Q76 44 78 51H83Q88 43 93 45L92 60Q88 69 79 68Q71 67 69 58Z',fur)+
            eye(76,57,.73)+eye(86,57,.73)+e(81,61,2.5,1.7,'#816073')+line('M78 64q3 2 6-1','#674e65'),80,78),
          80,65,'anim-hover 1.55s ease-in-out');
    }),

    // Gecko : pattes alternées sur le rocher, longue queue contrebalancée.
    animal('gecko','Gecko','Le gecko escalade son rocher !',[['#b7c689','#789b76'],['#eddda5','#b6bc83']],(skin,bib)=>
      ground(80,99,58)+p('M28 98q8-22 43-22q11-18 44-19q13 1 24 8l11 33Z','#d5c6ae')+
      marks('M33 94q17-12 37-12m27-9q11-10 31-5','#fff2da')+
      joint(turn(p('M70 76Q50 91 33 83Q20 77 25 67Q24 79 40 79Q51 80 63 70Z',skin),66,74,-11,18,'1.3s')+
        [[66,74,-1],[77,69,1],[88,65,-1],[98,61,1]].map(([x,y,sign],i)=>
          joint(move(`<g transform="scale(1 ${sign})">${line('M0 0l3 9 10 1m-3-1 4-3m-2 5 4 2','#83a27c',2.5)}</g>`,x,y),
            x,y,`anim-step .64s ease-in-out ${i%2?'-.32s':'0s'}`)).join('')+
        breathe(p('M56 74Q70 59 91 60Q99 52 107 51Q121 50 124 57Q124 63 108 65Q93 79 69 79Z',skin)+
          p('M66 75Q97 69 112 61L121 60Q110 72 86 77Z',bib)+eye(112,55,.74)+
          line('M114 61l8-2','#728461')+marks('M66 70l2-1m6-1 3-2m1 4 3-2m3-3 3-1m1 3 3-2'),87,75),
        79,77,'anim-climb 1.95s ease-in-out alternate')),

    // Crocodile : bâillement lent, mâchoire inférieure articulée, queue souple.
    animal('crocodile','Crocodile','Le crocodile ouvre grand la bouche pour bâiller !',[['#a8bb81','#688c65'],['#e3d4a0','#b6b27a']],(skin,bib)=>
      ground(80,96,63)+turn(p('M63 77Q48 82 31 78Q18 77 14 69Q10 86 35 92Q49 95 68 86Z',skin),58,81,-11,8,'1.68s')+
      turn(line('M54 82l-3 10 10 1m14-12 1 11 10 1','#799869',5),63,82,-4,8,'1.68s')+
      breathe(p('M40 83Q52 67 73 71Q84 70 91 76Q98 89 85 92Q56 98 40 83Z',skin)+
        p('M48 76l5-7 5 4 6-7 5 5 7-4 5 6Z','#849f71')+
        marks('M51 84l5-1m2 3 5-1m3-4 5-1m3 4 5-1'),69,91)+
      turn(p('M83 80Q89 67 99 71L141 74Q148 82 139 86L105 86Q91 89 83 80Z','#8d6971')+
        joint(p('M95 80Q121 81 145 78L143 84Q139 89 100 88Z',bib)+
          p('M121 81l3-3 2 3m7-1 3-3 2 3','#f5e8bf'),96,80,'anim-yawn 1.68s ease-in-out')+
        p('M83 77Q83 62 96 61Q103 60 108 68L143 70Q151 75 144 79L107 80Q92 87 83 77Z',skin)+
        p('M126 79l3 4 3-4m3 0 3 3 2-3','#f9ecc7')+eye(100,68)+e(140,73,2.2,1.3,'#6b825c'),93,82,3,-9,'1.68s')),

    // Hippocampe : la queue s'enroule près des algues, la nageoire vibre.
    animal('seahorse','Hippocampe','L’hippocampe enroule sa petite queue !',[['#edbb89','#b77970'],['#f3d5a3','#d7987e']],(skin,bib)=>
      water(79,102,48)+turn(line('M44 103q-10-14-5-27m8 24q10-16 7-28m55 28q12-11 8-24','#92ad96',3),48,100,-4,9,'1.55s')+
      joint(turn(line('M84 78q9 9 1 18q-8 8-16 0q-4-6 3-8q4-1 5 4','#bb8174',6),84,79,5,-25,'1.3s')+
        turn(p('M85 59q15-9 20 1q-5 10-19 10Z','#cdaaa1')+line('M89 61l12-4m-12 7 12-3','#e8c5b0',1),88,63,-12,16,'.28s')+
        breathe(p('M68 48Q68 38 80 40Q91 46 90 60Q104 78 88 83Q71 86 67 73Q67 63 75 55Z',skin)+
          p('M73 58Q86 61 90 74Q89 82 79 81Q67 75 73 58Z',bib)+
          line('M73 67q7 3 13 2m-12 5q6 2 13 1','#bb8277'),83,81)+
        turn(p('M67 52L58 51Q54 48 57 44L69 40Q70 29 83 30L88 24L91 34Q99 44 88 53Q80 59 67 52Z',skin)+
          p('M79 33l1-7 5 5m6 4 5-4-2 9Z',bib)+eye(76,42,.82)+line('M57 49l7-1','#a76d67'),83,53,-7,8,'1.3s'),
        81,71,'anim-bob 1.3s ease-in-out')),

    // Crabe : marche latérale et pinces à deux segments.
    animal('crab','Crabe','Le crabe marche de côté et claque des pinces !',[['#e6ad89','#bd776d'],['#f0c2a2','#ce8c7f']],(fur,claw)=>{
      const pincher=(x,sign)=>turn(move(`<g transform="scale(${sign} 1)">${line('M0 0q-13 1-16-12','#bf7d73',5)}${p('M-19-12q-10-4-5-16l6 7 5-4q3 11-6 13Z',claw)}${turn(p('M-17-17q6-9 2-14q-5 0-6 10Z',claw),-18,-17,-11,19,'.46s')}</g>`,x,75),x,75,-12,12,'.93s');
      return ground(80,95,58)+joint(
        [-1,1].map(side=>[0,1,2].map(i=>joint(
          line(`M${80+side*19} ${77+i*3}l${side*(13+i*3)} ${3+i} ${side*(8-i)} 8`,'#b8756e',4),
          80+side*20,79,`anim-step .46s ease-in-out -${(i+(side===1?1:0))*.115}s`)).join('')).join('')+
        pincher(60,1)+pincher(100,-1)+breathe(e(80,76,25,15,fur)+e(80,80,15,8,claw)+
          line('M71 65l-2-9m20 9 2-9','#ba7972',3)+e(69,56,4.3,4.5,claw)+e(91,56,4.3,4.5,claw)+
          eye(69,55,.79)+eye(91,55,.79)+line('M76 74q4 4 8 0','#a66a62')+marks('M59 76q4-6 11-7'),81,90),
        80,92,'anim-travel 1.35s ease-in-out alternate');
    }),

    // Lama : oreilles et lèvres indépendantes quand il mâchonne une brindille.
    animal('llama','Lama','Le lama mâchonne un brin d’herbe !',[['#f4e8cc','#c8af90'],['#dbc4a6','#ad907a']],(fur,cream)=>
      ground(79,98,49)+[50,61,82,94].map((x,i)=>turn(line(`M${x} 78l-1 16 6 1`,i%2?'#d5bea1':'#ac9681',5.5),x,78,-4,5,'1.2s')).join('')+
      turn(p('M46 73q-10 0-13-10q13 1 18 5Z',cream),47,70,-10,12,'1.2s')+
      breathe(p('M40 76Q38 67 45 63Q50 55 62 59Q69 55 77 60Q87 55 97 62Q110 69 102 78Q92 87 81 84Q75 90 65 85Q55 88 50 82Q42 85 40 76Z',fur)+
        marks('M49 69q3-5 9-3m5 6q5-5 11-3m1 8q6-4 13-1','#a9917c'),76,85)+
      turn(p('M84 75Q92 63 90 48L92 35L110 38L108 75Q102 87 84 75Z',fur)+
        turn(p('M96 40Q84 29 88 18Q92 13 97 25L103 35Z',cream),99,36,-11,6,'1.18s')+
        turn(p('M102 36Q109 15 115 18Q119 25 112 40Z',fur)+line('M111 34l4-12','#c59186',1.5),107,37,-10,11,'1.18s')+
        p('M90 42Q91 31 104 33Q113 33 116 42L126 47Q130 55 119 58L102 56Q91 55 90 42Z',fur)+
        joint(e(119,51,9,5,cream)+e(125,50,2.2,1.6,'#8b6f60')+
          line('M119 55q9 7 18 2m-6 2 2-6','#8f9e68',1.4),116,51,'anim-chew .39s ease-in-out')+eye(110,43,.87),
        98,75,-4,5,'1.2s')),

    // Cygne : la poussée des pattes reste sous l'eau, le cou s'incline au-dessus.
    animal('swan','Cygne','Le cygne glisse doucement sur l’eau !',[['#fcf5e5','#cecfc8'],['#ebe9d6','#bcc8c5']],(fur,wing)=>
      water(80,94,69)+joint(
        turn(line('M71 90l-12 5m34-5-10 7','#9ea9a1',3),81,91,-13,12,'1.12s')+
        breathe(p('M31 72Q44 76 54 74Q71 66 95 71Q115 72 115 86Q101 101 61 95Q41 92 31 72Z',fur)+
          turn(p('M42 77Q56 66 68 66Q86 66 94 79Q84 92 61 88Z',wing)+
            line('M48 78q16-8 29-4m-22 9q16-6 24-4m-18 8 16-3','#a9b8b5',1),79,81,0,9,'1.12s'),73,93)+
        turn(p('M99 85Q107 70 105 60Q91 42 100 34Q110 23 121 34Q124 39 118 43Q112 47 109 41Q105 42 116 57Q123 72 111 89Z',fur)+
          p('M119 36q11 1 16 8q-7 4-18-2Z','#d2a26f')+p('M118 35l6 3-5 4-3-2Z','#6a6869')+eye(115,35,.7),
          108,84,-5,10,'1.68s'),80,94,'anim-travel 1.9s ease-in-out alternate')),

    // Souris : petites pattes rapides et museau tourné vers le fromage.
    animal('mouse','Souris','La souris trottine jusqu’à son morceau de fromage !',[['#c8b6ad','#9b8785'],['#f0d3bb','#cfa897']],(fur,cream)=>
      ground(80,97,56)+p('M117 96l9-16 19 7v9Z','#e3b66b')+p('M117 96l28-9v9Z','#cfa161')+
      e(130,91,2.3,1.4,'#b58955')+e(134,86,2,1.3,'#f8d088')+
      joint(turn(line('M53 87Q32 93 24 88Q12 79 24 75','#a98787',2.6),53,87,-7,17,'.83s')+
        [57,66,76,86].map((x,i)=>joint(line(`M${x} 87q-4 7 5 7`,'#ab9291',3),x,87,`anim-step .36s ease-in-out ${i%2?'-.18s':'0s'}`)).join('')+
        breathe(e(67,83,22,12,fur)+e(76,87,14,6,cream),73,94)+
        turn(e(79,72,8,9,fur)+e(79,72,4.5,5.2,'#cd9f9e')+e(93,73,7,8,fur)+
          p('M77 81Q82 70 94 75L109 84Q110 90 98 92Q83 94 77 81Z',fur)+
          e(102,86,7,3.5,cream)+eye(95,80,.76)+e(108,84,2.5,2,'#7d5e64')+line('M103 86l11 2m-11-1 10 4','#8c6d72',.8),
          87,86,-6,8,'.72s'),77,94,'anim-travel 1.75s ease-in-out alternate')),

    // Libellule : quatre ailes nervurées battent par paires déphasées.
    animal('dragonfly','Libellule','La libellule fait du sur-place puis file !',[['#a5c9bb','#6d9a96'],['#eff5e0','#a7c9c9']],(body,wing)=>{
      const blades = [[-1,-1],[-1,1],[1,-1],[1,1]].map(([side,sign],i)=>joint(
        move(`<g transform="scale(${side} ${sign})">${p('M0 0Q-12-12-36-16Q-49-18-48-11Q-45 0-14 4Z',wing,'#96b8b9',.7)}
        ${line('M-5 0q-14-8-38-12m15 7-4-6m-1 5-8-3','#9bbabd',.65)}</g>`,80,57),
        80,57,`anim-flutter .16s ease-in-out ${i%2?'-.05s':'0s'}`));
      return ground(81,98,37)+joint(blades.join('')+
        turn(p('M76 58Q79 53 84 59L82 84Q80 94 78 85Z',body)+line('M78 65h4m-4 4h4m-4 4h3m-2 5h2','#719b9d',.85),81,58,-9,9,'.64s')+
        breathe(e(80,55,5.5,9,body)+e(80,47,6.5,5.5,body)+eye(76,46,.53)+eye(84,46,.53),80,60),
        80,56,'anim-dart 1.48s ease-in-out');
    }),

    // Coccinelle : élytres ouverts avant le décollage, six pattes sous la carapace.
    animal('ladybug','Coccinelle','La coccinelle ouvre ses ailes et s’envole !',[['#e5a49a','#bd6f72'],['#eef1d9','#bfd1c0']],(fur,wing)=>{
      const cover = p('M80 62Q62 56 56 73Q51 90 69 93Q78 92 80 84Z',fur)+
        e(67,67,3.8,4,'#6d535b')+e(61,79,3.8,4,'#6d535b')+e(72,84,3.7,4,'#6d535b')+marks('M59 74q2-6 7-9');
      return ground(80,99,37)+joint(
        [-1,1].map(side=>[0,1,2].map(i=>turn(line(`M${80+side*10} ${74+i*5}l${side*(13+i)} 3 ${side*4} 5`,'#755d66',2),
          80+side*10,76+i*4,-8,8,'.4s')).join('')).join('')+
        joint(p('M80 66Q56 46 45 58Q45 76 76 79ZM80 66Q104 46 115 58Q115 76 84 79Z',wing,'#acbfae',1),
          80,67,'anim-lady-wings 1.62s ease-in-out')+
        breathe(e(80,79,19,15,'#7a5d66')+e(80,64,11,9,'#7a5d66')+
          eye(75,61,.7)+eye(85,61,.7)+line('M74 58q-3-9-7-8m19 8q3-9 7-8','#755d66',1.2),80,91)+
        joint(cover,80,63,'anim-elytron 1.62s ease-in-out','--to:32deg')+
        joint(`<g transform="translate(160 0) scale(-1 1)">${cover}</g>`,80,63,'anim-elytron 1.62s ease-in-out','--to:-32deg'),
        80,94,'anim-takeoff 1.62s ease-in-out');
    })
  ];
})();

/* ===== Capybara : même anatomie, dix décors et mises en mouvement ===== */
const CAPY_SCENES = (() => {
  const {p,e,line,joint,turn,breathe,move,eye,ground,marks,drops,shell,tone} = quizArt;
  const palette = [['#d2a06d','#976647'],['#b78259','#77513e']];
  const capy = (fur,muzzle,{sleep=false,dance=false,yuzu=false}={}) => {
    const paw = (x,y,shade,delay) => joint(
      p(`M${x} ${y}q12-5 18 0l-1 19q2 9-9 9q-13 0-12-6Z`,shade)+
      line(`M${x+3} ${y+25}l1-4m5 4 1-4`,'#634837',1.2),
      x+7,y,dance ? `anim-step .88s ease-in-out ${delay}` : 'anim-breathe 2.35s ease-in-out','','capy');
    const toes = sleep ? p('M107 140q20-7 35 0q7 10-13 10h-22Zm67-1q20-7 36 1q9 9-11 10h-25Z',muzzle) :
      paw(101,119,muzzle,'-.44s')+paw(172,117,muzzle,'0s')+paw(119,120,fur,'0s')+paw(188,120,fur,'-.44s');
    const body = p('M82 117C80 92 95 73 123 70C151 66 174 77 190 77Q208 90 211 121Q210 147 150 147Q98 149 82 127Z',fur)+
      marks('M91 111q3-17 15-25m-8 24q1-12 13-21m-3 13q4-10 13-14m-29 36 4 6m3-8 6 9m4-7 6 8','#ffe0a8')+
      marks('M133 81q12-3 22 2m-18 3 10 0m-7 53 16 0','#744b3b');
    const ears =
      joint(e(204,65,8,12,muzzle)+e(204,65,4,7,'#a17059'),205,72,'capy-ear 2.9s ease-in-out -.6s','','capy')+
      joint(e(182,64,9,13,fur)+e(181,64,4.7,8,'#89614e')+marks('M177 62q1-5 4-6'),183,73,'capy-ear 2.7s ease-in-out','','capy');
    const face = ears+p('M169 89C170 74 180 64 199 66Q215 65 222 77Q232 82 241 84Q252 88 250 101Q249 115 235 118L197 118Q172 114 169 89Z',fur)+
      p('M222 81Q235 82 244 85Q254 91 250 103Q247 115 233 116Q220 116 216 106Q213 97 222 81Z',muzzle)+
      e(244,93,3.8,2.4,'#513b32')+line('M241 105q-10 4-17-1','#5e4033',1.7)+
      (sleep ? line('M195 90q5 4 10-1','#483229',2.2) : eye(200,88,1.14))+
      marks('M190 79q5-3 10-2m22 13 9-3m-4 7 8-3m-54 5 4 5m1-6 4 5')+
      line('M242 99l7-1m-8 3 7 1','#604637',.8)+
      (yuzu ? e(198,60,13,11,'#e7ac4e')+e(196,58,9,8,'#f5c760')+
        marks('M190 60l1-1m5-4 1-1m1 11 1-1m5-5 1-1','#9d6836')+
        p('M198 50q3-9 13-7q-2 7-13 7Z','#6d9562')+line('M198 51l-1-5','#816742') : '');
    return toes+breathe(body,144,145)+turn(face,182,104,sleep?0:-2,sleep?1:3,'2.35s');
  };
  const backdrop = (sky,far,near,night=false) =>
    `<rect width="320" height="200" fill="${sky}"/>`+e(261,44,20,20,night?'#f9edc3':'#fff1cc')+
    p('M0 100Q40 65 90 90Q126 69 170 95Q226 63 320 94V200H0Z',far)+
    p('M0 122Q58 96 112 120Q192 88 320 117V200H0Z',near);
  const leaves = (x,y,c) => move(p('M0 0Q-2-17-12-25Q-13-10 0 0Q6-19 17-22Q16-10 0 0Q12-9 19-7Q12 2 0 0Z',c),x,y);
  const wave = (d,x,y,delay) => joint(line(d,'#f4fff2',1.5),x,y,`anim-ripple 2s ease-out ${delay}`,'','capy');
  const scene = (id,name,t,draw) => ({
    id,name,t,svg: shell(id,palette,draw(tone(id),tone(id,1)),'0 0 320 200')
  });
  return [
    // Bain : une rive de galets au premier plan et de la vapeur derrière le yuzu.
    scene('bath','Bain au yuzu','Le capybara prend un bain chaud avec un yuzu sur la tête !',(fur,muzzle) =>
      backdrop('#e9e9d1','#c3cfb0','#a7bb9d')+
      p('M0 120Q89 109 161 117Q237 123 320 112V200H0Z','#83b9b0')+
      e(52,129,29,10,'#9b9f8d')+e(26,132,15,7,'#beb9a0')+
      wave('M14 145q33-9 58 0m-35 7q30-5 52 0',54,150,'-.7s')+
      joint(move(capy(fur,muzzle,{yuzu:true}),-2,-1),163,143,'anim-bob 2.7s ease-in-out','--to:0deg','capy')+
      p('M0 142Q52 151 102 138Q159 145 209 136Q265 138 320 132V200H0Z','#83b9b0')+
      wave('M92 151q50 10 121 0m-98 10q34 4 75 1',153,156,'0s')+
      wave('M222 144q23-5 57 0m-40 10q21 3 47-1',251,149,'-.9s')+
      [110,139,230].map((x,i) => joint(line(`M${x} 108q-10-8 0-16q10-9 1-19`,'#fff8e4',3),
        x,100,`capy-rise 2.6s ease-out -${i*.74}s`,'','capy')).join('')+
      e(294,183,39,17,'#929a88')+e(266,184,16,8,'#bdb8a3')+leaves(32,184,'#658f72')),

    // Danse : deux appuis alternés et des notes dessinées en SVG.
    scene('dance','Danse','Le capybara danse pour fêter ta victoire !',(fur,muzzle) =>
      backdrop('#f5dfcc','#e5bcae','#dbc2ad')+e(163,154,107,26,'#efd4ae')+
      ground(166,153,81)+leaves(32,163,'#8c9c74')+leaves(285,153,'#9ca17a')+
      joint(capy(fur,muzzle,{dance:true}),165,151,'capy-dance .88s ease-in-out','','capy')+
      [[55,74,'#ac7380'],[257,69,'#8d9272'],[272,106,'#ad7a61']].map(([x,y,c],i)=>
        joint(move(e(0,0,5,3.7,c)+line('M4 0v-17q7-1 9 4',c,2.3),x,y),x,y,`capy-rise 2s ease-out -${i*.64}s`,'','capy')).join('')),

    // Bouée : l'avant de la bouée recouvre les pattes et suit le même balancement.
    scene('float','Sur la bouée','Le capybara se laisse flotter sur sa bouée !',(fur,muzzle) =>
      backdrop('#e6efdc','#c4d8bd','#a6c3af')+
      p('M0 113Q68 108 148 116Q232 111 320 106V200H0Z','#88bfc0')+
      e(169,159,102,18,'#699f9e')+
      wave('M45 156q43 8 74 3m88 8q32 3 66-6m-143 17q33 3 64 0',160,164,'-.75s')+
      joint(e(166,143,87,23,'#c88275')+e(166,143,64,14,'#9d6667')+
        move(capy(fur,muzzle,{sleep:false}),-2,-6)+
        p('M79 141C105 157 223 158 253 141Q257 172 167 173Q81 173 79 141Z','#db9983')+
        p('M102 152q11 3 24 5l-6 12q-13-2-22-7Zm54 8 28-1 5 13-34 1Zm66-5 16-5 8 6q-6 7-19 10Z','#fae1b1')+
        marks('M95 148q18 7 37 8m78 1q21-4 31-9'),166,148,'capy-drift 3.1s ease-in-out','','capy')+
      leaves(35,177,'#679a81')),

    // Sieste : posture couchée, paupières closes, respiration au flanc.
    scene('nap','Sieste','Le capybara fait une sieste bien méritée… comme toi après ce quiz !',(fur,muzzle) =>
      backdrop('#d9dae6','#b6bed4','#a9b6b0',true)+
      e(165,152,108,28,'#c7c9ad')+ground(169,151,82)+
      leaves(47,166,'#819b8a')+leaves(276,159,'#819b8a')+
      `<g transform="translate(0 30) scale(1 .8)">${capy(fur,muzzle,{sleep:true})}</g>`+
      [[230,76,19],[249,64,14],[264,53,11]].map(([x,y,s],i) =>
        joint(`<text x="${x}" y="${y}" fill="#656c91" font-size="${s}" font-weight="700">${i?'z':'Z'}</text>`,x,y,
          `capy-rise 2.8s ease-out -${i*.7}s`,'','capy')).join('')+
      e(36,51,1.4,1.4,'#fff6d3')+e(75,34,1.1,1.1,'#fff6d3')+e(123,53,1.5,1.5,'#fff6d3')),

    // Oiseaux : trois poses, sauts déphasés sur la courbe du dos.
    scene('birds','Avec les oiseaux','Les oiseaux sautillent sur le dos du capybara pour te féliciter !',(fur,muzzle) => {
      const bird = (x,y,c,w,i) => joint(move(
        line('M-2-2v3m5-3v3','#805c43',1.2)+
        p('M-8-10l-8-4 3 8 8 1Z',w)+e(-1,-8,10,7,c)+
        turn(p('M-9-10q7-6 12-1q-3 8-12 5Z',w),-4,-10,-5,13,'.75s')+
        e(6,-15,6,6,c)+p('M11-16l6 2-6 2Z','#bc8a50')+eye(8,-16,.48),x,y),x,y,
        `capy-hop 1.1s cubic-bezier(.3,.1,.35,1) -${i*.36}s`,'','capy');
      return backdrop('#edf0d5','#c1d3a6','#9bb88a')+
        e(163,153,108,23,'#cbd0a0')+ground(165,153,81)+
        leaves(39,156,'#738e64')+leaves(281,164,'#738e64')+
        capy(fur,muzzle)+bird(103,76,'#87aab0','#63878f',0)+bird(133,70,'#d6ab65','#b68857',1)+bird(158,74,'#c79592','#a97579',2);
    }),

    // Pique-nique : le capybara renifle une fraise pendant que le coin de la nappe remue.
    scene('picnic','Pique-nique','Le capybara t’invite à un pique-nique aux fraises !',(fur,muzzle)=>{
      const berry = (x,y) => move(
        p('M-6 0Q-7-6 0-5Q8-7 8 0Q7 6 2 9Q-2 10-6 0Z','#c77876')+
        p('M-6-4l6 1 2-6 2 5 6-1-5 4-4-1-5 1Z','#779567')+
        marks('M-2 1l1 1m4-1 1 1m-3 3 1 1','#ffebaf'),x,y);
      return backdrop('#f5ecd2','#cad4ab','#9fb48a')+
        e(162,156,119,25,'#b1bc91')+
        p('M55 150l164-8 53 28-169 14Z','#dfa69c')+
        line('M75 159l166-10m-146 20 166-12m-157-9 42 32m0-34 42 30m0-32 40 29','#f1c9b4',3)+
        ground(154,151,78)+
        joint(move(capy(fur,muzzle),-19,-1),140,150,'capy-sniff 1.5s ease-in-out','','capy')+
        e(239,150,30,7,'#b98d65')+
        p('M211 149q1 19 11 24q19 6 35-2q8-7 10-22Z','#cdac79')+
        line('M219 150q3-29 22-26q17 0 19 27m-45 6q26 8 48 0m-45 7q21 7 41-1','#a7835e',2.3)+
        berry(232,147)+berry(244,147)+berry(252,153)+berry(207,129)+
        joint(p('M98 181l31-2-4 6-20 3Z','#c78e8d'),113,180,'capy-ear 2s ease-in-out','','capy')+
        leaves(39,163,'#76966e');
    }),

    // Cerf-volant : le fil reste attaché à la bobine et suit le cerf-volant.
    scene('kite','Cerf-volant','Le capybara fait danser son cerf-volant dans le vent !',(fur,muzzle)=>
      backdrop('#dbe9e3','#b7cdb6','#9fb991')+
      p('M29 46q4-10 13-7q9-9 21 1q13 2 15 6Z','#fbf4df')+
      e(167,155,112,22,'#c3ca9f')+ground(153,152,81)+
      capy(fur,muzzle)+
      joint(line('M218 136Q232 77 265 55','#806f65',1.5)+
        p('M265 31l24 16-24 19-15-19Z','#dc9c8e')+
        p('M265 31l24 16-24 2Z','#efc784')+
        line('M265 31v35m-15-19 39 0m-24 19q-5 8 5 11q11 5 5 12','#ac766f',1.3)+
        p('M263 74l-4-4 8 2 3-4 1 7Zm10 10l-6-3 8-1 4-4-1 7Z','#d4a76f'),
        218,136,'anim-turn 1.7s ease-in-out','--from:-5deg;--to:7deg','capy')+
      turn(e(218,138,6,5,'#b6805d')+line('M214 137l7-2m-5 5 7-2','#865f4d'),217,137,-6,7,'1.7s')+
      leaves(42,161,'#789a73')+leaves(285,164,'#7b9b74')),

    // Peinture : une patte manipule le pinceau devant un petit chevalet.
    scene('paint','Atelier peinture','Le capybara peint une petite fleur pour toi !',(fur,muzzle)=>
      backdrop('#efdfd6','#dec3b5','#c8b3a0')+
      e(158,154,116,25,'#e6c6a8')+ground(126,153,71)+
      move(capy(fur,muzzle),-38,2)+
      line('M254 84l-25 75m28-73 23 75m-27-57 0 56m-24-22 51 0','#92775e',4)+
      p('M229 75l49 3 5 55-55 1Z','#bca28a')+
      p('M233 79l42 2 4 48-46 1Z','#fcf1d9')+
      line('M255 122q5-11 0-22m1 18 10-8','#8da37a',2)+
      e(250,98,5,5,'#ca8f8e')+e(256,94,5,5,'#dca29c')+e(262,99,5,5,'#d29b97')+
      e(255,103,5,5,'#d8a19a')+e(256,99,3.5,3.5,'#dfb973')+
      joint(line('M177 130q11 7 22-4','#a67655',9)+line('M194 128l51-22','#9b765b',2.4)+
        p('M241 106q6-5 10-4q-2 5-8 6Z','#c58282'),178,132,'anim-turn 1.2s ease-in-out','--from:5deg;--to:-13deg','capy')+
      e(205,163,15,5,'#bd956f')+e(202,163,3.7,2.4,'#c28183')+e(209,161,3,2,'#88a77c')+
      leaves(38,163,'#8c9b76')),

    // Neige : le bonnet suit la tête, les flocons tombent par petits groupes.
    scene('snow','Première neige','Le capybara attrape un flocon avec son museau !',(fur,muzzle)=>{
      const flake=(x,y,i)=>joint(line(`M${x-3} ${y}h6m-3-3v6m-2-5 4 4m0-4-4 4`,'#fff9ec',1.15),
        x,y,`capy-snow 2.65s ease-in-out -${i*.47}s`,'','capy');
      return backdrop('#d5dfe9','#b4c8d2','#c1d1d3')+
        p('M0 136q68-7 131 6q85-15 189-4v62H0Z','#edf1e6')+
        [37,54,282].map((x,i)=>move(p('M0-37l-16 24h8l-13 12h42L8-13h8Z',i===1?'#9fb4af':'#aabeb8')+
          p('M0-37l-10 16 11-4 11 5Z','#f0eee3')+line('M0-2v9','#879e9c',3),x,130+i*3)).join('')+
        ground(159,154,88)+
        joint(capy(fur,muzzle)+p('M175 70q-5-19 10-24q16-3 24 14l-2 9Z','#9a829e')+
          e(182,45,6,5.5,'#e0c8c2')+p('M174 66q17-5 37-4l1 7q-20 0-36 5Z','#bd9db2')+
          marks('M181 59l3-7m3 5 3-6m5 6 1-4','#ead4c6'),177,135,'capy-sniff 1.8s ease-in-out','','capy')+
        [[41,39],[76,22],[142,36],[239,47],[260,60],[283,28],[217,21],[106,58]].map(([x,y],i)=>flake(x,y,i)).join('')+
        line('M88 164l8 1m-17 6 8 1m-18 4 8 1','#cad3cc',2.4);
    }),

    // Jardin : l'arrosoir bascule, les gouttes tombent et les fleurs ondulent.
    scene('garden','Au jardin','Le capybara arrose ses fleurs avec soin !',(fur,muzzle)=>
      backdrop('#f1ecd0','#c6d2a7','#a7bb8d')+
      e(163,154,115,24,'#c5c69b')+ground(133,151,76)+
      move(capy(fur,muzzle),-27,0)+
      turn(line('M166 134q11 5 24-5','#a67656',8)+
        p('M186 127q-6-9 1-13q12-5 15 6l-4 1q-2-8-9-4q-3 2 0 8Z','#718f8a')+
        p('M187 123h25l-3 19q-12 5-21-1Z','#84aaa1')+
        p('M211 130l18-9 3 3-20 13Z','#719a93')+e(230,122,2.7,4.4,'#92b3a6')+
        marks('M191 129v7m4-9v10'),167,134,-7,11,'1.38s')+
      joint(drops([[229,128],[238,129],[245,127],[252,130]]),237,134,'anim-drops 1.38s ease-out','--dx:10px;--dy:17px','capy')+
      [[238,154,131,'#d28f8d'],[256,157,132,'#d7b476'],[273,155,138,'#b694ab']].map(([x,y,top,color],i)=>
        turn(line(`M${x} ${y}q5-12 0 ${top-y}`,'#759370',2.5)+
          p(`M${x+1} ${y-4}q-12-3-11-9q10 1 11 9q9-9 14-6q-3 7-14 6Z`,'#8fa875')+
          e(x-4,top,4.6,4.2,color)+e(x,top-4,4.4,4.4,color)+e(x+4,top,4.6,4.2,color)+
          e(x,top+3,4.5,4,color)+e(x,top,2.8,2.8,'#eed4a4'),x,y,-7,9,'1.38s',`-${i*.2}s`)).join('')+
      leaves(41,159,'#79986d'))
  ];
})();

/* ===== Feu d’artifice : un seul RAF borné, mouvement basé sur le temps ===== */
const quizMotion = matchMedia('(prefers-reduced-motion: reduce)');
let quizFireFrame = 0;
function fireworks() {
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  cancelAnimationFrame(quizFireFrame);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(width*dpr);
  canvas.height = Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  const colors = ['#e45c81','#e89445','#eac056','#25a69d','#6d92d8','#9570c8'];
  const calm = quizMotion.matches;
  const duration = calm ? 420 : 1500;
  const speedScale = Math.min(1,width/520);
  const particles = [];
  for (let b=0; b<(calm?2:4); b++) {
    const x = width*(.18+b*.21+(Math.random()-.5)*.07);
    const y = height*(.19+Math.random()*.29);
    const count = calm?10:31;
    for (let i=0; i<count; i++) {
      const a = (i+Math.random()*.65)*Math.PI*2/count;
      const speed = (45+Math.random()*130)*speedScale;
      particles.push({x,y,a,speed,start:calm?0:b*105,life:calm?410:760+Math.random()*425,
        size:.85+Math.random()*1.85, phase:Math.random()*6.28,color:colors[(b+i%3)%colors.length]});
    }
  }
  const start = performance.now();
  function frame(now) {
    const elapsed = now-start;
    ctx.clearRect(0,0,width,height);
    if (elapsed>=duration || (!calm && quizMotion.matches)) {
      quizFireFrame=0;
      return;
    }
    for (const q of particles) {
      const age = elapsed-q.start;
      if (age<0 || age>=q.life) continue;
      const t = age/1000, fade = 1-age/q.life;
      const dist = calm ? 18+q.phase/6.28*18 : q.speed*(1-Math.exp(-2.3*t))/2.3;
      const x = q.x+Math.cos(q.a)*dist;
      const y = q.y+Math.sin(q.a)*dist+(calm?0:46*t*t);
      if (!calm) {
        const tail = Math.min(dist,8+q.size*3)*fade;
        const oldX = x-Math.cos(q.a)*tail, oldY = y-Math.sin(q.a)*tail-8*t*fade;
        ctx.lineCap='round';
        ctx.strokeStyle=q.color;
        ctx.lineWidth=q.size*1.25;
        ctx.globalAlpha=fade*.24;
        ctx.beginPath();
        ctx.moveTo(oldX,oldY);
        ctx.lineTo(x,y);
        ctx.stroke();
        ctx.lineWidth=q.size*.65;
        ctx.globalAlpha=fade*.64;
        ctx.beginPath();
        ctx.moveTo((x+oldX)/2,(y+oldY)/2);
        ctx.lineTo(x,y);
        ctx.stroke();
      }
      const shimmer = calm ? 1 : .75+.25*Math.sin(35*t+q.phase);
      ctx.globalAlpha=fade*shimmer;
      ctx.fillStyle=q.color;
      ctx.beginPath();
      ctx.arc(x,y,q.size*shimmer,0,Math.PI*2);
      ctx.fill();
      if (!calm && q.size>1.65) {
        ctx.globalAlpha=fade*.88;
        ctx.fillStyle='#fff5cc';
        ctx.fillRect(x-.65,y-.65,1.3,1.3);
      }
    }
    ctx.globalAlpha=1;
    quizFireFrame=requestAnimationFrame(frame);
  }
  quizFireFrame=requestAnimationFrame(frame);
}

/* ===== Affichage et interface publique ===== */
let lastAnimal = -1;
let toastTimer, toastCleanup;
function celebrate() {
  // Tirage sans répétition immédiate, avec un seul appel aléatoire.
  let index = Math.floor(Math.random()*(ANIMALS.length-(lastAnimal>=0?1:0)));
  if (lastAnimal>=0 && index>=lastAnimal) index++;
  celebrateIndex(index);
}
function celebrateIndex(index) {
  const a = ANIMALS[index];
  const toast = document.getElementById('animal-toast');
  if (!a || !toast) return;
  lastAnimal=index;
  fireworks();
  clearTimeout(toastTimer);
  clearTimeout(toastCleanup);
  toast.innerHTML = `<div class="anim-stage">${a.svg()}</div>
    <div class="anim-text">${PRAISE[Math.floor(Math.random()*PRAISE.length)]}<small>${a.t}</small></div>`;
  toast.classList.add('show');
  toastTimer=setTimeout(() => {
    toast.classList.remove('show');
    toastCleanup=setTimeout(() => toast.replaceChildren(),240);
  },2200);
}
function showCapybara() {
  showCapybaraIndex(Math.floor(Math.random()*CAPY_SCENES.length));
}
function showCapybaraIndex(index) {
  const scene = CAPY_SCENES[index];
  if (!scene) return;
  let overlay = document.getElementById('capy-overlay');
  if (!overlay) {
    overlay = document.createElement('dialog');
    overlay.id = 'capy-overlay';
    overlay.className = 'capy-overlay';
    overlay.setAttribute('aria-labelledby','capy-title');
    overlay.setAttribute('aria-describedby','capy-description');
    overlay.addEventListener('keydown', event => {
      if (event.key==='Enter' && !event.repeat) {
        event.preventDefault();
        overlay.close();
      }
    });
    overlay.addEventListener('close', () => overlay.remove());
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="capy-box">
    <h2 id="capy-title">Quiz réussi, bravo {{PRENOM}} !</h2>
    <p id="capy-description">${scene.t}</p>
    <div class="capy-scene">${scene.svg}</div>
    <button type="button" class="capy-close" autofocus>Merci !</button>
  </div>`;
  const close = overlay.querySelector('.capy-close');
  close.addEventListener('click', () => overlay.close());
  if (!overlay.open) overlay.showModal();
  close.focus();
  fireworks();
}

window.celebrate = function () { installer(); celebrate(); };
window.celebrateIndex = function (i) { installer(); celebrateIndex(i); };
window.fireworks = function () { installer(); fireworks(); };
window.showCapybara = function () { installer(); showCapybara(); };
window.showCapybaraIndex = function (i) { installer(); showCapybaraIndex(i); };
window.closeCapybara = function () { const o = document.getElementById('capy-overlay'); if (o) { if (o.open) o.close(); o.remove(); } };
window.RECOMPENSES = { animaux: ANIMALS, scenes: CAPY_SCENES };
})();
