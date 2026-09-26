' =======================================================
' Jarvis AI Assistant - Silent Background Launcher
' Runs Jarvis permanently without visible command prompt windows
' =======================================================
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = currentDir

If fso.FileExists(currentDir & "\Jarvis\Jarvis.exe") Then
    WshShell.Run """" & currentDir & "\Jarvis\Jarvis.exe""", 0, False
ElseIf fso.FileExists(currentDir & "\Jarvis.exe") Then
    WshShell.Run """" & currentDir & "\Jarvis.exe""", 0, False
ElseIf fso.FileExists(currentDir & "\service.exe") Then
    WshShell.Run """" & currentDir & "\service.exe"" start", 0, False
Else
    WshShell.Run """" & currentDir & "\Start_Jarvis.bat""", 0, False
End If

Set WshShell = Nothing
Set fso = Nothing
