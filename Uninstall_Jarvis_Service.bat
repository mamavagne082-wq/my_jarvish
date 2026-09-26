@echo off
title Jarvis AI Assistant - Service Uninstaller
color 0C

echo ===============================================================
echo          JARVIS AI ASSISTANT - SERVICE UNINSTALLER
echo ===============================================================
echo.
echo Removing Jarvis Background Auto-Start Service...
echo.

set ROOT_DIR=%~dp0
if exist "%ROOT_DIR%Jarvis\service.exe" (
    "%ROOT_DIR%Jarvis\service.exe" --uninstall
) else if exist "%ROOT_DIR%service.exe" (
    "%ROOT_DIR%service.exe" --uninstall
) else (
    python "%ROOT_DIR%service.py" --uninstall
)

echo.
pause
