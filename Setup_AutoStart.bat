@echo off
title Jarvis - Windows Auto-Start Setup
color 0A

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_DIR%\Jarvis_AutoStart.lnk
set TARGET_SCRIPT=%~dp0Jarvis_Background_Silent.vbs

:MENU
cls
echo ===============================================================
echo          JARVIS AI ASSISTANT - WINDOWS AUTO-START SETUP
echo ===============================================================
echo.
if exist "%SHORTCUT_PATH%" (
    echo  Current Status: [ ENABLED ] - Jarvis starts on PC boot
    echo  অবস্থা: [ সক্রিয় ] - পিসি চালু হলেই জারভিস স্বয়ংক্রিয়ভাবে চালু হবে
) else (
    echo  Current Status: [ DISABLED ] - Jarvis does not auto-start
    echo  অবস্থা: [ নিষ্ক্রিয় ] - পিসি চালু হলে জারভিস অটো-স্টার্ট হবে না
)
echo.
echo ---------------------------------------------------------------
echo  [1] Enable Jarvis Auto-Start on Windows Boot (অটো-স্টার্ট চালু করুন)
echo  [2] Disable Jarvis Auto-Start (অটো-স্টার্ট বন্ধ করুন)
echo  [3] Launch Jarvis Right Now (এখনই জারভিস চালু করুন)
echo  [4] Exit (বাহির হন)
echo ---------------------------------------------------------------
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" goto ENABLE
if "%choice%"=="2" goto DISABLE
if "%choice%"=="3" goto LAUNCH_NOW
if "%choice%"=="4" goto EXIT

echo Invalid choice. Please enter 1, 2, 3, or 4.
timeout /t 2 >nul
goto MENU

:ENABLE
echo.
echo Enabling Auto-Start on Windows Boot...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_SCRIPT%\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Jarvis AI Assistant Silent Auto-Start'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo.
    echo ===============================================================
    echo  [SUCCESS] Auto-Start is now ENABLED!
    echo  [সফল] অটো-স্টার্ট সফলভাবে চালু করা হয়েছে!
    echo  - পিসি রিস্টার্ট বা অন হওয়ামাত্রই জারভিস লাইভ ভয়েস মোডে চালু হবে।
    echo  - কোনো বাটন প্রেস করতে হবে না, মাইক দিয়ে সরাসরি কথা বলতে পারবেন।
    echo ===============================================================
) else (
    echo.
    echo [ERROR] Could not create startup shortcut.
)
echo.
pause
goto MENU

:DISABLE
echo.
if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%"
    echo ===============================================================
    echo  [SUCCESS] Auto-Start has been DISABLED.
    echo  [সফল] অটো-স্টার্ট সফলভাবে বন্ধ করা হয়েছে।
    echo ===============================================================
) else (
    echo Auto-Start was already disabled.
)
echo.
pause
goto MENU

:LAUNCH_NOW
echo.
echo Starting Jarvis in background...
start "" wscript.exe "%TARGET_SCRIPT%"
echo Jarvis has been started! Check your screen for the voice assistant.
timeout /t 3 >nul
goto MENU

:EXIT
exit
