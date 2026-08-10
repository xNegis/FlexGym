import { expect, test } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("FlexGym smoke", () => {
  test("displays ready state through real API and database", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/");

    await expect(page.locator("text=FlexGym")).toBeVisible();
    await expect(page.locator("text=System ready")).toBeVisible();
  });

  test("shows unavailable state and retries successfully", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.route("**/api/health", async (route) => {
      await route.fulfill({ status: 503, json: { status: "unavailable" } });
    });

    await page.goto("/");

    await expect(page.locator("text=Unable to reach the server")).toBeVisible();

    await page.unroute("**/api/health");
    await page.click("text=Retry");

    await expect(page.locator("text=System ready")).toBeVisible();
  });

  test("shows loading state before health response", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    let resolveHealth: () => void;
    const healthBlocked = new Promise<void>((resolve) => {
      resolveHealth = resolve;
    });

    await page.route("**/api/health", async (route) => {
      await healthBlocked;
      await route.fulfill({ status: 200, json: { status: "ok" } });
    });

    await page.goto("/");

    await expect(page.locator("text=Checking system status...")).toBeVisible();

    resolveHealth!();
    await expect(page.locator("text=System ready")).toBeVisible();
  });

  test("has no horizontal overflow at mobile viewport", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/");

    await expect(page.locator("text=System ready")).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});