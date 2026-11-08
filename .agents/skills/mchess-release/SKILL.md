---
name: mchess-release
description: Use when preparing a web, server, container, or Android MChess release.
---

# MChess release

- Review `README.md`, `PROJECT_STATUS.md`, and `apps/web/public/engine/Copying.txt` before packaging.
- Run `npm run build` and relevant online/static E2E checks.
- Android packaging uses Capacitor and requires the documented JDK/Android SDK setup; distinguish debug APKs from signed release builds.
- Hosted online play needs HTTPS, WebSockets, and persistent storage for the configured data directory.
- Check coach media provenance and third-party licenses. Do not publish user media by assumption.
- State the tested artifact, platform, and remaining release blockers.
