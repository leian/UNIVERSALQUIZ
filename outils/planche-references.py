#!/usr/bin/env python3
"""Refait les « planches de références » à joindre à ChatGPT (console → onglet Mascottes).

  python3 outils/planche-references.py

Une image par allure : docs/themes/reference/planche-f.png, planche-m.png, planche-n.png,
16 cases nommées (Tête, 7 thèmes, 8 saisons). À relancer après chaque nouvelle mascotte publiée,
puis committer : ChatGPT ne peut pas ouvrir les liens, il ne voit que les images jointes.
"""
from PIL import Image, ImageDraw, ImageFont
import os
RACINE = os.path.join(os.path.dirname(__file__), '..')
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = ImageFont.truetype(F, 26) if os.path.exists(F) else ImageFont.load_default()
TH = [('petits', 'Petits'), ('lecteurs', 'Lecteurs'), ('explorateurs', 'Explorateurs'), ('college', 'Collège'),
      ('lycee-gothique', 'Lycée gothique'), ('lycee-rap', 'Lycée rap'), ('parent', 'Parent')]
SA = [('noel', 'Noël'), ('hiver', 'Hiver'), ('paques', 'Pâques'), ('printemps', 'Printemps'), ('ete', 'Été'),
      ('rentree', 'Rentrée'), ('halloween', 'Halloween'), ('automne', 'Automne')]
REF = {'f': 'socca-f-nouvelle.png', 'm': 'socca-m.png', 'n': 'socca-n.png'}
C, L = 300, 44
for a in 'fmn':
    suf = '' if a == 'n' else '-' + a
    t = lambda p: os.path.join(RACINE, 'docs', 'themes', p)
    cases = [('Tête', t('reference/' + REF[a]))] + [(n, t(k + suf + '/accueil.webp')) for k, n in TH] + \
            [('Saison : ' + n, t('saisons/' + k + suf + '/accueil.webp')) for k, n in SA]
    cols = 4; rows = (len(cases) + cols - 1) // cols
    out = Image.new('RGB', (cols * C, rows * (C + L)), 'white'); d = ImageDraw.Draw(out)
    for i, (lab, pth) in enumerate(cases):
        x = (i % cols) * C; y = (i // cols) * (C + L)
        d.rectangle([x + 2, y + 2, x + C - 3, y + C + L - 3], outline=(200, 200, 200), width=2)
        if os.path.exists(pth):
            im = Image.open(pth).convert('RGBA'); im.thumbnail((C - 24, C - 24))
            out.paste(im, (x + (C - im.width) // 2, y + L + (C - im.height) // 2 - 6), im)
        w = d.textlength(lab, font=font); d.text((x + (C - w) / 2, y + 8), lab, fill=(40, 30, 26), font=font)
    sortie = t('reference/planche-' + a + '.png'); out.save(sortie, optimize=True); print('→', os.path.normpath(sortie))
