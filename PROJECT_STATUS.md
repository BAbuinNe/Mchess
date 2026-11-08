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
- GitHub Actions on both Ubuntu and Windows: dependency installation, Playwright setup, and `npm run build` passed.
- On both runners, E2E stopped in `tests/board.e2e.mjs` after a bot-game move because `.move-feedback` did not appear within 45 seconds.
- This PR changes no application source. The test failure remains unresolved; do not report the E2E suite as passing.
- Next step: inspect why the bot/position-analysis flow does not produce `.move-feedback` in the browser test, then rerun the focused scenario and full suite.

## Handoff format
For meaningful project work, append or replace a short entry with:
- verified change and affected area;
- exact checks run and their result;
- unresolved blocker or decision;
- next concrete step.

Keep this file concise and factual. Do not copy full chat transcripts or speculative feature plans into it.
