import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { allSpecimenIds, SPECIMENS, specimenId } from "../src/specimens";

/**
 * The grammar page and the gallery (IMPLEMENTATION 5.3).
 *
 * Both are fully static, so unlike the funnel and the receipts page these tests
 * need no stubbing at all - what the browser fetches is what the build wrote.
 */

test.describe("the grammar page", () => {
  test("draws its specimen inline, so the rows have something to point at", async ({ page }) => {
    await page.goto("/grammar");

    // Inline, not an <img>: the legend needs the elements as DOM nodes.
    await expect(page.locator(".specimen svg")).toBeVisible();
    await expect(page.locator(".specimen img")).toHaveCount(0);
  });

  test("every marked row points at an element that is actually on the specimen", async ({
    page,
  }) => {
    await page.goto("/grammar");

    const targets = await page
      .locator("tr[data-target]")
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.target));

    expect(targets.length).toBeGreaterThan(6);
    for (const target of targets) {
      await expect(page.locator(`.specimen .${target ?? ""}`).first()).toHaveCount(1);
    }
  });

  test("a row highlights its element on focus, not only on hover", async ({ page }) => {
    await page.goto("/grammar");

    const row = page.locator('tr[data-target="kd-lanterns"]');
    await row.focus();
    await expect(row).toHaveClass(/kd-hot/);
    await expect(page.locator(".specimen .kd-lanterns")).toHaveClass(/kd-hot/);
  });

  test("covers every Tier-1 signal in the PRD grammar table", async ({ page }) => {
    await page.goto("/grammar");
    // Thirteen rows, one per signal. A row quietly disappearing is the way this
    // page rots: it is the launch post's canonical link.
    await expect(page.locator("tbody tr")).toHaveCount(13);
  });

  test("has no axe violations", async ({ page }) => {
    await page.goto("/grammar");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
});

test.describe("the gallery", () => {
  test("shows every judged specimen, labelled", async ({ page }) => {
    await page.goto("/gallery");

    await expect(page.locator("figure img")).toHaveCount(allSpecimenIds().length);
    for (const specimen of SPECIMENS) {
      await expect(page.getByRole("heading", { name: specimen.title })).toBeVisible();
    }
  });

  test("serves each specimen as a real SVG file, not inline", async ({ page, request }) => {
    await page.goto("/gallery");

    // As files they are lazy and cacheable; inline they would put a third of a
    // megabyte in the critical path of a page that is mostly scrolled.
    const first = specimenId({ fixture: "maintainer", theme: "ink", season: "summer" });
    const response = await request.get(`/specimen/${first}.svg`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect((await response.text()).startsWith("<svg")).toBe(true);
  });

  test("every image is lazy and carries a real alt text", async ({ page }) => {
    await page.goto("/gallery");

    const images = page.locator("figure img");
    for (let i = 0; i < (await images.count()); i += 1) {
      const image = images.nth(i);
      await expect(image).toHaveAttribute("loading", "lazy");
      const alt = await image.getAttribute("alt");
      expect(alt ?? "").not.toBe("");
    }
  });

  test("has no axe violations", async ({ page }) => {
    await page.goto("/gallery");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
});

test.describe("navigation", () => {
  test("every page can reach every other one", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "grammar" }).click();
    await expect(page).toHaveURL(/\/grammar/);

    await page.getByRole("link", { name: "gallery" }).click();
    await expect(page).toHaveURL(/\/gallery/);

    await page.getByRole("link", { name: "kodama" }).click();
    // The landing page rewrites its own query to the permalink as soon as the
    // funnel runs, so the path is the thing to assert on.
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/(\?|$)/);
  });
});
