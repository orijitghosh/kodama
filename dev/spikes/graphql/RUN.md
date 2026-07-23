# SPIKE-GRAPHQL run 2026-07-21


## 1-2. Query shape and cost

### sindresorhus
- profile query: 200, cost 1, 29822 bytes, 4254 ms
- shape matches `src/github/shape.ts`
- created 2009-12-20 → 17 account-year window(s)
- year queries: 17 calls, 17 points, 292015 bytes
- year latency: 832 ms mean, 14159 ms sequential total
- **cold fetch total: 18 points, 18413 ms sequential (budget: 1500 ms p95)**
- same 17 year queries in parallel: 1267 ms
- normalizes: 19871 bytes of NormalizedHistory, 791 weeks, streak 47/82, 42152 capped contributions, languages [JavaScript, TypeScript, Swift, CSS, Rust]

### defunkt
- profile query: 200, cost 1, 27769 bytes, 3339 ms
- shape matches `src/github/shape.ts`
- created 2007-10-20 → 19 account-year window(s)
- year queries: 19 calls, 19 points, 328340 bytes
- year latency: 383 ms mean, 7275 ms sequential total
- **cold fetch total: 20 points, 10614 ms sequential (budget: 1500 ms p95)**
- same 19 year queries in parallel: 661 ms
- normalizes: 6382 bytes of NormalizedHistory, 236 weeks, streak 0/20, 5069 capped contributions, languages [JavaScript, C, Ruby, Emacs Lisp, Python]

## 3. Do two PATs on one account share a budget?
- tokens belong to the same account: true
- token A spent 1 point(s) on a profile query
- token B's remaining fell by 2 over that window
- **shared budget.** The PAT pool rotates over one quota; SPEC-SERVICE §3 needs amending before 4.3.

## Budget after the run
- 4672 / 5000 points, resets 2026-07-21T22:00:54Z
