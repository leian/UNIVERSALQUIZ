# Universal Quiz — notes pour Claude

Ce dépôt contient le **code** de Universal Quiz, dans sa version Google Apps Script. Les quiz eux-mêmes ne sont pas ici : chaque famille les dépose dans son propre dossier Google Drive (voir `README.md`).

## Organisation
- `moteur/` : le moteur de quiz et les pages d'accueil. `{{PRENOM}}` y est remplacé par le prénom des réglages ; garde des textes neutres en genre (« Bien joué ! », jamais « Trop forte ! »). `construire.mjs` adapte le chemin de la page au moment de la construction.
- `src/` : ce qui est propre à Apps Script (`Code.gs`, `pont.html`, manifeste, quiz d'exemple).
- `build/` : produit par `node construire.mjs`, jamais versionné.

## Avant chaque commit
- Lance `node tests/test.mjs` : il construit le projet, simule Google et joue un quiz dans Chrome. Tout doit être vert.
- Un fichier de `moteur/commun/` est inséré dans une balise `<script>` : il ne doit jamais contenir `</script`.
- Un nouveau fichier `moteur/commun/xxx.js` doit être déclaré dans `construire.mjs` (`COMMUN`) et dans `src/Code.gs` (`COMMUN`).

## Fabriquer un quiz pour quelqu'un
Le plus simple pour l'utilisateur : le JSON décrit dans le message de la page « Ajouter un quiz » (`src/page-ajouter.html`), qu'il colle sur son site. Sinon, prends `src/exemple-quiz.html` comme modèle et produis un seul fichier `.html` :
- garde telles quelles les lignes `<link href="commun/moteur-quiz.css">` et `<script src="commun/…">` ;
- garde l'appel `MoteurQuiz.lancer({ titre, sousTitre, icone, matiere, couleur, questions, … })` ;
- `matiere` vaut `francais`, `maths`, `sciences`, `anglais`, `histoire`, `geographie`, `musique` ou `autre` ;
- ajoute le commentaire `<!-- Pool : N questions -->` en tête ;
- ne pose que des questions dont la réponse se trouve dans la leçon, chacune avec une catégorie (`cat`) et une explication (`exp`).

Le fichier est rendu à l'utilisateur, qui le dépose dans son dossier Drive. Il n'est jamais ajouté à ce dépôt.
