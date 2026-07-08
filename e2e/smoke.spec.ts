import { test, expect } from "@playwright/test";

test("setup page loads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const response = await page.goto("/setup");
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});
