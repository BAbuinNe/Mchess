import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = 3001;
const api = `http://127.0.0.1:${port}`;
await mkdir("data", { recursive: true });
const dataDir = await mkdtemp(join(process.cwd(), "data", "online-ui-"));
const backend = spawn(process.execPath, ["apps/server/dist/main.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MCHESS_DATA_DIR: dataDir }, stdio: "ignore" });
const frontend = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await frontend.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  for (let i = 0; i < 100; i++) {
    if ((await fetch(api + "/health").catch(() => null))?.ok) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const pages = await Promise.all([browser.newPage({ viewport: { width: 393, height: 850 } }), browser.newPage({ viewport: { width: 393, height: 850 } })]);
  for (const [index, page] of pages.entries()) {
    await page.addInitScript(() => { localStorage.setItem("mchess.telegramInviteDismissed", "1"); localStorage.setItem("mchess.introSeen", "1"); });
    await page.goto("http://127.0.0.1:5173/");
    await page.getByRole("button", { name: "Профиль", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Ваше имя" }).fill(index ? "Борис" : "Алиса");
    if (!index) await page.getByRole("button", { name: "Аватар queen" }).click();
    await page.getByRole("button", { name: "Создать профиль" }).click();
    await page.getByText("До таблицы рейтинга осталось 10 партий").waitFor();
    await page.getByRole("button", { name: /MChess/ }).click();
  }
  await pages[0].getByRole("button", { name: /Онлайн-подбор/ }).click();
  await pages[1].getByRole("button", { name: /Онлайн-подбор/ }).click();
  await Promise.all(pages.map(page => page.getByRole("heading", { name: "Игра с другом" }).waitFor()));
  assert.match(await pages[0].locator(".player-line").first().innerText(), /Борис/);
  assert.equal(await pages[1].locator(".player-line .mini-avatar").first().innerText(), "♛");
  await pages[0].locator('[data-square="e2"]').click();
  await pages[0].locator('[data-square="e4"]').click();
  await pages[1].locator('[data-square="e4"] .piece').waitFor();
  assert.ok(await pages[1].locator(".moves-panel").innerText().then(text => text.includes("e4")));
  process.stdout.write("browser guest registration, matchmaking and shared move: OK\n");
} finally {
  await browser.close();
  await frontend.close();
  backend.kill();
}

