import { expect, test } from "@playwright/test";

test.describe("kept for proving that a failure is reported", () => {
  test("false on purpose: expects a heading that is never shown", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A heading Compass never shows" })).toBeVisible({ timeout: 2_000 });
  });
});
