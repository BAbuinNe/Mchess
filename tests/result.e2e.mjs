import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 850 } });
  await page.addInitScript(() => localStorage.setItem("mchess.localPgn", "1. f3 e5 2. g4 Qh4#"));
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: /Играть/, exact: false }).first().click();
  await page.locator(".result-video").waitFor();
  assert.match(await page.locator(".result-card h2").innerText(), /Победа чёрных/);
  assert.match(await page.locator(".result-video").getAttribute("src"), /victory\.mp4$/);
  await page.waitForTimeout(3000);
  assert.equal(await page.locator(".result-video").evaluate(video => video.paused), true);
  assert.ok(await page.locator(".result-video").evaluate(video => video.duration - video.currentTime < 0.15));
  await page.getByRole("button", { name: "Отчёт о партии" }).click();
  await page.locator(".game-report").waitFor();
  assert.equal(await page.locator(".report-moves button").count(), 4);
  await page.locator(".report-moves button").first().click();
  assert.ok(await page.locator(".game-report [data-square='f3'] .piece").count());
  process.stdout.write("result video and report: OK\n");
} finally {
  await browser.close();
  await server.close();
}
