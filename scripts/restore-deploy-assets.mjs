import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const manifest = JSON.parse(await readFile("deploy-parts/manifest.json", "utf8"));
for (const item of manifest) {
  const chunks = await Promise.all(item.parts.map(part => readFile(part)));
  const content = Buffer.concat(chunks);
  if (createHash("sha256").update(content).digest("hex") !== item.hash) throw new Error(`Corrupt asset: ${item.path}`);
  await mkdir(dirname(item.path), { recursive: true });
  await writeFile(item.path, content);
}
process.stdout.write(`Restored ${manifest.length} assets.\n`);
