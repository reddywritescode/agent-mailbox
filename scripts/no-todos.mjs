import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "client", "tests", "scripts", "docs", "launch-assets"];
const blocked = new RegExp(`\\b(${["TO", "DO"].join("")}|${["FIX", "ME"].join("")})\\b`);
const ignoredDirs = new Set(["node_modules", "dist", "coverage", ".git", ".agent-teacher"]);
const hits = [];

function walk(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (full.endsWith("docs/spec")) continue;
      if (!ignoredDirs.has(entry)) walk(full);
    } else if (!entry.endsWith(".png")) {
      const text = readFileSync(full, "utf8");
      if (blocked.test(text)) hits.push(full);
    }
  }
}

for (const root of roots) walk(root);
if (hits.length) {
  console.error(`Found blocked markers in shipped paths:\n${hits.join("\n")}`);
  process.exit(1);
}
