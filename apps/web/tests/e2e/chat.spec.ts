import { test, expect } from "@playwright/test";

test("chat dashboard loads fallback conversations", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Customer Support AI")).toBeVisible();
  await expect(page.getByText(/Unable to load conversations/)).toBeVisible();
  await expect(page.getByText("Return policy questions")).toBeVisible();

  await page.getByRole("button", { name: /Create conversation/ }).click();
  await expect(page.getByText(/Untitled chat/)).toBeVisible();
});

test("error toast shows when API is unreachable", async ({ page }) => {
  await page.goto("/");

  const toast = page.getByText(/Unable to load conversations/).first();
  await expect(toast).toBeVisible();

  await page.getByRole("button", { name: "Export markdown" }).click();
  await expect(toast).toBeVisible({ timeout: 5000 });
});
