# JARWIS — Native Android application

JARWIS is now implemented as a native Android app in `android-app/` rather than as a website.

## Build and install

Open `android-app/` in Android Studio, let Gradle sync, then run it on an Android phone or emulator. The app targets Android 8.0+ and uses the native Android SpeechRecognizer API.

```bash
# From the android-app directory, with Android Studio/Gradle installed
gradle assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Native capabilities in this version

- Native Android portrait application
- JARWIS voice command button using microphone permission
- Quick actions for calls, messages, music, timers, and maps
- Android intents to open the appropriate system app
- Confirmation dialog before opening the phone dialer
- Recent activity display
- No backend or paid API required for the included voice recognition

## Device-control boundary

Android does not allow an ordinary app to silently take complete control of a phone. Calls, messages, contacts, camera, location, accessibility, notifications, and settings each have separate platform restrictions and user-granted permissions. This app uses safe Android intents and asks before sensitive actions. A future production version can add specific integrations, but it should not bypass Android security or execute consequential actions without the user's approval.
