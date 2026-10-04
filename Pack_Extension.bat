@echo off
title Jarvis - Pack Extension v2.0
color 0B

echo ==========================================================
echo   JARVIS SURVEY COPILOT - EXTENSION PACKER v2.0
echo   Gemini 2.5 Flash + OpenRouter Support
echo ==========================================================
echo.

set ROOT_DIR=%~dp0
set EXT_DIR=%ROOT_DIR%Jarvis_Survey_Extension
set PEM_FILE=%ROOT_DIR%Jarvis_Survey_Extension.pem
set OUT_CRX=%ROOT_DIR%Jarvis_Survey_Extension.crx

echo [1] Checking Chrome installation...

set CHROME_EXE=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  set "CHROME_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
  set "CHROME_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

if not defined CHROME_EXE (
  echo ERROR: Chrome/Edge not found! Cannot pack .crx
  echo.
  echo MANUAL LOAD INSTRUCTIONS:
  echo 1. Open Chrome ^> chrome://extensions
  echo 2. Enable Developer Mode (top right toggle)
  echo 3. Click "Load unpacked" 
  echo 4. Select folder: %EXT_DIR%
  pause
  exit /b 1
)

echo [2] Found browser: %CHROME_EXE%
echo [3] Packing extension...

if exist "%OUT_CRX%" del /f /q "%OUT_CRX%"

if exist "%PEM_FILE%" (
  "%CHROME_EXE%" --pack-extension="%EXT_DIR%" --pack-extension-key="%PEM_FILE%" --no-message-box
) else (
  "%CHROME_EXE%" --pack-extension="%EXT_DIR%" --no-message-box
)

echo.
echo ==========================================================
echo   DONE! Extension packed.
echo.
echo   To INSTALL in Chrome:
echo   1. Open chrome://extensions
echo   2. Enable Developer Mode
echo   3. Drag and drop: %OUT_CRX%
echo      OR click "Load unpacked" and select: %EXT_DIR%
echo ==========================================================
pause
