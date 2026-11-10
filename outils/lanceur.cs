// =====================================================================
//  LANCEUR WINDOWS DE UNIVERSAL QUIZ (Installer-Universal-Quiz.exe)
//  Required Notice: Copyright 2026 leian (https://github.com/leian/UNIVERSALQUIZ)
//  Licence PolyForm Noncommercial 1.0.0 : https://polyformproject.org/licenses/noncommercial/1.0.0
//
//  Petit programme avec une icône : il contient Installer-Universal-Quiz.cmd
//  (ressource « installeur.cmd »), le dépose dans le dossier temporaire et le lance.
//  Compilé par l'action GitHub avec le csc.exe fourni par Windows (C# 5).
//  Option --test : extrait le fichier, affiche sa taille et s'arrête (pour l'action).
// =====================================================================
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("Installation de Universal Quiz")]
[assembly: AssemblyProduct("Universal Quiz")]
[assembly: AssemblyCompany("leian")]
[assembly: AssemblyCopyright("Copyright 2026 leian - PolyForm Noncommercial 1.0.0")]
[assembly: AssemblyVersion("1.0.0.0")]

static class Lanceur
{
    static int Main(string[] args)
    {
        try
        {
            Console.Title = "Installation de Universal Quiz";
            string dossier = Path.Combine(Path.GetTempPath(), "UniversalQuiz-installateur");
            Directory.CreateDirectory(dossier);
            string cmd = Path.Combine(dossier, "Installer-Universal-Quiz.cmd");
            using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("installeur.cmd"))
            {
                if (source == null) throw new Exception("Programme incomplet : telecharge-le a nouveau.");
                using (FileStream cible = File.Create(cmd)) source.CopyTo(cible);
            }
            if (args.Length > 0 && args[0] == "--test")
            {
                Console.WriteLine("OK " + new FileInfo(cmd).Length + " octets : " + cmd);
                return 0;
            }
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"\"" + cmd + "\"\"");
            psi.UseShellExecute = false;        // meme fenetre noire que ce programme
            using (Process p = Process.Start(psi))
            {
                p.WaitForExit();
                return p.ExitCode;
            }
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("Universal Quiz n'a pas pu demarrer : " + e.Message);
            Console.Error.WriteLine("Appuie sur une touche pour fermer.");
            try { Console.ReadKey(); } catch (Exception) { }
            return 1;
        }
    }
}
