# Universal Quiz

Ce projet transforme une leçon prise en photo en quiz de révision interactif, hébergé gratuitement chez Google.

- **Les quiz** (`.html`) et **les contrôles papier** (`.pdf`) se trouvent dans un dossier Google Drive. On publie un quiz en déposant son fichier, sans GitHub ni déploiement.
- **Les résultats** s'enregistrent dans un Google Sheets, avec un tableau de bord pour les parents, des badges et des séries de jours.
- **Le site** est une « application web » Google Apps Script, avec une seule adresse : `https://script.google.com/macros/s/…/exec`.

Ce projet est né d'un moteur de quiz familial, généralisé ici pour que n'importe quelle famille puisse l'installer.

## Installer

### Pour un ami sous Windows : un seul fichier

```bash
node outils/fabriquer-installeur.mjs
```

Cette commande crée `dist/Installer-Universal-Quiz.cmd`. Ce fichier contient tout le projet. Ton ami double-clique dessus, et le programme s'occupe du reste :

- il télécharge Node.js en version portable, sans droits administrateur ;
- il demande le prénom de l'enfant ;
- il ouvre les deux pages Google nécessaires ;
- il crée et publie le site ;
- il pose un raccourci sur le Bureau.

Rien n'est installé dans Windows : tout va dans `%LOCALAPPDATA%\UniversalQuiz`. Pour faire une mise à jour, il suffit de relancer le même fichier : l'adresse du site ne change pas.

**Publier une nouvelle version** : pousse un tag qui commence par `v`.

```bash
git tag v2 && git push origin v2
```

L'action GitHub `.github/workflows/publier.yml` teste alors le projet, fabrique l'installateur `.cmd`, compile `Installer-Universal-Quiz.exe` (une fenêtre d'installation illustrée, qui contient ce `.cmd` et fait le même travail ; voir `outils/lanceur.cs` et `outils/images/`) et publie les deux dans une Release marquée comme dernière version. Le `.exe` n'est pas signé : si un antivirus le bloque, le `.cmd` fait exactement la même chose. Le lien à donner aux amis ne change jamais : https://github.com/leian/UNIVERSALQUIZ/releases/latest/download/Installer-Universal-Quiz.cmd

### Les autres façons d'installer

- **A. Sans outil** : faire une copie du projet Apps Script partagé, puis le déployer.
- **B. Avec Node.js 18 ou plus**, depuis ce dépôt :

```bash
node installer.mjs
```

Avant le premier lancement de la voie B, active l'API Apps Script ici : https://script.google.com/home/usersettings

Relance la même commande après chaque modification : le site est mis à jour et son adresse ne change pas.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `moteur/commun/` | Le moteur de quiz : affichage, correction, récompenses, badges, suivi |
| `moteur/index.html`, `tableau-de-bord.html`, `controles.html` | Les pages « Mes quiz », « Suivi des résultats » et « Contrôles papier » |
| `src/Code.gs` | Le serveur : pages, catalogue automatique, résultats dans Sheets, installation automatique, réglages (prénom…) |
| `src/pont.html` | Inséré dans chaque page : redirige `fetch('/api/resultats')` vers Google et corrige les liens |
| `src/exemple-quiz.html` | Le quiz d'exemple créé à l'installation, qui sert aussi de modèle pour l'IA |
| `src/appsscript.json` | Le manifeste : application web exécutée par le propriétaire, accessible avec le lien |
| `construire.mjs` | Assemble `moteur/` et `src/` dans `build/`, le dossier envoyé sur Google |
| `installer.mjs` | Installe ou met à jour le projet avec clasp (Windows, macOS ou Linux) |
| `outils/` | `fabriquer-installeur.mjs` et `installeur-windows.ps1` : fabriquent l'installateur Windows en un seul fichier |
| `tests/` | Un test de bout en bout sans compte Google, sur un faux Google et dans Chrome : `node tests/test.mjs` |

## Ajouter un quiz

Tout se fait depuis le site, aussi sur téléphone, avec Claude, ChatGPT ou Grok :

1. Prends la leçon en photo.
2. Sur le site, ouvre **➕ Ajouter un quiz** (en bas de « Mes quiz »), puis appuie sur **Claude**, **ChatGPT** ou **Grok** : l'IA s'ouvre avec les consignes déjà écrites, et elles sont aussi copiées dans le presse-papiers au cas où.
3. L'IA répond « Envoie-moi les photos » : joins les photos et envoie. Si les consignes sont seulement écrites dans la case sans être envoyées, joins les photos puis envoie le tout.
4. Copie la réponse de l'IA, colle-la dans le cadre du site, puis clique sur **Créer le quiz**.

Les boutons utilisent le paramètre `?q=` de chaque IA (`claude.ai/new?q=`, `chatgpt.com/?q=`, `grok.com/?q=`). Les photos, elles, ne peuvent pas passer par un lien : il faut toujours les joindre à la main. Si une application mobile ignore les consignes du lien, il suffit de les coller. Les trois IA ont une version gratuite, mais un compte peut être demandé, surtout pour envoyer des photos.

L'IA répond en JSON (titre, matière, questions `qcm` / `vf` / `saisie`, mémo). `apiAjouterQuiz` (dans `src/Code.gs`) vérifie ce JSON, écarte les questions mal formées, fabrique le fichier `.html` et le range dans le dossier Drive. Déposer directement un fichier `.html` dans le dossier Drive marche toujours : le titre, la matière et l'icône sont lus dans `MoteurQuiz.lancer({ … })`, et un `catalogue.js` (variables `QUIZ` et `CONTROLES`) déposé dans le dossier reste prioritaire.

## Limites connues

- Google affiche un bandeau en haut des pages (« Cette application a été créée par un utilisateur de Google Apps Script »).
- Une page met 1 à 2 secondes à s'ouvrir.
- Un projet peut avoir au plus 200 versions. Au-delà, supprime les anciennes dans « Gérer les déploiements ».

## Licence

Universal Quiz est distribué sous la licence [PolyForm Noncommercial 1.0.0](LICENSE.md). Les familles, les écoles et les associations peuvent l'utiliser, le modifier et le partager librement. **Tout usage commercial est interdit** : il est interdit de le vendre ou d'en faire un service payant.

Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
