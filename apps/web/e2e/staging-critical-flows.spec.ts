import { test, expect } from "@playwright/test";

test("public pages render successfully", async ({ page }) => {
  const routes = ["/", "/login", "/signup", "/favicon.ico", "/contact"];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should return 200`).toBe(200);
  }
});

test("invalid login path shows explicit auth error", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("textbox", { name: "Email" }).fill("invalid@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid login credentials")).toBeVisible();
});

test("authenticated user lands on dashboard", async ({ page }) => {
  test.skip(
    !process.env.E2E_LOGIN_EMAIL || !process.env.E2E_LOGIN_PASSWORD,
    "E2E_LOGIN_EMAIL/E2E_LOGIN_PASSWORD not configured",
  );

  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(process.env.E2E_LOGIN_EMAIL!);
  await page
    .getByRole("textbox", { name: "Password" })
    .fill(process.env.E2E_LOGIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(page).toHaveURL(/dashboard/);
});
