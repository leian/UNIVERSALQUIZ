import json, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
L=json.load(open('/tmp/textes.json'))
L=[l for l in L if not re.fullmatch(r"[a-z0-9\-. …]+", l['visible']) and not re.search(r"in parents|mimeType|trashed|^'", l['visible'])]
ordre={}
for l in L: ordre.setdefault(l['page'], len(ordre))
L.sort(key=lambda l:(ordre[l['page']], l['ligne']))
F=Font(name='Arial', size=10); FB=Font(name='Arial', size=10, bold=True); FG=Font(name='Arial', size=9, color='808080')
JAUNE=PatternFill('solid', fgColor='FFF2CC'); TETE=PatternFill('solid', fgColor='2B2350'); GRIS=PatternFill('solid', fgColor='F2F2F2')
fin=Side(style='thin', color='D9D9D9'); B=Border(left=fin,right=fin,top=fin,bottom=fin)
wb=Workbook()
m=wb.active; m.title="Mode d'emploi"
lignes=[
 ("Révision des textes de SoccaQuiz", True),
 ("", False),
 ("Comment faire", True),
 ("1. Onglet « Textes » : chaque ligne est un texte affiché quelque part (page, bouton, message, aide, mail…).", False),
 ("2. Lis la colonne « Texte actuel ». Pour le changer, écris la nouvelle version dans « Nouveau texte » (cases jaunes). Laisse vide si c'est bon.", False),
 ("3. Une question, un doute, une idée plus large ? Écris-le dans « Remarque » (tu peux remplir seulement la remarque).", False),
 ("4. Les filtres de la ligne d'en-tête permettent de n'afficher qu'une page (colonne « Page »).", False),
 ("5. Renvoie-moi le fichier : j'applique les changements, je lance les tests, puis je publie (nouvelle version ou installateur à recoller, je te dirai lequel).", False),
 ("", False),
 ("Bon à savoir", True),
 ("• « … » dans un texte = une valeur ajoutée automatiquement (prénom, nombre, nom de quiz…). Garde-le à sa place, ou dis en remarque où la mettre.", False),
 ("• <prénom> = le prénom de l'enfant.", False),
 ("• « Morceau de phrase » : la phrase est coupée par un lien ou un bouton ; les morceaux voisins se suivent dans le tableau.", False),
 ("• Les textes du site doivent rester neutres en genre (« Bien joué ! », pas « Trop forte ! »).", False),
 ("• Libellés de boutons : si tu changes un bouton, l'aide et le mail qui le citent seront mis à jour avec (je m'en occupe).", False),
 ("• Ne sont pas dans ce tableau : les consignes données aux IA (src/consignes.txt), les quiz de la bibliothèque et le contenu des quiz.", False),
 ("• Colonnes grises (Où, Texte dans le code) : pour moi, pas besoin d'y toucher.", False),
 ("", False),
 ("Exemple de ligne remplie", True),
]
for i,(t,g) in enumerate(lignes,1):
    c=m.cell(row=i,column=1,value=t); c.font=Font(name='Arial', size=13 if i==1 else 10, bold=g); c.alignment=Alignment(wrap_text=True, vertical='top')
r0=len(lignes)+1
ex=[("Page","Texte actuel","Nouveau texte","Remarque"),("Installateur","Réinstaller la dernière version (si ce site fonctionne mal)","Réparer mon site (réinstaller la dernière version)","Plus parlant pour un parent")]
for j,row in enumerate(ex):
    for k,v in enumerate(row):
        c=m.cell(row=r0+j,column=1+k,value=v); c.font=FB if j==0 else F; c.border=B; c.alignment=Alignment(wrap_text=True, vertical='top')
        if j==1 and k in (2,3): c.fill=JAUNE
m.column_dimensions['A'].width=95; m.column_dimensions['B'].width=45; m.column_dimensions['C'].width=45; m.column_dimensions['D'].width=30
m.cell(row=r0+3,column=1,value=f"{len(L)} textes au total, extraits du code le 21 novembre 2026 (version v3.3, installateur 21-11 D).").font=FG

t=wb.create_sheet('Textes')
tetes=['N°','Page','Texte actuel','Nouveau texte','Remarque','Genre','Où (fichier : ligne)','Texte dans le code']
larg=[6,30,70,55,32,18,30,50]
for k,(h,w) in enumerate(zip(tetes,larg),1):
    c=t.cell(row=1,column=k,value=h); c.font=Font(name='Arial', size=10, bold=True, color='FFFFFF'); c.fill=TETE; c.alignment=Alignment(wrap_text=True, vertical='center'); c.border=B
    t.column_dimensions[c.column_letter].width=w
for i,l in enumerate(L,2):
    v=l['visible']
    genre=l['genre']
    if re.match(r"^[a-zà-ÿ,;:.)…]", v) or (not re.search(r"[.!?:…»)]$", v) and len(v)>40): genre='morceau de phrase'
    vals=[i-1,l['page'],v,None,None,genre,f"{l['fichier']} : {l['ligne']}",l['texte']]
    for k,val in enumerate(vals,1):
        c=t.cell(row=i,column=k,value=val); c.border=B; c.alignment=Alignment(wrap_text=k in (3,4,5,8), vertical='top')
        c.font=FG if k in (6,7,8) else F
        if k in (4,5): c.fill=JAUNE
        if k in (7,8): c.fill=GRIS
t.freeze_panes='D2'; t.auto_filter.ref=f"A1:H{len(L)+1}"
wb.save('SoccaQuiz-textes.xlsx')
print(len(L))
