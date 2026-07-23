import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSecrets, registerSecret, scrub, warn } from "../src/log.js";

afterEach(() => {
  clearSecrets();
  vi.restoreAllMocks();
});

describe("scrub", () => {
  it("redacts a registered secret whatever its shape", () => {
    registerSecret("s3cret-not-token-shaped");
    expect(scrub("using s3cret-not-token-shaped now")).toBe("using [redacted] now");
  });

  it("redacts classic tokens it was never told about", () => {
    const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    expect(scrub(`bad credentials for ${token}`)).toBe("bad credentials for [redacted]");
  });

  it("redacts fine-grained and OAuth token shapes", () => {
    expect(scrub("github_pat_11ABCDEFG0abcdefghijklmnop")).toBe("[redacted]");
    expect(scrub("gho_abcdefghijklmnopqrstuvwxyz01")).toBe("[redacted]");
  });

  it("keeps the scheme but drops the credential in an auth header", () => {
    expect(scrub("authorization: bearer abcdefghijklmnopqrst")).toBe(
      "authorization: bearer [redacted]",
    );
  });

  it("handles several secrets in one line", () => {
    const a = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(scrub(`${a} then ${b}`)).toBe("[redacted] then [redacted]");
  });

  it("leaves ordinary text alone", () => {
    expect(scrub("fetch failed for sindresorhus after 3 tries")).toBe(
      "fetch failed for sindresorhus after 3 tries",
    );
  });

  it("does not redact something merely resembling a prefix", () => {
    expect(scrub("ghp_short")).toBe("ghp_short");
  });
});

describe("warn", () => {
  it("scrubs the message and every context value", () => {
    const token = "ghp_cccccccccccccccccccccccccccccccccccc";
    registerSecret(token);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    warn(`refresh failed for ${token}`, { login: "hana", token });

    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0]![0] as string;
    expect(line).not.toContain("ghp_");
    expect(line).toContain("login=hana");
  });
});
