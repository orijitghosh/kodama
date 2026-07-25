import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { receiptsFor, render, treeFacts } from "@kodama/engine";
import type { Receipt } from "@kodama/engine";

import { richHistory, TODAY } from "./helpers/history";

/**
 * The receipts page (IMPLEMENTATION 5.2, SPEC-SERVICE §5, PRD §Receipts layer).
 *
 * The tree and the explanation are stubbed from the engine itself, not from
 * hand-written fixtures. That is the only way this suite can prove the thing it
 * claims: that the classes the renderer emits and the targets the receipts name
 * are the same set. A hand-written SVG would let a class rename sail through.
 */

const ORIGIN = "https://kodama-sigma.vercel.app";
const LOGIN = "hana";

const history = richHistory(LOGIN);
const facts = treeFacts(history, TODAY);
const receipts: Receipt[] = receiptsFor(facts, "en");
const svg = render(history, TODAY, {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
});

async function stubApi(page: Page, overrides: { status?: number } = {}): Promise<void> {
  await page.route(`${ORIGIN}/${LOGIN}.svg**`, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg }),
  );
  await page.route(`${ORIGIN}/api/${LOGIN}.json`, (route) =>
    route.fulfill({
      status: overrides.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify({
        v: 1,
        engine: "v1",
        login: LOGIN,
        date: TODAY,
        stale: false,
        facts,
        receipts,
        history,
      }),
    }),
  );
}

/** The page is served at `/tree` and reached at `/tree/<user>` via a rewrite. */
async function openReceipts(page: Page): Promise<void> {
  await page.goto(`/tree/?user=${LOGIN}`);
  await expect(page.locator("#frame")).toHaveAttribute("aria-busy", "false");
}

test.describe("receipts", () => {
  test("lists one line per element, with the figure behind it", async ({ page }) => {
    await stubApi(page);
    await openReceipts(page);

    const items = page.locator("#receipts li");
    await expect(items).toHaveCount(receipts.length);

    // The provenance shown is the provenance the engine computed - not a
    // paraphrase the page invented.
    for (const receipt of receipts) {
      await expect(page.locator("#receipts")).toContainText(receipt.provenance);
    }
  });

  test("every receipt found its element in the drawn tree", async ({ page }) => {
    await stubApi(page);
    await openReceipts(page);

    // If a target class did not exist in the SVG the page silently skips it,
    // which is the failure mode worth catching: the list would still look full.
    const decorated = await page.locator("#frame [data-receipt]").evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-receipt")),
    );
    expect(new Set(decorated)).toEqual(new Set(receipts.map((r) => r.target)));
  });

  test("an ornament is focusable and says what it is", async ({ page }) => {
    await stubApi(page);
    await openReceipts(page);

    const fruit = receipts.find((r) => r.target === "kd-fruits");
    expect(fruit, "the fixture should have merged pull requests").toBeDefined();

    const node = page.locator('#frame [data-receipt="kd-fruits"]');
    await expect(node).toHaveAttribute("role", "img");
    await expect(node).toHaveAttribute("tabindex", "0");
    await expect(node).toHaveAttribute("aria-label", new RegExp(escapeRe(fruit!.value)));

    await node.focus();
    await expect(page.locator("#tooltip")).toContainText(fruit!.provenance);
  });

  test("the keyboard reaches the tree, not just the mouse", async ({ page }) => {
    await stubApi(page);
    await openReceipts(page);

    // Tab from the top of the document until focus lands inside the SVG. If
    // nothing in the tree is reachable this exhausts and fails, which is the
    // point - hover-only provenance is provenance a screen reader cannot check.
    let landed = false;
    for (let i = 0; i < 30 && !landed; i += 1) {
      await page.keyboard.press("Tab");
      landed = await page.evaluate(() =>
        Boolean(document.activeElement?.closest("#frame [data-receipt]")),
      );
    }
    expect(landed).toBe(true);
    await expect(page.locator("#tooltip")).not.toBeEmpty();
  });

  test("says so plainly when the account does not exist", async ({ page }) => {
    await stubApi(page, { status: 404 });
    await page.goto(`/tree/?user=${LOGIN}`);
    await expect(page.locator("#error")).toContainText("no account");
  });

  test("has no axe violations", async ({ page }) => {
    await stubApi(page);
    await openReceipts(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
});

test.describe("the landing page", () => {
  test("has no axe violations either", async ({ page }) => {
    await page.route(`${ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg }),
    );
    await page.goto("/");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });

  test("hands the visitor on to the receipts for the name they typed", async ({ page }) => {
    await page.route(`${ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg }),
    );
    await page.goto("/");
    await page.fill("#user", "defunkt");
    await page.click("button[type=submit]");
    await expect(page.locator("#receipts-link")).toHaveAttribute("href", "/tree/defunkt");
  });
});

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
