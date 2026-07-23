# kodama - dev docs

Design notes for kodama: a hosted SVG service (TypeScript, Vercel) that draws
your GitHub history as a bonsai. These are working documents, not marketing.
They exist so I can pick the project back up in six months and still know why
things are the way they are.

## Read order

1. [PRD.md](PRD.md) - what and why; feature tiers; the growth grammar.
2. [SPEC-ENGINE.md](SPEC-ENGINE.md) - binding contract: schema, math,
   determinism, testing. Where PRD and spec disagree, spec wins.
3. [SPEC-SERVICE.md](SPEC-SERVICE.md) - API, GraphQL, caching, error states,
   site.
4. [TASTE.md](TASTE.md) - the aesthetic bar and the taste-gate procedure.
5. [DECISIONS.md](DECISIONS.md) - why; append before changing architecture.
6. [IMPLEMENTATION.md](IMPLEMENTATION.md) - numbered steps M0-M8 with
   acceptance criteria.

## Ground rules (repeated from IMPLEMENTATION so they're hard to miss)

- Engine is pure: no time, no randomness beyond the seeded PRNG, no I/O.
- Determinism is product law: byte-identical renders or it's a bug.
- Never a broken image: every failure path returns designed SVG, HTTP 200.
- Conventional commits.
- dev/ ships in the repo, never in deploys.
- Anything needing an account or a card (PATs, Vercel, domain, launch posts)
  is a manual step. Those are tracked in IMPLEMENTATION and LAUNCH.
