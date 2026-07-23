import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * SPEC-ENGINE §1 bans five ambient capabilities in the engine. This suite is
 * the enforcement proof: each probe is linted through the repository's real
 * ESLint config, at a path inside engine/src so the purity overlay applies.
 *
 * Written as a standing test rather than a one-off demonstration - the ban is
 * only worth as much as its continued enforcement.
 */
const engineSrc = resolve(import.meta.dirname, "../src");

const eslint = new ESLint({ cwd: resolve(import.meta.dirname, "../..") });

async function lintProbe(code: string): Promise<string[]> {
  const results = await eslint.lintText(code, {
    filePath: join(engineSrc, "__purity_probe__.ts"),
  });
  return results.flatMap((r) => r.messages.map((m) => m.message));
}

describe("engine purity is lint-enforced", () => {
  const probes: Array<[string, string]> = [
    ["Date.now", "export const t = Date.now();"],
    ["new Date", "export const t = new Date().getFullYear();"],
    ["Math.random", "export const r = Math.random();"],
    ["fetch", "export const go = () => fetch('https://example.com');"],
    ["process.env", "export const k = process.env.SECRET;"],
    ["toLocaleString", "export const s = (n: number) => n.toLocaleString();"],
    ["localeCompare", "export const c = (a: string, b: string) => a.localeCompare(b);"],
    ["node imports", "import { readFileSync } from 'node:fs';\nexport const f = readFileSync;"],
    ["Intl", "export const f = new Intl.NumberFormat();"],
  ];

  // The first probe pays for ESLint's config resolution and typescript-eslint's
  // startup, which is over a second locally and several on a shared runner.
  for (const [name, code] of probes) {
    it(
      `rejects ${name}`,
      async () => {
        const messages = await lintProbe(code);
        expect(messages.join("\n")).toMatch(/SPEC-ENGINE §1|SPEC-ENGINE §3\.3/);
      },
      30_000,
    );
  }

  it(
    "accepts pure code",
    async () => {
      const messages = await lintProbe(
        "export const add = (a: number, b: number): number => a + b;",
      );
      expect(messages).toEqual([]);
    },
    30_000,
  );
});

describe("engine source contains no ambient time or randomness", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
    });
  }

  it("has no banned tokens anywhere in src", () => {
    const banned = [/\bDate\.now\b/, /\bMath\.random\b/, /\bprocess\.env\b/, /\bnew Date\b/];
    const offenders: string[] = [];
    for (const file of walk(engineSrc)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of banned) {
        if (pattern.test(source)) offenders.push(`${file}: ${String(pattern)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares zero runtime dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
