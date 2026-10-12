import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

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
    if (entry.isDirectory()) {
      results.push(...findCodeFiles(full));
    } else if (/\.(ts|tsx|js)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

let totalWaits = 0;
let totalMs = 0;
let filesWithWaits = 0;

const files = findCodeFiles(root);

for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  let waitsInFile = 0;

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "waitForTimeout"
    ) {
      waitsInFile++;
      const arg = node.arguments[0];
      if (arg && ts.isNumericLiteral(arg)) totalMs += Number(arg.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (waitsInFile > 0) {
    filesWithWaits++;
    totalWaits += waitsInFile;
    console.log(waitsInFile + " waits  " + path.relative(root, file));
  }
}

console.log("----");
console.log("Files scanned:          " + files.length);
console.log("Files with hard waits:  " + filesWithWaits);
console.log("Total waitForTimeout:   " + totalWaits);
console.log("Hard-coded sleep time:  " + (totalMs / 1000).toFixed(1) + "s");