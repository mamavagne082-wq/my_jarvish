@echo off
title Jarvis Android Mobile APK Builder
color 0B

echo ===============================================================
echo          JARVIS MOBILE ANDROID - APK BUILD UTILITY
echo ===============================================================
echo.

cd /d "%~dp0"

if not defined JAVA_HOME (
    if exist "C:\Program Files\Java\jdk-27" (
        set "JAVA_HOME=C:\Program Files\Java\jdk-27"
    )
)

echo [1/3] Checking Java / JDK installation...
java -version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Java Development Kit (JDK 17+) is required to compile APK.
    echo Please install JDK 17+ or open this project in Android Studio.
    echo.
    pause
    exit /b 1
)

echo [2/3] Checking Android SDK / Gradle...
if exist "gradlew.bat" (
    echo Running Gradle Build...
    call gradlew.bat assembleDebug
) else (
    echo Gradle wrapper not found. Checking system gradle...
    where gradle >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        gradle assembleDebug
    ) else (
        echo [INFO] You can build the APK easily:
        echo 1. Open the "Jarvis_Mobile_Android" folder in Android Studio.
        echo 2. Click Build ^> Build Bundle(s) / APK(s) ^> Build APK(s).
        echo 3. The APK will be ready instantly to transfer to your phone!
        pause
        exit /b 0
    )
)

echo.
echo ===============================================================
echo [SUCCESS] Build Process Finished!
echo Check app\build\outputs\apk\debug\ for your Jarvis_Mobile.apk
echo ===============================================================
pause
