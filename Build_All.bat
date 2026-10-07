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
echo  STEP 3: Packaging Jarvis Browser Extension (.crx + .zip)
echo ===============================================================
call "%ROOT_DIR%Pack_Extension.bat" --no-pause

echo.
echo ===============================================================
echo  [SUCCESS] ALL BUILDS & PACKAGES COMPLETED SUCCESSFULLY!
echo  1. Native Windows Executable: Jarvis.exe & service.exe
echo  2. Android Mobile Application: Jarvis_Mobile.apk
echo  3. Browser Extension: Jarvis_Survey_Extension.crx & .zip
echo ===============================================================
pause
