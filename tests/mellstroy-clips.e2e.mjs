import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ root: "apps/web", configFile: "apps/web/vite.config.ts", server: { host: "0.0.0.0", port: 5173, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.MCHESS_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173/");
  const results = await page.evaluate(async () => {
    localStorage.clear();
    const { nextMellstroyClip } = await import("/src/mellstroyClips.ts");
    const positive = Array.from({ length: 9 }, () => nextMellstroyClip("good"));
    const negative = Array.from({ length: 9 }, () => nextMellstroyClip("mistake"));
    const general = Array.from({ length: 84 }, () => nextMellstroyClip("book"));
    const brilliant = nextMellstroyClip("brilliant");
    return { positive, negative, general, brilliant };
  });
  for (const [name, urls, count] of [["positive", results.positive, 9], ["negative", results.negative, 9], ["general", results.general, 84]]) {
    assert.equal(new Set(urls).size, count, `${name} pool repeated before completing a cycle`);
  }
  assert.ok(results.positive.every(url => /meme-(08|13|14|16|18|20|21|23|33)\.webm$/.test(url)));
  assert.ok(results.negative.every(url => /meme-(03|04|17|31|38|39|41|44|52)\.webm$/.test(url)));
  assert.ok(results.brilliant.includes("meme-"));
  process.stdout.write("102 coach clips rotate by move category without early repeats: OK\n");
} finally {
  await browser.close();
  await server.close();
}

