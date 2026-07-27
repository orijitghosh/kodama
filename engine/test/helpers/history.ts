/**
 * The synthetic-history builders, now owned by `src/history-builder.ts`.
 *
 * They moved when `form-cases.ts` did: the crafted accounts ship as
 * `@kodama/engine/form-cases`, and having the suite build its histories from a
 * second copy of the same default object is how the two would drift. This file
 * stays so the nine suites that import it keep their import path.
 */

export { historyWith, weeksEndingAt } from "../../src/history-builder.js";
