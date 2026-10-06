@echo off
title Jarvis - Pack Extension v2.5
color 0B

echo ==========================================================
echo   JARVIS SURVEY COPILOT - EXTENSION PACKER v2.5
echo   Gemini Flash + OpenRouter + Multi-Key Support
echo ==========================================================
echo.

set "ROOT_DIR=%~dp0"
set "EXT_DIR=%ROOT_DIR%Jarvis_Survey_Extension"
set "PEM_FILE=%ROOT_DIR%Jarvis_Survey_Extension.pem"
set "OUT_CRX=%ROOT_DIR%Jarvis_Survey_Extension.crx
set "OUT_ZIP=%ROOT_DIR%Jarvis_Survey_Extension.zip

echo [1] Locating browser executable...

set "BROWSER_EXE="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" set "BROWSER_EXE=C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"

if defined BROWSER_EXE (
  echo [2] Browser detected: "%BROWSER_EXE%"
  echo [3] Packing CRX bundle...
  if exist "%OUT_CRX%" del /f /q "%OUT_CRX%"
  if exist "%PEM_FILE%" (
    "%BROWSER_EXE%" --pack-extension="%EXT_DIR%" --pack-extension-key="%PEM_FILE%" --no-message-box
  ) else (
    "%BROWSER_EXE%" --pack-extension="%EXT_DIR%" --no-message-box
  )
) else (
  echo [2] Chrome / Edge browser not detected for direct CRX packing.
)

echo [4] Creating ZIP package for easy loading...
powershell -NoProfile -Command "if (Test-Path '%OUT_ZIP%') { Remove-Item -Force '%OUT_ZIP%' }; Get-ChildItem -Path '%EXT_DIR%' -Exclude '__pycache__','*.pyc' | Compress-Archive -DestinationPath '%OUT_ZIP%' -Force"


echo.
echo ==========================================================
echo   SUCCESS! Extension is packaged and ready.
echo.
echo   HOW TO INSTALL / REFRESH IN BROWSER:
echo   1. Open Chrome ^> chrome://extensions
echo   2. Enable 'Developer mode' (top-right switch)
echo   3. Click 'Load unpacked' and select:
echo      %EXT_DIR%
echo      (Or click the Reload icon on Jarvis Survey Copilot)
echo ==========================================================
if "%~1"=="/nopause" goto end
if "%~1"=="--no-pause" goto end
pause
:end
