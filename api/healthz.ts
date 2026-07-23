/**
 * Vercel function entrypoint for `GET /healthz` (SPEC-SERVICE §1).
 *
 * Reports pool and cache state, never user data - see `service/src/health.ts`
 * for the two rules that body obeys. The `fetch` shape is required; see the
 * note in `tree.ts`.
 */

import { container, ENGINE_VERSION, handleHealth } from "@kodama/api";

export default {
  fetch(): Response {
    return handleHealth(container(), ENGINE_VERSION);
  },
};
