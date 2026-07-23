/**
 * Single-flight (SPEC-SERVICE §3).
 *
 * A popular README going cold at the same moment across a region would
 * otherwise start N identical cold fetches, each ~20 points. One runs; the
 * rest await it.
 *
 * In-process only: serverless gives no shared lock, so this collapses the
 * stampede within an instance and the KV write collapses what is left between
 * instances.
 */

export class SingleFlight<T> {
  readonly #inflight = new Map<string, Promise<T>>();

  /** Callers sharing a key share one execution and one outcome. */
  run(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.#inflight.get(key);
    if (existing !== undefined) return existing;

    // Failures are shared too, then forgotten: a retry after a rejection must
    // actually retry, not re-await a settled rejected promise.
    const started = work().finally(() => {
      this.#inflight.delete(key);
    });
    this.#inflight.set(key, started);
    return started;
  }

  /** Live flight count, for `/healthz`. */
  get size(): number {
    return this.#inflight.size;
  }
}
