test("login", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.waitForTimeout(3000);
  await page.fill("#email", "a@b.com");
  await page.click("#submit");
  await page.waitForTimeout(2000);
  console.log("done");
  await expect(page).toHaveURL("/home");
});