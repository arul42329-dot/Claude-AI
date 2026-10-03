#!/usr/bin/env sh
# Small, source-controlled Gradle launcher. Android Studio can import this project directly.
# If Gradle is installed globally, it is used; otherwise a standard wrapper JAR can be placed
# at gradle/wrapper/gradle-wrapper.jar by Android Studio/your build environment.
if command -v gradle >/dev/null 2>&1; then
  exec gradle "$@"
fi
if [ -f "$(dirname "$0")/gradle/wrapper/gradle-wrapper.jar" ] && command -v java >/dev/null 2>&1; then
  exec java -classpath "$(dirname "$0")/gradle/wrapper/gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain "$@"
fi
echo "Gradle is not installed. Import this project into Android Studio, or install Gradle 8.9 and JDK 17." >&2
exit 1
