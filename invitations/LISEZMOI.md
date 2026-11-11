# Envoyer les invitations depuis soccaquiz@gmail.com

Une page qui n'est accessible qu'au compte soccaquiz : tu colles la liste des amis (un par ligne, `Lucie lucie@gmail.com`, `Marc, marc@orange.fr` ou simplement l'adresse), tu touches **Envoyer**, et chacun reçoit le mail d'invitation mis en forme, avec « Bonjour Lucie, ». Le mail est lu sur `docs/invitation.html` : toute modification poussée sur GitHub est prise en compte dès l'envoi suivant.

## Mise en place (une seule fois, sur ordinateur, environ 5 minutes)
1. Dans une fenêtre privée, connecte-toi à **script.google.com** avec **soccaquiz@gmail.com**, puis **Nouveau projet**. Renomme-le « Envoi des invitations ».
2. Remplace tout le contenu de `Code.gs` par `invitations/Code.gs`, puis enregistre.
3. ⚙️ **Paramètres du projet** → coche **Afficher le fichier manifeste « appsscript.json »**. Reviens dans l'éditeur et remplace le contenu de `appsscript.json` par `invitations/appsscript.json`. Enregistre.
4. **Déployer → Nouveau déploiement** → type **Application web** : Exécuter en tant que **Moi**, Accès **Seulement moi** → **Déployer**.
5. Autorise : « Examiner les autorisations » → soccaquiz → **Paramètres avancés** → **Accéder à Envoi des invitations (non sécurisé)** → **Autoriser**. C'est ton propre script : il peut envoyer des mails en ton nom et lire la page du mail sur GitHub, rien d'autre.
6. Copie l'**URL de l'application web** et mets-la en favori (sur le téléphone aussi, en étant connecté à soccaquiz).

## À l'usage
- Commence par **M'envoyer un essai** pour voir le mail dans la boîte de soccaquiz.
- Gmail limite à environ 100 destinataires par jour pour un compte gratuit ; la page affiche ce qu'il reste.
- Les adresses envoyées disparaissent de la liste ; celles en erreur y restent, avec la raison.

## Mettre à jour
Si `invitations/Code.gs` change : recolle-le, enregistre, puis **Déployer → Gérer les déploiements** → ✏️ → **Nouvelle version** → **Déployer**. Une modification du mail seul (`docs/invitation.html`) ne demande rien.
