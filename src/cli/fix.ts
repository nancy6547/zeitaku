import * as fs from "fs";
import * as path from "path";
import { fixCode } from "../core/sleeps";

const folder = process.argv[2];
const write = process.argv.includes("--write");
if (!folder) {
  console.log("Usage: npx tsx src/cli/fix.ts <folder> [--write]");
  process.exit(1);
}

const RUNTIME = path.resolve(__dirname, "../runtime/zeitaku");

function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findTestFiles(full));
    else if (/\.(spec|test|e2e)\.(ts|js)$/.test(entry.name)) results.push(full);
  }
  return results;
}

let total = 0;
for (const file of findTestFiles(folder)) {
  let rel = path.relative(path.dirname(file), RUNTIME).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;

  const { output, count } = fixCode(fs.readFileSync(file, "utf8"), rel, file);
  if (count > 0) {
    if (write) fs.writeFileSync(file, output);
    total += count;
    console.log((write ? "fixed " : "would fix ") + count + "  " + path.relative(folder, file));
  }
}
console.log("----");
console.log(total + " hard waits " + (write ? "replaced" : "found (run again with --write to apply)"));
