import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 850 } });
  await page.addInitScript(() => {
    localStorage.setItem("mchess.coach", "Мелстрой");
    localStorage.setItem("mchess.telegramInviteDismissed", "1");
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: /Играть с ботом/ }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  const started = Date.now();
  const history = async () => {
    const pgn = await page.evaluate(() => localStorage.getItem("mchess.localPgn") || "");
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    return game.history();
  };
  await page.waitForTimeout(1500);
  assert.equal((await history()).length, 1, "trainer moved before two seconds");
  await page.locator('.coach-reaction video[src*="/mellstroy/meme-"]').waitFor({ state: "attached", timeout: 15000 });
  while ((await history()).length < 2 && Date.now() - started < 15000) await page.waitForTimeout(200);
  assert.equal((await history()).length, 2, "trainer did not move");
  assert.ok(Date.now() - started >= 1900, "trainer did not wait two seconds");
  process.stdout.write("Mellstroy video and two-second bot reply: OK\n");
} finally {
  await browser.close();
  await server.close();
}