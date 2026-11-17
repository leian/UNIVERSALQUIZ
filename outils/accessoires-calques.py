# Nettoie la planche d'accessoires et sépare chaque accessoire en deux calques :
# « dos » (dessiné derrière la socca, donc caché par la tête là où elle passe devant) et « avant ».
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
src, dossier = sys.argv[1], sys.argv[2]
S = np.array(Image.open(src).convert("RGBA")).astype(np.int32)
H, W = S.shape[:2]; C = H
# 1) nettoyage : on garde la grande pièce de chaque case et ce qui est dedans (reflet du casque)
lab, n = ndimage.label(S[:, :, 3] > 40)
garder = np.zeros((H, W), bool)
for k in range(W // C):
    zone = lab[:, k*C:(k+1)*C]
    ids, aires = np.unique(zone[zone > 0], return_counts=True)
    if not len(ids): continue
    grand = ids[np.argmax(aires)]
    ys, xs = np.where(zone == grand); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    for i, a in zip(ids, aires):
        ys2, xs2 = np.where(zone == i)
        if i == grand or (a > 100 and xs2.min() > x0 and xs2.max() < x1 and ys2.min() > y0 and ys2.max() < y1):
            garder[:, k*C:(k+1)*C] |= zone == i
garder = ndimage.binary_dilation(garder, iterations=2)
S[~garder] = 0
propre = S.copy()
# couronne de fleurs : la fleur de droite est coupée par le bord de la case ; on reprend celle de gauche, en miroir
k = 10; cel = S[:, k*C:(k+1)*C]
cel[:, 100:200] = cel[:, 0:100][:, ::-1].copy()     # moitié gauche en miroir (la fleur du centre est symétrique)
propre = S.copy()
# 2) séparation
dos = np.zeros_like(S); avant = S.copy()
def lum(p): return 0.3*p[0] + 0.59*p[1] + 0.11*p[2]
def proche(a, b, t=38): return np.abs(a[:3] - b[:3]).sum() < t
TRAIT = np.array([62, 24, 8, 255])
def fond_interieur(k, graine, tol=48):
    """Ouverture du chapeau vue par-dessous : l'intérieur (croissant de couleur unie entre le bord arrière
    et le bord avant) passe derrière ; la tête, qui est dans le chapeau, le cache. Le bord avant reste devant."""
    cel = S[:, k*C:(k+1)*C]
    c0 = cel[graine[1], graine[0]][:3]
    m = (np.abs(cel[:, :, :3] - c0).sum(2) < tol) & (cel[:, :, 3] > 40)
    lab, _ = ndimage.label(m); zone = lab == lab[graine[1], graine[0]]
    sombre = (0.3*cel[:, :, 0] + 0.59*cel[:, :, 1] + 0.11*cel[:, :, 2] < 150) & (cel[:, :, 3] > 40)
    for _ in range(4):                                   # trait du bord arrière, juste au-dessus
        haut = np.zeros_like(zone); haut[:-1] = zone[1:]
        zone |= haut & sombre
    zone = ndimage.binary_dilation(zone) & (cel[:, :, 3] > 0)
    bas = np.zeros_like(zone)                             # le bord avant (contour du bas) reste devant
    for x in range(C):
        ys = np.where(cel[:, x, 3] > 40)[0]
        if len(ys):
            y = ys.max()
            while y > 0 and (0.3*cel[y, x, 0] + 0.59*cel[y, x, 1] + 0.11*cel[y, x, 2] < 58 or cel[y, x, 3] < 200): bas[y, x] = True; y -= 1
    zone &= ~bas
    dos[:, k*C:(k+1)*C][zone] = cel[zone]; avant[:, k*C:(k+1)*C][zone] = 0
def tout_derriere(k):
    dos[:, k*C:(k+1)*C] = S[:, k*C:(k+1)*C]; avant[:, k*C:(k+1)*C] = 0
def haut_derriere(k, ymax):
    dos[:ymax, k*C:(k+1)*C] = S[:ymax, k*C:(k+1)*C]; avant[:ymax, k*C:(k+1)*C] = 0
fond_interieur(0, (100, 167))     # toque : intérieur sous le bandeau
fond_interieur(1, (100, 166), 60)     # couronne : intérieur du cercle
fond_interieur(7, (100, 172), 40)     # bonnet : revers intérieur
tout_derriere(3)                   # oreilles de lapin : le serre-tête passe derrière la tête
tout_derriere(10)                  # couronne de fleurs : l'arc dessiné est l'arrière de la couronne
haut_derriere(11, 52)              # médaille : le ruban passe derrière le cou
# couronne de fleurs : l'arc du dessin est l'arrière ; l'avant est le même arc retourné et aplati,
# qui passe sur le front et rejoint les deux bouts
k = 10; cel = S[:, k*C:(k+1)*C].astype(np.uint8)
im = Image.fromarray(cel, "RGBA"); bb = im.getbbox()
arc = im.crop(bb).transpose(Image.FLIP_TOP_BOTTOM)
arc = arc.resize((arc.width, int(arc.height * 0.62)), Image.LANCZOS)
cel_av = Image.new("RGBA", (C, C), (0, 0, 0, 0)); cel_av.alpha_composite(arc, (bb[0], bb[3] - 26))
avant[:, k*C:(k+1)*C] = np.array(cel_av).astype(np.int32)
for nom, t in [("accessoires.webp", propre), ("accessoires-avant.webp", avant), ("accessoires-dos.webp", dos)]:
    Image.fromarray(np.clip(t, 0, 255).astype(np.uint8), "RGBA").save(f"{dossier}/{nom}", "WEBP", quality=90, method=6)
