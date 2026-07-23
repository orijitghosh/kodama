import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The landing funnel (IMPLEMENTATION 5.1, SPEC-SERVICE §5).
 *
 * Two claims are under test. First, the funnel works: a name goes in, a tree
 * and a pasteable line come out, and the picker changes both together. Second,
 * the static parts survive with JavaScript off - the badge is an `<img>`
 * and a line of markdown, and neither has any business needing a bundle.
 */

const ORIGIN = "https://kodama-sigma.vercel.app";

/** A minimal valid SVG, so no test depends on the live service answering. */
const STUB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="880" height="420" viewBox="0 0 880 420">' +
  '<rect width="880" height="420" fill="#101312"/></svg>';

async function stubBadges(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route(`${ORIGIN}/**`, async (route) => {
    seen.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB_SVG });
  });
  return seen;
}

test.describe("with JavaScript", () => {
  test("a username produces a tree and a pasteable line", async ({ page }) => {
    const requested = await stubBadges(page);
    await page.goto("/");

    await page.fill("#user", "defunkt");
    await page.click("button[type=submit]");

    await expect(page.locator("#tree")).toHaveAttribute("src", `${ORIGIN}/defunkt.svg`);
    await expect(page.locator("#snippet")).toHaveText(
      `![kodama tree for defunkt](${ORIGIN}/defunkt.svg)`,
    );
    expect(requested).toContain(`${ORIGIN}/defunkt.svg`);
  });

  test("the picker changes the image and the snippet together", async ({ page }) => {
    await stubBadges(page);
    await page.goto("/");
    await page.fill("#user", "defunkt");
    await page.click("button[type=submit]");

    await page.selectOption("#theme", "dusk");
    await page.selectOption("#scale", "compact");
    await page.uncheck("#animate");

    const expected = `${ORIGIN}/defunkt.svg?theme=dusk&scale=compact&animate=off`;
    await expect(page.locator("#tree")).toHaveAttribute("src", expected);
    await expect(page.locator("#snippet")).toHaveText(`![kodama tree for defunkt](${expected})`);
  });

  test("a default value never reaches the snippet", async ({ page }) => {
    await stubBadges(page);
    await page.goto("/");
    await page.fill("#user", "defunkt");
    await page.click("button[type=submit]");

    // Pick a non-default and come back: the parameter must leave again, or
    // every README carries a record of someone changing their mind.
    await page.selectOption("#theme", "dusk");
    await expect(page.locator("#snippet")).toContainText("theme=dusk");
    await page.selectOption("#theme", "ink");
    await expect(page.locator("#snippet")).toHaveText(
      `![kodama tree for defunkt](${ORIGIN}/defunkt.svg)`,
    );
  });

  test("an invalid username is refused before any request is made", async ({ page }) => {
    const requested = await stubBadges(page);
    await page.goto("/");

    await page.fill("#user", "-nope");
    await page.click("button[type=submit]");

    await expect(page.locator("#status")).toContainText("not a GitHub username");
    expect(requested.some((url) => url.includes("nope"))).toBe(false);
  });

  test("the configuration survives a reload, so a link can be shared", async ({ page }) => {
    await stubBadges(page);
    await page.goto("/?user=tj&theme=yozakura&scale=strip&tint=lang&animate=off");

    await expect(page.locator("#user")).toHaveValue("tj");
    await expect(page.locator("#theme")).toHaveValue("yozakura");
    await expect(page.locator("#scale")).toHaveValue("strip");
    await expect(page.locator("#tint")).toHaveValue("lang");
    await expect(page.locator("#animate")).not.toBeChecked();
    await expect(page.locator("#tree")).toHaveAttribute(
      "src",
      `${ORIGIN}/tj.svg?theme=yozakura&scale=strip&tint=lang&animate=off`,
    );
  });

  test("copy puts the snippet on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await stubBadges(page);
    await page.goto("/");
    await page.fill("#user", "defunkt");
    await page.click("button[type=submit]");

    await page.click("#copy");
    await expect(page.locator("#copy")).toHaveText("Copied");

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(`![kodama tree for defunkt](${ORIGIN}/defunkt.svg)`);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the demo tree and its snippet are still there", async ({ page }) => {
    const requested = await stubBadges(page);
    await page.goto("/");

    // Rendered at build time: no bundle ran, and the image is a real request
    // to the real route shape.
    await expect(page.locator("#tree")).toHaveAttribute("src", `${ORIGIN}/sindresorhus.svg`);
    await expect(page.locator("#snippet")).toHaveText(
      `![kodama tree for sindresorhus](${ORIGIN}/sindresorhus.svg)`,
    );
    expect(requested).toContain(`${ORIGIN}/sindresorhus.svg`);
  });

  test("the noscript block explains how to build the URL by hand", async ({ page }) => {
    await stubBadges(page);
    await page.goto("/");
    // Asserted against the served markup rather than the DOM: with scripting
    // off, Chromium still parses `<noscript>` contents as raw text, so the
    // element has children in the HTML and none in the tree.
    expect(await page.content()).toContain("YOUR-USERNAME.svg");
  });

  test("the username field validates natively, with the API's own pattern", async ({ page }) => {
    await stubBadges(page);
    await page.goto("/");

    // The hyphen is escaped. Browsers compile `pattern` with the `v` flag, and
    // the unescaped form is a syntax error there - which a browser handles by
    // dropping the constraint without a word, leaving a field that accepts
    // anything. See service/test/params.test.ts for the other half of this.
    const pattern = await page.locator("#user").getAttribute("pattern");
    expect(pattern).toBe("^[a-zA-Z0-9](?:[a-zA-Z0-9\\-]{0,38})$");

    const checks = await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>("#user");
      if (!el) return null;
      el.value = "-nope";
      const bad = el.checkValidity();
      el.value = "octocat";
      return { bad, good: el.checkValidity() };
    });
    expect(checks).toEqual({ bad: false, good: true });
  });
});
