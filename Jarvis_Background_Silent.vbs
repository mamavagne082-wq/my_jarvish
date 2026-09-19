' =======================================================
' Jarvis AI Assistant - Silent Background Launcher
' Runs Jarvis without any visible command prompt windows
' =======================================================
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = currentDir

' Launch Start_Jarvis.bat silently (0 = hidden)
WshShell.Run """" & currentDir & "\Start_Jarvis.bat""", 0, False

Set WshShell = Nothing
Set fso = Nothing
