@echo off
title Jarvis AI Assistant - Standalone EXE Builder
color 0B

echo ===============================================================
echo          JARVIS AI ASSISTANT - EXE COMPILATION UTILITY
echo ===============================================================
echo.

set ROOT_DIR=%~dp0
if exist "%ROOT_DIR%Jarvis\Jarvis_code" (
    set JARVIS_DIR=%ROOT_DIR%Jarvis\
) else (
    set JARVIS_DIR=%ROOT_DIR%
)

echo [1/2] Compiling Native Jarvis.exe and service.exe with Self-Healing Watchdog...
if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe "/out:%JARVIS_DIR%Jarvis.exe" "%JARVIS_DIR%Jarvis.cs"
    copy /y "%JARVIS_DIR%Jarvis.exe" "%ROOT_DIR%Jarvis.exe" >nul 2>nul
    copy /y "%JARVIS_DIR%Jarvis.exe" "%JARVIS_DIR%service.exe" >nul 2>nul
    copy /y "%JARVIS_DIR%Jarvis.exe" "%ROOT_DIR%service.exe" >nul 2>nul
    echo       [SUCCESS] Native Jarvis.exe and service.exe compiled successfully!
) else (
    echo [ERROR] csc.exe compiler not found in standard .NET Framework location.
)

echo.
echo ===============================================================
echo  [SUCCESS] All Jarvis Executables successfully built!
echo  [সফল] সকল জারভিস ইএক্সই (EXE) সফলভাবে তৈরি সম্পন্ন হয়েছে!
echo.
echo  - Jarvis.exe:  %ROOT_DIR%Jarvis.exe
echo  - service.exe: %ROOT_DIR%service.exe
echo ===============================================================
echo.
