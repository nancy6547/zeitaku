import * as ts from "typescript";

export type Sleep = { line: number; receiver: string; ms: number | null; start: number; end: number };

// Find every X.waitForTimeout(...) call in a piece of code
export function findSleeps(code: string, fileName = "file.ts"): Sleep[] {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const sleeps: Sleep[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "waitForTimeout"
    ) {
      const arg = node.arguments[0];
      sleeps.push({
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        receiver: node.expression.expression.getText(),
        ms: arg && ts.isNumericLiteral(arg) ? Number(arg.text) : null,
        start: node.getStart(),
        end: node.getEnd(),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sleeps;
}

// Rewrite the sleeps and add the Zeitaku header. Pure function: text in, text out.
export function fixCode(code: string, runtimeImport: string, fileName = "file.ts"): { output: string; count: number } {
  const sleeps = findSleeps(code, fileName);
  if (sleeps.length === 0) return { output: code, count: 0 };

  // Apply edits from the END backwards, so earlier positions stay valid
  let output = code;
  for (const s of [...sleeps].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, s.start) + "__zeitaku.idle(" + s.receiver + ")" + output.slice(s.end);
  }

  const header =
    'import { __zeitaku } from "' + runtimeImport + '";\n' +
    "test.beforeEach(async ({ page }) => { await __zeitaku.attach(page); });\n" +
    "test.afterEach(async ({ page }, testInfo) => {\n" +
    "  if (testInfo.status !== testInfo.expectedStatus) console.log(__zeitaku.diagnose(page));\n" +
    "});";

  // Header goes right after the last import (works with any line endings)
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const lastImport = sourceFile.statements.filter(ts.isImportDeclaration).pop();
  if (lastImport) {
    const at = lastImport.getEnd();
    output = output.slice(0, at) + "\n" + header + output.slice(at);
  } else {
    output = header + "\n" + output;
  }
  return { output, count: sleeps.length };
}
