import * as ts from "typescript";
import * as fs from "fs";

const code = fs.readFileSync("samples/login.test.ts", "utf8");
const sourceFile = ts.createSourceFile("login.test.ts", code, ts.ScriptTarget.Latest, true);

const WATCH = new Set(["goto", "waitForTimeout", "fill", "click"]);

function visit(node: ts.Node) {
  if (ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression.getText();
      if (WATCH.has(method)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        console.log("line " + line + ": " + receiver + "." + method);
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);