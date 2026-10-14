@echo off
title Jarvis AI Assistant - Auto Screen Vision
color 0B

echo =======================================================
echo          JARVIS AI ASSISTANT - STARTING UP
echo      Zero-Prompt Automatic Screen Vision Active
echo =======================================================
echo.

set ROOT_DIR=%~dp0
if exist "%ROOT_DIR%Jarvis.exe" (
    echo Starting Native Jarvis.exe Desktop Core...
    start "" "%ROOT_DIR%Jarvis.exe"
    exit /b 0
)
if exist "%ROOT_DIR%Jarvis\Jarvis.exe" (
    echo Starting Native Jarvis.exe Desktop Core...
    start "" "%ROOT_DIR%Jarvis\Jarvis.exe"
    exit /b 0
)

echo Compiling Jarvis.exe Native Executable...
call "%ROOT_DIR%Build_Jarvis_EXE.bat"
if exist "%ROOT_DIR%Jarvis.exe" (
    start "" "%ROOT_DIR%Jarvis.exe"
    exit /b 0
)

echo [ERROR] Jarvis.exe could not be started.
pause

