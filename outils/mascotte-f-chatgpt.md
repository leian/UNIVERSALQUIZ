# Nouvelle mascotte au féminin (socca à l'envers) — prompts pour ChatGPT

But : redessiner les mascottes **au féminin** de tous les thèmes avec la nouvelle tête (part de socca **pointe en bas**, grand bord croustillant en haut, barrette étoile dorée dans le coin en haut à droite, cils), en gardant la tenue de chaque thème. Les **postures du collège** sont déjà faites dans ce style : on n'y touche pas.

## Pour chaque planche

1. **Nouvelle conversation** ChatGPT (une par planche).
2. Joins **deux images** :
   - **Image 1 — la nouvelle tête** (toujours la même) : https://leian.github.io/UNIVERSALQUIZ/themes/reference/socca-f-nouvelle.png
   - **Image 2 — la tenue actuelle** du thème (adresse dans le tableau plus bas).
3. Colle le **prompt** qui correspond (thème : 2×2 ; saison : 2×1), en remplaçant `[TENUE]` par la ligne du tableau.
4. Case ratée : « Refais exactement la même planche, mais corrige la case N : … ».
5. Envoie-moi les planches nommées comme la colonne « Dossier » (ex. `explorateurs-f.png`, `noel-f.png`) ; ou, toi-même :
   `python3 outils/decouper-planche.py <planche.png> docs/themes/<dossier>` (ajoute `saison` à la fin pour une saison).

## Prompt — thème (4 images, 2 × 2)

```
Image 1 : la nouvelle tête de ma mascotte (une part de socca niçoise, pointe vers le BAS, grand bord croustillant en haut, barrette étoile dorée dans le coin en haut à droite, grands yeux avec cils). Ignore ses vêtements.
Image 2 : l'ancienne version de cette mascotte, avec la tenue à garder.

Redessine la mascotte de l'image 2 avec EXACTEMENT la tête de l'image 1 (même forme à l'envers, même texture, mêmes couleurs, même visage, même barrette, même style de trait), et EXACTEMENT la tenue de l'image 2 : [TENUE]. Même corps, mêmes bras et jambes jaunes, mêmes chaussures que l'image 2.

Planche de 4 images, format carré 1024 × 1024, fond blanc uni, 2 colonnes × 2 lignes de cases de même taille :
- en haut à gauche : accueil — elle fait coucou d'une main, grand sourire, comme sur l'image 2 ;
- en haut à droite : bravo — très joyeuse, les deux bras levés, bouche ouverte, quelques confettis ;
- en bas à gauche : encouragement — sourire doux, pouce levé ;
- en bas à droite : réflexion — une main au menton, regard vers le haut, petit point d'interrogation.

Contraintes : aucune ligne de séparation, aucun cadre, aucun texte, aucune ombre au sol ; la mascotte entière dans chaque case, à la même taille, pieds à la même hauteur, avec de la marge (rien, confettis compris, ne touche le bord de sa case) ; ton drôle et bienveillant pour des enfants.
```

## Prompt — saison (2 images, 2 × 1)

```
Image 1 : la nouvelle tête de ma mascotte (une part de socca niçoise, pointe vers le BAS, grand bord croustillant en haut, barrette étoile dorée dans le coin en haut à droite, grands yeux avec cils). Ignore ses vêtements.
Image 2 : l'ancienne version de cette mascotte, en costume de saison.

Redessine la mascotte de l'image 2 avec EXACTEMENT la tête de l'image 1 (même forme à l'envers, même texture, mêmes couleurs, même visage, même barrette, même style de trait), et EXACTEMENT le costume de l'image 2 : [TENUE].

Planche de 2 images, format paysage 1536 × 1024, fond blanc uni, 2 cases côte à côte de même taille :
- à gauche : accueil — elle fait coucou d'une main, grand sourire ;
- à droite : bravo — très joyeuse, les deux bras levés, quelques confettis aux couleurs de la saison.

Contraintes : aucune ligne de séparation, aucun cadre, aucun texte, aucune ombre au sol ; la mascotte entière dans chaque case, à la même taille, pieds à la même hauteur, avec de la marge (rien, confettis compris, ne touche le bord de sa case) ; ton drôle et bienveillant pour des enfants.
```

## Thèmes (prompt 2 × 2)

| Dossier | Image 2 (tenue actuelle) | [TENUE] |
|---|---|---|
| `petits-f` | https://leian.github.io/UNIVERSALQUIZ/themes/petits-f/accueil.webp | bonnet rouge et blanc à pompon, joues roses, foulard rouge noué au cou |
| `lecteurs-f` | https://leian.github.io/UNIVERSALQUIZ/themes/lecteurs-f/accueil.webp | cartable marron sur le dos, livre ouvert à la main, foulard rouge |
| `explorateurs-f` | https://leian.github.io/UNIVERSALQUIZ/themes/explorateurs-f/accueil.webp | chapeau d'explorateur kaki, sac à dos kaki, loupe à la main, foulard rouge |
| `college-f` | https://leian.github.io/UNIVERSALQUIZ/themes/college-f/accueil.webp | sweat à capuche bleu, casque audio autour du cou, pull rouge noué à la taille, skateboard à côté d'elle (accueil seulement) — pour qu'elle ressemble à ses postures |
| `lycee-gothique-f` | https://leian.github.io/UNIVERSALQUIZ/themes/lycee-gothique-f/accueil.webp | veste noire style cuir, t-shirt violet avec une lune, bracelets noirs, bottes noires ; yeux sans longs cils |
| `lycee-rap-f` | https://leian.github.io/UNIVERSALQUIZ/themes/lycee-rap-f/accueil.webp | casquette rouge, t-shirt noir large, grosse chaîne dorée, baskets rouges et blanches |
| `parent-f` | https://leian.github.io/UNIVERSALQUIZ/themes/parent-f/accueil.webp | costume bleu marine, chemise blanche, cravate rouge, tasse de café à la main |

## Saisons (prompt 2 × 1)

| Dossier | Image 2 (costume actuel) | [TENUE] |
|---|---|---|
| `saisons/noel-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/noel-f/accueil.webp | bonnet de Père Noël, guirlande lumineuse, écharpe rouge et blanche |
| `saisons/hiver-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/hiver-f/accueil.webp | le costume d'hiver de l'image 2 |
| `saisons/paques-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/paques-f/accueil.webp | le costume de Pâques de l'image 2 |
| `saisons/printemps-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/printemps-f/accueil.webp | le costume de printemps de l'image 2 |
| `saisons/ete-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/ete-f/accueil.webp | le costume d'été de l'image 2 |
| `saisons/rentree-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/rentree-f/accueil.webp | le costume de la rentrée de l'image 2 |
| `saisons/halloween-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/halloween-f/accueil.webp | le costume d'Halloween de l'image 2 (gentil, pas effrayant) |
| `saisons/automne-f` | https://leian.github.io/UNIVERSALQUIZ/themes/saisons/automne-f/accueil.webp | le costume d'automne de l'image 2 |

Total : 7 planches de thème + 8 de saison = 15 planches.
