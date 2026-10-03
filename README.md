# JARVIS — private, local Android voice assistant

JARVIS is a Kotlin Android application for practical, **local-first** phone assistance. It has no account flow, cloud backend, API key, analytics SDK, ads, Internet permission, or paid speech service. Settings, command history, and preferences stay in the app's private Android storage; raw microphone recordings are never written by JARVIS.

> **Important Android boundary:** JARVIS only uses public Android APIs. It will never root a device, use hidden APIs, bypass a security screen, quietly drive another app, or claim that a restricted setting was changed when Android did not permit it.

## What is implemented

- Futuristic dark JARVIS interface with visible `IDLE`, `LISTENING`, `THINKING`, `EXECUTING`, and `SPEAKING` states
- Manual microphone activation, partial transcription, transcript, last response, and local history
- Android on-device speech recognition on Android 12+ when the device supplies it; offline-preferred device recognition fallback on older devices
- Local Android `TextToSpeech`, with English (`en-IN`) and Tamil (`ta-IN`) selection and a visible explanation if the device has no voice installed
- Rule-based, extensible command registry with English, Tamil script, and Tamil-English mixed aliases
- Installed-app discovery through launcher intents (for example YouTube, WhatsApp, Instagram, Chrome, or any visible launcher app)
- Public Android intents for Settings, Wi-Fi, Bluetooth, mobile network, display, battery, sound, camera, browser, alarms, timers, and reviewed SMS drafts
- Private local reminders delivered with Android `AlarmManager`/notifications (and restored after reboot), battery level, media volume, basic media-key controls, clipboard reading while the app is foregrounded, contacts lookup/calling after permission, and optional notification reading
- Optional, clearly disclosed **JARVIS Accessibility Service** for only explicit tap-by-visible-text, scroll, Back, Home, and read-screen requests
- Privacy screen with microphone, contacts, phone, accessibility, notification access, history size, local-data clearing, and no-recording disclosure
- Configurable assistant name, wake phrase label, default language, response language, voice rate/pitch, auto-listening while the app is open, and history controls

## Project layout

```text
app/src/main/java/com/jarvis/offline/
├── MainActivity.kt                  # voice → parse → action → spoken response pipeline
├── SettingsActivity.kt
├── PrivacyActivity.kt
├── core/
│   ├── CommandParser.kt             # local aliases and command registry
│   ├── CommandExecutor.kt           # public Android actions + honest failures
│   └── AssistantPreferences.kt      # private SharedPreferences/history
├── voice/                           # platform SpeechRecognizer and TextToSpeech
├── device/                          # app, contacts, and permission/access resolvers
├── accessibility/                   # optional disclosed service
└── notifications/                   # optional listener; latest item is RAM-only
```

## Requirements

- Android Studio Ladybug or newer (or Android Studio with AGP 8.7 support)
- JDK 17
- Android SDK Platform 35 / Build Tools installed in Android Studio
- Phone running Android 8.0 (API 26) or newer

The project uses Android Gradle Plugin **8.7.3**, Kotlin **2.0.21**, `compileSdk 35`, `targetSdk 35`, and `minSdk 26`. It intentionally has no third-party runtime dependencies.

## Open and build

1. Clone/open this repository in **Android Studio**: **File → Open** → choose the repository root (`Claude-AI`).
2. Let Android Studio install/sync Android SDK Platform 35 and JDK 17 if it prompts.
3. Select the `app` configuration and choose **Build → Build APK(s)**.
4. The debug APK is created at:

   ```text
   app/build/outputs/apk/debug/app-debug.apk
   ```

5. To build at a terminal with JDK 17 and Gradle 8.9 available:

   ```bash
   ./gradlew assembleDebug
   ./gradlew test
   ```

   The source-controlled `gradlew` launcher uses a locally installed Gradle when available; Android Studio can also manage the configured Gradle distribution from `gradle/wrapper/gradle-wrapper.properties`. The local parser test suite covers English, Tamil-English mixed, wake-phrase, alarm/timer, reminder, message-draft, and Tamil-script command routing.

## Install on a phone

1. Enable **Developer options → USB debugging**, or copy `app-debug.apk` to the device.
2. Install with Android Studio's Run button, Android's package installer, or:

   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

3. Open **JARVIS**. It works without sign-in and does not ask for an Internet connection.

## First-time permission setup

### Microphone

1. Tap **TALK**.
2. Read the disclosure and tap **Allow** for microphone access.
3. JARVIS only starts listening after this direct action. It does not keep a hidden background microphone or save raw audio.

### Contacts and phone calls

These are not requested at launch. Say a command such as `Call amma` or `Find contact Ravi`; JARVIS explains why it needs the relevant permission before Android shows the permission sheet.

### Accessibility Service (optional)

1. Open **Privacy & access** in JARVIS.
2. Tap **Learn & enable accessibility** and read the clear purpose disclosure.
3. Choose **JARVIS Accessibility Service** in Android's Accessibility settings and enable it.
4. Only then can requests such as `tap Continue`, `scroll down`, `go back`, `go home`, or `read screen` work.

The service is not disguised and performs no automatic/background UI workflow. Android continues to show that the service is enabled.

### Notification access (optional)

1. Open **Privacy & access**.
2. Tap **Enable notification access**, read the explanation, then use Android's notification-access settings.
3. When you explicitly ask `read notifications`, JARVIS reads the latest non-empty notification that its listener has observed. The listener keeps this latest item only in RAM and does not add it to storage on its own.

## Offline English and Tamil speech

JARVIS itself contains no web call and requests `EXTRA_PREFER_OFFLINE` from Android's recognizer.

- On **Android 12+**, if the device exposes Android's on-device recognizer, JARVIS creates that recognizer and the UI reports **On-device recognition active**.
- On devices that do not expose it, JARVIS uses the system recognizer in offline-preferred mode. Install the appropriate offline language pack for fully offline recognition; menu names vary by manufacturer. Look for **Settings → System → Languages & input → On-device speech recognition / Speech recognition & synthesis / Offline speech recognition**, then download **English (India)** and **Tamil (India)** where provided.
- For spoken replies, open **Settings → Text-to-speech output** and install/select an offline voice for **English (India)** and **Tamil (India)**. If Tamil TTS is missing, JARVIS keeps the Tamil response on screen and clearly says that the device voice needs installing.
- If an offline recognizer or language pack is absent, JARVIS explains the problem instead of silently treating cloud recognition as a requirement.

No fully offline Tamil model is bundled because Android vendors ship different legal/device-specific speech engines and model sizes. The speech layer is isolated in `voice/SpeechInput.kt`, so an organization can add a legally licensed on-device engine/model later without changing the command parser or privacy architecture.

## Try these commands

### English

- `Hi JARVIS`
- `Who are you?`
- `What can you do?`
- `Open YouTube`
- `Open Instagram`
- `Open settings`
- `Open Wi-Fi settings`
- `Open Bluetooth settings`
- `Open camera`
- `Battery percentage`
- `Set alarm 6 AM`
- `Set timer 5 minutes`
- `Remind me to drink water in 10 minutes`
- `Send message to Ravi saying I will call you soon` (opens a reviewable SMS draft; it never sends silently)
- `Volume up`
- `Call Ravi` (after the requested permissions)

### Tamil / Tamil-English mix

- `WhatsApp open pannu`
- `Bluetooth on pannu`
- `Camera open pannu`
- `Settings open pannunga`
- `WiFi settings open pannu`
- `Volume konjam increase pannu`
- `Alarm set pannu 6 AM`
- `Battery percentage enna?`
- `நான் யார்?` / `நீங்கள் யார்?`
- `கேமரா திற`

The parser intentionally accepts casual aliases rather than requiring a rigid grammar. Add new local aliases or commands in `core/CommandParser.kt`; implement their public Android action and truthful response in `core/CommandExecutor.kt`.

## Android capability limits (handled honestly)

Some controls are intentionally restricted by Android/OEM policy. For example, modern Android versions generally do not allow a normal app to directly enable mobile data or Wi-Fi. For those requests JARVIS opens the appropriate system settings page and explains why. App launch availability can also vary because Android package visibility returns only launchable/visible apps. Calls, accessibility operations, notifications, and media control are only attempted with the appropriate user-granted access.

The configurable wake phrase is currently used while JARVIS is actively listening. Continuous background hotword detection is deliberately not enabled: Android background microphone rules vary, and avoiding an always-on foreground microphone protects battery and privacy. Manual **TALK** remains available on every supported device.

## Privacy summary

- No `INTERNET` permission is declared.
- No API key, server, account, cloud database, analytics SDK, ad SDK, or external database is used.
- Shared preferences/history are private app storage and can be cleared from **Privacy & access**.
- JARVIS retains short command/response text history only; it never writes raw microphone recordings.
- Sensitive sources are accessed only after the user invokes a related feature and grants Android permission/special access.
- Android's own speech and TTS packages are system components; their independent privacy settings remain under the device owner's control.
