@echo off
rem Small source-controlled Gradle launcher. Android Studio can import this project directly.
where gradle >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  gradle %*
  exit /b %ERRORLEVEL%
)
if exist "%~dp0gradle\wrapper\gradle-wrapper.jar" (
  java -classpath "%~dp0gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
  exit /b %ERRORLEVEL%
)
echo Gradle is not installed. Import this project into Android Studio, or install Gradle 8.9 and JDK 17.
exit /b 1
