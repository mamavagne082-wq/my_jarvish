@echo off
title Jarvis - Windows Auto-Start Setup
color 0A

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_DIR%\JarvisService.lnk
set ROOT_DIR=%~dp0
if exist "%ROOT_DIR%Jarvis.exe" (
    set JARVIS_EXE="%ROOT_DIR%Jarvis.exe"
) else if exist "%ROOT_DIR%Jarvis\Jarvis.exe" (
    set JARVIS_EXE="%ROOT_DIR%Jarvis\Jarvis.exe"
) else (
    set JARVIS_EXE=
)

if exist "%ROOT_DIR%service.exe" (
    set SERVICE_EXE="%ROOT_DIR%service.exe"
) else if exist "%ROOT_DIR%Jarvis\service.exe" (
    set SERVICE_EXE="%ROOT_DIR%Jarvis\service.exe"
) else (
    set SERVICE_EXE=
)

:MENU
cls
echo ===============================================================
echo          JARVIS AI ASSISTANT - WINDOWS AUTO-START SETUP
echo ===============================================================
echo.
if exist "%SHORTCUT_PATH%" (
    echo  Current Status: [ ENABLED ] - Jarvis Service starts on PC boot
    echo  অবস্থা: [ সক্রিয় ] - পিসি চালু হলেই জারভিস ব্যাকগ্রাউন্ডে চালু হবে
) else (
    echo  Current Status: [ DISABLED ] - Jarvis does not auto-start
    echo  অবস্থা: [ নিষ্ক্রিয় ] - পিসি চালু হলে জারভিস অটো-স্টার্ট হবে না
)
echo.
echo ---------------------------------------------------------------
echo  [1] Enable Jarvis Auto-Start on Windows Boot (অটো-স্টার্ট চালু করুন)
echo  [2] Disable Jarvis Auto-Start (অটো-স্টার্ট বন্ধ করুন)
echo  [3] Launch Jarvis Service Right Now (এখনই ব্যাকগ্রাউন্ডে চালু করুন)
echo  [4] Check Service Status (সার্ভিস অবস্থা দেখুন)
echo  [5] Exit (বাহির হন)
echo ---------------------------------------------------------------
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto ENABLE
if "%choice%"=="2" goto DISABLE
if "%choice%"=="3" goto LAUNCH_NOW
if "%choice%"=="4" goto STATUS
if "%choice%"=="5" goto EXIT

echo Invalid choice. Please enter 1-5.
timeout /t 2 >nul
goto MENU

:ENABLE
echo.
if defined JARVIS_EXE (
    echo Registering Jarvis.exe for Windows startup...
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "JarvisAssistant" /t REG_SZ /d %JARVIS_EXE% /f >nul 2>&1
)
if defined SERVICE_EXE (
    %SERVICE_EXE% --install
) else (
    python "%ROOT_DIR%service.py" --install
)
echo [SUCCESS] Auto-start successfully enabled!
pause
goto MENU

:DISABLE
echo.
if defined JARVIS_EXE (
    reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "JarvisAssistant" /f >nul 2>&1
)
if defined SERVICE_EXE (
    %SERVICE_EXE% --uninstall
) else (
    python "%ROOT_DIR%service.py" --uninstall
)
echo [SUCCESS] Auto-start disabled.
pause
goto MENU

:LAUNCH_NOW
echo.
echo Starting Jarvis in background...
if defined JARVIS_EXE (
    start "" %JARVIS_EXE%
) else if defined SERVICE_EXE (
    start "" %SERVICE_EXE%
) else (
    start "" python "%ROOT_DIR%service.py"
)
echo Jarvis has been started! Say 'Hey Jarvis' or 'হে জারভিস' to bring up the UI.
timeout /t 3 >nul
goto MENU

:STATUS
echo.
if defined SERVICE_EXE (
    %SERVICE_EXE% status
) else (
    python "%ROOT_DIR%service.py" status
)
pause
goto MENU

:EXIT
exit
