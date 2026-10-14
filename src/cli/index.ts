#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { findSleeps, fixCode } from "../core/sleeps";

const HELP = `zeitaku - replace hard-coded Playwright sleeps with network-aware waits

Usage:
  zeitaku scan <folder>            List every waitForTimeout() in a codebase
  zeitaku fix <folder>             Preview which test files would change
  zeitaku fix <folder> --write     Rewrite them in place
`;

const [command, folder] = process.argv.slice(2);
const write = process.argv.includes("--write");

if (!command || !folder || !["scan", "fix"].includes(command)) {
  console.log(HELP);
  process.exit(command ? 1 : 0);
}
if (!fs.existsSync(folder)) {
  console.error("zeitaku: folder not found: " + folder);
  process.exit(1);
}

function walk(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full, pattern));
    else if (pattern.test(entry.name)) results.push(full);
  }
  return results;
}

if (command === "scan") {
  const files = walk(folder, /\.(ts|tsx|js)$/);
  let total = 0, totalMs = 0, withWaits = 0;
  for (const file of files) {
    const sleeps = findSleeps(fs.readFileSync(file, "utf8"), file);
    if (sleeps.length === 0) continue;
    withWaits++;
    total += sleeps.length;
    for (const s of sleeps) totalMs += s.ms ?? 0;
    console.log(sleeps.length + " waits  " + path.relative(folder, file));
  }
  console.log("----");
  console.log("Files scanned:          " + files.length);
  console.log("Files with hard waits:  " + withWaits);
  console.log("Total waitForTimeout:   " + total);
  console.log("Hard-coded sleep time:  " + (totalMs / 1000).toFixed(1) + "s");
}

if (command === "fix") {
  let total = 0;
  for (const file of walk(folder, /\.(spec|test|e2e)\.(ts|js)$/)) {
    const { output, count } = fixCode(fs.readFileSync(file, "utf8"), "zeitaku", file);
    if (count === 0) continue;
    if (write) fs.writeFileSync(file, output);
    total += count;
    console.log((write ? "fixed " : "would fix ") + count + "  " + path.relative(folder, file));
  }
  console.log("----");
  console.log(total + " hard waits " + (write ? "replaced" : "found (run again with --write to apply)"));
}
