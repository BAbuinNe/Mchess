---
name: mchess-performance
description: Use when measuring or optimizing MChess loading, rendering, engine, network, or asset performance.
---

# MChess performance

- Measure the slow path on a representative mobile viewport/device before optimizing.
- Keep Stockfish in its worker and avoid repeated analysis or React updates for unchanged positions.
- Inspect bundle, network, image/video size, and render work before choosing an optimization.
- Preserve chess correctness, accessibility, and visual stability; compare before/after measurements.
- Add a focused regression check when the optimization changes visible behavior.
