# Universal Quiz

Ce projet transforme une leçon prise en photo en quiz de révision interactif, hébergé gratuitement chez Google.

- **Les quiz** (`.html`) et **les contrôles papier** (`.pdf`) se trouvent dans un dossier Google Drive. On publie un quiz en déposant son fichier, sans GitHub ni déploiement.
- **Les résultats** s'enregistrent dans un Google Sheets, avec un tableau de bord pour les parents, des badges et des séries de jours.
- **Le site** est une « application web » Google Apps Script, avec une seule adresse : `https://script.google.com/macros/s/…/exec`.

Ce projet est né d'un moteur de quiz familial, généralisé ici pour que n'importe quelle famille puisse l'installer.

## Installer

### L'installateur en ligne (téléphone, tablette ou ordinateur)

L'ami reçoit un lien par mail. Il active l'interrupteur « API Google Apps Script », tape le prénom de l'enfant, puis touche **Installer mon site**. Son site est créé dans son propre compte Google, avec la dernière version du moteur. Le même lien sert ensuite aux mises à jour, et l'adresse du site ne change pas.

L'éditeur (soccaquiz@gmail.com) met ce lien en place une seule fois : voir [`en-ligne/LISEZMOI.md`](en-ligne/LISEZMOI.md), qui contient aussi le mail type à envoyer aux amis.

**Publier une nouvelle version du moteur** (moteur, pages, images) : GitHub → Actions → « Publier l'installateur » → Run workflow, avec un nouveau tag (par exemple `v2.1`). L'Action teste le projet, puis crée une Release qui contient `universal-quiz.json`. Chaque site compare sa version à la dernière Release : la page « ➕ Ajouter un quiz » affiche alors « Une nouvelle version est disponible », avec le bouton **Mettre à jour mon site**. L'adresse du site, les quiz et les résultats ne changent pas.

Le mail d'invitation à copier dans Gmail : https://leian.github.io/UNIVERSALQUIZ/invitation.html

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `moteur/commun/` | Le moteur de quiz : affichage, correction, récompenses, badges, suivi |
| `moteur/index.html`, `tableau-de-bord.html`, `controles.html` | Les pages « Mes quiz », « Suivi des résultats » et « Contrôles papier » |
| `src/Code.gs` | Le serveur : pages, catalogue automatique, résultats dans Sheets, installation automatique, réglages (prénom…) |
| `src/pont.html` | Inséré dans chaque page : redirige `fetch('/api/resultats')` vers Google et corrige les liens |
| `src/exemple-quiz.html` | Le quiz d'exemple créé à l'installation, qui sert aussi de modèle pour l'IA |
| `src/appsscript.json` | Le manifeste : application web exécutée par le propriétaire, accessible avec le lien |
| `construire.mjs` | Assemble `moteur/` et `src/` dans `build/`, d'où est tiré `universal-quiz.json` |
| `en-ligne/` | L'installateur en ligne (installation et mise à jour depuis un téléphone) et sa mise en place |
| `outils/fabriquer-charge.mjs` | Fabrique `universal-quiz.json`, le moteur lu par l'installateur en ligne |
| `tests/` | Un test de bout en bout sans compte Google, sur un faux Google et dans Chrome : `node tests/test.mjs` |

## Ajouter un quiz

Tout se fait depuis le site, aussi sur téléphone, avec Claude, ChatGPT ou Grok :

1. Prends la leçon en photo.
2. Sur le site, ouvre **➕ Ajouter un quiz** (en bas de « Mes quiz »), puis appuie sur **Claude**, **ChatGPT** ou **Grok** : l'IA s'ouvre avec les consignes déjà écrites, et elles sont aussi copiées dans le presse-papiers au cas où.
3. L'IA répond « Envoie-moi les photos » : joins les photos et envoie. Si les consignes sont seulement écrites dans la case sans être envoyées, joins les photos puis envoie le tout.
4. Copie la réponse de l'IA, colle-la dans le cadre du site, puis clique sur **Créer le quiz**.

Les boutons utilisent le paramètre `?q=` de chaque IA (`claude.ai/new?q=`, `chatgpt.com/?q=`, `grok.com/?q=`). Les photos, elles, ne peuvent pas passer par un lien : il faut toujours les joindre à la main. Si une application mobile ignore les consignes du lien, il suffit de les coller. Les trois IA ont une version gratuite, mais un compte peut être demandé, surtout pour envoyer des photos.

L'IA répond en JSON (titre, matière, icône, badge, questions `qcm` / `vf` / `saisie`, mémo). Pour l'anglais, une question peut porter `dire` (phrase lue à voix haute, boutons « Écouter » et « Lentement ») ; pour la musique, `notes` (notes jouées) et `portee` (notes dessinées sur une portée). `apiAjouterQuiz` (dans `src/Code.gs`) vérifie ce JSON, écarte les questions mal formées, fabrique le fichier `.html` et le range dans le dossier Drive. Déposer directement un fichier `.html` dans le dossier Drive marche toujours : le titre, la matière et l'icône sont lus dans `MoteurQuiz.lancer({ … })`, et un `catalogue.js` (variables `QUIZ` et `CONTROLES`) déposé dans le dossier reste prioritaire.

## Limites connues

- Google affiche un bandeau en haut des pages (« Cette application a été créée par un utilisateur de Google Apps Script »).
- Une page met 1 à 2 secondes à s'ouvrir.
- Un projet peut avoir au plus 200 versions. Au-delà, supprime les anciennes dans « Gérer les déploiements ».

## Licence

Universal Quiz est distribué sous la licence [PolyForm Noncommercial 1.0.0](LICENSE.md). Les familles, les écoles et les associations peuvent l'utiliser, le modifier et le partager librement. **Tout usage commercial est interdit** : il est interdit de le vendre ou d'en faire un service payant.

Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
