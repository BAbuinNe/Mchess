---
name: mchess-testing
description: Use when adding, selecting, configuring, or diagnosing MChess checks and test automation.
---

# MChess testing

- Install from the root lockfile with `npm ci`; build both workspaces with `npm run build`.
- Focused scripts are exposed in the root `package.json` as `test:*`; browser scenarios use Playwright Chromium.
- Server scenarios that launch `apps/server/dist/main.js` require a fresh build first.
- CI sets `MCHESS_BROWSER` to Playwright's installed Chromium. On Windows, set that variable if Chrome is not at the script's default location.
- Keep test data isolated and temporary. Inspect generated artifacts and the working tree after a run.
- Report the exact command, result, and any skipped prerequisite; never describe an unrun check as passing.
