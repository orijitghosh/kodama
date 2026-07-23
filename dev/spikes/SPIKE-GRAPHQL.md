# SPIKE-GRAPHQL - the live GitHub API, measured

**Run 2026-07-21.** Two scopeless classic PATs on one account. Targets:
`sindresorhus` (whale, 17 y) and `defunkt` (veteran, 19 y), plus the token
owner's own quiet 14-year account - that third run is reported nowhere here
and recorded nowhere in the repo (§6). Runner: `service/scripts/spike-graphql.ts`,
bisect:
`service/scripts/spike-profile-cost.ts`. Raw output in `graphql/RUN.md`, recorded
responses beside it.

Four questions. Two of the answers invalidate something the spec says.

---

## 1. Does the query resolve? Yes, as amended

All three accounts returned 200 and parsed against `service/src/github/shape.ts`
with no mismatches. The step-4.1 amendments were necessary and correct:
`login`, per-repository `languages`, and the four aliases (`mergedPRs`,
`openPRs`, `closedIssues`, `answers`) all resolve. `rateLimit` now also
returns `cost` and `limit`.

The recorded responses normalize end to end:

| account | created | years | weeks | NormalizedHistory | streak |
|---|---|---|---|---|---|
| sindresorhus | 2009-12-20 | 17 | 791 | **19 871 B** | 47 / 82 |
| defunkt | 2007-10-20 | 19 | 236 | 6 382 B | 0 / 20 |

## 2. Cost: flat 1 point per query

Every query shape costs exactly **1 point**, whether it asks for one field or
for 100 repositories with their language mixes. The 5 000 points/hour budget is
therefore a budget on *number of round trips*, not on their size.

A cold fetch is 1 profile query + one per account year: **15-20 points** for a
decade-plus account, so roughly **250 cold fetches per hour** on one account's
budget. Warm refreshes are 1-2 points.

This flips the usual optimization: splitting one fat query into four parallel
thin ones costs 3 extra points out of 5 000 and buys back seconds. Latency is
the scarce resource here, not quota.

## 3. Two PATs on one account share one budget - the pool is wrong

Measured directly: spend a point with token A, read `rateLimit.remaining` with
token B, and B's remaining has fallen. Both tokens report the same `viewer`.

**SPEC-SERVICE §3's PAT pool assumes independent per-token budgets, and on a
single account it has none.** Round-robin across two tokens on one account
rotates over one 5 000-point pool and buys exactly nothing - no extra capacity,
no failover, just more secrets to hold. Amended in the spec and D-029.

What still works: tokens on *different* accounts are genuinely independent, so
the pool code is worth keeping - it just needs one token per account to mean
anything, and `/healthz` should report distinct budgets rather than a sum that
double-counts.

## 4. Latency: the cold budget is not achievable as designed

Sequential cold fetch, wall clock:

| account | profile | years (sequential) | **total** | years (parallel) |
|---|---|---|---|---|
| sindresorhus | 3 947 ms | 16 209 ms | **20 156 ms** | 1 629 ms |
| defunkt | 3 234 ms | 7 747 ms | 10 981 ms | 725 ms |

Against a 1 500 ms p95 cold budget (SPEC-SERVICE §6). Twenty seconds for a
whale.

Fanning the year windows out in parallel fixes most of it - 16 s → 1.6 s - but
the profile query alone is still ~4 s. Bisecting it on `sindresorhus`, best of
three:

| variant | best ms | bytes |
|---|---|---|
| identity only | 115 | 100 |
| identity + calendar | 755 | 17 704 |
| identity + counts | 792 | 743 |
| repos 100, no languages | 1 122 | 2 493 |
| **repos 100 + languages** | **2 561** | 11 477 |
| repos 25 + languages | 918 | 2 855 |
| FULL (production document) | 4 936 | 29 759 |

The 100-repository language fan-out is half the profile query's time on its
own, and the full document is roughly the sum of its parts - it is not doing
anything clever internally, so neither should we.

### What 4.3 should build

1. **Phase one: identity only** (`login`, `createdAt`) - 115 ms. It is the
   only thing the year windows depend on.
2. **Phase two: everything else in parallel** - calendar, counts, stars,
   languages, and every year window at once. Wall clock becomes the slowest
   branch instead of the sum.
3. **Take languages from the top 25 repos, not 100.** 2 561 ms → 918 ms for a
   language mix that is, by stars, essentially identical. Stars can still come
   from a `first: 100` query in a parallel branch (1 122 ms).

Modelled cold fetch after all three: **~1.8 s** for a whale (115 ms + a ~1.6 s
slowest branch), against ~20 s today. Cost rises from 20 points to ~23.

That is close to the 1 500 ms budget but not under it, and the remainder is
GitHub's own response time, which we do not control. The budget is amended to
**2 500 ms p95 cold, 1 500 ms for accounts under 10 years** (SPEC-SERVICE §6);
this is a spec value proven wrong in practice, handled per the standing
constraint rather than quietly missed. Cold is also once per user per 24 h -
every other request is a CDN or KV hit.

## 5. Incidental findings

- **A whale's NormalizedHistory is ~20 KB, not the ~8 KB SPEC-ENGINE §2
  estimates.** 791 active weeks for `sindresorhus`. `dev/OPS.md` storage
  projections updated; still comfortable, but the estimate was 2.5× low.
- Year-window responses are ~17 KB each and total ~300 KB per cold fetch. That
  is bandwidth against the Upstash plan only if we cached raw responses - we
  cache the normalized 20 KB instead, which is the right call and now has a
  number behind it.
- `defunkt` has 19 account years but only 236 active weeks: long-dormant
  accounts are cheap to fetch and cheap to store. Dormancy is the common case
  for old accounts, not the exception.
- Query latency is highly variable run to run (the same document measured
  3.2 s and 4.9 s minutes apart). Any p95 claim needs many samples at 4.5, not
  the three taken here.

## 6. Recorded responses

`graphql/*.profile.json`, `graphql/*.years.json`, `graphql/*.history.json` -
minified, `rateLimit` stripped. These become the round-trip fixtures the
step-4.1 accept criteria asked for.

The token owner's own account is **not recorded and not committed**, by their
decision: a self-query returns the authenticated user's private contribution
counts in their calendar, so those responses are personal data in a way
third-party public profiles are not. Fetching with someone else's token
returns public contributions only, so `sindresorhus` and `defunkt` are safe to
commit and are the fixtures the suite uses.

**Correction, 2026-07-21.** The run above targeted `orijit`, which is not the
token owner - the account is `orijitghosh`. The rule stated above is sound and
still stands; it simply never applied, because no self-query was ever made.
`dev/spikes/graphql/orijit.*` is one more third-party public profile, fetched
with the owner's token exactly as `sindresorhus` and `defunkt` were, and it
holds no private data. Those files stay uncommitted anyway: they were recorded
under a mistaken premise and nothing depends on them, so keeping them would
only preserve the confusion. The gitignore entry stays as written so that a
re-run under either spelling cannot commit a self-query by accident.

What this cost: the three "account shapes" §1 claims to have covered were a
whale, a veteran, and a stranger - not the owner. No conclusion in this
document rests on which specific account was third, so §§1-5 stand as measured.
The lesson is narrower and worth naming: **a login that returns 200 is not
evidence it is the login you meant.** GitHub answers happily for any name that
exists, so a typo in an account name fails silently and looks like success.
