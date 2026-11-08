import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
const sourceFiles = [".dockerignore", ".gitignore", "Dockerfile", "README.md", "package.json", "package-lock.json", ...await walk("apps/server"), ...await walk("apps/web/src"), ...await walk("apps/web/public"), ...await walk("scripts"), ...await walk("tests"), "apps/web/index.html", "apps/web/package.json", "apps/web/tsconfig.json", "apps/web/vite.config.ts", ...await walk("deploy-parts")];
const files = [...new Set(sourceFiles)].filter(path => !path.includes("/dist/") && !path.includes("/node_modules/") && !path.includes("/.vite/") && !path.includes("/android/") && !path.includes("/build/") && !path.includes("/data/") && !/\/coaches\/(magnus|hikaru|karpov|mellstroy)\.png$/.test(path));
const manifest = JSON.parse(await readFile("deploy-parts/manifest.json", "utf8"));
const split = new Set(manifest.map(item => item.path));
const chosen = files.filter(path => !split.has(path));
const binary = chosen.filter(path => [".png", ".jpg", ".jpeg", ".mp4", ".webm", ".wasm", ".part"].includes(extname(path)));
const text = chosen.filter(path => !binary.includes(path));
const [mode, index] = process.argv.slice(2);
if (mode === "list") process.stdout.write(JSON.stringify({ binary, text }));
else if (mode === "text") {
  const group = text.slice(Number(index) * 20, (Number(index) + 1) * 20);
  process.stdout.write(JSON.stringify(await Promise.all(group.map(async path => ({ path, content: await readFile(path, "utf8") })))));
} else if (mode === "binary") {
  const path = binary[Number(index)];
  if (!path) throw new Error("No binary file at index " + index);
  process.stdout.write(JSON.stringify({ path, content: (await readFile(path)).toString("base64") }));
}