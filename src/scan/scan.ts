import * as fs from "fs";
import * as path from "path";
import { findSleeps } from "../core/sleeps";

const root = process.argv[2];
if (!root) {
  console.log("Usage: npx tsx src/scan/scan.ts <folder>");
  process.exit(1);
}

function findCodeFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findCodeFiles(full));
    else if (/\.(ts|tsx|js)$/.test(entry.name)) results.push(full);
  }
  return results;
}

let totalWaits = 0;
let totalMs = 0;
let filesWithWaits = 0;
const files = findCodeFiles(root);

for (const file of files) {
  const sleeps = findSleeps(fs.readFileSync(file, "utf8"), file);
  if (sleeps.length > 0) {
    filesWithWaits++;
    totalWaits += sleeps.length;
    for (const s of sleeps) totalMs += s.ms ?? 0;
    console.log(sleeps.length + " waits  " + path.relative(root, file));
  }
}

console.log("----");
console.log("Files scanned:          " + files.length);
console.log("Files with hard waits:  " + filesWithWaits);
console.log("Total waitForTimeout:   " + totalWaits);
console.log("Hard-coded sleep time:  " + (totalMs / 1000).toFixed(1) + "s");
