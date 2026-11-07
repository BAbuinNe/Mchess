import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 850 } });
  await page.route("**/assets/reactions/events/blunder-1.mp4", async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.evaluate(async () => {
    const { default: React } = await import("/node_modules/.vite/deps/react.js");
    const { default: ReactDOM } = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { default: CoachReaction } = await import("/src/CoachReaction.tsx");
    const root = document.createElement("div");
    document.body.append(root);
    window.reactionTest = { React, CoachReaction, root: ReactDOM.createRoot(root) };
    window.reactionTest.root.render(React.createElement(CoachReaction, { clip: "/assets/reactions/events/blunder-1.mp4", onClose: () => {} }));
  });
  await page.locator(".coach-reaction").waitFor({ state: "attached" });
  assert.equal(await page.locator(".coach-reaction").evaluate(element => getComputedStyle(element).visibility), "hidden");
  await page.locator(".coach-reaction.ready").waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".coach-reaction.ready").evaluate(element => getComputedStyle(element).visibility), "visible");
  assert.equal(await page.locator(".coach-reaction video").evaluate(video => getComputedStyle(video).opacity), "1");
  await page.evaluate(() => {
    const { React, CoachReaction, root } = window.reactionTest;
    root.render(React.createElement(CoachReaction, { clip: "/assets/reactions/verified/positive-20.webm", onClose: () => {} }));
  });
  await page.locator(".coach-reaction.transparent.ready").waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".coach-reaction.transparent video").evaluate(video => getComputedStyle(video).backgroundColor), "rgba(0, 0, 0, 0)");
  process.stdout.write("reaction waits for first frame and remains opaque: OK\n");
} finally {
  await browser.close();
  await server.close();
}
