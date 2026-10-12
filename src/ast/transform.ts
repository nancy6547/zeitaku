import * as ts from "typescript";
import * as fs from "fs";

const code = fs.readFileSync("samples/login.test.ts", "utf8");
const sourceFile = ts.createSourceFile("login.test.ts", code, ts.ScriptTarget.Latest, true);

let replaced = 0;

const zeitakuTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
  return (root) => {
    function visit(node: ts.Node): ts.Node {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "waitForTimeout"
      ) {
        replaced++;
	const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        console.log("replaced line " + line + ": " + node.expression.getText());
        const receiver = node.expression.expression;
        return ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("__zeitaku"), "idle"),
          undefined,
          [receiver]
        );
      }
      return ts.visitEachChild(node, visit, context);
    }
    return ts.visitNode(root, visit) as ts.SourceFile;
  };
};

const result = ts.transform(sourceFile, [zeitakuTransformer]);
const printer = ts.createPrinter();
const output = printer.printFile(result.transformed[0]);

fs.writeFileSync("samples/login.zeitaku.test.ts", output);
console.log("Replaced " + replaced + " waits");