# Découpe les 12 accessoires de la planche (fond transparent) : un par case d'une grille 4 × 3
import sys, numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA"); A = np.array(im)
H, W = A.shape[:2]
lab, n = ndimage.label(A[:, :, 3] > 30)
pieces = [[] for _ in range(12)]
for i, sl in enumerate(ndimage.find_objects(lab)):
    aire = (lab[sl] == i + 1).sum()
    if aire < 40: continue
    cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
    pieces[int(cy // (H / 3)) * 4 + int(cx // (W / 4))].append(i + 1)
for k, ids in enumerate(pieces):
    m = np.isin(lab, ids); m = ndimage.binary_dilation(m, iterations=2)
    c = A.copy(); c[~m] = 0
    bb = Image.fromarray(c).getbbox()
    Image.fromarray(c).crop(bb).save(f"{out}/a{k:02d}.png")
    print(k, bb)
