import re, json, sys
UQ='/home/claude/universalquiz/'; SF='/home/claude/soccaquiz.fr/'
FICHIERS = [
 ('Site de l\'enfant – accueil', UQ+'moteur/index.html'),
 ('Espace parent – tableau de bord et réglages', UQ+'moteur/tableau-de-bord.html'),
 ('Espace parent – Ajouter un quiz', UQ+'src/page-ajouter.html'),
 ('Quiz – moteur', UQ+'moteur/commun/moteur-quiz.js'),
 ('Quiz – animations', UQ+'moteur/commun/animations.js'),
 ('Quiz – badges', UQ+'moteur/commun/badges.js'),
 ('Quiz – récompenses', UQ+'moteur/commun/recompenses.js'),
 ('Quiz – suivi', UQ+'moteur/commun/suivi.js'),
 ('Quiz – dessins', UQ+'moteur/commun/dessins.js'),
 ('Quiz d\'exemple', UQ+'src/exemple-quiz.html'),
 ('Liaison pages ↔ serveur', UQ+'src/pont.html'),
 ('Messages du site (serveur)', UQ+'src/Code.gs'),
 ('Coquille du site de l\'enfant (app.soccaquiz.fr)', UQ+'site/index.html'),
 ('Coquille de l\'espace parent (app.soccaquiz.fr/parent)', UQ+'site/parent/index.html'),
 ('Appli installable (enveloppe)', UQ+'appli/index.html'),
 ('Installateur', UQ+'en-ligne/Code.gs'),
 ('Page « Installer » (GitHub)', UQ+'docs/installer.html'),
 ('Mail d\'invitation', UQ+'docs/invitation.html'),
 ('Page « Parler » (micro)', UQ+'docs/parler.html'),
 ('soccaquiz.fr – accueil', SF+'index.html'),
 ('soccaquiz.fr – aide', SF+'aide.html'),
 ('soccaquiz.fr – confidentialité (copiée aussi dans docs/)', SF+'confidentialite.html'),
]
MOT = re.compile(r"[A-Za-zÀ-ÿ]{3,}")
def humain(t):
    t2 = t.strip()
    if len(t2) < 3 or not MOT.search(t2): return False
    if re.match(r'^(https?:|\.?/|#|data:|mailto:)', t2): return False
    if re.search(r'[{};]\s*$', t2) and ':' in t2 and not re.search(r'[àâçéèêëîïôûùüÿœ]', t2): return False   # CSS
    if re.fullmatch(r"[\w\-.#:\[\]=>*,()/ \"'@%+]+", t2) and not re.search(r"[A-Za-zÀ-ÿ]{3,}\s+[A-Za-zÀ-ÿ']{2,}", t2): return False
    if re.fullmatch(r"[a-z][\w\-]*(\.[\w\-]+)*", t2): return False   # identifiants
    if re.search(r'\b(function|return|var|const|let|document\.|window\.|=>|\.prototype)\b', t2) and not re.search(r'[àâçéèêîôûù]', t2): return False
    if re.fullmatch(r"[\s\w\-]*(px|em|rem|vh|vw|%|s|ms)?[\s\w\-]*", t2) and ' ' not in t2.strip(): return False
    # un vrai texte : une espace entre deux mots, un accent, ou une ponctuation française
    return bool(re.search(r"[A-Za-zÀ-ÿ]{2,}[  ’'][A-Za-zÀ-ÿ]", t2) or re.search(r'[àâçéèêëîïôûùüœ«»…]', t2) or re.search(r'^[A-ZÀ-Ý][a-zà-ÿ]{2,}[ !?.:]*$', t2))
def chaines_js(src, debut_ligne):
    out=[]; i=0; n=len(src); ligne=debut_ligne
    while i<n:
        c=src[i]
        if c=='\n': ligne+=1; i+=1; continue
        if c=='/' and i+1<n and src[i+1]=='/':
            # commentaire ligne (attention aux adresses https:\/\/ déjà échappées)
            j=src.find('\n',i); j=n if j<0 else j; i=j; continue
        if c=='/' and i+1<n and src[i+1]=='*':
            j=src.find('*/',i+2); j=n if j<0 else j+2; ligne+=src.count('\n',i,j); i=j; continue
        if c in '\'"`':
            q=c; j=i+1; buf=[]
            while j<n and src[j]!=q:
                if src[j]=='\\' and j+1<n: buf.append(src[j:j+2]); j+=2; continue
                if src[j]=='\n' and q!='`': break
                buf.append(src[j]); j+=1
            brut=''.join(buf)
            out.append((ligne, brut, q))
            ligne+=src.count('\n',i,j); i=j+1; continue
        i+=1
    return out
lignes=[]
for page, chemin in FICHIERS:
    src=open(chemin,encoding='utf-8').read()
    est_js = chemin.endswith(('.js','.gs'))
    vus=set()
    def ajouter(no, texte, genre):
        cle=(no,texte)
        if cle in vus: return
        vus.add(cle)
        lignes.append({'page':page,'fichier':chemin.replace(UQ,'UNIVERSALQUIZ/').replace(SF,'soccaquiz.fr/'),'ligne':no,'genre':genre,'texte':texte})
    if est_js:
        for no,t,q in chaines_js(src,1):
            if humain(t.replace("\\'","'")): ajouter(no,t,'texte dans le code')
    else:
        # parties script → chaînes JS ; reste → texte HTML et attributs
        pos=0
        for m in re.finditer(r'<script\b[^>]*>(.*?)</script>|<style\b[^>]*>.*?</style>', src, re.S):
            avant=src[pos:m.start()]; l0=src.count('\n',0,pos)+1
            for mm in re.finditer(r'>([^<>]+)<', avant):
                t=mm.group(1)
                if humain(t): ajouter(l0+avant.count('\n',0,mm.start()), ' '.join(t.split()), 'texte de la page')
            for mm in re.finditer(r'\b(placeholder|title|alt|aria-label|content)="([^"]+)"', avant):
                if humain(mm.group(2)): ajouter(l0+avant.count('\n',0,mm.start()), mm.group(2), 'attribut '+mm.group(1))
            if m.group(1) is not None:
                ls=src.count('\n',0,m.start(1))+1
                for no,t,q in chaines_js(m.group(1),ls):
                    if humain(t.replace("\\'","'")): ajouter(no,t,'texte dans le code')
            pos=m.end()
        avant=src[pos:]; l0=src.count('\n',0,pos)+1
        for mm in re.finditer(r'>([^<>]+)<', avant):
            t=mm.group(1)
            if humain(t): ajouter(l0+avant.count('\n',0,mm.start()), ' '.join(t.split()), 'texte de la page')
        for mm in re.finditer(r'\b(placeholder|title|alt|aria-label|content)="([^"]+)"', avant):
            if humain(mm.group(2)): ajouter(l0+avant.count('\n',0,mm.start()), mm.group(2), 'attribut '+mm.group(1))
json.dump(lignes, open('/tmp/textes.json','w'), ensure_ascii=False, indent=0)
from collections import Counter
print(len(lignes)); print(Counter(l['page'] for l in lignes).most_common())

def visible(t):
    v = t
    # retire les ${…} (avec accolades imbriquées)
    out=[]; i=0
    while i < len(v):
        if v.startswith('${', i):
            d=0; j=i
            while j < len(v):
                if v[j]=='{': d+=1
                elif v[j]=='}':
                    d-=1
                    if d==0: break
                j+=1
            out.append('…'); i=j+1; continue
        out.append(v[i]); i+=1
    v=''.join(out)
    v=re.sub(r'<[^>]*>', ' ', v)
    v=v.replace("\\'", "'").replace('\\"','"').replace('\\n',' ').replace('&nbsp;',' ').replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')
    v=re.sub(r'\{\{PRENOM\}\}','<prénom>',v)
    return ' '.join(v.split())
garde=[]
for l in lignes:
    v=visible(l['texte'])
    if not humain(v) or re.search(r'\b(const|function|return|=>|getElementById|innerHTML)\b', v): continue
    l['visible']=v; garde.append(l)
json.dump(garde, open('/tmp/textes.json','w'), ensure_ascii=False, indent=0)
print('gardés', len(garde)); print(Counter(l['page'] for l in garde).most_common())
