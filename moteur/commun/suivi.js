/* =====================================================================
   SUIVI DES RÉSULTATS — commun à tous les quiz SoccaQuiz
   ---------------------------------------------------------------------
   Suivi.debut()                 → à appeler quand une partie commence
   Suivi.enregistrer({ … })      → à appeler à la fin d'une partie
   Les résultats sont envoyés à /api/resultats (Cloudflare Pages Function
   + KV). En cas d'échec (hors ligne, KV pas encore relié…), ils restent
   dans une file d'attente locale et sont renvoyés au prochain chargement
   ou au retour de la connexion. Chaque partie a un _id : le serveur
   ignore une partie déjà reçue (envoi interrompu puis recommencé).
   Un appareil « parent » peut désactiver l'enregistrement depuis le
   tableau de bord (clé localStorage uqSuivi.off = "1").
   ===================================================================== */
(function () {
  const API = '/api/resultats';
  const K_FILE = 'uqSuivi.file', K_LOCAL = 'uqSuivi.local', K_OFF = 'uqSuivi.off';
  let t0 = null;

  const lire = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  // texte seul, sans exécuter ni charger quoi que ce soit (DOMParser ne charge pas les images, contrairement à une div)
  const texte = html => { let t = ''; try { t = new DOMParser().parseFromString(String(html ?? ''), 'text/html').body.textContent || ''; } catch (e) { t = String(html ?? '').replace(/<[^>]*>/g, ''); } return t.replace(/\s+/g, ' ').trim().slice(0, 400); };
  const idQuiz = () => { try { return decodeURIComponent(location.pathname.split('/').pop() || 'inconnu').replace(/\.html$/i, ''); } catch (e) { return 'inconnu'; } };

  // file d'attente : dans le stockage local ; s'il est bloqué (cookies tiers refusés, navigation privée…),
  // en mémoire le temps de la page, pour que la partie parte quand même tout de suite
  let stockage = true, memoire = [];
  try { localStorage.setItem('uqSuivi.test', '1'); localStorage.removeItem('uqSuivi.test'); } catch (e) { stockage = false; }
  const lireFile = () => stockage ? lire(K_FILE, []) : memoire.slice();
  const ecrireFile = f => { f = f.slice(-50); if (stockage && ecrire(K_FILE, f)) return; stockage = false; memoire = f; };

  // un seul envoi à la fois : sinon l'envoi lancé au chargement de la page et celui de fin de partie
  // pouvaient envoyer deux fois la même partie (le serveur écarte aussi un _id déjà reçu)
  let enCours = null;
  const cle = r => r._id || JSON.stringify(r);
  function envoyerFile() {
    if (enCours) return enCours.then(() => envoyerFile());
    enCours = envoyer().catch(() => {}).finally(() => { enCours = null; });
    return enCours;
  }
  async function envoyer() {
    const file = lireFile();
    if (!file.length || !/^https?:/.test(location.protocol)) return;
    const partis = new Set();
    for (const r of file) {
      try {
        const body = JSON.stringify(r);
        // keepalive : l'envoi survit à la fermeture de la page, mais le navigateur refuse alors plus de 64 Ko
        const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: body.length < 60000, credentials: 'same-origin' });
        if (res.ok || res.status === 400) partis.add(cle(r));   // 400 = données refusées : inutile de réessayer
      } catch (e) {}
    }
    // on relit la file : une partie a pu y être ajoutée pendant l'envoi
    ecrireFile(lireFile().filter(r => !partis.has(cle(r))));
  }

  window.Suivi = {
    texte,
    actif: () => { try { return localStorage.getItem(K_OFF) !== '1'; } catch (e) { return true; } },
    desactiver: () => { try { localStorage.setItem(K_OFF, '1'); } catch (e) {} },
    activer: () => { try { localStorage.removeItem(K_OFF); } catch (e) {} },
    enAttente: () => lireFile().length,          // parties gardées sur l'appareil, pas encore envoyées
    historiqueLocal: () => lire(K_LOCAL, []),
    envoyerFile,

    debut() { t0 = Date.now(); },

    /* r = { titre, matiere, score, total, mode, questions:[{q, cat, donne, attendu, ok, k, o, i}] }
       mode : 'normal' | 'erreurs' (Refaire mes erreurs) | 'duel' (défi en famille) | 'revision' (Mes révisions, défi du mois)
       renvoie une promesse résolue quand l'envoi est terminé (réussi ou non : voir enAttente()) */
    enregistrer(r) {
      try {
        const questions = (r.questions || []).slice(0, 200).map(x => ({
          q: texte(x.q), cat: texte(x.cat), donne: texte(x.donne), attendu: texte(x.attendu), ok: !!x.ok,
          k: String(x.k || '').slice(0, 40), o: typeof x.o === 'string' ? x.o.slice(0, 6000) : '', i: x.i ? 1 : 0
        }));
        const cats = {};
        questions.forEach(x => { const c = x.cat || '—'; cats[c] = cats[c] || { ok: 0, total: 0 }; cats[c].total++; if (x.ok) cats[c].ok++; });
        const rec = {
          quiz: idQuiz(),
          titre: texte(r.titre || document.title).slice(0, 120),
          matiere: r.matiere || '',
          score: Number(r.score) || 0,
          total: Number(r.total) || questions.length,
          duree: t0 ? Math.round((Date.now() - t0) / 1000) : null,
          dateLocale: new Date().toISOString(),
          appareil: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'ordinateur',
          mode: ['normal', 'erreurs', 'duel', 'revision'].includes(r.mode) ? r.mode : 'normal',
          cats, questions,
          _id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
        };
        t0 = null;
        const hist = lire(K_LOCAL, []);
        hist.push({ quiz: rec.quiz, score: rec.score, total: rec.total, date: rec.dateLocale, mode: rec.mode });
        ecrire(K_LOCAL, hist.slice(-300));
        if (!Suivi.actif()) return Promise.resolve();
        const file = lireFile();
        file.push(rec);
        ecrireFile(file);
        return envoyerFile();
      } catch (e) { console.warn('Suivi : enregistrement impossible', e); return Promise.resolve(); }
    }
  };

  // renvoie ce qui n'a pas pu partir lors d'une visite précédente
  if (document.readyState === 'complete') envoyerFile();
  else window.addEventListener('load', () => setTimeout(envoyerFile, 800));
  // et dès que la connexion revient (partie finie hors ligne)
  window.addEventListener('online', () => envoyerFile());
})();
