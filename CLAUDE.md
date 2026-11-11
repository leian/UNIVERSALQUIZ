# Universal Quiz — notes pour Claude

Ce dépôt contient le **code** de Universal Quiz, dans sa version Google Apps Script. Les quiz eux-mêmes ne sont pas ici : chaque famille les dépose dans son propre dossier Google Drive (voir `README.md`).

## Organisation
- `moteur/` : le moteur de quiz et les pages d'accueil. `{{PRENOM}}` y est remplacé par le prénom des réglages ; garde des textes neutres en genre (« Bien joué ! », jamais « Trop forte ! »). `construire.mjs` adapte le chemin de la page au moment de la construction.
- `src/` : ce qui est propre à Apps Script (`Code.gs`, `pont.html`, manifeste, quiz d'exemple).
- `build/` : produit par `node construire.mjs`, jamais versionné.

## Diffuser une modification
- Moteur, pages, images du site (`moteur/`, `src/`) : publier une Release (Action « Publier l'installateur », nouveau tag). Chaque famille voit alors « nouvelle version disponible » sur sa page « Ajouter un quiz » et touche « Mettre à jour mon site ».
- Installateur (`en-ligne/`) : il faut recoller `en-ligne/Code.gs` dans le projet Apps Script du compte soccaquiz, puis Déployer → Gérer les déploiements → Nouvelle version. Préviens toujours l'utilisateur quand c'est nécessaire.
- Pages publiques et mail d'invitation (`docs/`) : en ligne dès le push (GitHub Pages). Le mail (`docs/invitation.html`, contenu de `<div id="mail">`) est aussi lu par la page d'envoi `invitations/` : garde les `<span id="bonjour">` et `<span id="signature">`.
- Page d'envoi des invitations (`invitations/`, projet Apps Script à part dans le compte soccaquiz, accès « Seulement moi ») : comme l'installateur, il faut recoller `invitations/Code.gs` puis créer une nouvelle version du déploiement. Elle ne touche pas à la validation Google de l'installateur.

## Consignes pour l'IA et Gemini
- Une seule source : `src/consignes.txt`. `construire.mjs` l'insère dans la page « Ajouter » et écrit `docs/consignes/<empreinte>.txt` (GitHub Pages) : **committe ce fichier** quand il apparaît, et ne supprime jamais les anciens (les sites pas encore mis à jour s'en servent).
- Claude, ChatGPT et Grok ne reçoivent qu'une phrase avec le lien vers ces consignes ; le texte complet reste copiable en secours.
- Gemini est appelé depuis le navigateur (pas de nouvelle autorisation Apps Script à faire accepter aux familles). La clé est dans les propriétés du script (`GEMINI_CLE`) et n'est donnée qu'à la page `ajouter`.

## Avant chaque commit
- Lance `node tests/test.mjs` : il construit le projet, simule Google et joue un quiz dans Chrome. Tout doit être vert.
- Un fichier de `moteur/commun/` est inséré dans une balise `<script>` : il ne doit jamais contenir `</script`.
- Un nouveau fichier `moteur/commun/xxx.js` doit être déclaré dans `construire.mjs` (`COMMUN`) et dans `src/Code.gs` (`COMMUN`).

## Fabriquer un quiz pour quelqu'un
Le plus simple pour l'utilisateur : le format en lignes (`T|…`, `## catégorie`, `Q|question|bonne|faux|faux|explication`, `V|…|V|…`, `S|…|réponse;variante|…`, `M|…`) décrit dans les consignes pour l'IA (`src/consignes.txt`), qu'il colle sur son site. Ce format a été choisi pour coûter le moins de tokens possible à l'utilisateur : garde les consignes courtes. L'ancien JSON reste accepté par `apiAjouterQuiz`. Sinon, prends `src/exemple-quiz.html` comme modèle et produis un seul fichier `.html` :
- garde telles quelles les lignes `<link href="commun/moteur-quiz.css">` et `<script src="commun/…">` ;
- garde l'appel `MoteurQuiz.lancer({ titre, sousTitre, icone, matiere, couleur, questions, … })` ;
- `matiere` vaut `francais`, `maths`, `sciences`, `anglais`, `histoire`, `geographie`, `musique` ou `autre` ;
- ajoute le commentaire `<!-- Pool : N questions -->` en tête ;
- ne pose que des questions dont la réponse découle de la leçon, chacune avec une catégorie (`cat`) et une explication (`exp`) ;
- n'interroge que sur ce que la leçon veut faire apprendre, jamais sur un simple support (l'âge du personnage d'une phrase d'exemple dans une leçon sur le verbe BE, les nombres d'un exemple corrigé) ; dans un récit ou un compte rendu de lecture, en revanche, personnages et événements comptent ; une seule question par fait, réparties entre toutes les notions ;
- chaque question se comprend sans la leçon sous les yeux : jamais « dans le bilan », « l'exemple donné », « d'après le document » ;
- `icone` illustre le thème précis, `badge` est un autre emoji, gagné à 100 % ;
- anglais : `dire: 'phrase'` sur une question ajoute les boutons « Écouter » et « Lentement » (`langue` pour une autre langue) ;
- musique : `notes: ['C4', 'E4']` joue les notes (C4 = do du milieu), `portee: true` les dessine aussi, `portee: 'seule'` les dessine sans les jouer.

Le fichier est rendu à l'utilisateur, qui le dépose dans son dossier Drive. Il n'est jamais ajouté à ce dépôt.
