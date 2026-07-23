/**
 * The Vercel adapters in `api/` (D-032).
 *
 * These two files are three lines each and still took down the first staging
 * deploy. Vercel picks the handler signature from the shape of the export: a
 * bare `export default function` is dispatched as a Node.js
 * `(request, response)` handler, which is handed an `IncomingMessage` whose
 * `url` is a bare path and whose returned `Response` is discarded, and the
 * invocation hangs until it fails with a 5xx. Exporting `{ fetch }` selects the
 * Web signature. The type system does not catch it, so it is asserted here.
 *
 * These tests import the built package through the workspace link, so they also
 * prove the adapters' import specifier resolves - the other way a deploy fails
 * with no local signal. They need `pnpm build` to have run first.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

const REPO = resolve(import.meta.dirname, "../..");

describe("api/healthz.ts", () => {
  it("exports the Web `fetch` shape, not a bare default function", async () => {
    const mod = await import("../../api/healthz.js");
    expect(typeof mod.default).toBe("object");
    expect(typeof mod.default.fetch).toBe("function");
  });

  it("answers with a real Response", async () => {
    quiet();
    const mod = await import("../../api/healthz.js");
    const response = mod.default.fetch();
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});

describe("api/tree.ts", () => {
  it("exports the Web `fetch` shape, not a bare default function", async () => {
    const mod = await import("../../api/tree.js");
    expect(typeof mod.default).toBe("object");
    expect(typeof mod.default.fetch).toBe("function");
  });

  it("takes an absolute-URL Request and returns an SVG, rewrite shape included", async () => {
    quiet();
    const mod = await import("../../api/tree.js");
    // No PATs and no KV in this process, so the fetch fails and the error
    // table answers - which is the point: even the failure is a 200 image.
    const response = await mod.default.fetch(
      new Request("https://kodama.dev/api/tree?user=hana"),
    );
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect((await response.text()).startsWith("<svg")).toBe(true);
  });
});

describe("api/facts.ts", () => {
  it("exports the Web `fetch` shape, not a bare default function", async () => {
    const mod = await import("../../api/facts.js");
    expect(typeof mod.default).toBe("object");
    expect(typeof mod.default.fetch).toBe("function");
  });

  it("takes the rewrite shape and answers JSON with a real status", async () => {
    quiet();
    const mod = await import("../../api/facts.js");
    // No PATs in this process, so this is the outage path - and unlike the
    // image route, the outage path here is allowed to say 503 (D-034).
    const response = await mod.default.fetch(new Request("https://kodama.dev/api/facts?user=hana"));
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

/**
 * `vercel.json` itself.
 *
 * It is validated against a strict schema at deploy time and rejected for any
 * property the schema does not know - including a `//` comment key, which is
 * the second time that habit has cost a failed command in this repo. None of
 * these checks need a network or a deploy, and each one stands for a mistake
 * that is otherwise only reported by `vercel --prod` refusing to run.
 */
describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(resolve(REPO, "vercel.json"), "utf8")) as {
    functions: Record<string, unknown>;
    rewrites: Array<{ source: string; destination: string }>;
    [key: string]: unknown;
  };

  it("carries no comment keys, which the schema refuses", () => {
    const walk = (value: unknown, path: string): void => {
      if (value === null || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          walk(item, `${path}[${String(i)}]`);
        });
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        expect(key.startsWith("//"), `comment key at ${path}.${key}`).toBe(false);
        walk(child, `${path}.${key}`);
      }
    };
    walk(config, "$");
  });

  it("declares only functions that exist", () => {
    for (const file of Object.keys(config.functions)) {
      expect(existsSync(resolve(REPO, file)), file).toBe(true);
    }
  });

  it("rewrites only to functions that exist", () => {
    for (const rule of config.rewrites) {
      if (!rule.destination.startsWith("/api/")) continue;
      const file = `${rule.destination.slice(1)}.ts`;
      expect(existsSync(resolve(REPO, file)), `${rule.source} → ${rule.destination}`).toBe(true);
    }
  });

  /**
   * The bare-login rule matches any single segment (D-037). It is only safe
   * because the host serves real files first and because every more specific
   * rule is ahead of it - put it earlier and `/healthz` becomes a redirect to
   * somebody's tree.
   */
  it("keeps the bare-login catch-all last", () => {
    const catchAll = config.rewrites.findIndex((r) => r.source === "/:user");
    expect(catchAll, "the /:user rewrite is missing").toBeGreaterThanOrEqual(0);
    expect(catchAll).toBe(config.rewrites.length - 1);
  });
});
