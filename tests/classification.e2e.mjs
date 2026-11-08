import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem("mchess.telegramInviteDismissed", "1"));
  await page.goto("http://127.0.0.1:5173/");
  const grades = await page.evaluate(async () => {
    const { classify } = await import("/src/LiveEvaluation.tsx");
    const result = (score, mate = null, move = "d2d4") => ({ score, mate, move, depth: 12, pv: [] });
    const played = { from: "e2", to: "e4", piece: "p" };
    return {
      hangingInLostGame: classify(result(-1000), result(1500), played, {}),
      smallLoss: classify(result(50), result(-40), played, {}),
      missedMate: classify(result(null, 2), result(-900), played, {})
    };
  });
  assert.equal(grades.hangingInLostGame, "blunder");
  assert.equal(grades.smallLoss, "excellent");
  assert.equal(grades.missedMate, "missed-win");
  process.stdout.write("move classifications in lost and mating positions: OK\n");
} finally {
  await browser.close();
  await server.close();
}