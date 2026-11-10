# Installateur en ligne — mise en place par l'éditeur (une seule fois)

L'installateur en ligne permet à un ami de créer son site Universal Quiz **depuis son téléphone**, sans rien télécharger. C'est un petit site Apps Script, publié par l'éditeur (le compte **soccaquiz@gmail.com**). Quand un ami l'ouvre, il agit dans *le compte de l'ami* :

1. il crée chez lui un projet « Universal Quiz » ;
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
   - nom de l'application : `Universal Quiz` ; adresse d'assistance : `soccaquiz@gmail.com` ;
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

## 4. Le mail à envoyer aux amis

> **Objet : Universal Quiz — des quiz de révision pour ton enfant**
>
> Bonjour,
>
> Voici l'outil dont je t'ai parlé : on prend une leçon en photo, une IA en fait un quiz, et l'enfant révise sur son téléphone ou sa tablette. C'est gratuit, et tout reste dans ton propre compte Google.
>
> Pour l'installer, environ 5 minutes depuis ton téléphone, ouvre ce lien et suis les deux étapes :
> 👉 *(URL de l'installateur)*
>
> Google affichera deux fois l'avertissement « Google n'a pas validé cette application » : une fois pour l'installateur, une fois pour ton site. C'est normal : touche **Paramètres avancés**, puis **Accéder à…**, puis **Continuer**.
>
> À la fin, garde l'adresse de ton site en favori. Pour ajouter un quiz : sur ton site, « ➕ Ajouter un quiz ». Pour une mise à jour, rouvre ce même lien et touche « Mettre à jour mon site ».

## Mettre à jour l'installateur lui-même (rare)

Seulement si `en-ligne/Code.gs` ou `en-ligne/appsscript.json` change :
1. recolle les fichiers dans le projet « Installateur Universal Quiz » ;
2. **Déployer → Gérer les déploiements** → ✏️ → *Version* : **Nouvelle version** → **Déployer**.

L'adresse ne change pas.
