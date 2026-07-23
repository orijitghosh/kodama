/**
 * In-process KV, for tests and for local development without a store.
 *
 * The clock is injected so TTL behaviour can be asserted without sleeping;
 * production passes nothing and gets `Date.now`.
 */

import type { KV } from "./index.js";

interface Entry {
  value: string;
  expiresAtMs: number;
}

export interface MemoryKvOptions {
  /** Milliseconds since the epoch. Defaults to the wall clock. */
  now?: () => number;
}

export class MemoryKV implements KV {
  readonly #entries = new Map<string, Entry>();
  readonly #now: () => number;

  /** Counted so tests can prove the request flow spends what it claims. */
  ops = { get: 0, set: 0, del: 0 };

  constructor(options: MemoryKvOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
  }

  get(key: string): Promise<string | null> {
    this.ops.get += 1;
    const entry = this.#entries.get(key);
    if (entry === undefined) return Promise.resolve(null);
    if (entry.expiresAtMs <= this.#now()) {
      this.#entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError(`ttlSeconds must be positive, got ${String(ttlSeconds)}`);
    }
    this.ops.set += 1;
    this.#entries.set(key, { value, expiresAtMs: this.#now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.ops.del += 1;
    this.#entries.delete(key);
    return Promise.resolve();
  }

  /** Live key count, expiries excluded. Test and `/healthz` affordance. */
  get size(): number {
    const now = this.#now();
    let live = 0;
    for (const entry of this.#entries.values()) if (entry.expiresAtMs > now) live += 1;
    return live;
  }

  clear(): void {
    this.#entries.clear();
    this.ops = { get: 0, set: 0, del: 0 };
  }
}
