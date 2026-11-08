# MChess project status

**Last checked:** 2026-11-08  
**Baseline:** GitHub `main` README and workspace manifests. Update this file after checking the affected code; this is a compact handoff, not a substitute for source inspection.

## Documented as implemented
- Russian-language React/Vite web app and Capacitor Android packaging.
- Local chess games, PGN history/import/export, and legal-move handling through `chess.js`.
- Stockfish 19 Lite in a browser worker for play and current-position analysis.
- Training positions, coach UI/media, and a PWA service worker.
- Fastify API and WebSocket support for private online rooms, matchmaking/profile features, and shared game state.
- Root build command and focused Playwright E2E scripts.

These items are based on the repository README and manifests; verify a feature in code before making a change that depends on its detailed behavior.

## Documented as incomplete or requiring verification
- Public hosting and production-ready persistent database setup.
- Broader academy/content coverage and full game analysis.
- Android release signing and device-level release verification.
- Coach media attribution/permission review before public distribution.
- Any feature whose README description may have changed since this status note.

## Current verification entry
- GitHub Actions run on Ubuntu: `npm ci`, Playwright setup, and `npm run build` passed.
- The E2E run stopped in `tests/board.e2e.mjs`: after a bot-game move, the test timed out waiting for `.move-feedback`. No application code changed in this PR; the result does not establish whether the failure is platform-specific.
- The workflow now uses Windows, matching the test scripts' default Chrome path/platform assumptions. Confirm its next Actions result before treating E2E as green.

## Handoff format
For meaningful project work, append or replace a short entry with:
- verified change and affected area;
- exact checks run and their result;
- unresolved blocker or decision;
- next concrete step.

Keep this file concise and factual. Do not copy full chat transcripts or speculative feature plans into it.
