# Fabrique les trois planches des nouveaux accessoires (12 cases de 256 px) à partir des découpes a00..a11.png :
#  accessoires2.webp        : chaque accessoire entier, sans déformation (boutons de la garde-robe)
#  accessoires2-avant.webp  : la partie posée devant la socca, étirée à toute la case (la page lui redonne ses proportions)
#  accessoires2-dos.webp    : la partie derrière la socca (cape : tout sauf le col et la broche)
import sys
from PIL import Image
dossier, out = sys.argv[1], sys.argv[2]
C = 256
DOS = {6: 0.27}          # cape : sous 27 % de la hauteur, la cape passe derrière la socca
icones = Image.new("RGBA", (12*C, C)); avant = icones.copy(); dos = icones.copy()
for k in range(12):
    a = Image.open(f"{dossier}/a{k:02d}.png").convert("RGBA")
    i = a.copy(); i.thumbnail((C-8, C-8), Image.LANCZOS)
    icones.alpha_composite(i, (k*C + (C-i.width)//2, (C-i.height)//2))
    f = a.resize((C, C), Image.LANCZOS)
    if k in DOS:
        y = round(C * DOS[k])
        haut = f.crop((0, 0, C, y)); bas = f.crop((0, y, C, C))
        avant.alpha_composite(haut, (k*C, 0)); dos.alpha_composite(bas, (k*C, y))
    else:
        avant.alpha_composite(f, (k*C, 0))
    print(k, a.size)
for nom, im in [("accessoires2.webp", icones), ("accessoires2-avant.webp", avant), ("accessoires2-dos.webp", dos)]:
    im.save(f"{out}/{nom}", "WEBP", quality=90, method=6)
