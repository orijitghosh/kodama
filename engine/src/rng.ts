/**
 * The engine's only source of randomness (SPEC-ENGINE §3.3).
 *
 * Two properties matter more than statistical quality here:
 *
 * 1. Cross-platform determinism. mulberry32 is pure 32-bit integer work, so two
 *    machines agree bit for bit, unlike anything carrying float state.
 * 2. Substream independence. Draws come from labelled substreams rather than
 *    one shared sequence, so adding a draw site later (wind chimes, say) cannot
 *    reshuffle the attractor cloud and repose every existing tree. The label is
 *    hashed into the seed, so streams are independent of call ordering.
 */

/** FNV-1a, 32-bit. Stable, tiny, and good enough to decorrelate labels. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The per-user seed: the login, lowercased so URL casing cannot fork a tree. */
export function seedFromLogin(login: string): number {
  return fnv1a32(login.toLowerCase());
}

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** `true` with the given probability. */
  chance(probability: number): boolean;
  /** `n` floats in [0, 1). */
  take(n: number): number[];
  /** A copy of the generator, so callers can look ahead without consuming. */
  clone(): Rng;
}

/** mulberry32: one 32-bit word of state, uniform output, no host dependence. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    take: (n) => Array.from({ length: n }, next),
    clone: () => mulberry32(state),
  };
  return rng;
}

/**
 * A seed's family of labelled substreams. `streams.for("attractors")` always
 * returns the same sequence for the same (seed, label), independent of what
 * any other subsystem drew.
 */
export interface RngStreams {
  readonly seed: number;
  for(label: string): Rng;
}

export function streamsFor(seed: number): RngStreams {
  return {
    seed,
    for: (label: string): Rng => {
      // Mixing the label hash with the seed rather than concatenating strings
      // keeps this allocation-light on the hot path.
      const mixed = (Math.imul(seed ^ fnv1a32(label), 0x9e3779b1) ^ (seed >>> 3)) >>> 0;
      return mulberry32(mixed);
    },
  };
}

export function streamsForLogin(login: string): RngStreams {
  return streamsFor(seedFromLogin(login));
}
