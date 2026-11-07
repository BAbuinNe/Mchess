import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = join(process.cwd(), "resources/openings");
const entries = [];
for (const letter of "abcde") {
  const lines = readFileSync(join(source, letter + ".tsv"), "utf8").trim().split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const [eco, name, pgn] = line.split("\t");
    const moves = pgn.replace(/\d+\.(?:\.\.)?/g, " ").trim().split(/\s+/);
    if (eco && name && moves.length) entries.push({ eco, name, moves });
  }
}
writeFileSync(join(process.cwd(), "apps/web/public/assets/openings.json"), JSON.stringify(entries));
process.stdout.write(`Wrote ${entries.length} opening lines, ${entries.filter(entry => /gambit/i.test(entry.name)).length} gambits\n`);
