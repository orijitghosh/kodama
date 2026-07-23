/**
 * The GraphQL transport.
 *
 * One job: send a document with a pooled token, classify what came back, and
 * hand the quota reading to the pool. Every failure mode the route has a
 * designed SVG for (SPEC-SERVICE §4) is a `kind` on the error thrown here.
 */

import { scrub } from "../log.js";
import type { PatPool, RateLimitReading } from "./pool.js";

export type GitHubErrorKind =
  | "notFound"
  | "rateLimited"
  | "unauthorized"
  | "server"
  | "network"
  | "shape";

export class GitHubError extends Error {
  override readonly name = "GitHubError";
  readonly kind: GitHubErrorKind;
  readonly status: number | undefined;

  constructor(kind: GitHubErrorKind, message: string, status?: number) {
    // Messages carry GitHub's own text, which has been known to echo a token
    // back from a malformed header.
    super(scrub(message));
    this.kind = kind;
    this.status = status;
  }
}

interface GraphQLBody {
  data?: Record<string, unknown> | null;
  errors?: { message: string; type?: string }[];
}

export interface GitHubClientOptions {
  pool: PatPool;
  /** Injected for tests; production passes the global. */
  fetchImpl?: typeof fetch;
  /** Abort a single query after this long. */
  timeoutMs?: number;
}

export class GitHubClient {
  readonly #pool: PatPool;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  /** Points spent this process, for `/healthz` and the cost sheet. */
  spent = 0;

  constructor(options: GitHubClientOptions) {
    this.#pool = options.pool;
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  async query<T>(document: string, variables: Record<string, unknown>): Promise<T> {
    const token = this.#pool.acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.#timeoutMs);

    let response: Response;
    try {
      response = await this.#fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "kodama",
        },
        body: JSON.stringify({ query: document, variables }),
        signal: controller.signal,
      });
    } catch (err) {
      this.#pool.penalize(token, "transport");
      throw new GitHubError("network", err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      this.#pool.penalize(token, "auth");
      throw new GitHubError(
        response.status === 401 ? "unauthorized" : "rateLimited",
        `github returned ${String(response.status)}`,
        response.status,
      );
    }
    if (response.status >= 500) {
      throw new GitHubError("server", `github returned ${String(response.status)}`, response.status);
    }

    const text = await response.text();
    let body: GraphQLBody;
    try {
      body = JSON.parse(text) as GraphQLBody;
    } catch {
      throw new GitHubError("shape", `non-JSON response: ${text.slice(0, 120)}`, response.status);
    }

    const reading = body.data?.["rateLimit"] as RateLimitReading | undefined;
    if (reading !== undefined) {
      this.#pool.report(token, reading);
      this.spent += reading.cost;
    }

    if (body.errors !== undefined && body.errors.length > 0) {
      const first = body.errors[0]!;
      // GraphQL reports a missing user as a 200 with a NOT_FOUND error, so the
      // "user not found" SVG hangs off this branch rather than off a status.
      const kind: GitHubErrorKind =
        first.type === "NOT_FOUND"
          ? "notFound"
          : first.type === "RATE_LIMITED"
            ? "rateLimited"
            : "server";
      throw new GitHubError(kind, body.errors.map((e) => e.message).join("; "), response.status);
    }

    if (body.data === null || body.data === undefined) {
      throw new GitHubError("shape", "response had no data", response.status);
    }
    if (body.data["user"] === null) {
      throw new GitHubError("notFound", "user not found", response.status);
    }
    return body.data as T;
  }
}
