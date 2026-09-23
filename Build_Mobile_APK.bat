@echo off
title Jarvis Mobile Android - APK Builder
color 0A

echo ===============================================================
echo          JARVIS MOBILE ANDROID - APK COMPILATION UTILITY
echo ===============================================================
echo.

set ROOT_DIR=%~dp0
set MOBILE_DIR=%ROOT_DIR%Jarvis_Mobile_Android

if not defined JAVA_HOME (
    if exist "C:\Program Files\Java\jdk-27" (
        set "JAVA_HOME=C:\Program Files\Java\jdk-27"
    )
)

echo [1/3] Java Environment:
echo       JAVA_HOME: %JAVA_HOME%
echo.

cd /d "%MOBILE_DIR%"

echo [2/3] Building Android APK...
call build_apk.bat

echo.
echo [3/3] Checking output APK...
if exist "%MOBILE_DIR%\app\build\outputs\apk\debug\app-debug.apk" (
    copy /y "%MOBILE_DIR%\app\build\outputs\apk\debug\app-debug.apk" "%ROOT_DIR%Jarvis_Mobile.apk" >nul 2>&1
    echo.
    echo ===============================================================
    echo  [SUCCESS] Mobile APK successfully compiled!
    echo  [সফল] মোবাইল এপিকে (APK) সফলভাবে তৈরি সম্পন্ন হয়েছে!
    echo.
    echo  Location: %ROOT_DIR%Jarvis_Mobile.apk
    echo ===============================================================
)

echo.
