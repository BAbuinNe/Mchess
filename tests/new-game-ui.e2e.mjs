import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const frontend = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "127.0.0.1", port: 5178, strictPort: true } });
await frontend.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 850 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem("mchess.telegramInviteDismissed", "1"));
  await page.goto("http://127.0.0.1:5178/");
  await page.getByRole("navigation", { name: "Главная навигация" }).getByRole("button", { name: "Играть" }).click();
  await page.getByRole("heading", { name: "Новая партия" }).waitFor();
  assert.equal(await page.locator(".board-frame").count(), 0);
  assert.ok(await page.getByRole("button", { name: /Играть с другом/ }).isVisible());
  assert.ok(await page.getByRole("button", { name: /Играть с тренером/ }).isVisible());
  await page.screenshot({ path: "artifacts/new-game-393.png", fullPage: true });
  await page.getByRole("button", { name: "Профиль", exact: true }).first().click();
  const portraits = page.locator(".coach-card .coach-image");
  await portraits.first().waitFor();
  assert.equal(await portraits.count(), 4);
  for (const image of await portraits.all()) assert.ok(await image.evaluate(element => element.complete && element.naturalWidth > 0));
  await page.screenshot({ path: "artifacts/coaches-393.png", fullPage: true });
  process.stdout.write("new game menu and coach portraits: OK\n");
} finally {
  await browser.close();
  await frontend.close();
}
