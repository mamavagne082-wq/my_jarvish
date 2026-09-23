@echo off
title Jarvis Extension Local Bridge Server
cd /d "%~dp0"
echo ========================================================
echo   JARVIS SURVEY EXTENSION - LOCAL BRIDGE SERVER
echo ========================================================
echo Starting local bridge on http://127.0.0.1:8765 ...
echo (Press Ctrl+C to stop)
echo.

python jarvis_extension_bridge.py
pause
