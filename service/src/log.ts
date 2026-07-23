/**
 * Log scrubbing.
 *
 * A personal access token in a log line is a token in a log drain, a support
 * ticket and a screenshot. Nothing in this package logs a raw string: every
 * message goes through `scrub`, which knows both the shape of GitHub tokens
 * and the exact strings this process was handed.
 */

/** Tokens registered at boot, redacted by exact match whatever their shape. */
const known = new Set<string>();

export function registerSecret(secret: string): void {
  if (secret.length >= 8) known.add(secret);
}

/** Test affordance; production never unregisters. */
export function clearSecrets(): void {
  known.clear();
}

/**
 * Classic (`ghp_`), fine-grained (`github_pat_`), OAuth and refresh tokens.
 * The shape rules catch tokens this process was never told about - a token
 * pasted into a URL, or echoed back inside a GitHub error message.
 */
const TOKEN_SHAPES = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\b(bearer|token)\s+[A-Za-z0-9_-]{16,}/gi,
];

export function scrub(value: string): string {
  let out = value;
  for (const secret of known) {
    if (secret.length > 0) out = out.split(secret).join("[redacted]");
  }
  for (const shape of TOKEN_SHAPES) {
    out = out.replace(shape, (match) =>
      /^(bearer|token)\s/i.test(match) ? `${match.split(/\s/)[0]!} [redacted]` : "[redacted]",
    );
  }
  return out;
}

/** The only logging entry point in this package. */
export function warn(message: string, context: Record<string, unknown> = {}): void {
  const parts = Object.entries(context).map(([k, v]) => `${k}=${String(v)}`);
  console.warn(scrub([message, ...parts].join(" ")));
}
