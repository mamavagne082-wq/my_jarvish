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

echo [1/3] Compiling Native Jarvis.exe...
if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe "/out:%JARVIS_DIR%Jarvis.exe" "%JARVIS_DIR%Jarvis.cs"
    copy /y "%JARVIS_DIR%Jarvis.exe" "%ROOT_DIR%Jarvis.exe" >nul 2>nul
    echo       [SUCCESS] Native Jarvis.exe compiled successfully!
)

echo.
echo [2/3] Locating Python Environment...
if exist "%JARVIS_DIR%Jarvis_code\venv\Scripts\python.exe" (
    set PYTHON_EXE="%JARVIS_DIR%Jarvis_code\venv\Scripts\python.exe"
) else if exist "%ROOT_DIR%venv\Scripts\python.exe" (
    set PYTHON_EXE="%ROOT_DIR%venv\Scripts\python.exe"
) else (
    set PYTHON_EXE=python
)
echo       Using Python: %PYTHON_EXE%

echo.
echo [3/3] Compiling Background Service EXE (service.exe)...
cd /d "%JARVIS_DIR%"
%PYTHON_EXE% build_service_exe.py
copy /y "%JARVIS_DIR%service.exe" "%ROOT_DIR%service.exe" >nul 2>nul

echo.
echo ===============================================================
echo  [SUCCESS] All Jarvis Executables successfully built!
echo  [সফল] সকল জারভিস ইএক্সই (EXE) সফলভাবে তৈরি সম্পন্ন হয়েছে!
echo.
echo  - Jarvis.exe:  %JARVIS_DIR%Jarvis.exe
echo  - service.exe: %JARVIS_DIR%service.exe
echo ===============================================================
echo.
pause
