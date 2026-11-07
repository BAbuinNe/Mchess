import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const executablePath = process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const server = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const width of [320, 360, 393, 412, 480]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => localStorage.setItem("mchess.telegramInviteDismissed", "1"));
    await page.goto("http://127.0.0.1:5173/");
    await page.getByRole("button", { name: /Играть/, exact: false }).first().click();
    await page.getByRole("button", { name: /На одном устройстве/ }).click();
    const geometry = await page.locator(".board-grid").evaluate(board => {
      const bounds = board.getBoundingClientRect();
      const cells = [...board.querySelectorAll(".square")].map(cell => cell.getBoundingClientRect());
      return {
        width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right,
        cells: cells.map(cell => ({ width: cell.width, height: cell.height })),
        loadedPieces: [...board.querySelectorAll(".piece")].every(img => img.complete && img.naturalWidth > 0)
      };
    });
    assert.equal(geometry.cells.length, 64);
    assert.ok(Math.abs(geometry.width - geometry.height) < 1, `${width}: board not square`);
    assert.ok(geometry.left >= 0 && geometry.right <= width, `${width}: board outside viewport`);
    assert.ok(geometry.width >= width - 20, `${width}: board too small (${geometry.width})`);
    assert.ok(geometry.cells.every(cell => Math.abs(cell.width - cell.height) < 1), `${width}: cells not square`);
    assert.ok(geometry.cells.every(cell => Math.abs(cell.width - geometry.cells[0].width) < 1), `${width}: unequal cells`);
    assert.ok(geometry.loadedPieces, `${width}: SVG pieces failed to load`);
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    assert.ok(await page.locator('[data-square="e4"] .piece').count(), `${width}: tap move failed`);
    assert.ok(await page.locator('[data-square="e2"].last-move').count(), `${width}: last move highlight missing`);
    await page.getByRole("button", { name: /Перевернуть/ }).click();
    assert.equal(await page.locator(".board-grid .square").first().getAttribute("data-square"), "h1");
    const from = await page.locator('[data-square="d7"]').boundingBox();
    const to = await page.locator('[data-square="d5"]').boundingBox();
    assert.ok(from && to);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.ok(await page.locator('[data-square="d5"] .piece').count(), `${width}: drag move failed`);
    if (width === 393) {
      await mkdir("artifacts", { recursive: true });
      await page.screenshot({ path: "artifacts/board-393.png", fullPage: true });
    }
    await page.close();
    process.stdout.write(`board ${width}px: OK\n`);
  }
  const botPage = await browser.newPage({ viewport: { width: 393, height: 850 } });
  await botPage.addInitScript(() => { localStorage.setItem("mchess.coach", "Мелстрой"); localStorage.setItem("mchess.telegramInviteDismissed", "1"); });
  await botPage.goto("http://127.0.0.1:5173/");
  await botPage.getByRole("button", { name: /Играть с ботом/ }).click();
  await botPage.locator('[data-square="e2"]').click();
  await botPage.locator('[data-square="e4"]').click();
  await botPage.locator(".move-feedback").waitFor({ timeout: 45000 });
  await botPage.locator('[data-square="e4"] .board-move-badge svg').waitFor({ timeout: 45000 });
  assert.ok(await botPage.locator('[data-square="e4"] .board-move-badge svg').count(), "human move icon missing after bot replies");
  assert.match(await botPage.locator(".move-feedback").innerText(), /Теория/, "opening move should be marked as theory");
  const summaryBox = await botPage.locator('.eval-summary').boundingBox();
  const boardBox = await botPage.locator('.board-frame').first().boundingBox();
  const actionsBox = await botPage.locator('.play-page .quick-actions').boundingBox();
  const detailBox = await botPage.locator('.eval-detail').boundingBox();
  assert.ok(summaryBox && boardBox && summaryBox.y < boardBox.y, "evaluation scale should be above board");
  assert.ok(actionsBox && detailBox && actionsBox.y < detailBox.y, "coach buttons should be above move explanations");
  assert.ok(await botPage.locator(".eval-track[role=meter]").count());
  await botPage.getByRole("button", { name: /Подсказка/ }).waitFor({ state: "visible" });
  await botPage.getByRole("button", { name: /Подсказка/ }).click({ timeout: 30000 });
  await botPage.locator(".hint-square").first().waitFor({ timeout: 30000 });
  await botPage.getByRole("button", { name: /Отмена/ }).click();
  assert.ok(await botPage.locator(".square.last-move").count() <= 2);
  await botPage.screenshot({ path: "artifacts/bot-game-393.png", fullPage: true });
  process.stdout.write("live Stockfish evaluation: OK\n");
  await botPage.close();
} finally {
  await browser.close();
  await server.close();
}

