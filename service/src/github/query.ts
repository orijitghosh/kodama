/**
 * The two GraphQL documents (SPEC-SERVICE §3).
 *
 * Treat these as intent until SPIKE-GRAPHQL (step 4.2) has run them against the
 * live schema; field names and connection arguments are the likeliest thing to
 * be wrong here.
 *
 * Two amendments to the spec's draft were needed to normalize at all: `login`
 * (the canonical casing, otherwise missing from the response) and `languages`
 * on each repository, since NormalizedHistory has a language mix and the draft
 * query never fetched one.
 */

/**
 * The repo mix (NormalizedHistory v2, D-042).
 *
 * A `contributionsCollection` sub-selection, so it rides on windows already
 * being fetched: GraphQL point cost is set by node count, and 100 repository
 * rows on a query already paying for 365 calendar days is close to free.
 *
 * `maxRepositories` is the schema's own ceiling. An account committing to more
 * than 100 repositories inside one account year loses the tail, which moves
 * `breadth` and `hhi` slightly for a handful of the most scattered accounts on
 * the platform - acceptable, and the alternative is pagination per year.
 *
 * Nothing here is stored: the normalizer reduces it to five numbers and one repo
 * name (SPEC-ENGINE §2). Fetched per window, discarded on the way through.
 */
const REPO_MIX_BRANCH = `commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner isFork createdAt owner { login } }
        contributions { totalCount }
      }`;

/**
 * Phase one of a cold fetch: the only thing the year windows depend on.
 *
 * 115 ms measured, against ~4 s for the whole profile document. Splitting it
 * out is what lets everything else run concurrently (SPIKE-GRAPHQL §4).
 */
export const IDENTITY_QUERY = `query Identity($login: String!) {
  user(login: $login) { login createdAt }
  rateLimit { cost limit remaining resetAt }
}`;

/** Phase two, branch A: the cheap scalar totals. ~790 ms. */
export const COUNTS_QUERY = `query Counts($login: String!) {
  user(login: $login) {
    mergedPRs: pullRequests(states: MERGED, last: 10, orderBy: {field: UPDATED_AT, direction: ASC}) {
      totalCount
      nodes { mergedAt additions }
    }
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    answers: repositoryDiscussionComments(onlyAnswers: true) { totalCount }
  }
  rateLimit { cost limit remaining resetAt }
}`;

/**
 * Phase two, branch B: stars over the top 100 repos. ~1 120 ms - which hides
 * entirely under the year branch, so the wider net is free.
 */
export const STARS_QUERY = `query Stars($login: String!) {
  user(login: $login) {
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}, privacy: PUBLIC) {
      nodes { stargazerCount }
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

/**
 * Phase two, branch C: the language mix, from the top 25 repos only.
 *
 * At 100 repos this branch costs 2 561 ms and becomes the critical path; at 25
 * it costs 918 ms and hides under the years. The top 25 by stars hold 84-95%
 * of a heavy user's bytes, and the mix is used for a hue rotation of at most
 * 20° - the tail cannot move it (D-030).
 */
export const LANGUAGES_QUERY = `query Languages($login: String!) {
  user(login: $login) {
    repositories(first: 25, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}, privacy: PUBLIC) {
      nodes {
        languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

/**
 * The original single-document form. Not what production runs - the
 * fetcher issues the four queries above concurrently and assembles a response
 * of exactly this shape (SPIKE-GRAPHQL §4).
 *
 * Kept because the recorded spike fixtures have this shape and the normalizer
 * is written against it: one contract, two ways of filling it.
 */
export const PROFILE_QUERY = `query Profile($login: String!) {
  user(login: $login) {
    login
    createdAt
    contributionsCollection {
      totalPullRequestReviewContributions
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
      ${REPO_MIX_BRANCH}
    }
    mergedPRs: pullRequests(states: MERGED, last: 10, orderBy: {field: UPDATED_AT, direction: ASC}) {
      totalCount
      nodes { mergedAt additions }
    }
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    answers: repositoryDiscussionComments(onlyAnswers: true) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}, privacy: PUBLIC) {
      nodes {
        stargazerCount
        languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

/**
 * One account year of calendar plus that year's review count.
 *
 * Years before the current one are immutable, which is what makes the 30-day
 * `y:<login>:<year>` cache entries safe (SPEC-SERVICE §3).
 */
export const YEAR_QUERY = `query Year($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalPullRequestReviewContributions
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
      ${REPO_MIX_BRANCH}
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;
