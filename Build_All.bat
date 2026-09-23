@echo off
title Jarvis - Build EXE and APK Utility
color 0E

echo ===============================================================
echo          JARVIS - ALL-IN-ONE BUILD UTILITY (EXE + APK)
echo ===============================================================
echo.

set ROOT_DIR=%~dp0

echo ===============================================================
echo  STEP 1: Compiling Jarvis PC Standalone Executable (.exe)
echo ===============================================================
call "%ROOT_DIR%Build_Jarvis_EXE.bat"

echo.
echo ===============================================================
echo  STEP 2: Compiling Jarvis Android Mobile App (.apk)
echo ===============================================================
call "%ROOT_DIR%Build_Mobile_APK.bat"

echo.
echo ===============================================================
echo  ALL BUILD PROCESSES COMPLETED!
echo ===============================================================
pause
