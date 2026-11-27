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
                                et ajoutée à DESSINS_PRETS_.poses de src/Code.gs. Nouvelle posture : l'ajouter
                                d'abord à POSES de moteur/commun/animations.js ([id, nom]), l'outil y lit la liste
  poupee-<f|m|n>.png            socca à habiller des petits, une image → docs/themes/recompenses/poupee[-f|-m].webp
                                (allure ajoutée à DESSINS_PRETS_.recompenses.poupee ; placer ensuite les accessoires
                                avec la console → Récompenses → « Placer les accessoires », puis --positions)
  autocollants.png              album du primaire, planche 6×4 → docs/themes/recompenses/autocollants.webp
  curiosites.png                cabinet de curiosités (lycée, adultes), planche 6×4 → recompenses/curiosites.webp
                                (et DESSINS_PRETS_.recompenses.curiosites = true)

  python3 outils/integrer-planches.py --positions <f|m|n> '<JSON de la console>'
                                places des 12 accessoires sur la socca à habiller de cette allure
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
ANIM = open(os.path.join(RACINE, 'moteur', 'commun', 'animations.js'), encoding='utf-8').read()
POSES = re.findall(r"\['([a-z0-9-]+)', '", ANIM[ANIM.index('const POSES = ['):ANIM.index('];', ANIM.index('const POSES = ['))])
CODE = os.path.join(RACINE, 'src', 'Code.gs')
MOTIF = re.compile(r'^const DESSINS_PRETS_ = (\{.*\});$', re.M)


def comprendre(nom):
    b = re.sub(r'\.(png|jpe?g|webp)$', '', os.path.basename(nom).lower())
    if b in ('autocollants', 'curiosites'):
        return ('grille', None, 'n', b)
    mp = re.match(r'^poupee-(f|m|n)$', b)
    if mp:
        return ('poupee', None, mp.group(1), None)
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


def grille(src, sortie, case):
    """planche 6 × 4 → image 6 × 4 cases carrées (fond rendu transparent, chaque objet centré à la même échelle)"""
    sys.path.insert(0, ICI)
    from importlib import import_module
    im = import_module('decouper-planche').fond_transparent(Image.open(src))
    w, h = im.size
    cases = [im.crop((c * w // 6, l * h // 4, (c + 1) * w // 6, (l + 1) * h // 4)) for l in range(4) for c in range(6)]
    cases = [c.crop(c.getbbox() or (0, 0, *c.size)) for c in cases]
    k = (case - 8) / max(max(c.width, c.height) for c in cases)
    out = Image.new('RGBA', (case * 6, case * 4), (0, 0, 0, 0))
    for i, c in enumerate(cases):
        c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
        out.paste(c, ((i % 6) * case + (case - c.width) // 2, (i // 6) * case + (case - c.height) // 2), c)
    out.save(sortie, 'WEBP', quality=88)


def main():
    if sys.argv[1:2] == ['--positions']:
        allure, pos = sys.argv[2], json.loads(sys.argv[3])
        assert allure in 'fmn' and isinstance(pos, list) and len(pos) == 12 and all(len(p) == 4 for p in pos), 'positions : 12 × [x, y, l, h]'
        code = open(CODE, encoding='utf-8').read()
        dessins = json.loads(MOTIF.search(code).group(1))
        dessins.setdefault('recompenses', {}).setdefault('positions', {})[allure] = [[round(float(v)) for v in p] for p in pos]
        ligne = 'const DESSINS_PRETS_ = ' + json.dumps(dessins, ensure_ascii=False, separators=(',', ':')) + ';'
        open(CODE, 'w', encoding='utf-8').write(MOTIF.sub(lambda m: ligne, code, count=1))
        print('✓ positions des accessoires —', allure); return
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
        elif genre == 'grille':
            sortie = os.path.join(RACINE, 'docs', 'themes', 'recompenses', quoi + '.webp')
            grille(f, sortie, 128 if quoi == 'autocollants' else 160)
            if quoi == 'curiosites': dessins.setdefault('recompenses', {})['curiosites'] = True
            apercus.append(sortie); print('✓', quoi)
        elif genre == 'poupee':
            sys.path.insert(0, ICI)
            from importlib import import_module
            im = import_module('decouper-planche').fond_transparent(Image.open(f))
            im = im.crop(im.getbbox() or (0, 0, *im.size)); k = 376 / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            c = Image.new('RGBA', (384, 384), (0, 0, 0, 0)); c.paste(im, ((384 - im.width) // 2, 380 - im.height), im)
            sortie = os.path.join(RACINE, 'docs', 'themes', 'recompenses', 'poupee' + suf + '.webp'); c.save(sortie, 'WEBP', quality=88)
            l = dessins.setdefault('recompenses', {}).setdefault('poupee', [])
            if allure not in l: l.append(allure)
            apercus.append(sortie); print('✓ socca à habiller —', allure, '(placer ensuite les accessoires : console → Récompenses)')
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
