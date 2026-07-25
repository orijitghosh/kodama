/**
 * @kodama/api - fetch, normalize, cache, serve.
 *
 * Everything impure lives here: the GitHub client, the KV port, the route
 * handlers. `@kodama/engine` stays a pure function of what this package hands
 * it (SPEC-SERVICE §2).
 */

export {
  coldKey,
  COLD_TTL_S,
  guarded,
  historyKey,
  HISTORY_TTL_S,
  isFresh,
  MemoryKV,
  missKey,
  newHealth,
  NOT_FOUND_TTL_S,
  yearKey,
  YEAR_TTL_S,
} from "./kv/index.js";
export type { KV, KvHealth } from "./kv/index.js";
export { UpstashKV, upstashFromEnv } from "./kv/upstash.js";
export type { UpstashOptions } from "./kv/upstash.js";

export { buildContainer, container, resetContainer, todayUtc } from "./app.js";
export type { Container, KvKind } from "./app.js";
export { ALERT_AT_CONSUMED, ERROR_RATE_ALERT, handleHealth, healthBody } from "./health.js";
export type { HealthBody } from "./health.js";
export { Meter, METER_CAPACITY, METER_MIN_SAMPLES } from "./meter.js";
export type { MeterSnapshot } from "./meter.js";

export { DAILY_COMMIT_CAP, KodamaShapeError, normalize } from "./normalize.js";
export type { NormalizeInput } from "./normalize.js";

export {
  COUNTS_QUERY,
  IDENTITY_QUERY,
  LANGUAGES_QUERY,
  PROFILE_QUERY,
  STARS_QUERY,
  YEAR_QUERY,
} from "./github/query.js";
export { GitHubClient, GitHubError } from "./github/client.js";
export type { GitHubErrorKind } from "./github/client.js";
export { BENCH_FLOOR, PatPool, PoolExhaustedError } from "./github/pool.js";
export type { PoolStats, RateLimitReading } from "./github/pool.js";

export { Fetcher, yearWindows } from "./fetcher.js";
export type { FetchResult, HistorySource, YearWindow } from "./fetcher.js";
export { clientOf, ColdBudgetError, COLD_FETCHES_PER_HOUR, KvColdGuard } from "./guard.js";
export type { ColdGuard, ColdGuardOptions } from "./guard.js";
export { SingleFlight } from "./singleflight.js";
export { registerSecret, scrub } from "./log.js";

export { ENGINE_VERSION, handleTree, SIZE_CAPS } from "./route.js";
export type { RouteDeps } from "./route.js";
export { handleUserRedirect } from "./redirect-route.js";
export { handleFacts } from "./facts-route.js";
export type { FactsBody, FactsDeps, FactsError } from "./facts-route.js";
export { errorSvg, markStale } from "./error-svg.js";
export type { ErrorKind } from "./error-svg.js";
export {
  isValidLogin,
  LOGIN_PATTERN,
  loginFromPath,
  OPTION_DEFAULTS,
  parseOptions,
  restorePath,
} from "./params.js";
export type { ParsedOptions, RouteShape } from "./params.js";
