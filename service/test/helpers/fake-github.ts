/**
 * A stand-in for api.github.com, routing by operation name.
 *
 * Records what was asked and with which token, so tests can assert the fan-out
 * shape (one identity query, N year queries) and the pool rotation without
 * reaching into either class.
 */

import { calendar } from "./responses.js";
import type { DayInput } from "./responses.js";

export interface FakeAccount {
  login: string;
  createdAt: string;
  days: DayInput[];
  reviewsPerYear?: number;
  mergedTotal?: number;
  openPRs?: number;
  closedIssues?: number;
  answers?: number;
  stars?: number[];
  languages?: { name: string; size: number }[];
}

export interface FakeCall {
  operation: string;
  token: string;
  variables: Record<string, unknown>;
}

export interface FakeGitHubOptions {
  accounts: FakeAccount[];
  /** Per-operation failure injection; the value is the HTTP status to return. */
  failWith?: Partial<Record<string, number>>;
  /** Headers to send with an injected failure - `retry-after` and friends. */
  failHeaders?: Record<string, string>;
  /** Return a GraphQL-level error for these operations. */
  graphqlError?: Partial<Record<string, { message: string; type?: string }>>;
  /** Throw at the transport layer, as a dropped connection would. */
  networkError?: boolean;
  remaining?: number;
}

export interface FakeGitHub {
  fetchImpl: typeof fetch;
  calls: FakeCall[];
  countOf: (operation: string) => number;
}

const RATE = (remaining: number) => ({
  cost: 1,
  limit: 5000,
  remaining,
  resetAt: "2026-07-21T22:00:00Z",
});

export function fakeGitHub(options: FakeGitHubOptions): FakeGitHub {
  const calls: FakeCall[] = [];

  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const operation = /query (\w+)/.exec(body.query)?.[1] ?? "unknown";
    const token = String(init?.headers ? (init.headers as Record<string, string>)["authorization"] : "")
      .replace(/^bearer /, "");
    calls.push({ operation, token, variables: body.variables });

    if (options.networkError === true) throw new TypeError("fetch failed");

    const headers = options.failHeaders ?? {};

    const status = options.failWith?.[operation];
    if (status !== undefined) {
      return new Response("upstream said no", { status, headers });
    }

    const gqlError = options.graphqlError?.[operation];
    if (gqlError !== undefined) {
      // A primary-limit rejection carries no `data`, which is the case the pool
      // has to survive on headers alone.
      return Response.json(
        gqlError.type === "RATE_LIMITED"
          ? { data: null, errors: [gqlError] }
          : { data: { rateLimit: RATE(options.remaining ?? 4999) }, errors: [gqlError] },
        { headers },
      );
    }

    const login = String(body.variables["login"] ?? "");
    const account = options.accounts.find((a) => a.login.toLowerCase() === login.toLowerCase());
    if (account === undefined) {
      return Response.json({
        data: { user: null, rateLimit: RATE(options.remaining ?? 4999) },
        errors: [{ message: "Could not resolve to a User.", type: "NOT_FOUND" }],
      });
    }

    return Response.json({
      data: { ...payloadFor(operation, account, body.variables), rateLimit: RATE(options.remaining ?? 4999) },
    });
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    calls,
    countOf: (operation) => calls.filter((c) => c.operation === operation).length,
  };
}

function payloadFor(
  operation: string,
  account: FakeAccount,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  switch (operation) {
    case "Identity":
      return { user: { login: account.login, createdAt: `${account.createdAt}T00:00:00Z` } };
    case "Counts":
      return {
        user: {
          mergedPRs: { totalCount: account.mergedTotal ?? 0, nodes: [] },
          openPRs: { totalCount: account.openPRs ?? 0 },
          closedIssues: { totalCount: account.closedIssues ?? 0 },
          answers: { totalCount: account.answers ?? 0 },
        },
      };
    case "Stars":
      return {
        user: {
          repositories: { nodes: (account.stars ?? []).map((stargazerCount) => ({ stargazerCount })) },
        },
      };
    case "Languages":
      return {
        user: {
          repositories: {
            nodes: [
              {
                languages: {
                  edges: (account.languages ?? []).map((l) => ({
                    size: l.size,
                    node: { name: l.name },
                  })),
                },
              },
            ],
          },
        },
      };
    case "Year": {
      const from = String(variables["from"]).slice(0, 10);
      const to = String(variables["to"]).slice(0, 10);
      const days = account.days.filter((d) => d.date >= from && d.date <= to);
      return {
        user: {
          contributionsCollection: {
            totalPullRequestReviewContributions: account.reviewsPerYear ?? 0,
            contributionCalendar: calendar(days),
          },
        },
      };
    }
    default:
      return {};
  }
}
