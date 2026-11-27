#!/usr/bin/env python3
"""Intègre dans l'appli les planches de mascottes rendues par ChatGPT (console → onglet « Mascottes »).

  python3 outils/integrer-planches.py <planche.png> [<planche.png> …]

Le NOM du fichier dit ce que c'est (c'est le nom donné par la console) :
  <thème>[-f|-m].png            mascotte d'un thème, planche 2×2 → docs/themes/<thème>[-f|-m]/
                                (accueil, bravo, encouragement, reflexion)
  <saison>-<thème>[-f|-m].png   costume de saison d'une classe, planche 2×1
                                → docs/themes/saisons/<saison>-<thème>[-f|-m]/ (accueil, bravo)
                                et ajouté à DESSINS_PRETS_.saisons de src/Code.gs
  <posture>-<f|m|n>.png         posture du collège, planche 3×2 → docs/themes/poses[-f|-m]/<posture>.webp
                                et ajoutée à DESSINS_PRETS_.poses de src/Code.gs
thème = petits, lecteurs, explorateurs, college, lycee-gothique, lycee-rap, parent
saison = noel, hiver, paques, printemps, ete, rentree, halloween, automne
Sans -f / -m : la socca de toujours (neutre). Un nom inconnu est refusé (rien n'est touché).

Ensuite : refait les planches de références (outils/planche-references.py) et affiche le résumé.
Il reste à regarder l'aperçu (/tmp/apercu-integration.png), lancer `node tests/test.mjs`, committer
(images + src/Code.gs + docs/themes/reference) et pousser sur main (le relais se republie seul).
"""
import sys, os, re, json, subprocess
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
THEMES = ['petits', 'lecteurs', 'explorateurs', 'college', 'lycee-gothique', 'lycee-rap', 'parent']
SAISONS = ['noel', 'hiver', 'paques', 'printemps', 'ete', 'rentree', 'halloween', 'automne']
POSES = ['six-seven', 'moue', 'for-sure', 'je-men-fous', 'retourne', 'clin-doeil', 'mewing', 'toc-toc', 'aura', 'sigma',
         'duckface', 'soupir', 'pas-french', 'spiki', 'ehho', 'ours', 'last-dance', 'uk', 'babydoll', 'cri']
CODE = os.path.join(RACINE, 'src', 'Code.gs')
MOTIF = re.compile(r'^const DESSINS_PRETS_ = (\{.*\});$', re.M)


def comprendre(nom):
    b = re.sub(r'\.(png|jpe?g|webp)$', '', os.path.basename(nom).lower())
    m = re.match(r'^(.*?)(?:-(f|m|n))?$', b)
    base, allure = m.group(1), m.group(2) or 'n'
    if base in THEMES and allure != 'n' or b in THEMES:
        return ('theme', base if base in THEMES else b, allure if base in THEMES else 'n', None)
    for s in SAISONS:
        if base.startswith(s + '-') and base[len(s) + 1:] in THEMES:
            return ('saison', base[len(s) + 1:], allure, s)
    if base in POSES and m.group(2):
        return ('pose', None, allure, base)
    return None


def main():
    fichiers = sys.argv[1:]
    if not fichiers:
        print(__doc__); sys.exit(1)
    plan = []
    for f in fichiers:
        c = comprendre(f)
        if not c:
            print('✗ nom inconnu, rien n\'est fait :', os.path.basename(f)); sys.exit(2)
        plan.append((f, c))
    code = open(CODE, encoding='utf-8').read()
    dessins = json.loads(MOTIF.search(code).group(1))
    apercus = []
    for f, (genre, theme, allure, quoi) in plan:
        suf = '' if allure == 'n' else '-' + allure
        if genre == 'theme':
            dossier = os.path.join(RACINE, 'docs', 'themes', theme + suf)
            subprocess.run([sys.executable, os.path.join(ICI, 'decouper-planche.py'), f, dossier, 'theme'], check=True, stdout=subprocess.DEVNULL)
            apercus += [os.path.join(dossier, n + '.webp') for n in ('accueil', 'bravo', 'encouragement', 'reflexion')]
            print('✓ thème', theme + suf)
        elif genre == 'saison':
            cle = theme + suf
            dossier = os.path.join(RACINE, 'docs', 'themes', 'saisons', quoi + '-' + cle)
            subprocess.run([sys.executable, os.path.join(ICI, 'decouper-planche.py'), f, dossier, 'saison'], check=True, stdout=subprocess.DEVNULL)
            l = dessins['saisons'].setdefault(cle, [])
            if quoi not in l: l.append(quoi)
            l.sort(key=SAISONS.index)
            apercus += [os.path.join(dossier, n + '.webp') for n in ('accueil', 'bravo')]
            print('✓ saison', quoi, '—', cle)
        else:
            subprocess.run([sys.executable, os.path.join(ICI, 'pose-planche.py'), f, quoi] + ([allure] if allure != 'n' else []), check=True, stdout=subprocess.DEVNULL)
            l = dessins['poses'].setdefault(allure, [])
            if quoi not in l: l.append(quoi)
            l.sort(key=POSES.index)
            apercus.append(os.path.join(RACINE, 'docs', 'themes', 'poses' + suf, quoi + '.webp'))
            print('✓ posture', quoi, '—', allure)
    ligne = 'const DESSINS_PRETS_ = ' + json.dumps(dessins, ensure_ascii=False, separators=(',', ':')) + ';'
    open(CODE, 'w', encoding='utf-8').write(MOTIF.sub(lambda m: ligne, code, count=1))
    subprocess.run([sys.executable, os.path.join(ICI, 'planche-references.py')], check=True, stdout=subprocess.DEVNULL)
    for d in ('__pycache__',):
        p = os.path.join(ICI, d)
        if os.path.isdir(p): subprocess.run(['rm', '-rf', p])
    # aperçu : chaque image sur fond gris (bandes de postures réduites), pour vérifier d'un coup d'œil
    vues = []
    for a in apercus:
        im = Image.open(a).convert('RGBA')
        im = im.resize((im.width * 128 // im.height, 128))
        vues.append(im)
    if vues:
        larg = 900; lignes, x, y, h = [], 0, 0, 132
        pos = []
        for v in vues:
            if x + v.width > larg: x, y = 0, y + h
            pos.append((x, y)); x += v.width + 4
        out = Image.new('RGB', (larg, y + h), (205, 215, 225))
        for v, p in zip(vues, pos): out.paste(v, p, v)
        out.save('/tmp/apercu-integration.png')
        print('aperçu : /tmp/apercu-integration.png')
    print('src/Code.gs : DESSINS_PRETS_ à jour ; planches de références refaites.')


if __name__ == '__main__':
    main()
