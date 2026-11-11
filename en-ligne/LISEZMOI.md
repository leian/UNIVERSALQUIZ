# Installateur en ligne — mise en place par l'éditeur (une seule fois)

**Adresse de l'installateur (déployé le 11 novembre 2026 par soccaquiz)** : https://script.google.com/macros/s/AKfycbxv33ZGQhg1x0FQeRQZy7JIpL9KH2pZ_koOUqVW4Jhw8yjfhrt4hYU4HGkffU_CX5PN/exec

L'installateur en ligne permet à un ami de créer son site SoccaQuiz **depuis son téléphone**, sans rien télécharger. C'est un petit site Apps Script, publié par l'éditeur (le compte **soccaquiz@gmail.com**). Quand un ami l'ouvre, il agit dans *le compte de l'ami* :

1. il crée chez lui un projet « SoccaQuiz » (« Universal Quiz » pour les sites installés avant le 11 novembre 2026) ;
2. il y copie la dernière version du moteur, prise dans le fichier `universal-quiz.json` de la dernière Release GitHub ;
3. il le publie en site web.

L'installateur ne lit ni le Drive ni les fichiers de l'ami.

Le moteur se met à jour tout seul : chaque nouvelle Release (Action « Publier l'installateur ») fournit un nouveau `universal-quiz.json`. Il ne faut republier l'installateur que si `en-ligne/Code.gs` change.

> Avant de commencer, il faut qu'au moins une Release contienne `universal-quiz.json` : lance l'Action « Publier l'installateur » (tag `v1.6` par exemple).

Toutes les étapes ci-dessous se font sur un ordinateur, **connecté avec soccaquiz@gmail.com**. Le plus simple est une fenêtre de navigation privée, ou un profil de navigateur à part.

## 1. Créer le projet Google Cloud (gratuit, sans carte bancaire)

Un projet Apps Script « ordinaire » ne peut pas appeler l'API Apps Script. Il lui faut donc son propre projet Google Cloud.

1. Ouvre https://console.cloud.google.com, accepte les conditions, puis **Sélectionner un projet → Nouveau projet**. Nom : `Universal Quiz`, puis **Créer**.
2. Dans la page d'accueil du projet, note le **numéro du projet** (*Project number*, uniquement des chiffres).
3. Menu ☰ → **API et services → Bibliothèque**. Cherche **Apps Script API**, puis **Activer**.
4. Menu ☰ → **API et services → Écran de consentement OAuth** (« Google Auth Platform ») → **Commencer** :
   - nom de l'application : `SoccaQuiz` (Google a refusé « Universal Quiz ») ; adresse d'assistance : `soccaquiz@gmail.com` ;
   - audience : **Externe** ;
   - coordonnées : `soccaquiz@gmail.com`, puis accepte et **Créer**.
5. Dans **Audience**, clique sur **Publier l'application** (statut « En production »). Sans cette étape, seuls les « utilisateurs test » listés à la main pourraient installer.
   L'application n'est pas validée par Google : les amis verront l'avertissement « Google n'a pas validé cette application » et passeront par « Paramètres avancés ». Elle est aussi limitée à 100 personnes, ce qui suffit largement.

## 2. Créer le projet Apps Script de l'installateur

1. Ouvre https://script.google.com, puis **Nouveau projet**. Renomme-le `Installateur Universal Quiz`.
2. ⚙️ **Paramètres du projet** :
   - coche **Afficher le fichier manifeste « appsscript.json » dans l'éditeur** ;
   - section **Projet Google Cloud** → **Changer de projet**, colle le numéro noté à l'étape 1.2, puis **Définir le projet**.
3. Retourne dans l'éditeur (`< >`) :
   - dans `Code.gs`, efface tout et colle le contenu de [`en-ligne/Code.gs`](Code.gs) ;
   - dans `appsscript.json`, efface tout et colle le contenu de [`en-ligne/appsscript.json`](appsscript.json) ;
   - 💾 Enregistrer.
4. **Déployer → Nouveau déploiement** → ⚙️ **Application Web** :
   - *Exécuter en tant que* : **Utilisateur qui accède à l'application Web** ;
   - *Qui a accès* : **Tout utilisateur disposant d'un compte Google** ;
   - **Déployer**, puis autorise avec le compte soccaquiz.
5. Copie l'**URL de l'application Web** (elle finit par `/exec`) : c'est le lien à envoyer aux amis.

## 3. Essayer

Ouvre le lien avec **un autre compte** que soccaquiz (le tien par exemple), de préférence sur un téléphone. Fais l'étape 1, installe, puis ouvre le site créé et autorise-le. La page « Mes quiz » doit s'afficher avec le quiz d'exemple.

En cas d'erreur, le message affiché indique en général l'étape oubliée :
- « l'installateur n'est pas complètement configuré » : l'Apps Script API n'est pas activée dans le projet Cloud (1.3) ou le projet Cloud n'est pas relié (2.2) ;
- « accès bloqué » ou « cette application n'est pas disponible » : l'application n'est pas publiée (1.5).

### Refaire un test complet avec le même compte

L'installateur se souvient de chaque installation, pour proposer « Mettre à jour ». Pour rejouer le parcours d'un nouvel ami avec un compte qui a déjà installé :

1. Ouvre l'installateur : il affiche « Ton site est installé ». Touche **Repartir de zéro (créer un nouveau site)**, puis confirme. (L'adresse `…/exec?recommencer=1` fait la même chose.)
2. Pour revoir aussi les deux écrans d'autorisation de Google : sur https://myaccount.google.com/permissions, supprime l'accès des applications « SoccaQuiz » (et « Universal Quiz ») avant de recommencer.
3. Facultatif : sur https://script.google.com, mets à la corbeille le projet « SoccaQuiz » (ou « Universal Quiz ») du test précédent. Sinon, les sites de test s'accumulent.

Le nouveau site réutilise le dossier Drive « SoccaQuiz » (ou l'ancien « Universal Quiz ») et le Sheets des résultats s'ils existent déjà dans le compte : les quiz et les scores ne sont jamais perdus.

## 4. Le mail à envoyer aux amis

Le mail mis en forme (logo, bouton, étapes) est sur cette page : **https://leian.github.io/UNIVERSALQUIZ/invitation.html**. Écris le prénom de l'ami et ta signature, touche « Copier le mail », puis colle-le dans un nouveau message Gmail.

## 5. Supprimer l'avertissement de Google (facultatif)

Voir [`VALIDATION-GOOGLE.md`](VALIDATION-GOOGLE.md).

## Mettre à jour l'installateur lui-même (rare)

Seulement si `en-ligne/Code.gs` ou `en-ligne/appsscript.json` change :
1. recolle les fichiers dans le projet « Installateur Universal Quiz » ;
2. **Déployer → Gérer les déploiements** → ✏️ → *Version* : **Nouvelle version** → **Déployer**.

L'adresse ne change pas.
