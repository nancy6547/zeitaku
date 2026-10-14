import { describe, it, expect } from "vitest";
import { findSleeps, fixCode } from "../src/core/sleeps";

describe("findSleeps", () => {
  it("finds a basic sleep with its line, receiver and milliseconds", () => {
    const sleeps = findSleeps(`await page.waitForTimeout(3000);`);

    expect(sleeps.length).toBe(1);
    expect(sleeps[0].line).toBe(1);
    expect(sleeps[0].receiver).toBe("page");
    expect(sleeps[0].ms).toBe(3000);
  });

  it("ignores comments and strings", () => {
    const sleeps = findSleeps(`// waitForTimeout(1)
console.log("page.waitForTimeout(5)");`);

    expect(sleeps.length).toBe(0);
  });

  it("finds a call split across two lines", () => {
    const sleeps = findSleeps(`await page
  .waitForTimeout(2000);`);

    expect(sleeps.length).toBe(1);
  });

  it("sets ms to null when the delay is a variable", () => {
    const sleeps = findSleeps(`await page.waitForTimeout(DELAY);`);

    expect(sleeps[0].ms).toBeNull();
  });
  it("marks a sleep before a negative check as intentional", () => {
    const sleeps = findSleeps(`await page.waitForTimeout(500);
await expect(menu).toBeHidden();`);

    expect(sleeps[0].kind).toBe("intentional");
  });

  it("marks a normal sleep as replaceable", () => {
    const sleeps = findSleeps(`await page.waitForTimeout(500);
await page.click("#go");`);

    expect(sleeps[0].kind).toBe("replaceable");
  });

  it("treats toHaveLength(0) as a negative check", () => {
    const sleeps = findSleeps(`await page.waitForTimeout(750);
expect(searchRequests).toHaveLength(0);`);

    expect(sleeps[0].kind).toBe("intentional");
  });
});

describe("fixCode", () => {
  it("replaces the sleep with __zeitaku.idle", () => {
    const result = fixCode(`await page.waitForTimeout(1000);`, "./rt");

    expect(result.count).toBe(1);
    expect(result.output).toContain("__zeitaku.idle(page)");
    expect(result.output).not.toContain("waitForTimeout");
  });

  it("returns the code unchanged when there are no sleeps", () => {
    const code = `const x = 1;`;

    expect(fixCode(code, "./rt")).toEqual({ output: code, count: 0 });
  });

  it("puts the header after the imports, even with Windows line endings", () => {
    const code = `import { test } from "@playwright/test";\r\n\r\nawait page.waitForTimeout(1);\r\n`;
    const result = fixCode(code, "./rt");

    expect(result.output.startsWith('import { test } from "@playwright/test";\nimport { __zeitaku }')).toBe(true);
  });
});