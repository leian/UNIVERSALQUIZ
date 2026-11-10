// =====================================================================
//  INSTALLATEUR WINDOWS DE UNIVERSAL QUIZ (Installer-Universal-Quiz.exe)
//  Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
//  Licence PolyForm Noncommercial 1.0.0 : https://polyformproject.org/licenses/noncommercial/1.0.0
//
//  Une fenêtre qui guide l'installation pas à pas, avec des illustrations.
//  Elle fait le même travail que Installer-Universal-Quiz.cmd :
//    1. dépose les fichiers du projet dans %LOCALAPPDATA%\UniversalQuiz\projet
//       (ils sont lus dans le .cmd embarqué, ressource « installeur.cmd ») ;
//    2. télécharge Node.js portable (une seule fois) ;
//    3. lance « node installer.mjs », qui signale son avancement par des lignes « @@UQ … ».
//  Compilé par l'action GitHub avec le csc.exe fourni par Windows (C# 5 uniquement).
//  Options : --test (vérifie le contenu, pour l'action) ; --capture <dossier> (images de chaque écran).
// =====================================================================
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Installation de Universal Quiz")]
[assembly: AssemblyProduct("Universal Quiz")]
[assembly: AssemblyCompany("leian")]
[assembly: AssemblyCopyright("Copyright 2026 leian - PolyForm Noncommercial 1.0.0")]
[assembly: AssemblyVersion("2.0.0.0")]

static class Programme
{
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0 && args[0] == "--test") return Fenetre.Tester();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Fenetre f = new Fenetre();
            if (args.Length > 1 && args[0] == "--capture") { f.Capturer(args[1]); return 0; }
            Application.Run(f);
            return 0;
        }
        catch (Exception e)
        {
            if (args.Length > 0) { try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "UniversalQuiz-erreur.txt"), e.ToString()); } catch (Exception) { } return 1; }
            MessageBox.Show("Universal Quiz n'a pas pu démarrer :\n" + e.Message, "Universal Quiz", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}

class Fenetre : Form
{
    const string URL_API = "https://script.google.com/home/usersettings";
    const string VERSION_NODE = "v22.11.0";
    enum Page { Bienvenue, Api, Travail, Connexion, Autoriser, Pret, Erreur }

    readonly string dossier = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "UniversalQuiz");
    string Projet { get { return Path.Combine(dossier, "projet"); } }
    string DossierNode { get { return Path.Combine(dossier, "node"); } }
    string FichierPrenom { get { return Path.Combine(dossier, "prenom.txt"); } }

    readonly Label lblTitre = new Label(), lblTexte = new Label(), lblChamp = new Label(), lblEtat = new Label();
    readonly PictureBox image = new PictureBox();
    readonly TextBox champ = new TextBox(), journalVisible = new TextBox();
    readonly ProgressBar barre = new ProgressBar();
    readonly Button btnPrincipal = new Button(), btnSecond = new Button(), btnTiers = new Button();
    readonly Image imgApi, imgAcces, imgAutoriser;

    readonly StringBuilder journal = new StringBuilder();
    Page page;
    string prenom = "", url = null;
    bool miseAJour, pageGoogleOuverte;
    Process node;
    Thread travail;

    public Fenetre()
    {
        Text = "Installation de Universal Quiz";
        try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch (Exception) { }
        AutoScaleMode = AutoScaleMode.None;
        ClientSize = new Size(620, 540);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(255, 248, 239);
        Font = new Font("Segoe UI", 10f);

        lblTitre.SetBounds(24, 16, 572, 36);
        lblTitre.Font = new Font("Segoe UI", 15f, FontStyle.Bold);
        lblTitre.ForeColor = Color.FromArgb(43, 35, 80);
        lblTexte.SetBounds(24, 58, 572, 104);
        lblTexte.ForeColor = Color.FromArgb(43, 35, 80);
        image.SetBounds(30, 168, 560, 250);
        image.SizeMode = PictureBoxSizeMode.Zoom;
        lblChamp.SetBounds(24, 180, 572, 24);
        lblChamp.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        champ.SetBounds(24, 208, 572, 30);
        champ.Font = new Font("Segoe UI", 12f);
        journalVisible.SetBounds(24, 180, 572, 230);
        journalVisible.Multiline = true; journalVisible.ReadOnly = true; journalVisible.ScrollBars = ScrollBars.Vertical;
        journalVisible.Font = new Font("Consolas", 8.5f);
        barre.SetBounds(24, 432, 572, 16);
        barre.Style = ProgressBarStyle.Marquee; barre.MarqueeAnimationSpeed = 30;
        lblEtat.SetBounds(24, 452, 572, 22);
        lblEtat.ForeColor = Color.FromArgb(107, 99, 144);
        btnTiers.SetBounds(24, 488, 180, 36);
        btnSecond.SetBounds(214, 488, 190, 36);
        btnPrincipal.SetBounds(416, 488, 180, 36);
        btnPrincipal.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        btnPrincipal.Click += delegate { ClicPrincipal(); };
        btnSecond.Click += delegate { ClicSecond(); };
        btnTiers.Click += delegate { Ouvrir(URL_API); };
        champ.KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Enter && page == Page.Bienvenue) { e.SuppressKeyPress = true; ClicPrincipal(); } };
        Controls.AddRange(new Control[] { lblTitre, lblTexte, image, lblChamp, champ, journalVisible, barre, lblEtat, btnTiers, btnSecond, btnPrincipal });

        imgApi = Ressource("etape-api.png");
        imgAcces = Ressource("etape-acces.png");
        imgAutoriser = Ressource("etape-autoriser.png");

        try { if (File.Exists(FichierPrenom)) prenom = File.ReadAllText(FichierPrenom).Trim(); } catch (Exception) { }
        miseAJour = File.Exists(Path.Combine(Projet, ".deploiement-id"));
        FormClosing += delegate { ArreterNode(); };
        Shown += delegate { if (miseAJour && prenom != "" && page == Page.Travail) Demarrer(); };
        Montrer(miseAJour && prenom != "" ? Page.Travail : Page.Bienvenue);
    }

    // ------------------------------------------------------------ écrans
    void Montrer(Page p)
    {
        page = p;
        image.Visible = lblChamp.Visible = champ.Visible = journalVisible.Visible = false;
        barre.Visible = btnTiers.Visible = btnSecond.Visible = false;
        btnPrincipal.Visible = true; btnPrincipal.Enabled = true;
        champ.ReadOnly = false;
        lblEtat.Text = "";
        switch (p)
        {
            case Page.Bienvenue:
                lblTitre.Text = "Bienvenue dans Universal Quiz";
                lblTexte.Text = "Ce programme crée le site de quiz de ton enfant, dans ton propre compte Google. C'est gratuit, et personne d'autre ne voit tes quiz ni les résultats.\n\nIl te faut un compte Gmail. Compte environ 10 minutes : trois petites étapes, toutes expliquées en images.";
                lblChamp.Text = "Prénom de ton enfant :";
                lblChamp.Visible = champ.Visible = true;
                champ.Text = prenom;
                btnPrincipal.Text = "Commencer";
                break;
            case Page.Api:
                lblTitre.Text = "Étape 1 sur 3 : activer un bouton chez Google";
                lblTexte.Text = "1. Clique sur « Ouvrir la page Google ». Connecte-toi avec ton compte Gmail si Google le demande.\n2. Clique sur la ligne « API Google Apps Script », puis mets l'interrupteur sur Activé (il devient bleu).\n3. Reviens dans cette fenêtre et clique sur « C'est fait ».";
                image.Image = imgApi; image.Visible = true;
                btnSecond.Text = "Ouvrir la page Google"; btnSecond.Visible = true;
                btnPrincipal.Text = "C'est fait"; btnPrincipal.Enabled = pageGoogleOuverte;
                break;
            case Page.Travail:
                lblTitre.Text = miseAJour ? "Mise à jour de ton site…" : "Création de ton site…";
                lblTexte.Text = "Laisse cette fenêtre ouverte : elle travaille toute seule.\nCela prend environ une minute (un peu plus la première fois).";
                barre.Visible = true; btnPrincipal.Visible = false;
                break;
            case Page.Connexion:
                lblTitre.Text = "Étape 2 sur 3 : connecter ton compte Google";
                lblTexte.Text = "Une page Google vient de s'ouvrir dans ton navigateur.\n1. Choisis ton compte, coche « Tout sélectionner », descends tout en bas et clique sur « Continuer ».\n2. Quand la page affiche « Logged in! », reviens ici : la suite se fait toute seule.\nSi Windows demande d'autoriser Node.js (pare-feu), clique sur « Autoriser ».";
                image.Image = imgAcces; image.Visible = true;
                barre.Visible = true; btnPrincipal.Visible = false;
                lblEtat.Text = "En attente de ta réponse dans la page Google…";
                break;
            case Page.Autoriser:
                lblTitre.Text = "Étape 3 sur 3 : autoriser ton site";
                lblTexte.Text = "1. Clique sur « Ouvrir mon site », puis sur « Examiner les autorisations » et choisis ton compte.\n2. Google affiche un avertissement : c'est normal. Clique sur « Paramètres avancés », puis « Accéder à Universal Quiz (non sécurisé) », puis « Autoriser ».\n3. Quand la page « Mes quiz » s'affiche, reviens ici et clique sur « C'est fait ».";
                image.Image = imgAutoriser; image.Visible = true;
                btnSecond.Text = "Ouvrir mon site"; btnSecond.Visible = true;
                btnPrincipal.Text = "C'est fait";
                break;
            case Page.Pret:
                lblTitre.Text = miseAJour ? "Mise à jour terminée" : "C'est prêt !";
                lblTexte.Text = (miseAJour ? "Ton site est à jour, et son adresse n'a pas changé." : "Le site de " + prenom + " est en ligne.")
                    + "\n\nUn raccourci « Universal Quiz » est sur ton Bureau. Envoie l'adresse ci-dessous à ton enfant (SMS ou e-mail). Pour créer un quiz, ouvre le lien « Ajouter un quiz » en bas de la page « Mes quiz ».";
                lblChamp.Text = "Adresse du site :";
                lblChamp.Visible = champ.Visible = true;
                champ.Text = url; champ.ReadOnly = true;
                btnSecond.Text = "Copier l'adresse"; btnSecond.Visible = true;
                btnPrincipal.Text = "Ouvrir mon site";
                break;
            case Page.Erreur:
                string tout = journal.ToString();
                bool api = tout.IndexOf("Apps Script API", StringComparison.OrdinalIgnoreCase) >= 0 || tout.IndexOf("usersettings") >= 0;
                lblTitre.Text = "L'installation n'a pas abouti";
                lblTexte.Text = api
                    ? "Google a refusé la création du site. Le plus souvent, l'interrupteur « API Google Apps Script » n'est pas sur Activé.\nClique sur « Ouvrir la page Google », vérifie qu'il est bleu, attends une minute, puis clique sur « Réessayer »."
                    : "Vérifie ta connexion Internet, puis clique sur « Réessayer » : le programme reprend là où il s'était arrêté.\nSi ça bloque encore, clique sur « Copier le détail » et colle-le dans un message pour Yan.";
                journalVisible.Text = tout; journalVisible.Visible = true;
                journalVisible.SelectionStart = journalVisible.TextLength; journalVisible.ScrollToCaret();
                btnTiers.Text = "Ouvrir la page Google"; btnTiers.Visible = true;
                btnSecond.Text = "Copier le détail"; btnSecond.Visible = true;
                btnPrincipal.Text = "Réessayer";
                break;
        }
    }

    void ClicPrincipal()
    {
        switch (page)
        {
            case Page.Bienvenue:
                prenom = champ.Text.Trim().Replace("\"", "");
                if (prenom == "") { lblEtat.Text = "Tape d'abord le prénom de ton enfant."; champ.Focus(); return; }
                if (miseAJour) Demarrer(); else Montrer(Page.Api);
                break;
            case Page.Api: Demarrer(); break;
            case Page.Autoriser: Montrer(Page.Pret); break;
            case Page.Pret: Ouvrir(url); break;
            case Page.Erreur: Demarrer(); break;
        }
    }

    void ClicSecond()
    {
        switch (page)
        {
            case Page.Api: Ouvrir(URL_API); pageGoogleOuverte = true; btnPrincipal.Enabled = true; break;
            case Page.Autoriser: Ouvrir(url); break;
            case Page.Pret: Copier(url); lblEtat.Text = "Adresse copiée : colle-la avec Ctrl + V."; break;
            case Page.Erreur: Copier(journal.ToString()); lblEtat.Text = "Détail copié."; break;
        }
    }

    static void Ouvrir(string adresse)
    {
        try { Process.Start(adresse); } catch (Exception) { }
    }

    static void Copier(string texte)
    {
        try { Clipboard.SetText(texte); } catch (Exception) { }
    }

    // ------------------------------------------------------------ travail en arrière-plan
    void Demarrer()
    {
        url = null;
        Montrer(Page.Travail);
        travail = new Thread(Travailler);
        travail.IsBackground = true;
        travail.Start();
    }

    void Sur(MethodInvoker action)
    {
        try { if (!IsDisposed && IsHandleCreated) BeginInvoke(action); } catch (Exception) { }
    }

    void Etat(string texte) { Sur(delegate { lblEtat.Text = texte; }); }

    void Travailler()
    {
        try
        {
            Etat("Préparation des fichiers…");
            Directory.CreateDirectory(Projet);
            File.WriteAllText(FichierPrenom, prenom, new UTF8Encoding(false));
            int n = ExtraireProjet(Projet);
            if (n < 5) throw new Exception("Programme incomplet : télécharge-le à nouveau.");
            string exe = Path.Combine(DossierNode, "node.exe");
            if (!File.Exists(exe))
            {
                Etat("Téléchargement d'un outil (environ 30 Mo, une seule fois)…");
                TelechargerNode();
            }
            Etat("Préparation des outils…");
            int code = LancerNode(exe);
            if (url == null) throw new Exception("L'installation s'est arrêtée (code " + code + ").");
            File.WriteAllText(Path.Combine(dossier, "adresse-du-site.txt"), url);
            try
            {
                string bureau = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                File.WriteAllText(Path.Combine(bureau, "Universal Quiz.url"), "[InternetShortcut]\r\nURL=" + url + "\r\n");
            }
            catch (Exception) { }
            Sur(delegate { Copier(url); Montrer(miseAJour ? Page.Pret : Page.Autoriser); });
        }
        catch (Exception e)
        {
            lock (journal) journal.AppendLine().AppendLine(e.Message);
            Sur(delegate { Montrer(Page.Erreur); });
        }
    }

    static string TexteInstalleur()
    {
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("installeur.cmd"))
        {
            if (s == null) throw new Exception("Programme incomplet : télécharge-le à nouveau.");
            using (StreamReader r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd();
        }
    }

    // les fichiers du projet sont les lignes « #F chemin base64 » placées à la fin du .cmd embarqué
    static int ExtraireProjet(string cible)
    {
        string texte = TexteInstalleur();
        int debut = texte.IndexOf("#" + "FICHIERS#");
        if (debut < 0) return 0;
        int n = 0;
        foreach (string brute in texte.Substring(debut).Split('\n'))
        {
            string ligne = brute.Trim();
            if (!ligne.StartsWith("#F ")) continue;
            string[] parts = ligne.Split(' ');
            if (parts.Length != 3) continue;
            string chemin = Path.Combine(cible, parts[1].Replace('/', '\\'));
            Directory.CreateDirectory(Path.GetDirectoryName(chemin));
            File.WriteAllBytes(chemin, Convert.FromBase64String(parts[2]));
            n++;
        }
        return n;
    }

    void TelechargerNode()
    {
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;     // TLS 1.2
        string nom = "node-" + VERSION_NODE + "-win-x64";
        string zip = Path.Combine(Path.GetTempPath(), "universalquiz-node.zip");
        using (WebClient client = new WebClient())
            client.DownloadFile("https://nodejs.org/dist/" + VERSION_NODE + "/" + nom + ".zip", zip);
        Etat("Installation de l'outil…");
        string extrait = Path.Combine(dossier, nom);
        if (Directory.Exists(extrait)) Directory.Delete(extrait, true);
        ZipFile.ExtractToDirectory(zip, dossier);
        if (Directory.Exists(DossierNode)) Directory.Delete(DossierNode, true);
        Directory.Move(extrait, DossierNode);
        try { File.Delete(zip); } catch (Exception) { }
    }

    int LancerNode(string exe)
    {
        ProcessStartInfo psi = new ProcessStartInfo(exe, "installer.mjs --prenom \"" + prenom + "\"");
        psi.WorkingDirectory = Projet;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = psi.RedirectStandardError = psi.RedirectStandardInput = true;
        psi.StandardOutputEncoding = psi.StandardErrorEncoding = Encoding.UTF8;
        psi.EnvironmentVariables["UQ_DEPUIS_WINDOWS"] = "1";
        psi.EnvironmentVariables["UQ_GUI"] = "1";
        psi.EnvironmentVariables["NODE_NO_WARNINGS"] = "1";
        psi.EnvironmentVariables["PATH"] = DossierNode + ";" + Environment.GetEnvironmentVariable("PATH");
        using (Process p = new Process())
        {
            p.StartInfo = psi;
            p.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { Ligne(e.Data); };
            p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { Ligne(e.Data); };
            p.Start();
            node = p;
            p.StandardInput.Close();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            p.WaitForExit();
            node = null;
            return p.ExitCode;
        }
    }

    void Ligne(string ligne)
    {
        if (ligne == null) return;
        if (!ligne.StartsWith("@@UQ "))
        {
            if (ligne.Trim() != "") lock (journal) journal.AppendLine(ligne);
            return;
        }
        string m = ligne.Substring(5).Trim();
        if (m.StartsWith("fin ")) { url = m.Substring(4).Trim(); return; }
        Sur(delegate
        {
            if (m == "connexion") { Montrer(Page.Connexion); return; }
            if (page == Page.Connexion) Montrer(Page.Travail);
            if (m == "outil") lblEtat.Text = "Préparation des outils (une seule fois)…";
            else if (m == "connecte") lblEtat.Text = "Compte Google connecté.";
            else if (m == "etape 2") lblEtat.Text = "Création du projet dans ton compte Google…";
            else if (m == "etape 3") lblEtat.Text = "Envoi du moteur de quiz…";
            else if (m == "etape 4") lblEtat.Text = "Mise en ligne du site…";
        });
    }

    void ArreterNode()
    {
        try
        {
            Process p = node;
            if (p == null || p.HasExited) return;
            ProcessStartInfo k = new ProcessStartInfo("taskkill", "/PID " + p.Id + " /T /F");
            k.UseShellExecute = false; k.CreateNoWindow = true;
            Process.Start(k);
        }
        catch (Exception) { }
    }

    // ------------------------------------------------------------ ressources, test et captures
    static Image Ressource(string nom)
    {
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(nom))
        {
            if (s == null) throw new Exception("Image manquante : " + nom);
            using (Image i = Image.FromStream(s)) return new Bitmap(i);
        }
    }

    // --test : dépose le .cmd embarqué dans le dossier temporaire (l'action le compare à l'original)
    //          et vérifie que les fichiers du projet et les images sont bien là
    public static int Tester()
    {
        string temp = Path.Combine(Path.GetTempPath(), "UniversalQuiz-installateur");
        Directory.CreateDirectory(temp);
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("installeur.cmd"))
        using (FileStream f = File.Create(Path.Combine(temp, "Installer-Universal-Quiz.cmd")))
            s.CopyTo(f);
        string essai = Path.Combine(temp, "projet-test");
        if (Directory.Exists(essai)) Directory.Delete(essai, true);
        int n = ExtraireProjet(essai);
        File.WriteAllText(Path.Combine(temp, "test.txt"), n + " fichiers");
        if (n < 5 || !File.Exists(Path.Combine(essai, "installer.mjs")) || !File.Exists(Path.Combine(essai, "src", "Code.gs"))) return 3;
        Ressource("etape-api.png").Dispose(); Ressource("etape-acces.png").Dispose(); Ressource("etape-autoriser.png").Dispose();
        return 0;
    }

    // --capture <dossier> : enregistre une image de chaque écran (pour relire la mise en page)
    public void Capturer(string cible)
    {
        Directory.CreateDirectory(cible);
        prenom = "Tom"; url = "https://script.google.com/macros/s/AKfycbEXEMPLE/exec"; pageGoogleOuverte = true;
        lock (journal) journal.AppendLine("Exemple de détail technique.");
        Show();
        foreach (Page p in Enum.GetValues(typeof(Page)))
        {
            miseAJour = false;
            Montrer(p);
            Application.DoEvents();
            using (Bitmap b = new Bitmap(Width, Height))
            {
                DrawToBitmap(b, new Rectangle(0, 0, Width, Height));
                b.Save(Path.Combine(cible, ((int)p) + "-" + p + ".png"));
            }
        }
        Close();
    }
}
