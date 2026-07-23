/**
 * Dependency-free structural guard for NormalizedHistory (D-013).
 *
 * The engine cannot import zod, and it must not trust a KV payload: a
 * malformed cache entry that reached the renderer would surface as a broken
 * image, which the product forbids outright. So the guard runs first and
 * throws a typed error the API maps onto a designed SVG.
 */

import type { LangShare, NormalizedHistory, PRStub, WeekCell } from "./types.js";
import { isValidDate } from "./date.js";

export class KodamaSchemaError extends Error {
  override readonly name = "KodamaSchemaError";
  /** Set when the payload is a recognisable history of the wrong version. */
  readonly version: number | undefined;

  constructor(message: string, version?: number) {
    super(message);
    this.version = version;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFiniteInt(value: unknown, path: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new KodamaSchemaError(`${path} must be a finite integer, got ${String(value)}`);
  }
  if (value < min) {
    throw new KodamaSchemaError(`${path} must be >= ${String(min)}, got ${String(value)}`);
  }
  return value;
}

function requireCivilDate(value: unknown, path: string): string {
  if (typeof value !== "string" || !isValidDate(value)) {
    throw new KodamaSchemaError(`${path} must be a YYYY-MM-DD date, got ${String(value)}`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new KodamaSchemaError(`${path} must be a non-empty string`);
  }
  return value;
}

const WEEK_LABEL = /^\d{4}-W\d{2}$/;

function validateWeeks(value: unknown): WeekCell[] {
  if (!Array.isArray(value)) throw new KodamaSchemaError("weeks must be an array");
  return value.map((week, i) => {
    if (!isRecord(week)) throw new KodamaSchemaError(`weeks[${String(i)}] must be an object`);
    const w = requireString(week["w"], `weeks[${String(i)}].w`);
    if (!WEEK_LABEL.test(w)) {
      throw new KodamaSchemaError(`weeks[${String(i)}].w must look like 2026-W29, got ${w}`);
    }
    return { w, c: requireFiniteInt(week["c"], `weeks[${String(i)}].c`) };
  });
}

function validatePRs(value: unknown): PRStub[] {
  if (!Array.isArray(value)) throw new KodamaSchemaError("recentPRs must be an array");
  return value.map((pr, i) => {
    if (!isRecord(pr)) throw new KodamaSchemaError(`recentPRs[${String(i)}] must be an object`);
    const bucket = pr["bucket"];
    if (bucket !== 1 && bucket !== 2 && bucket !== 3) {
      throw new KodamaSchemaError(`recentPRs[${String(i)}].bucket must be 1, 2 or 3`);
    }
    return { mergedAt: requireCivilDate(pr["mergedAt"], `recentPRs[${String(i)}].mergedAt`), bucket };
  });
}

function validateLanguages(value: unknown): LangShare[] {
  if (!Array.isArray(value)) throw new KodamaSchemaError("languages must be an array");
  const langs = value.map((lang, i) => {
    if (!isRecord(lang)) throw new KodamaSchemaError(`languages[${String(i)}] must be an object`);
    const share = lang["share"];
    if (typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1) {
      throw new KodamaSchemaError(`languages[${String(i)}].share must be within 0..1`);
    }
    return { name: requireString(lang["name"], `languages[${String(i)}].name`), share };
  });
  const total = langs.reduce((sum, l) => sum + l.share, 0);
  // A small tolerance: shares are rounded at normalization time.
  if (total > 1.001) {
    throw new KodamaSchemaError(`language shares must sum to <= 1, got ${total.toFixed(4)}`);
  }
  return langs;
}

/**
 * Validates and returns a NormalizedHistory. Throws {@link KodamaSchemaError}
 * for anything the renderer could not safely index - including a version other
 * than 1, which the API answers with the seedling plus a cache purge
 * (SPEC-ENGINE §2).
 */
export function assertHistoryV1(value: unknown): NormalizedHistory {
  if (!isRecord(value)) throw new KodamaSchemaError("history must be an object");

  const v = value["v"];
  if (v !== 1) {
    const version = typeof v === "number" ? v : undefined;
    throw new KodamaSchemaError(
      `unsupported NormalizedHistory version: ${String(v)} (engine speaks v1)`,
      version,
    );
  }

  const totals = value["totals"];
  if (!isRecord(totals)) throw new KodamaSchemaError("totals must be an object");
  const streak = value["streak"];
  if (!isRecord(streak)) throw new KodamaSchemaError("streak must be an object");

  const createdAt = requireCivilDate(value["createdAt"], "createdAt");
  const fetchedAt = requireCivilDate(value["fetchedAt"], "fetchedAt");

  const current = requireFiniteInt(streak["current"], "streak.current");
  const longest = requireFiniteInt(streak["longest"], "streak.longest");
  if (current > longest) {
    throw new KodamaSchemaError(
      `streak.current (${String(current)}) cannot exceed streak.longest (${String(longest)})`,
    );
  }

  return {
    v: 1,
    login: requireString(value["login"], "login"),
    fetchedAt,
    createdAt,
    weeks: validateWeeks(value["weeks"]),
    totals: {
      commits: requireFiniteInt(totals["commits"], "totals.commits"),
      prsMerged: requireFiniteInt(totals["prsMerged"], "totals.prsMerged"),
      prsOpen: requireFiniteInt(totals["prsOpen"], "totals.prsOpen"),
      reviews: requireFiniteInt(totals["reviews"], "totals.reviews"),
      issuesClosed: requireFiniteInt(totals["issuesClosed"], "totals.issuesClosed"),
      discussions: requireFiniteInt(totals["discussions"], "totals.discussions"),
      starsReceived: requireFiniteInt(totals["starsReceived"], "totals.starsReceived"),
    },
    streak: {
      current,
      longest,
      lastActiveDate: requireCivilDate(streak["lastActiveDate"], "streak.lastActiveDate"),
    },
    recentPRs: validatePRs(value["recentPRs"]),
    languages: validateLanguages(value["languages"]),
  };
}
