#!/usr/bin/env python3
"""Fabrique une posture animée du collège à partir d'une planche rendue par ChatGPT.

  python3 outils/pose-planche.py <planche.png> <id> [f|m]

  planche : 6 images en 3 colonnes × 2 lignes, lues de gauche à droite puis de haut en bas
  id      : identifiant de la posture (POSES de moteur/commun/animations.js), ex. six-seven
  f | m   : allure (sinon : la socca de toujours)

Sortie : docs/themes/poses[-f|-m]/<id>.webp, bande de 6 images 384 × 384 (2304 × 384).
Le fond blanc devient transparent depuis les bords. Les 6 images gardent la même échelle
et sont posées en bas au même endroit : la socca ne « saute » pas d'une image à l'autre.
Ensuite : ajouter l'id à POSES_DESSINEES (src/Code.gs), tests, publier.
"""
import sys, os
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from importlib import import_module
fond_transparent = import_module('decouper-planche').fond_transparent

T = 384

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    src, ident = sys.argv[1], sys.argv[2]
    allure = sys.argv[3] if len(sys.argv) > 3 else ''
    im = fond_transparent(Image.open(src))
    w, h = im.size
    cases = [im.crop((c * w // 3, l * h // 2, (c + 1) * w // 3, (l + 1) * h // 2)) for l in range(2) for c in range(3)]
    boites = [c.getbbox() or (0, 0, *c.size) for c in cases]
    # même échelle pour les 6 : la plus grande silhouette tient dans la case
    grand = max(max(b[2] - b[0], b[3] - b[1]) for b in boites)
    echelle = (T - 8) / grand
    bande = Image.new('RGBA', (T * 6, T), (0, 0, 0, 0))
    for k, (c, b) in enumerate(zip(cases, boites)):
        # centre horizontal de la case (pas de la silhouette : un bras tendu ne décale pas le corps), pieds en bas
        cx = c.width / 2
        x0 = round(max(0, b[0]) - cx)
        morceau = c.crop(b)
        morceau = morceau.resize((max(1, round(morceau.width * echelle)), max(1, round(morceau.height * echelle))), Image.LANCZOS)
        x = round(T / 2 + x0 * echelle)
        x = min(max(0, x), T - morceau.width)
        bande.paste(morceau, (k * T + x, T - 4 - morceau.height), morceau)
    dossier = os.path.join(os.path.dirname(__file__), '..', 'docs', 'themes', 'poses' + ('-' + allure if allure else ''))
    os.makedirs(dossier, exist_ok=True)
    sortie = os.path.join(dossier, ident + '.webp')
    bande.save(sortie, 'WEBP', quality=88, method=6)
    print('→', os.path.normpath(sortie), bande.size)

if __name__ == '__main__':
    main()
