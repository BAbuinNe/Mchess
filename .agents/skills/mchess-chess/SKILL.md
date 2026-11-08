---
name: mchess-chess
description: Use when changing legal moves, game state, notation, online chess rules, Stockfish interaction, or chess outcomes.
---

# MChess chess rules

- Treat `chess.js` as the rules authority in both client and server code.
- Preserve parity between local and online behavior; validate online input again on the server.
- Cover relevant edge cases: check, mate, stalemate, draw, castling, en passant, promotion, resignation, and clocks.
- Keep Stockfish calls behind the existing worker boundary; do not block rendering with engine work.
- Add or update the narrowest relevant E2E scenario and run the build.
