# JARWIS — complete mobile voice agent

This repository now contains a native Android fallback and a full Flutter/LiveKit mobile client based on the referenced Jarvis voice-agent project.

## Project layout

- `flutter-app/` — the main cross-platform mobile application (Android/iOS)
- `agent-server/` — Python LiveKit agent with Gemini realtime voice and browser tools
- `android-app/` — small native Android fallback that works without a cloud agent

## Run the full app

### 1. Configure the agent server

```bash
cd agent-server
cp .env.example .env.local
# Add LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET and GOOGLE_API_KEY
uv sync
uv run playwright install chromium
uv run src/agent.py dev
```

The server must be running before the mobile client connects.

### 2. Configure the Flutter app

```bash
cd flutter-app
flutter pub get
mkdir -p assets
cat > assets/.env <<'EOF'
LIVEKIT_SANDBOX_ID=<your-livekit-sandbox-id>
LIVEKIT_AGENT_NAME=my-agent
LIVEKIT_AGENT_DEPLOYMENT=
# Or use your own secure token endpoint instead of LIVEKIT_SANDBOX_ID:
# LIVEKIT_TOKEN_ENDPOINT=https://your-domain.example.com/livekit/token
EOF
flutter run
```

Build an Android APK with:

```bash
flutter build apk --release
```

Do not put LiveKit API secrets or the Gemini API key in the Flutter app. The mobile app should receive short-lived room tokens from a backend/token endpoint.

## What the full app provides

- Native Android/iOS Flutter application
- Realtime two-way voice with LiveKit and Gemini
- Camera/audio controls
- JARWIS butler persona
- Browser automation through Playwright tools
- Confirmation gate for consequential browser actions
- Android microphone/camera/Bluetooth permissions declared by the Flutter client

## Device-control boundary

This can be a complete voice agent, but neither Android nor iOS allows an ordinary app to silently control every part of a phone. Calls, messages, contacts, location, camera, notifications, accessibility, and settings each have separate user-controlled restrictions. The included agent uses explicit integrations and confirmation rather than bypassing operating-system security. The current browser tools control a browser session, not the entire phone.
