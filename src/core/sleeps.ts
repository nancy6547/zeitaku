import * as ts from "typescript";

export type SleepKind = "replaceable" | "intentional";

export type Sleep = {
  line: number;
  receiver: string;
  ms: number | null;
  start: number;
  end: number;
  kind: SleepKind;
};

// How many statements after a sleep we look at to decide what it is for
const LOOKAHEAD = 3;

// Does this piece of code check that something did NOT happen?
// e.g. expect(x).toBeHidden(), expect(x).not.toBeVisible(), expect(count).toBeLessThanOrEqual(1)
export function isNegativeCheck(code: string): boolean {
  const patterns = [".toBeHidden(", ".not.", ".toBeLessThan", ".toHaveCount(0)", ".toHaveLength(0)", ".toBeFalsy(", ".toBeNull("];
  return patterns.some((p) => code.includes(p));
}

// Walk up from the call to the full statement it belongs to (e.g. `await page.waitForTimeout(500);`)
function statementOf(node: ts.Node): ts.Statement | undefined {
  let current: ts.Node | undefined = node;
  while (current && !ts.isExpressionStatement(current) && !ts.isVariableStatement(current)) {
    current = current.parent;
  }
  return current as ts.Statement | undefined;
}

// The text of the next few statements after `statement`, in the same block of code
function codeAfter(statement: ts.Statement, sourceFile: ts.SourceFile): string {
  const parent = statement.parent;
  if (!ts.isBlock(parent) && !ts.isSourceFile(parent)) return "";
  const siblings = parent.statements;
  const index = siblings.indexOf(statement);
  return siblings
    .slice(index + 1, index + 1 + LOOKAHEAD)
    .map((s) => s.getText(sourceFile))
    .join("\n");
}

// Find every X.waitForTimeout(...) call and classify it
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
      const statement = statementOf(node);
      const after = statement ? codeAfter(statement, sourceFile) : "";

      sleeps.push({
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        receiver: node.expression.expression.getText(),
        ms: arg && ts.isNumericLiteral(arg) ? Number(arg.text) : null,
        start: node.getStart(),
        end: node.getEnd(),
        kind: isNegativeCheck(after) ? "intentional" : "replaceable",
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sleeps;
}

// Rewrite the REPLACEABLE sleeps and add the Zeitaku header. Pure function: text in, text out.
export function fixCode(code: string, runtimeImport: string, fileName = "file.ts"): { output: string; count: number } {
  const sleeps = findSleeps(code, fileName).filter((s) => s.kind === "replaceable");
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
