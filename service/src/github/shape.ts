/**
 * Response shapes for the documents in `query.ts`.
 *
 * Parsed rather than trusted: a response that drifted from the schema should
 * surface as one typed error at the boundary, not as a `NaN` five functions
 * later. Everything the grammar does not read is ignored, so GitHub adding
 * fields never breaks us.
 */

import { z } from "zod";

const contributionDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  contributionCount: z.number().int().nonnegative(),
});

const contributionCalendar = z.object({
  weeks: z.array(z.object({ contributionDays: z.array(contributionDay) })),
});

const contributionsCollection = z.object({
  totalPullRequestReviewContributions: z.number().int().nonnegative(),
  contributionCalendar,
});

const totalCount = z.object({ totalCount: z.number().int().nonnegative() });

/** GitHub's connections are null-happy; every level here can come back null. */
const languageConnection = z
  .object({
    edges: z
      .array(
        z
          .object({
            size: z.number().nonnegative(),
            node: z.object({ name: z.string().min(1) }),
          })
          .nullable(),
      )
      .nullable(),
  })
  .nullish();

export const profileResponseSchema = z.object({
  user: z.object({
    login: z.string().min(1),
    /** ISO 8601 datetime; only the date half survives normalization. */
    createdAt: z.string().min(10),
    contributionsCollection,
    mergedPRs: z.object({
      totalCount: z.number().int().nonnegative(),
      nodes: z
        .array(
          z
            .object({
              mergedAt: z.string().min(10).nullable(),
              additions: z.number().int().nonnegative(),
            })
            .nullable(),
        )
        .nullable(),
    }),
    openPRs: totalCount,
    closedIssues: totalCount,
    answers: totalCount,
    repositories: z.object({
      nodes: z
        .array(
          z
            .object({
              stargazerCount: z.number().int().nonnegative(),
              languages: languageConnection,
            })
            .nullable(),
        )
        .nullable(),
    }),
  }),
});

export const yearResponseSchema = z.object({
  user: z.object({ contributionsCollection }),
});

// ---------------------------------------------------------------------------
// The split documents the fetcher actually issues (SPIKE-GRAPHQL §4). Each is
// a slice of the profile shape above; the fetcher reassembles them into it.
// ---------------------------------------------------------------------------

const profileUser = profileResponseSchema.shape.user.shape;

export const identityResponseSchema = z.object({
  user: z.object({ login: profileUser.login, createdAt: profileUser.createdAt }),
});

export const countsResponseSchema = z.object({
  user: z.object({
    mergedPRs: profileUser.mergedPRs,
    openPRs: profileUser.openPRs,
    closedIssues: profileUser.closedIssues,
    answers: profileUser.answers,
  }),
});

export const starsResponseSchema = z.object({
  user: z.object({
    repositories: z.object({
      nodes: z.array(z.object({ stargazerCount: z.number().int().nonnegative() }).nullable()).nullable(),
    }),
  }),
});

export const languagesResponseSchema = z.object({
  user: z.object({
    repositories: z.object({
      nodes: z.array(z.object({ languages: languageConnection }).nullable()).nullable(),
    }),
  }),
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;
export type YearResponse = z.infer<typeof yearResponseSchema>;
export type IdentityResponse = z.infer<typeof identityResponseSchema>;
export type CountsResponse = z.infer<typeof countsResponseSchema>;
export type StarsResponse = z.infer<typeof starsResponseSchema>;
export type LanguagesResponse = z.infer<typeof languagesResponseSchema>;
