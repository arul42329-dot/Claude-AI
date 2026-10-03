# JARWIS

A mobile-first personal AI companion interface.

## Run locally

Serve the repository with any static server, for example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173` on a phone or desktop browser.

## What is included

- Responsive mobile UI with voice-first command surface
- Browser Speech Recognition integration when supported by the device/browser
- Quick actions and a local activity feed
- PWA manifest for adding the interface to a home screen
- Privacy-first confirmation language for sensitive actions

## Important platform limitation

A normal web app cannot take complete control of a phone or bypass operating-system permission prompts. iOS and Android only expose specific capabilities to apps, and both require user-granted permissions. This prototype intentionally does not pretend to silently control calls, messages, camera, contacts, or other sensitive data. A production native app would need explicit platform integrations, a visible permission flow, and confirmation before consequential actions.
