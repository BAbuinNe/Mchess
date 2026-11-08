# MChess architecture

## Product shape
MChess is a Russian-language chess app with a Vite web client, a Fastify server for online play and shared data, and an Android package built from the web client with Capacitor. The repository is a prototype; see `PROJECT_STATUS.md` for the currently documented scope and gaps.

## Workspace
- Root npm workspaces: `apps/web` and `apps/server`.
- Shared rules: `chess.js` is used by the browser client and server.
- Root scripts start both development processes, build both workspaces, and run focused end-to-end scenarios in `tests/`.

## Web client — `apps/web`
- React 19 + TypeScript, built and served by Vite.
- `apps/web/src/App.tsx` coordinates app screens and game flows. UI areas are split into focused components such as `ChessBoard.tsx`, `Training.tsx`, `GameReport.tsx`, `NewsCenter.tsx`, and `LiveEvaluation.tsx`.
- `chess.js` validates local moves and provides game state/notation. Stockfish runs in a browser worker through `engine.ts`; keep engine work off the UI thread.
- Static assets, Stockfish files, PWA manifest, and service worker live under `apps/web/public`.
- Capacitor's Android project packages the web app; native build tools are needed only for APK work.

## Server — `apps/server`
- Fastify 5 with CORS, static-file, and WebSocket plugins.
- Serves the built web client and API from one Node.js process; room and application data are stored beneath the configured data directory. Use a persistent volume for hosted deployments.
- Server-side chess validation uses `chess.js`; WebSocket messages carry live room state and game events.
- The server build is TypeScript compiled to `apps/server/dist`.

## Main data flow
1. Local games stay in the browser and use `chess.js`; browser storage preserves local progress and game history.
2. Online requests go from the web client to the API. Room updates and game events use WebSockets.
3. Stockfish analysis runs locally in a web worker and does not require the online server.
4. Android embeds the same web client; online features require a reachable HTTPS server.

## Build and verification
- Install: `npm ci` at the repository root.
- Build: `npm run build`.
- Focused browser/server E2E checks are listed in the root `package.json`; server E2E checks need a build first.
- CI installs Playwright Chromium and runs the build plus all `tests/*.e2e.mjs` scripts.

## Boundaries and deployment
- GitHub Pages can host static files but cannot run the Fastify/WebSocket server.
- Online hosting needs a Node-compatible process, HTTPS, WebSocket support, and persistent storage.
- Coach media and engine files have their own licensing/provenance requirements; consult the repository README before release.
