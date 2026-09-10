' Arranca el servidor de stock en segundo plano (sin ventana negra).
' Escribe siempre en scripts\servidor.log para poder diagnosticar.

Option Explicit
Dim fso, sh, scriptDir, proyecto, backend, logFile, envFile, nodeExe, batFile, ts, puerto

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
proyecto = fso.GetParentFolderName(scriptDir)
backend = proyecto & "\backend"
logFile = scriptDir & "\servidor.log"
envFile = backend & "\.env"
batFile = scriptDir & "\_arrancar-tmp.bat"
puerto = 3001

Call LogLine("---- " & Now & " servidor-oculto.vbs ----")
Call LogLine("Proyecto: " & proyecto)

If Not fso.FolderExists(backend) Then
  Call LogLine("ERROR: no existe backend")
  MsgBox "No se encontro la carpeta backend:" & vbCrLf & backend, vbCritical, "Sistema de Stock"
  WScript.Quit 1
End If

If Not fso.FileExists(envFile) Then
  Call LogLine("ERROR: falta backend\.env")
  MsgBox "Falta el archivo backend\.env" & vbCrLf & "Copialo desde .env.example y pone la clave de PostgreSQL.", vbCritical, "Sistema de Stock"
  WScript.Quit 1
End If

' Si el codigo fuente es mas nuevo que dist, recompilar (tras pegar actualizaciones)
Dim compileBat, compileExec, compileCode
compileBat = scriptDir & "\_compilar-frontend-si-hace-falta.bat"
If fso.FileExists(compileBat) Then
  Call LogLine("Verificando/compilando frontend si hay cambios...")
  compileCode = sh.Run("cmd /c """ & compileBat & """ >> """ & logFile & """ 2>&1", 0, True)
  Call LogLine("Compilacion frontend codigo=" & compileCode)
End If

If Not fso.FileExists(proyecto & "\frontend\dist\index.html") Then
  Call LogLine("ERROR: falta frontend\dist\index.html")
  MsgBox "Falta compilar el frontend." & vbCrLf & "Ejecuta: scripts\actualizar-sistema.bat", vbExclamation, "Sistema de Stock"
  WScript.Quit 1
End If

nodeExe = FindNode()
If nodeExe = "" Then
  Call LogLine("ERROR: node.exe no encontrado")
  MsgBox "Node.js no esta instalado o no esta en el PATH." & vbCrLf & "Instalalo desde https://nodejs.org (LTS).", vbCritical, "Sistema de Stock"
  WScript.Quit 1
End If
Call LogLine("Node: " & nodeExe)

If PuertoEnUso(puerto) Then
  Call LogLine("OK: ya hay algo escuchando en el puerto " & puerto)
Else
  ' Esperar un poco por PostgreSQL al inicio de Windows
  WScript.Sleep 3000

  ' Generar un .bat temporal evita problemas de comillas con "Program Files"
  On Error Resume Next
  Set ts = fso.CreateTextFile(batFile, True)
  ts.WriteLine "@echo off"
  ts.WriteLine "cd /d """ & backend & """"
  ts.WriteLine "set NODE_ENV=production"
  ts.WriteLine """" & nodeExe & """ server.js >> """ & logFile & """ 2>&1"
  ts.Close
  On Error GoTo 0

  Call LogLine("Ejecutando bat temporal: " & batFile)
  sh.Run """" & batFile & """", 0, False

  WScript.Sleep 5000
  If PuertoEnUso(puerto) Then
    Call LogLine("OK: servidor escuchando en " & puerto)
  Else
    Call LogLine("AVISO: el puerto " & puerto & " sigue libre. Mira los errores en este mismo archivo (servidor.log).")
  End If
End If

If PuertoEnUso(puerto) Then
  Call ArrancarTunel()
Else
  Call LogLine("Tunel no arrancado: el servidor no esta en el puerto " & puerto)
End If
WScript.Quit 0

Sub LogLine(msg)
  Dim t
  On Error Resume Next
  Set t = fso.OpenTextFile(logFile, 8, True)
  t.WriteLine msg
  t.Close
  On Error GoTo 0
End Sub

Function FindNode()
  Dim p, parts, i, candidate
  FindNode = ""
  On Error Resume Next
  p = sh.ExpandEnvironmentStrings("%PATH%")
  parts = Split(p, ";")
  For i = LBound(parts) To UBound(parts)
    candidate = Trim(parts(i))
    If candidate <> "" Then
      If Right(candidate, 1) <> "\" Then candidate = candidate & "\"
      If fso.FileExists(candidate & "node.exe") Then
        FindNode = candidate & "node.exe"
        Exit Function
      End If
    End If
  Next
  candidate = sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
  If fso.FileExists(candidate) Then FindNode = candidate : Exit Function
  candidate = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe")
  If fso.FileExists(candidate) Then FindNode = candidate : Exit Function
  candidate = sh.ExpandEnvironmentStrings("%LocalAppData%\Programs\nodejs\node.exe")
  If fso.FileExists(candidate) Then FindNode = candidate : Exit Function
  On Error GoTo 0
End Function

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

Sub ArrancarTunel()
  Dim tunel
  tunel = scriptDir & "\tunel-oculto.vbs"
  If Not fso.FileExists(tunel) Then
    Call LogLine("AVISO: no existe tunel-oculto.vbs")
    Exit Sub
  End If
  Call LogLine("Arrancando tunel ngrok...")
  sh.Run "wscript.exe """ & tunel & """", 0, False
End Sub
