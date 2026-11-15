# Console SoccaQuiz (compte soccaquiz@gmail.com)

Une seule page pour tout gérer, réservée au compte soccaquiz, rangée en onglets :

- **Propositions** : les quiz envoyés par les familles avec « Proposer ». « Relire et publier » ouvre le texte (modifiable), l'aperçu des questions, le titre, la matière, les classes, puis publie dans la bibliothèque. « Refuser » les range à part. « Coller un quiz reçu par mail » sert pour ceux arrivés par mail.
- **Bibliothèque** : les quiz publiés, à modifier ou retirer (ceux qui l'ont déjà ajouté le gardent). « Ajouter un quiz à la main » pour un quiz que tu as fait toi-même.
- **Invitations** : l'envoi des mails d'invitation (remplace l'ancien projet « Envoi des invitations »).
- **Liens** : toutes les adresses utiles du projet, rangées par thème.
- **Versions** : les versions publiées du site et le lien pour en publier une nouvelle.
- **Réglages** : le jeton GitHub et la réception directe des propositions.

## Mise en place (une seule fois, sur ordinateur, environ 10 minutes)

### 1. Le projet
1. Dans une fenêtre privée (ou le profil Brave soccaquiz), ouvre **script.google.com** avec **soccaquiz@gmail.com**, puis **Nouveau projet**. Renomme-le « Console SoccaQuiz ».
2. Remplace tout le contenu de `Code.gs` par [`console/Code.gs`](https://github.com/leian/UNIVERSALQUIZ/blob/main/console/Code.gs) (bouton « Copy raw file »), puis enregistre.
3. ⚙️ **Paramètres du projet** → coche **Afficher le fichier manifeste « appsscript.json »**, reviens sur l'éditeur et remplace le contenu de `appsscript.json` par [`console/appsscript.json`](https://github.com/leian/UNIVERSALQUIZ/blob/main/console/appsscript.json).

### 2. Le déploiement « Console » (ta page)
1. **Déployer → Nouveau déploiement** → type **Application web**. Description `Console`, Exécuter en tant que **Moi**, Accès **Seulement moi** → **Déployer**.
2. Autorise : « Examiner les autorisations » → soccaquiz → **Paramètres avancés** → **Accéder à Console SoccaQuiz (non sécurisé)** → **Autoriser**. C'est ton propre script : il envoie les invitations, range les propositions dans un tableau de ton Drive et écrit dans le dépôt GitHub avec le jeton que tu lui donnes.
3. Copie l'**URL de l'application web** et mets-la en favori (ordinateur et téléphone, connecté à soccaquiz).

### 3. Le jeton GitHub (pour publier)
Ouvre la console → **Réglages** et suis les 5 étapes affichées. En résumé : jeton « Fine-grained », limité au dépôt `leian/UNIVERSALQUIZ`, permission **Contents : Read and write** seulement. La console le vérifie avant de l'enregistrer.

### 4. Le déploiement « Propositions » (réception directe)
1. Dans le même projet : **Déployer → Nouveau déploiement** → Application web. Description `Propositions`, Exécuter en tant que **Moi**, Accès **Tout le monde** → **Déployer**.
2. Copie son adresse, puis dans la console → **Réglages** → « Réception directe des propositions » → colle-la → **Activer**.

Les sites des familles affichent alors « Envoyer à SoccaQuiz » dans la fenêtre « Proposer » (d'ici une minute, sans nouvelle version). Cette adresse ne sert qu'à recevoir les quiz : ouverte par quelqu'un d'autre que toi, elle n'affiche qu'une phrase et un lien vers SoccaQuiz. Seul le texte du quiz et la classe sont gardés : ni nom, ni adresse, ni adresse IP. Garde-fous : 20 envois par tranche de 10 minutes, 300 propositions en attente au plus, doublons écartés.

### 5. L'ancien projet « Envoi des invitations »
Une fois l'onglet Invitations essayé (« M'envoyer un essai »), tu peux archiver son déploiement : projet « Envoi des invitations » → **Déployer → Gérer les déploiements** → **Archiver**.

## Mettre à jour
Quand `console/Code.gs` change : recolle-le, enregistre, puis **Déployer → Gérer les déploiements** et, pour **chacun des deux** déploiements (Console et Propositions) : ✏️ → Version : **Nouvelle version** → **Déployer**. Les adresses ne changent pas.

## En cas de souci
- « Le jeton GitHub est refusé ou a expiré » : crée un nouveau jeton (mêmes réglages) et colle-le dans Réglages.
- Plusieurs comptes Google ouverts dans le navigateur : la console peut afficher une page vide ou « Impossible d'ouvrir le fichier ». Utilise la fenêtre privée ou le profil soccaquiz.
- Le tableau des propositions (« SoccaQuiz – Propositions ») est dans le Drive de soccaquiz ; le bouton « Ouvrir le tableau » y mène.
