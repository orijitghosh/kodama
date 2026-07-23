import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;

/**
 * The funnel is tested against the built static output, not the dev server:
 * the acceptance claim is about what ships, and Astro's dev server hydrates
 * differently enough that a green dev run would not be evidence.
 *
 * Every request for a badge is intercepted in the tests themselves, so the
 * suite never touches the live service - a funnel test that fails because
 * GitHub was slow is a test that gets ignored.
 */
export default defineConfig({
  testDir: "./test",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm run build && pnpm run preview",
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
