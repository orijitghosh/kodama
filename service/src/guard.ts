/**
 * The cold-fetch cap (PRD §Architecture, §Risks: "per-IP cache-miss limits").
 *
 * Everything else in the service defends the *budget* after it is being spent -
 * the pool benches a refused token, the CDN and KV keep the steady state nearly
 * free, serve-stale keeps a badge drawing through an outage. Nothing decided who
 * was allowed to spend it in the first place.
 *
 * That gap is cheap to walk through. A login that does not exist still costs a
 * GraphQL query, names are free to invent, and an account's budget is 5 000
 * points an hour (D-029) - so a few thousand requests for `?????` drain it and
 * every uncached badge in the world degrades to the seedling. `missKey` in the
 * KV port closes the repeat case; this closes the case where every name is new.
 *
 * Two properties matter more than precision:
 *
 *   - **It fails open.** A store that cannot count returns 0 from `incr`, and 0
 *     lets the request through. A cache outage must not become a refusal.
 *   - **It keeps no address.** The counter is keyed by a 32-bit hash of the
 *     client, which is all an abuse counter needs and all PRD §Privacy allows.
 */

import { fnv1a32 } from "@kodama/engine";

import { coldKey, COLD_TTL_S } from "./kv/index.js";
import type { KV } from "./kv/index.js";

/**
 * Cold fetches one client may charge to the pool per hour.
 *
 * Sized against the honest heavy user rather than the median: browsing the
 * gallery, pasting a few logins into the landing page and reloading a receipts
 * page costs single digits. Forty leaves room for a shared NAT or an office
 * behind one address, and caps a single source at under 1% of the hourly budget.
 */
export const COLD_FETCHES_PER_HOUR = 40;

const HOUR_MS = 3_600_000;

/** Raised instead of spending, when a client is over its hourly allowance. */
export class ColdBudgetError extends Error {
  /** When the current bucket rolls - the route turns it into `retry-after`. */
  readonly retryAtMs: number;

  constructor(retryAtMs: number) {
    super("cold fetch budget exhausted for this client");
    this.name = "ColdBudgetError";
    this.retryAtMs = retryAtMs;
  }
}

export interface ColdGuard {
  /**
   * Charges one cold fetch to `client`, throwing `ColdBudgetError` when that
   * client is over its allowance. It throws rather than returning a boolean
   * because the refusal carries a deadline the caller has no other way to know,
   * and because a caller that forgets to check a boolean spends the budget.
   *
   * A null client - no forwarding header, so a local call or a runtime that
   * hides it - is not charged and never refused.
   */
  charge(client: string | null): Promise<void>;
}

export interface ColdGuardOptions {
  kv: KV;
  /** Defaults to `COLD_FETCHES_PER_HOUR`; tests want a reachable number. */
  cap?: number;
  now?: () => number;
}

export class KvColdGuard implements ColdGuard {
  readonly #kv: KV;
  readonly #cap: number;
  readonly #now: () => number;

  constructor(options: ColdGuardOptions) {
    this.#kv = options.kv;
    this.#cap = options.cap ?? COLD_FETCHES_PER_HOUR;
    this.#now = options.now ?? (() => Date.now());
  }

  async charge(client: string | null): Promise<void> {
    if (client === null) return;
    const now = this.#now();
    const bucket = Math.floor(now / HOUR_MS);
    const count = await this.#kv.incr(coldKey(client, bucket), COLD_TTL_S);
    // 0 is the port's "could not answer"; a real count starts at 1.
    if (count !== 0 && count > this.#cap) throw new ColdBudgetError((bucket + 1) * HOUR_MS);
  }
}

/**
 * Who to charge, as a hash rather than an address.
 *
 * `x-forwarded-for` is a client-supplied list that proxies append to, so only
 * the *first* hop is meaningful here - and even that is spoofable. That is
 * acceptable: the cap exists to stop the cheap accidental drain (a crawler, a
 * loop, a scripted sweep), not to stop someone who has decided to rotate
 * addresses. Vercel appends the real peer, so the header is present in
 * production and absent in tests.
 */
export function clientOf(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first === undefined || first.length === 0) return null;
  return fnv1a32(first).toString(16);
}
