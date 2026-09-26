@echo off
title Jarvis AI Assistant - Service Auto-Start Installer
color 0A

echo ===============================================================
echo          JARVIS AI ASSISTANT - PERMANENT SERVICE INSTALLER
echo ===============================================================
echo.
echo Installing Jarvis Background Service to run 24/7 permanently...
echo পিসির ব্যাকগ্রাউন্ডে স্বয়ংক্রিয়ভাবে চালু থাকার জন্য সার্ভিস ইনস্টল হচ্ছে...
echo.

set ROOT_DIR=%~dp0
if exist "%ROOT_DIR%Jarvis\service.exe" (
    set SERVICE_EXE="%ROOT_DIR%Jarvis\service.exe"
) else if exist "%ROOT_DIR%service.exe" (
    set SERVICE_EXE="%ROOT_DIR%service.exe"
) else (
    set SERVICE_EXE=
)

if defined SERVICE_EXE (
    %SERVICE_EXE% --install
) else (
    if exist "%ROOT_DIR%Jarvis\venv\Scripts\python.exe" (
        set PY="%ROOT_DIR%Jarvis\venv\Scripts\python.exe"
    ) else if exist "%ROOT_DIR%venv\Scripts\python.exe" (
        set PY="%ROOT_DIR%venv\Scripts\python.exe"
    ) else (
        set PY=python
    )
    %PY% "%ROOT_DIR%service.py" --install
)

echo.
pause
