@echo off
title Jarvis AI Assistant - Standalone EXE Builder
color 0B

echo ===============================================================
echo          JARVIS AI ASSISTANT - EXE COMPILATION UTILITY
echo ===============================================================
echo.

set ROOT_DIR=%~dp0
if exist "%ROOT_DIR%Jarvis\Jarvis_code" (
    set JARVIS_CODE_DIR=%ROOT_DIR%Jarvis\Jarvis_code
) else (
    set JARVIS_CODE_DIR=%ROOT_DIR%Jarvis_code
)

echo [1/4] Locating Python Environment...
if exist "%JARVIS_CODE_DIR%\venv\Scripts\python.exe" (
    set PYTHON_EXE="%JARVIS_CODE_DIR%\venv\Scripts\python.exe"
) else if exist "%ROOT_DIR%venv\Scripts\python.exe" (
    set PYTHON_EXE="%ROOT_DIR%venv\Scripts\python.exe"
) else (
    set PYTHON_EXE=python
)
echo       Using Python: %PYTHON_EXE%

echo.
echo [2/4] Verifying PyInstaller...
%PYTHON_EXE% -m pip install --quiet pyinstaller

echo.
echo [3/4] Compiling Jarvis Python Agent into Standalone EXE...
cd /d "%JARVIS_CODE_DIR%"
%PYTHON_EXE% build_agent_exe.py

echo.
echo [4/4] Finalizing Executables...
if exist "%JARVIS_CODE_DIR%\dist\JarvisAgent\JarvisAgent.exe" (
    echo.
    echo ===============================================================
    echo  [SUCCESS] Jarvis Standalone EXE successfully built!
    echo  [সফল] জারভিস ইএক্সই (EXE) সফলভাবে তৈরি সম্পন্ন হয়েছে!
    echo.
    echo  Location: %JARVIS_CODE_DIR%\dist\JarvisAgent\JarvisAgent.exe
    echo ===============================================================
) else (
    echo [ERROR] EXE build could not be verified. Please check logs above.
)

echo.
pause
