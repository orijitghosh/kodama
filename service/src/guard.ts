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
 * behind one address.
 *
 * It is not a small slice of the budget. A cold fetch is 15-23 points (OPS §3),
 * so forty of them is 600-920 points - about 16% of one account's 5 000-point
 * hour - and roughly six capped sources empty an account. What the cap bounds
 * is the drain *per network*, which is why the unit counted is the network and
 * not the address (`networkOf`).
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
  return fnv1a32(networkOf(first)).toString(16);
}

/**
 * The unit a client is counted by: an IPv4 address, or an IPv6 /64.
 *
 * An IPv6 subscriber is routinely handed a whole /64 - 2^64 addresses - and can
 * step to a fresh one on every request, so counting per address gave one machine
 * an unlimited number of forty-fetch allowances. The /64 is the smallest block
 * an ISP assigns to one customer, which makes it the IPv6 counterpart of "one
 * address". An IPv4-mapped address (`::ffff:203.0.113.7`) is IPv4 and is counted
 * as that address.
 *
 * Anything that does not parse is returned as given: it is still hashed and
 * still counted, just on its own.
 */
export function networkOf(address: string): string {
  const bare = address.split("%")[0]!.toLowerCase();
  if (!bare.includes(":")) return bare;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  if (mapped !== null) return mapped[1]!;

  const halves = bare.split("::");
  if (halves.length > 2) return bare;
  const groupsOf = (half: string | undefined): string[] =>
    half === undefined || half === "" ? [] : half.split(":");
  const head = groupsOf(halves[0]);
  const tail = groupsOf(halves[1]);
  // A dotted tail (`64:ff9b::192.0.2.1`) fills two groups. Only the first four
  // are kept, so its value never matters - only the space it takes.
  const width = (groups: string[]): number =>
    groups.reduce((n, g) => n + (g.includes(".") ? 2 : 1), 0);
  const missing = 8 - width(head) - width(tail);
  const compressed = halves.length === 2;
  if (compressed ? missing < 1 : missing !== 0) return bare;

  const groups = [...head, ...Array<string>(compressed ? missing : 0).fill("0"), ...tail];
  const prefix = groups.slice(0, 4);
  if (!prefix.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return bare;
  return `${prefix.map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}
