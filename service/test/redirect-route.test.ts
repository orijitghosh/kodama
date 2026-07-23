import { describe, expect, it } from "vitest";

import { handleUserRedirect } from "../src/redirect-route.js";

const get = (path: string) => handleUserRedirect(new Request(`https://kodama.dev${path}`));

describe("handleUserRedirect", () => {
  it("sends a bare login to its receipts page", () => {
    const response = get("/octocat");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/tree/octocat");
  });

  it("accepts the rewrite shape the host actually delivers", () => {
    const response = get("/api/redirect?user=octocat");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/tree/octocat");
  });

  it("uses 302, because where a bare login should land is still a product decision", () => {
    expect(get("/octocat").status).toBe(302);
  });

  it("404s anything that is not a login", () => {
    for (const path of ["/-nope", "/has%20space", "/a/b", "/"]) {
      expect(get(path).status, path).toBe(404);
    }
  });

  /**
   * The catch-all is only safe because the host serves real files first. These
   * cases would already have been answered from disk in production - the
   * assertion is that if one ever slipped through, it fails closed rather than
   * redirecting somebody to `/tree/favicon.ico`.
   */
  it("refuses anything carrying a dot, so a static asset is never a username", () => {
    for (const path of ["/favicon.ico", "/robots.txt", "/sitemap.xml"]) {
      expect(get(path).status, path).toBe(404);
    }
  });

  it("cannot be talked into a path separator through the query", () => {
    const response = get("/api/redirect?user=octocat%2F..%2Fadmin");
    expect(response.status).toBe(404);
  });
});
