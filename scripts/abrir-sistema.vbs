' Acceso directo del sistema:
' 1) Arranca el servidor si no esta corriendo (sin ventana)
' 2) Espera a que responda
' 3) Abre el navegador

Option Explicit
Dim fso, sh, scriptDir, proyecto, url, i, ok, logFile

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
proyecto = fso.GetParentFolderName(scriptDir)
logFile = scriptDir & "\servidor.log"
url = "http://localhost:3001"

sh.Run "wscript.exe """ & scriptDir & "\servidor-oculto.vbs""", 0, True

ok = False
For i = 1 To 45
  If PuertoEnUso(3001) Then
    ok = True
    Exit For
  End If
  WScript.Sleep 1000
Next

If ok Then
  ' Tunel fijo ngrok. No espera: corre en segundo plano.
  If fso.FileExists(scriptDir & "\tunel-oculto.vbs") Then
    sh.Run "wscript.exe """ & scriptDir & "\tunel-oculto.vbs""", 0, False
  End If
  sh.Run url, 1, False
Else
  MsgBox "El sistema no arranco." & vbCrLf & vbCrLf & _
         "Hacé esto:" & vbCrLf & _
         "1) Abrí scripts\diagnosticar.bat y leé el resultado" & vbCrLf & _
         "2) Revisá scripts\servidor.log" & vbCrLf & _
         "3) Revisá backend\.env (clave de PostgreSQL)" & vbCrLf & vbCrLf & _
         "Proyecto:" & vbCrLf & proyecto, vbExclamation, "Sistema de Stock"
  If fso.FileExists(logFile) Then
    sh.Run "notepad.exe """ & logFile & """", 1, False
  End If
End If

WScript.Quit 0

Function PuertoEnUso(p)
  Dim exec, out
  PuertoEnUso = False
  On Error Resume Next
  Set exec = sh.Exec("cmd /c netstat -ano | findstr :" & p & " | findstr LISTENING")
  WScript.Sleep 300
  out = ""
  If Not exec.StdOut.AtEndOfStream Then out = exec.StdOut.ReadAll
  If InStr(1, out, "LISTENING", vbTextCompare) > 0 Then PuertoEnUso = True
  On Error GoTo 0
End Function
