import { expect, test } from "@playwright/test";

test.describe("kept for proving that a second try is reported", () => {
  test("unsteady on purpose: fails at its first try and passes at its second", async ({ page }, testInfo) => {
    await page.goto("/");
    const logIn = page.getByRole("banner").getByRole("button", { name: "Log in" });
    await expect(logIn).toBeVisible();
    if (testInfo.retry === 0) {
      await expect(page.getByRole("heading", { name: "A heading Compass never shows" })).toBeVisible({ timeout: 2_000 });
    }
  });
});
