/**
 * The error-rate meter (meter.ts). Its whole job is a rolling fraction over a
 * fixed window, so the tests that matter are the eviction ones: a degraded
 * sample leaving the window has to leave the count with it, or an old outage
 * would haunt the number forever.
 */

import { describe, expect, it } from "vitest";

import { Meter, METER_CAPACITY } from "../src/meter.js";

describe("Meter", () => {
  it("reports an empty window as zero, not NaN", () => {
    expect(new Meter().snapshot()).toEqual({ samples: 0, degraded: 0, fraction: 0 });
  });

  it("counts degraded against total while filling", () => {
    const m = new Meter(10);
    m.record(true);
    m.record(false);
    m.record(true);
    expect(m.snapshot()).toEqual({ samples: 3, degraded: 2, fraction: 2 / 3 });
  });

  it("caps samples at capacity and evicts the oldest outcome", () => {
    const m = new Meter(4);
    // Fill with four degraded, then push four healthy: the window should end
    // holding only the healthy ones, the early failures aged out.
    for (let i = 0; i < 4; i += 1) m.record(true);
    expect(m.snapshot()).toEqual({ samples: 4, degraded: 4, fraction: 1 });
    for (let i = 0; i < 4; i += 1) m.record(false);
    expect(m.snapshot()).toEqual({ samples: 4, degraded: 0, fraction: 0 });
  });

  it("evicts a degraded sample's contribution to the count exactly once", () => {
    const m = new Meter(3);
    m.record(true); // [T]
    m.record(false); // [T,F]
    m.record(false); // [T,F,F], full
    m.record(false); // evicts the T → [F,F,F]
    expect(m.snapshot()).toEqual({ samples: 3, degraded: 0, fraction: 0 });
  });

  it("keeps a steady-state fraction as the window rolls", () => {
    const m = new Meter(4);
    // Every other render degraded, well past a full window: fraction settles
    // at one half and does not drift as old samples are replaced by new.
    for (let i = 0; i < 40; i += 1) m.record(i % 2 === 0);
    expect(m.snapshot()).toEqual({ samples: 4, degraded: 2, fraction: 0.5 });
  });

  it("defaults to the documented capacity", () => {
    const m = new Meter();
    for (let i = 0; i < METER_CAPACITY + 25; i += 1) m.record(false);
    expect(m.snapshot().samples).toBe(METER_CAPACITY);
  });
});
