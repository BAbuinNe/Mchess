# MChess contributor guidance

## Read first
- Read `ARCHITECTURE.md` before changing cross-app behavior.
- Read `PROJECT_STATUS.md` before planning work; update it when verified project state or next priorities change.
- Use the focused skill in `.agents/skills/` for UI, chess rules, tests, release, debugging, performance, or context work.

## Project constraints
- This is an npm workspace with `apps/web` and `apps/server`. Use the repository's existing React, TypeScript, Vite, Fastify, Capacitor, and `chess.js` patterns.
- Keep `chess.js` authoritative for legal moves on both client and server. Do not duplicate chess rules for convenience.
- Preserve the Russian interface and mobile-first layout.
- Treat supplied coach images, audio, and video as user-provided assets. Do not replace, regenerate, or redistribute them without a task-specific reason.
- Never commit secrets, local environment files, generated APKs, temporary test data, or unrelated working-tree changes.
- Prefer the smallest change that completes the request. Do not install a dependency when the current stack can do the job.

## Verification
- For code changes, run the focused E2E scenario from `package.json` and `npm run build` when practical.
- Server E2E scenarios require a fresh build first because they launch `apps/server/dist/main.js`.
- Browser E2E scenarios use Playwright Chromium. On Windows, set `MCHESS_BROWSER` if Chrome is not at the script's default path. In CI, use the Playwright-installed Chromium executable.
- Before reporting a test pass, report the command and its actual result. If a test cannot run, state the specific missing prerequisite.
- For documentation-only changes, check paths, commands, and Markdown structure; do not claim runtime behavior was tested.

## Keep context useful
At the end of a meaningful task, update `PROJECT_STATUS.md` with only verified changes, checks, blockers, and the next concrete step. Keep durable project facts in repository files rather than relying on chat history.
