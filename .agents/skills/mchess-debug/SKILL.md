---
name: mchess-debug
description: Use when locating or fixing a MChess defect across browser, engine, network, or server behavior.
---

# MChess debugging

- Reproduce the reported flow and capture the first observable failure before editing.
- Trace the path across UI, `chess.js` state, worker/API/WebSocket, and persistence as relevant.
- Compare expected behavior with logs and existing tests; change one cause at a time.
- Add the smallest regression check that reliably reproduces the defect.
- Re-run that check and the build; report evidence and any unresolved uncertainty.
