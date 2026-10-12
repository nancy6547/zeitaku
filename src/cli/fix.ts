import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

const folder = process.argv[2];
const write = process.argv.includes("--write");
if (!folder) {
  console.log("Usage: npx tsx src/cli/fix.ts <folder> [--write]");
  process.exit(1);
}

const RUNTIME = path.resolve(__dirname, "../runtime/zeitaku");

function findCodeFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findCodeFiles(full));
    else if (/\.(spec|test|e2e)\.(ts|js)$/.test(entry.name)) results.push(full);
  }
  return results;
}

type Edit = { start: number; end: number; text: string };

function fixFile(file: string): number {
  const code = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "waitForTimeout"
    ) {
      const receiver = node.expression.expression.getText();
      edits.push({ start: node.getStart(), end: node.getEnd(), text: "__zeitaku.idle(" + receiver + ")" });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (edits.length === 0) return 0;

  // Apply edits from the END of the file backwards, so earlier positions stay valid
  let output = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  // Add the import + auto-attach so the fixed file actually runs
  let rel = path.relative(path.dirname(file), RUNTIME).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  const header =
    'import { __zeitaku } from "' + rel + '";\n' +
    "test.beforeEach(async ({ page }) => { await __zeitaku.attach(page); });\n";

  // Put the header right after the last import (works with any line endings)
  const lastImport = sourceFile.statements.filter(ts.isImportDeclaration).pop();
  if (lastImport) {
    const at = lastImport.getEnd();
    output = output.slice(0, at) + "\n" + header.trimEnd() + output.slice(at);
  } else {
    output = header + output;
  }

  if (write) fs.writeFileSync(file, output);
  return edits.length;
}

let total = 0;
for (const file of findCodeFiles(folder)) {
  const n = fixFile(file);
  if (n > 0) {
    total += n;
    console.log((write ? "fixed " : "would fix ") + n + "  " + path.relative(folder, file));
  }
}
console.log("----");
console.log(total + " hard waits " + (write ? "replaced" : "found (run again with --write to apply)"));