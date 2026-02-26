import { test, expect } from "@playwright/test";

// Mock external APIs at the Playwright level using route interception
test.describe("Simulation Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept external API calls
    // Mock OpenAI (persona generation)
    await page.route("**/api.openai.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: "Sarah Chen",
                  title: "VP of Sales",
                  company: "TechCorp",
                  personality: "Direct and analytical",
                  background: "15 years in enterprise SaaS",
                  objections: ["Budget constraints", "Already using competitor"],
                  communication_style: "Professional and concise",
                }),
              },
            },
          ],
        }),
      }),
    );

    // Mock Deepgram
    await page.route("**/api.deepgram.com/**", (route) =>
      route.fulfill({ status: 200, body: "{}" }),
    );

    // Mock ElevenLabs
    await page.route("**/api.elevenlabs.io/**", (route) =>
      route.fulfill({ status: 200, body: "{}" }),
    );
  });

  test("complete simulation journey: login → create → simulate → scorecard", async ({
    page,
  }) => {
    // Step 1: Navigate to login
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);

    // Verify login page elements
    const emailInput = page.getByPlaceholder(/email/i);
    const passwordInput = page.getByPlaceholder(/password/i);
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Fill login form with test credentials
    const testEmail = process.env.E2E_TEST_EMAIL || "test@example.com";
    const testPassword = process.env.E2E_TEST_PASSWORD || "testpassword123";

    await emailInput.fill(testEmail);
    await passwordInput.fill(testPassword);

    // Submit login
    const loginButton = page.getByRole("button", { name: /sign in|log in/i });
    await loginButton.click();

    // Wait for navigation to dashboard or onboarding
    await page.waitForURL(/\/(dashboard|onboarding|simulations)/, {
      timeout: 15_000,
    });

    // Step 2: Navigate to new simulation
    await page.goto("/simulations/new");
    await expect(page).toHaveURL(/\/simulations\/new/);

    // Fill prospect form (Step 1 of wizard)
    const companyInput = page.getByLabel(/company/i).or(
      page.getByPlaceholder(/company/i),
    );
    await companyInput.fill("TechCorp");

    // Fill name if visible
    const nameInput = page.getByLabel(/name/i).or(
      page.getByPlaceholder(/name/i),
    );
    if (await nameInput.isVisible()) {
      await nameInput.fill("Sarah Chen");
    }

    // Click next/continue
    const nextButton = page
      .getByRole("button", { name: /next|continue/i })
      .first();
    await nextButton.click();

    // Step 2: Select scenario — pick "Cold Call"
    const coldCallOption = page.getByText(/cold call/i).first();
    await expect(coldCallOption).toBeVisible({ timeout: 5_000 });
    await coldCallOption.click();

    // Click next
    const nextButton2 = page
      .getByRole("button", { name: /next|continue/i })
      .first();
    await nextButton2.click();

    // Step 3: Review and start — click "Start Simulation" or similar
    const startButton = page
      .getByRole("button", { name: /start|begin|launch/i })
      .first();
    await expect(startButton).toBeVisible({ timeout: 10_000 });
    await startButton.click();

    // Should navigate to the simulation page
    await page.waitForURL(/\/simulate\//, { timeout: 15_000 });

    // Step 3: Verify simulation page elements
    // Look for connection indicator
    const connectionStatus = page
      .getByText(/connecting|connected|listening/i)
      .first();
    await expect(connectionStatus).toBeVisible({ timeout: 10_000 });

    // Look for end session button
    const endButton = page
      .getByRole("button", { name: /end|stop/i })
      .first();
    await expect(endButton).toBeVisible();

    // Click end session
    await endButton.click();

    // Handle confirmation dialog if present
    const confirmButton = page.getByRole("button", {
      name: /confirm|yes|end session/i,
    });
    if (await confirmButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Step 4: Should navigate to scorecard page
    await page.waitForURL(/\/sessions\/.*\/scorecard/, { timeout: 15_000 });

    // Verify scorecard has an overall score
    const scoreElement = page.getByText(/overall|score/i).first();
    await expect(scoreElement).toBeVisible({ timeout: 10_000 });
  });
});
