# =====================================================================
#  INSTALLATEUR WINDOWS DE UNIVERSAL QUIZ
#  Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
#  Licence PolyForm Noncommercial 1.0.0 : https://polyformproject.org/licenses/noncommercial/1.0.0
#  Ce script est inséré dans « Installer-Universal-Quiz.cmd » par
#  outils/fabriquer-installeur.mjs. Les fichiers du projet sont ajoutés
#  à la fin du .cmd, après la ligne de marque (voir $marque plus bas).
#  Rien n'est installé dans Windows : tout va dans %LOCALAPPDATA%\UniversalQuiz
# =====================================================================
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$Host.UI.RawUI.WindowTitle = 'Installation de Universal Quiz'

function Titre($t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Info($t) { Write-Host $t }
function Entree($t) { Write-Host ''; Write-Host $t -ForegroundColor Yellow; [void](Read-Host '>>> Appuie sur Entree pour continuer') }
function Echec($t) { Write-Host ''; Write-Host $t -ForegroundColor Red; exit 1 }

$base   = Join-Path $env:LOCALAPPDATA 'UniversalQuiz'
$projet = Join-Path $base 'projet'
New-Item -ItemType Directory -Force -Path $projet | Out-Null
$miseAJour = Test-Path (Join-Path $projet '.deploiement-id')

Write-Host ''
Write-Host '  UNIVERSAL QUIZ' -ForegroundColor Green
if ($miseAJour) { Write-Host '  Mise a jour de ton site de quiz.' }
else { Write-Host '  Ce programme va creer le site de quiz de ton enfant, dans ton compte Google.' }

# ---------- 1. prénom ----------
$fPrenom = Join-Path $base 'prenom.txt'
$prenom = ''
if (Test-Path $fPrenom) { $prenom = ([IO.File]::ReadAllText($fPrenom)).Trim() }
if (-not $prenom) {
  Titre 'Etape 1 sur 4 : le prenom'
  do { $prenom = (Read-Host 'Quel est le prenom de ton enfant ? Tape-le puis appuie sur Entree').Trim() } while (-not $prenom)
  [IO.File]::WriteAllText($fPrenom, $prenom, (New-Object Text.UTF8Encoding $false))
}
Info "Prenom : $prenom"

# ---------- 2. fichiers du projet (contenus dans ce fichier) ----------
$soi = [IO.File]::ReadAllText($env:UQ_SELF, [Text.Encoding]::UTF8)
$marque = '#' + 'FICHIERS#'
$i = $soi.IndexOf($marque)
if ($i -lt 0) { Echec 'Fichier installateur abime : telecharge-le a nouveau.' }
$n = 0
foreach ($ligne in ($soi.Substring($i + $marque.Length) -split "`r?`n")) {
  if ($ligne -notmatch '^#F (\S+) (\S+)$') { continue }
  $chemin = Join-Path $projet ($Matches[1] -replace '/', '\')
  New-Item -ItemType Directory -Force -Path (Split-Path $chemin) | Out-Null
  [IO.File]::WriteAllBytes($chemin, [Convert]::FromBase64String($Matches[2]))
  $n++
}
if ($n -lt 5) { Echec 'Fichier installateur abime : telecharge-le a nouveau.' }

# ---------- 3. Node.js (portable, sans droits administrateur) ----------
$nodeDir = Join-Path $base 'node'
$nodeOk = $false
if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:PATH = "$nodeDir;$env:PATH"; $nodeOk = $true }
else {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { try { $nodeOk = ([int]((& node -v) -replace '^v(\d+).*$', '$1')) -ge 18 } catch {} }
}
if (-not $nodeOk) {
  Titre 'Telechargement de Node.js (une seule fois, environ 30 Mo)'
  $version = 'v22.11.0'
  $zip = Join-Path $env:TEMP 'universalquiz-node.zip'
  try { Invoke-WebRequest "https://nodejs.org/dist/$version/node-$version-win-x64.zip" -OutFile $zip -UseBasicParsing }
  catch { Echec "Telechargement impossible. Verifie ta connexion Internet, puis relance ce fichier.`n$($_.Exception.Message)" }
  Expand-Archive $zip -DestinationPath $base -Force
  if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
  Rename-Item (Join-Path $base "node-$version-win-x64") 'node'
  Remove-Item $zip -Force
  $env:PATH = "$nodeDir;$env:PATH"
  Info 'Node.js est pret.'
}

# ---------- 4. activer l'API Apps Script ----------
if (-not $miseAJour) {
  Titre 'Etape 2 sur 4 : un bouton a activer chez Google'
  Info 'Une page Google va s''ouvrir dans ton navigateur :'
  Info '   https://script.google.com/home/usersettings'
  Info '1. Si Google le demande, connecte-toi avec ton compte Gmail.'
  Info '2. Clique sur la ligne  API Google Apps Script.'
  Info '3. Mets l''interrupteur sur  Active  (il devient bleu).'
  Start-Process 'https://script.google.com/home/usersettings'
  Entree 'Quand c''est fait, reviens dans cette fenetre noire.'

  Titre 'Etape 3 sur 4 : connecter ton compte Google'
  Info 'Une autre page Google va s''ouvrir :'
  Info '1. Choisis ton compte Gmail.'
  Info '2. Coche la case  Tout selectionner  en haut de la liste des acces.'
  Info '3. Descends en bas de la page et clique sur  Continuer  (ou Autoriser).'
  Info '4. La page affiche  Logged in! You may close this page : tu peux la fermer.'
  Info 'Ensuite, laisse cette fenetre travailler (environ une minute).'
}

# ---------- 5. installation / mise à jour ----------
Push-Location $projet
$env:UQ_DEPUIS_WINDOWS = '1'
& node installer.mjs --prenom $prenom
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) {
  Echec "L'installation n'a pas abouti.`nVerifie que l'interrupteur  API Google Apps Script  est bien sur Active :`n   https://script.google.com/home/usersettings`npuis relance ce fichier. Si ca bloque encore, fais une capture d'ecran pour Yan."
}

# ---------- 6. raccourci et adresse ----------
$id = ([IO.File]::ReadAllText((Join-Path $projet '.deploiement-id'))).Trim()
$url = "https://script.google.com/macros/s/$id/exec"
[IO.File]::WriteAllText((Join-Path $base 'adresse-du-site.txt'), $url)
try {
  $bureau = [Environment]::GetFolderPath('Desktop')
  [IO.File]::WriteAllText((Join-Path $bureau 'Universal Quiz.url'), "[InternetShortcut]`r`nURL=$url`r`n")
} catch {}
try { Set-Clipboard -Value $url } catch {}

if ($miseAJour) {
  Titre 'Mise a jour terminee'
  Info "L'adresse du site ne change pas : $url"
} else {
  Titre 'Etape 4 sur 4 : ouvrir le site une premiere fois'
  Info 'Le site va s''ouvrir. Google demande une derniere autorisation :'
  Info '1. Clique sur  Examiner les autorisations, puis choisis ton compte.'
  Info '2. Si Google dit  Google n''a pas valide cette application : c''est normal.'
  Info '   Clique sur  Parametres avances  (en bas a gauche),'
  Info '   puis sur  Acceder a Universal Quiz (non securise).'
  Info '3. Clique sur  Autoriser.'
  Info '4. La page  Mes quiz  apparait avec un quiz d''essai. C''est termine !'
  Write-Host ''
  Write-Host "Adresse du site de $prenom :" -ForegroundColor Green
  Write-Host "   $url" -ForegroundColor Green
  Info 'Elle est deja copiee : tu peux la coller (Ctrl+V) dans un SMS ou un e-mail pour ton enfant.'
  Info 'Un raccourci  Universal Quiz  a aussi ete pose sur ton Bureau.'
  Start-Process $url
}
