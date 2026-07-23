import { describe, expect, it } from "vitest";

import { SingleFlight } from "../src/singleflight.js";

/** A promise the test resolves by hand, so overlap is deterministic. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SingleFlight", () => {
  it("runs one execution for concurrent callers on one key", async () => {
    const flight = new SingleFlight<string>();
    const gate = deferred<string>();
    let runs = 0;

    const work = () => {
      runs += 1;
      return gate.promise;
    };
    const a = flight.run("hana", work);
    const b = flight.run("hana", work);
    expect(flight.size).toBe(1);

    gate.resolve("history");
    expect(await Promise.all([a, b])).toEqual(["history", "history"]);
    expect(runs).toBe(1);
  });

  it("keeps different keys independent", async () => {
    const flight = new SingleFlight<string>();
    let runs = 0;
    const work = (value: string) => () => {
      runs += 1;
      return Promise.resolve(value);
    };
    expect(await Promise.all([flight.run("a", work("a")), flight.run("b", work("b"))])).toEqual([
      "a",
      "b",
    ]);
    expect(runs).toBe(2);
  });

  it("shares the rejection, then forgets it so a retry really retries", async () => {
    const flight = new SingleFlight<string>();
    const gate = deferred<string>();
    let runs = 0;

    const failing = () => {
      runs += 1;
      return gate.promise;
    };
    const a = flight.run("hana", failing);
    const b = flight.run("hana", failing);
    gate.reject(new Error("github down"));

    await expect(a).rejects.toThrow("github down");
    await expect(b).rejects.toThrow("github down");
    expect(runs).toBe(1);
    expect(flight.size).toBe(0);

    await expect(flight.run("hana", () => Promise.resolve("recovered"))).resolves.toBe("recovered");
    expect(runs).toBe(1);
  });

  it("clears the slot after success so the next request re-reads the cache", async () => {
    const flight = new SingleFlight<number>();
    await flight.run("hana", () => Promise.resolve(1));
    expect(flight.size).toBe(0);
    await expect(flight.run("hana", () => Promise.resolve(2))).resolves.toBe(2);
  });
});
