# Postures du collège — prompts pour ChatGPT

Une posture = **une image ChatGPT** : 6 étapes d'une petite boucle animée, en 3 colonnes × 2 lignes.

## Marche à suivre (pour chaque posture)

1. Ouvre une **nouvelle conversation** ChatGPT (une par posture : la socca reste plus fidèle).
2. Joins l'image de référence de la mascotte du collège :
   - socca de toujours : https://leian.github.io/UNIVERSALQUIZ/themes/college/accueil.webp
   - au féminin : https://leian.github.io/UNIVERSALQUIZ/themes/college-f/accueil.webp
   - au masculin : https://leian.github.io/UNIVERSALQUIZ/themes/college-m/accueil.webp
3. Colle le **prompt commun** ci-dessous, en remplaçant `[POSTURE]` par le texte de la posture (tableau plus bas).
4. Si une case est ratée (socca différente, texte, cadre) : « Refais exactement la même planche, mais corrige la case N : … ».
5. Télécharge l'image, puis :
   `python3 outils/pose-planche.py <image.png> <id> [f|m]`
   → `docs/themes/poses[-f|-m]/<id>.webp`
6. Ajoute l'`id` dans `POSES_DESSINEES` (`src/Code.gs` : `n`, `f` ou `m`), tests, publication.

Tant qu'une posture n'est pas listée, elle n'existe pas sur le site. Les postures se gagnent dans l'ordre du tableau, parmi celles qui sont dessinées.

## Prompt commun

```
Voici la mascotte de mon application de révision pour collégiens : une part de socca (galette niçoise dorée et croustillante) avec un visage, des bras et des jambes. Garde EXACTEMENT ce personnage : mêmes couleurs, mêmes proportions, même visage, même tenue, même style de dessin, même épaisseur de trait.

Dessine une planche de 6 images qui forment une petite animation en boucle (environ 1 seconde) de cette mascotte qui fait la posture suivante :
[POSTURE]

Contraintes, très importantes :
- Format paysage 1536 × 1024, fond blanc uni, 3 colonnes et 2 lignes de cases de même taille, lues de gauche à droite puis de haut en bas.
- Aucune ligne de séparation, aucun cadre, aucun texte, aucun numéro, aucune ombre au sol.
- La mascotte entière dans chaque case, à la même taille, au même endroit, pieds à la même hauteur, avec de la marge autour (rien ne touche le bord de la case).
- D'une case à l'autre, seuls le geste et l'expression changent un peu ; la 6e image doit pouvoir enchaîner sur la 1re.
- Ton drôle et bienveillant, adapté à des élèves de 11 à 15 ans. Aucune personne réelle, aucun logo, aucun personnage connu.
```

## Les 20 postures (ordre de déblocage)

| # | id | Nom affiché | [POSTURE] à coller |
|---|----|-------------|--------------------|
| 1 | `six-seven` | 67 (Six-Seven) | Les deux mains tendues devant elle, paumes vers le haut, qui montent et descendent en alternance comme une balance qui pèse deux options, air faussement sérieux. |
| 2 | `moue` | Gen Z Pout | Regard vide et blasé, lèvres pincées et poussées vers le haut en petite moue, tête immobile, un léger battement de paupières. |
| 3 | `for-sure` | For Sure (Macron) | Lunettes de soleil d'aviateur, sourire nonchalant, tête légèrement penchée sur le côté, petit hochement de tête sûr de lui. |
| 4 | `je-men-fous` | Je m'en fiche | Hausse les épaules, une paille à la bouche, tient un verre de grenadine ; elle hausse les épaules puis reprend tranquillement une gorgée comme si de rien n'était. |
| 5 | `retourne` | Distracted Boyfriend | Marche vers l'avant puis tourne brusquement la tête par-dessus l'épaule, bouche en « o », pour fixer une étoile dorée qui passe à côté d'elle. |
| 6 | `clin-doeil` | Clin d'œil pistolet | Les deux mains en « pistolets de doigts » pointés vers l'avant, clin d'œil complice et grand sourire, petit mouvement des mains en rythme. |
| 7 | `mewing` | Mewing | Menton levé très haut, mâchoire serrée et bien dessinée, regard vers le haut, air très concentré et un peu fier. |
| 8 | `toc-toc` | Toc Toc (Patrick Sébastien) | Saute à cloche-pied tout en mimant de frapper à une porte invisible avec le poing, deux petits coups à chaque saut. |
| 9 | `aura` | Battle d'aura | Enchaîne des gestes absurdes et dramatiques pour dégager du charisme : main sur le front, pose de héros, tour sur elle-même, doigt pointé vers le ciel. |
| 10 | `sigma` | Sigma Boy | Regard déterminé, épaules en arrière, poing serré levé à hauteur de poitrine, petit mouvement de tête décidé. |
| 11 | `duckface` | Duckface | Joues creusées, lèvres en bec de canard, regard en coin, tient un téléphone à bout de bras comme pour un selfie. |
| 12 | `soupir` | Chouette française | Tête penchée, bouche ouverte en « ouhh », gros soupir exagéré, une main qui balaie l'air d'un geste blasé. (Sans cigarette.) |
| 13 | `pas-french` | I don't wanna be French | Bras croisés, regard de mépris face à nous, menton levé, petit mouvement de tête de refus. |
| 14 | `spiki` | Spiki (ｽﾋﾟｷ) | Corps penché en avant, totalement absorbée par une action (taper très vite sur un petit clavier), regard fixe et yeux ronds. |
| 15 | `ehho` | Ehho Ehho | Tête de travers, yeux écarquillés, les deux mains près des joues en surprise dramatique, petits sursauts. |
| 16 | `ours` | Ours polaire (November 2026) | Déguisée en ours polaire (capuche avec oreilles rondes), assise dans la neige, regard fixe vers nous, quelques flocons qui tombent. |
| 17 | `last-dance` | The Last Dance | Deux exemplaires identiques de la mascotte côte à côte qui dansent parfaitement en synchronisation : bras qui balancent, pas de côté. |
| 18 | `uk` | U+K Dance | Les bras qui forment la lettre U au-dessus de la tête, puis la lettre K, en rythme, avec énergie. |
| 19 | `babydoll` | Babydoll Dance | Deux pas de côté avec une rotation des hanches, bras souples, petit sourire. |
| 20 | `cri` | Chicken Jockey | Bras tendus droit devant, bouche grande ouverte en train de pousser un cri de victoire joyeux. |

Pour le n° 17 (deux soccas côte à côte), ajoute au prompt : « Les deux mascottes tiennent ensemble dans chaque case. »
