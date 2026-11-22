#!/usr/bin/env python3
"""Découpe une planche de mascotte rendue par ChatGPT et range les images au bon format.

  python3 outils/decouper-planche.py <planche.png> <dossier de sortie> [genre]

genre (déduit du nom du fichier s'il est absent) :
  - planche 2×2 (accueil, bravo / encouragement, reflexion) → 4 images 384×384
  - planche 2×1 de saison (accueil, bravo)                  → 2 images 384×384
  - « saut » dans le nom : bande de 6 images                 → saut.webp à la taille de l'actuelle
Le fond blanc (s'il y en a un) devient transparent, à partir des bords seulement
(le blanc des yeux reste blanc). Sortie en WebP, comme les images actuelles.
"""
import sys, os
from PIL import Image, ImageDraw

def fond_transparent(im):
    im = im.convert('RGBA')
    if im.getextrema()[3][0] < 250:          # déjà transparent
        return im
    w, h = im.size
    marque = (255, 0, 255, 0)
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] + [(x, 0) for x in range(0, w, 16)] + [(x, h - 1) for x in range(0, w, 16)]:
        r, g, b, a = im.getpixel((x, y))
        if r > 235 and g > 235 and b > 235:
            ImageDraw.floodfill(im, (x, y), marque, thresh=40)
    px = im.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == marque:
                px[x, y] = (255, 255, 255, 0)
    return im

def case(im, taille=384):
    boite = im.getbbox() or (0, 0, *im.size)
    im = im.crop(boite)
    im.thumbnail((taille - 8, taille - 8), Image.LANCZOS)
    c = Image.new('RGBA', (taille, taille), (0, 0, 0, 0))
    c.paste(im, ((taille - im.width) // 2, taille - 4 - im.height), im)   # posée en bas, comme les actuelles
    return c

def main():
    src, sortie = sys.argv[1], sys.argv[2]
    genre = sys.argv[3] if len(sys.argv) > 3 else ('saut' if 'saut' in src else 'saison' if 'saison' in src else 'theme')
    os.makedirs(sortie, exist_ok=True)
    im = fond_transparent(Image.open(src))
    w, h = im.size
    if genre == 'saut':
        cible = os.path.join(sortie, 'saut.webp')
        taille = Image.open(cible).size if os.path.exists(cible) else (1128, 260)
        im.resize(taille, Image.LANCZOS).save(cible, 'WEBP', quality=88)
        print('→', cible, taille); return
    noms = ['accueil', 'bravo'] if genre == 'saison' else ['accueil', 'bravo', 'encouragement', 'reflexion']
    cols, rows = 2, len(noms) // 2
    morceaux = []
    for i in range(len(noms)):
        x, y = i % cols, i // cols
        m = im.crop((x * w // cols, y * h // rows, (x + 1) * w // cols, (y + 1) * h // rows))
        morceaux.append(m.crop(m.getbbox() or (0, 0, *m.size)))
    # même échelle pour toutes les cases : la mascotte garde la même taille d'une attitude à l'autre
    taille = 384
    k = min((taille - 8) / max(m.width for m in morceaux), (taille - 8) / max(m.height for m in morceaux))
    for n, m in zip(noms, morceaux):
        m = m.resize((max(1, round(m.width * k)), max(1, round(m.height * k))), Image.LANCZOS)
        c = Image.new('RGBA', (taille, taille), (0, 0, 0, 0))
        c.paste(m, ((taille - m.width) // 2, taille - 4 - m.height), m)   # posée en bas, comme les actuelles
        f = os.path.join(sortie, n + '.webp')
        c.save(f, 'WEBP', quality=88)
        print('→', f)

if __name__ == '__main__':
    main()
