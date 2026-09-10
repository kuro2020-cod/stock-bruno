' Crea el acceso directo "Sistema de Stock" en el escritorio.
Option Explicit
Dim fso, sh, scriptDir, proyecto, vbs, desktop, lnk

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
proyecto = fso.GetParentFolderName(scriptDir)
vbs = scriptDir & "\abrir-sistema.vbs"

desktop = sh.SpecialFolders("Desktop")
lnk = sh.CreateShortcut(desktop & "\Sistema de Stock.lnk")
lnk.TargetPath = "wscript.exe"
lnk.Arguments = """" & vbs & """"
lnk.WorkingDirectory = proyecto
lnk.WindowStyle = 7
lnk.Description = "Abrir Sistema de Control de Stock"
lnk.Save

WScript.Echo "Acceso directo creado en el escritorio: Sistema de Stock.lnk"
