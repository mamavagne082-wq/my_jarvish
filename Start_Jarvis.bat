@echo off
title Jarvis AI Assistant - Auto Screen Vision
color 0B

echo =======================================================
echo          JARVIS AI ASSISTANT - STARTING UP
echo      Zero-Prompt Automatic Screen Vision Active
echo =======================================================
echo.

set ROOT_DIR=%~dp0
if exist "%ROOT_DIR%Jarvis\Jarvis_code" (
    set JARVIS_ROOT=%ROOT_DIR%Jarvis\
) else (
    set JARVIS_ROOT=%ROOT_DIR%
)

echo [1/3] Checking environment...
if exist "%JARVIS_ROOT%Jarvis_code\venv\Scripts\python.exe" (
    set PYTHON_CMD="%JARVIS_ROOT%Jarvis_code\venv\Scripts\python.exe"
) else if exist "%JARVIS_ROOT%venv\Scripts\python.exe" (
    set PYTHON_CMD="%JARVIS_ROOT%venv\Scripts\python.exe"
) else (
    set PYTHON_CMD=python
)

echo [2/3] Starting Jarvis Python Vision Agent...
start "Jarvis-Agent-Backend" cmd /k "cd /d "%JARVIS_ROOT%Jarvis_code" && %PYTHON_CMD% agent.py dev"

echo [3/3] Starting Jarvis Frontend UI...
cd /d "%JARVIS_ROOT%agent-starter-react"
start "Jarvis-Frontend-UI" cmd /k "cd /d "%JARVIS_ROOT%agent-starter-react" && npm run next:dev"

echo.
echo Waiting for servers to initialize...
timeout /t 4 /nobreak >nul

echo Opening Jarvis Interface in browser...
start https://localhost:3000

echo.
echo =======================================================
echo   Jarvis is now running!
echo   - Backend Agent & Frontend Web UI are both launched
echo   - Voice Assistant: Ready
echo =======================================================
timeout /t 5 >nul
exit
