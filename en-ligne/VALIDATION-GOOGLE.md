# Faire valider l'installateur par Google (facultatif)

But : supprimer l'avertissement « Google n'a pas validé cette application » **de l'installateur**, et afficher le logo Universal Quiz sur son écran d'autorisation. C'est gratuit. Compte quelques jours à quelques semaines, avec parfois un ou deux échanges de mails avec Google.

Ce que la validation ne change pas : l'avertissement affiché à la première ouverture du **site de chaque famille**. Ce site est un projet Apps Script qui appartient à la famille (l'avertissement affiche d'ailleurs sa propre adresse), et Google ne valide que le projet de l'éditeur.

Tout se fait avec le compte **soccaquiz@gmail.com**.

**Nom de l'application** : Google a refusé « Universal Quiz », jugé trop générique (11 novembre 2026). Le nom déclaré dans Branding est donc **SoccaQuiz**, et il figure sur la page d'accueil `docs/index.html`. Vidéo de démonstration : https://youtu.be/2zi-xip2fUc. Après la validation Search Console, il faut attendre 24 heures avant de demander la validation du branding.

## 1. Prouver que le site leian.github.io/UNIVERSALQUIZ est à toi

1. Ouvre https://search.google.com/search-console → **Ajouter une propriété** → **Préfixe de l'URL** → `https://leian.github.io/UNIVERSALQUIZ/`.
2. Choisis la méthode **Fichier HTML** et télécharge le fichier `googleXXXXXXXX.html`.
3. Ajoute ce fichier dans le dossier `docs/` du dépôt (ou donne-le à Claude), attends 2 minutes, puis clique sur **Valider**.

## 2. Tourner la vidéo de démonstration (1 à 2 minutes)

Enregistre l'écran du téléphone ou du PC, sans son si tu veux, puis publie la vidéo sur YouTube en **non répertoriée**. Elle doit montrer, dans l'ordre :

1. l'adresse de l'installateur dans la barre du navigateur ;
2. l'écran d'autorisation Google **en entier**, avec le nom « Universal Quiz » et les accès demandés (langue de l'écran : anglais si possible, en ajoutant `&hl=en` à l'adresse de cet écran) ;
3. l'installation : prénom, « Installer mon site », adresse du site créé ;
4. sur script.google.com, le projet « Universal Quiz » qui vient d'apparaître : c'est la preuve de l'usage des accès ;
5. le bouton « Mettre à jour mon site ».

## 3. Remplir la demande

Google Cloud → projet **UniversalQuiz** → **Google Auth Platform** :

1. **Branding** : importe le logo [`docs/logo-120.png`](../docs/logo-120.png), puis Enregistrer.
2. **Accès aux données** → **Ajouter ou supprimer des champs d'application**, et ajoute à la main :
   - `https://www.googleapis.com/auth/script.projects`
   - `https://www.googleapis.com/auth/script.deployments`
   - `https://www.googleapis.com/auth/script.external_request`
3. Pour chaque accès, colle cette justification (en anglais, c'est ce que Google attend) :

> SoccaQuiz is the installer of Universal Quiz, a free, non-commercial revision-quiz website for children. This installer runs as the signed-in user and uses the Apps Script API only to (1) create one Apps Script project named "Universal Quiz" in the user's own account, (2) copy the open-source quiz engine into it (script.projects), and (3) deploy it as a web app and update that deployment when the user taps "Update my site" (script.deployments). script.external_request is used to download the engine files from the project's public GitHub release and to call the Apps Script API. The installer never reads or modifies any other project, file, e-mail or contact, and the publisher receives no user data. Source code: https://github.com/leian/UNIVERSALQUIZ (folder en-ligne/).

4. Colle le lien de la vidéo YouTube.
5. **Centre de validation** → **Envoyer pour validation**.

Google répond par mail à soccaquiz@gmail.com. S'il demande une précision, réponds dans le même fil : la demande reste ouverte.

Tant que la validation n'est pas accordée, rien ne change pour les amis : ils passent par « Paramètres avancés », comme aujourd'hui.
