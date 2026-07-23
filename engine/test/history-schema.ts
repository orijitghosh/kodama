/**
 * The zod schema for NormalizedHistory (D-013).
 *
 * Lives in test land deliberately: the engine ships zero runtime dependencies,
 * so zod may never be imported from `src`. This is the authoring-time contract
 * - it validates committed fixtures and cross-checks the hand-written guard in
 * `src/validate.ts`, which is the one that runs in production.
 */

import { z } from "zod";

const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    if (m < 1 || m > 12 || d < 1) return false;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= lengths[m - 1]!;
  }, "not a real calendar date");

const nonNegativeInt = z.number().int().nonnegative();

export const weekCellSchema = z.object({
  w: z.string().regex(/^\d{4}-W\d{2}$/, "expected an ISO week label like 2026-W29"),
  c: nonNegativeInt,
});

export const prStubSchema = z.object({
  mergedAt: civilDate,
  bucket: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const langShareSchema = z.object({
  name: z.string().min(1),
  share: z.number().min(0).max(1),
});

export const normalizedHistorySchema = z
  .object({
    v: z.literal(1),
    login: z.string().min(1),
    fetchedAt: civilDate,
    createdAt: civilDate,
    weeks: z.array(weekCellSchema),
    totals: z.object({
      commits: nonNegativeInt,
      prsMerged: nonNegativeInt,
      prsOpen: nonNegativeInt,
      reviews: nonNegativeInt,
      issuesClosed: nonNegativeInt,
      discussions: nonNegativeInt,
      starsReceived: nonNegativeInt,
    }),
    streak: z.object({
      current: nonNegativeInt,
      longest: nonNegativeInt,
      lastActiveDate: civilDate,
    }),
    recentPRs: z.array(prStubSchema).max(10),
    languages: z.array(langShareSchema).max(5),
  })
  .strict()
  .refine((h) => h.streak.current <= h.streak.longest, {
    message: "streak.current cannot exceed streak.longest",
    path: ["streak", "current"],
  })
  .refine((h) => h.languages.reduce((sum, l) => sum + l.share, 0) <= 1.001, {
    message: "language shares must sum to <= 1",
    path: ["languages"],
  })
  .refine(
    (h) => h.weeks.every((week, i) => i === 0 || h.weeks[i - 1]!.w < week.w),
    { message: "weeks must be ascending and unique", path: ["weeks"] },
  );

export type ParsedHistory = z.infer<typeof normalizedHistorySchema>;
