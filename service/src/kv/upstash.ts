/**
 * Upstash Redis over its REST API (D-027).
 *
 * No SDK. The port is four methods over two REST shapes - one command, or a
 * pipeline of them - so a dependency would only add retries we do not want (a
 * slow cache is worse than a missed one) and another client to keep current.
 * `fetch` is ambient on every runtime this package targets.
 *
 * Credentials arrive as `KV_REST_API_URL` / `KV_REST_API_TOKEN`, injected by
 * the Vercel Marketplace integration. They are the same names the sunset Vercel
 * KV used, hence the "no action required" note in `dev/OPS.md` §1.
 *
 * Every method here may throw, by design: `guarded()` turns a failing store
 * into a cache miss, which only works if failures reach it.
 */

import type { KV } from "./index.js";

export interface UpstashOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  /**
   * A cache read must never outlast the request it is speeding up. Past this,
   * fetching GitHub directly is the faster path.
   */
  timeoutMs?: number;
}

interface UpstashReply {
  result?: unknown;
  error?: string;
}

export class UpstashKV implements KV {
  readonly #url: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: UpstashOptions) {
    this.#url = options.url.replace(/\/+$/, "");
    this.#token = options.token;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 1_000;
  }

  async get(key: string): Promise<string | null> {
    const result = await this.#command(["GET", key]);
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError(`ttlSeconds must be positive, got ${String(ttlSeconds)}`);
    }
    await this.#command(["SET", key, value, "EX", String(Math.floor(ttlSeconds))]);
  }

  async del(key: string): Promise<void> {
    await this.#command(["DEL", key]);
  }

  /**
   * INCR then EXPIRE, in one round trip over Upstash's pipeline endpoint.
   *
   * Two commands because Redis has no "increment with expiry"; one request
   * because a cap that costs two round trips on the cold path is a cap that
   * makes the thing it protects slower. The expiry is re-set on every hit rather
   * than only on creation - the key already carries its hour in its name, so
   * refreshing the TTL cannot widen the window it counts.
   */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError(`ttlSeconds must be positive, got ${String(ttlSeconds)}`);
    }
    const results = await this.#pipeline([
      ["INCR", key],
      ["EXPIRE", key, String(Math.floor(ttlSeconds))],
    ]);
    const count = results[0];
    if (typeof count !== "number") throw new Error("upstash INCR returned no count");
    return count;
  }

  /**
   * Upstash's REST protocol: the command is the JSON body, the reply is
   * `{ result }` or `{ error }`.
   */
  async #command(command: readonly string[]): Promise<unknown> {
    const reply = (await this.#post(this.#url, command, command[0])) as UpstashReply;
    if (typeof reply.error === "string") {
      throw new Error(`upstash ${command[0] ?? "?"} failed: ${reply.error}`);
    }
    return reply.result ?? null;
  }

  /** The same protocol, batched: an array of commands in, an array of replies out. */
  async #pipeline(commands: readonly (readonly string[])[]): Promise<unknown[]> {
    const label = commands[0]?.[0];
    const reply = (await this.#post(`${this.#url}/pipeline`, commands, label)) as UpstashReply[];
    if (!Array.isArray(reply)) throw new Error(`upstash ${label ?? "?"} failed: not a pipeline`);
    return reply.map((entry) => {
      if (typeof entry.error === "string") {
        throw new Error(`upstash ${label ?? "?"} failed: ${entry.error}`);
      }
      return entry.result ?? null;
    });
  }

  async #post(url: string, body: unknown, label: string | undefined): Promise<unknown> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    const response = await this.#fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      // The key can name a login, so the command is not echoed into the error.
      throw new Error(`upstash ${label ?? "?"} failed: HTTP ${String(response.status)}`);
    }
    return await response.json();
  }
}

/**
 * Reads the Marketplace-injected credentials, or returns null when they are
 * absent - which is the local-development case, not an error. The caller
 * falls back to `MemoryKV` and logs once.
 */
export function upstashFromEnv(env: Record<string, string | undefined>): UpstashKV | null {
  const url = env["KV_REST_API_URL"];
  const token = env["KV_REST_API_TOKEN"];
  if (url === undefined || token === undefined) return null;
  if (url.length === 0 || token.length === 0) return null;
  return new UpstashKV({ url, token });
}
