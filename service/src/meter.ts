/**
 * The error-rate meter behind `/healthz` (SPEC-SERVICE §3, IMPLEMENTATION 6.2).
 *
 * The image route returns 200 with a valid SVG on every path (route.ts), which
 * keeps READMEs from showing a broken image but also hides failures: an
 * exhausted pool, a GitHub outage and a dead KV are all served as a 200
 * "come back soon" seedling, so the status code, the CDN and any uptime checker
 * stay green. This meter is where those failures get counted.
 *
 * It counts a rolling window rather than a lifetime total. A warm Vercel
 * instance can serve for hours, and a lifetime counter with 5 000 healthy
 * renders behind it would dilute a fresh outage below any threshold. The ring
 * keeps the last `capacity` outcomes, so `/healthz` reports how this instance is
 * doing now.
 *
 * Scope is one warm instance. A cold start begins an empty window, which is
 * correct - a new process has no error history - and the next hundred renders
 * refill it. Cross-instance aggregation belongs to Vercel's logs
 * (SPEC-SERVICE §3: log drain or simple threshold).
 */

/** The rolling window size - the last N image-route outcomes. */
export const METER_CAPACITY = 100;

/**
 * Below this many samples the fraction is too noisy to alert on: three renders,
 * one degraded, is not a 33% error rate worth paging over. `/healthz` still
 * reports the raw numbers; only the *alert* waits for a real sample.
 */
export const METER_MIN_SAMPLES = 20;

export interface MeterSnapshot {
  /** Outcomes currently in the window, up to `METER_CAPACITY`. */
  samples: number;
  /** How many of those were degraded (a failure served as a 200). */
  degraded: number;
  /** `degraded / samples`, or 0 when the window is empty. */
  fraction: number;
}

/**
 * A fixed-size ring of booleans (degraded or not). No timestamps: "the last 100
 * renders" is a better outage signal than "the last 100 seconds," because a
 * badge that nobody loads for an hour should not age its own error history out.
 */
export class Meter {
  private readonly ring: boolean[];
  private next = 0;
  private filled = 0;
  private degradedCount = 0;

  constructor(private readonly capacity = METER_CAPACITY) {
    this.ring = new Array<boolean>(capacity).fill(false);
  }

  /** Record one image-route outcome. `degraded` = a failure served as a 200. */
  record(degraded: boolean): void {
    if (this.filled === this.capacity && this.ring[this.next]) {
      // Evicting a degraded sample: drop it from the running count first.
      this.degradedCount -= 1;
    }
    this.ring[this.next] = degraded;
    if (degraded) this.degradedCount += 1;
    this.next = (this.next + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
  }

  snapshot(): MeterSnapshot {
    return {
      samples: this.filled,
      degraded: this.degradedCount,
      fraction: this.filled === 0 ? 0 : this.degradedCount / this.filled,
    };
  }
}
