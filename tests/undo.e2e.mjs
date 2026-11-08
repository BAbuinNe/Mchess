import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => { localStorage.setItem("mchess.telegramInviteDismissed", "1"); localStorage.setItem("mchess.introSeen", "1"); });
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Играть с ботом" }).first().click();
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.locator('.play-page [data-square="e2"]').click();
    await page.locator('.play-page [data-square="e4"]').click();
    await page.getByRole("button", { name: /Отмена/ }).click();
    assert.match(await page.locator('.play-page [data-square="e2"]').getAttribute("aria-label"), /белая пешка/);
  }
  await page.locator('.play-page [data-square="e2"]').click();
  await page.locator('.play-page [data-square="e4"]').click();
  assert.match(await page.locator('.play-page [data-square="e4"]').getAttribute("aria-label"), /белая пешка/);
  console.log("Repeated undo leaves pieces movable: OK");
} finally {
  await browser.close();
  await server.close();
}

