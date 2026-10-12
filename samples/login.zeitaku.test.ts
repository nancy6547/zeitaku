test("login", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await __zeitaku.idle(page);
    await page.fill("#email", "a@b.com");
    await page.click("#submit");
    await __zeitaku.idle(page);
    console.log("done");
    await expect(page).toHaveURL("/home");
});
