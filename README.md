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

Ne l'envoie pas par Gmail, qui bloque les fichiers `.cmd`. Dépose-le plutôt dans ton Google Drive et partage le lien.

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

1. Prends la leçon en photo.
2. Envoie les photos à une IA (Claude, ChatGPT…) avec le fichier `quiz_exemple_capitales.html` comme modèle. Le texte à lui donner est dans le tutoriel.
3. Dépose le fichier `.html` obtenu dans le dossier Drive « Universal Quiz ». Il apparaît dans « Mes quiz » en moins d'une minute.

Le titre, la matière et l'icône sont lus dans l'appel `MoteurQuiz.lancer({ … })` du fichier. Si un fichier `catalogue.js` (variables `QUIZ` et `CONTROLES`) est déposé dans le dossier, il est prioritaire.

## Limites connues

- Google affiche un bandeau en haut des pages (« Cette application a été créée par un utilisateur de Google Apps Script »).
- Une page met 1 à 2 secondes à s'ouvrir.
- Un projet peut avoir au plus 200 versions. Au-delà, supprime les anciennes dans « Gérer les déploiements ».

## Licence

Universal Quiz est distribué sous la licence [PolyForm Noncommercial 1.0.0](LICENSE.md). Les familles, les écoles et les associations peuvent l'utiliser, le modifier et le partager librement. **Tout usage commercial est interdit** : il est interdit de le vendre ou d'en faire un service payant.

Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
