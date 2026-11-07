import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const files = [
  "apps/web/public/assets/intro/intro.mp4",
  ...["blunder-1", "blunder-2", "blunder-3", "brilliant-1", "brilliant-2", "brilliant-rook", "brilliant-win"].map(name => `apps/web/public/assets/reactions/events/${name}.mp4`),
  ...["negative-17", "negative-39", "positive-20", "positive-23"].map(name => `apps/web/public/assets/reactions/verified/${name}.webm`),
  "apps/web/public/assets/results/defeat.mp4",
  "apps/web/public/assets/results/victory.mp4",
  "apps/web/public/engine/stockfish-19-lite-single.wasm"
];
const partSize = 480_000;
await mkdir("deploy-parts", { recursive: true });
const manifest = [];
for (const path of files) {
  const buffer = await readFile(path);
  if (buffer.length <= partSize) continue;
  const hash = createHash("sha256").update(buffer).digest("hex");
  const parts = [];
  for (let index = 0; index * partSize < buffer.length; index++) {
    const part = `deploy-parts/${hash.slice(0, 16)}-${index}.part`;
    await writeFile(part, buffer.subarray(index * partSize, (index + 1) * partSize));
    parts.push(part);
  }
  manifest.push({ path, hash, parts });
}
await writeFile(join("deploy-parts", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(`Prepared ${manifest.length} split assets in ${manifest.reduce((total, item) => total + item.parts.length, 0)} parts.\n`);
