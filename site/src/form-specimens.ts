/**
 * The style-reference specimens.
 *
 * Build-time only, like `specimens.ts`: `/styles` renders its SVG during
 * `astro build` and ships the result.
 *
 * The one interesting import is `@kodama/engine/form-cases`. The gallery can use
 * the ten real fixtures because it is showing accounts; this page is showing
 * *styles*, and only four of the fourteen are reachable from those fixtures - so a
 * page built on them would document four and guess at ten. The crafted accounts
 * are a subpath export rather than part of the main entry point so that the
 * service, which renders trees on a request path, never loads fourteen synthetic
 * histories it has no use for.
 *
 * Everything is re-exported through this one module so the page has a single seam
 * onto the engine, and so the subpath import is stated once where it can be
 * explained.
 */

import { FORM_CASES, FORM_CASE_DATE } from "@kodama/engine/form-cases";
import { render, treeFacts } from "@kodama/engine";
import type { FormName } from "@kodama/engine";

export { FORM_CASES, FORM_CASE_DATE };
export type { FormCase } from "@kodama/engine/form-cases";

export {
  DEFAULT_FORM,
  FORM_LABELS,
  FORM_LADDER,
  FORM_MIN_ACTIVE_WEEKS,
  render,
  treeFacts,
} from "@kodama/engine";
export type { FormName } from "@kodama/engine";

/**
 * Renders one style's specimen, and refuses if the ladder no longer agrees.
 *
 * The assertion is the point. A reference page showing a silhouette under a name
 * the selector would not give it is worse than no page, and the thresholds it
 * depends on are measured and expected to move (`FORM_THRESHOLDS`). `gate-4.ts`
 * makes the same refusal for the same reason - the difference is that this one
 * fails the build.
 */
export function renderFormSpecimen(form: FormName): string {
  const one = FORM_CASES.find((each) => each.form === form);
  if (one === undefined) throw new Error(`no crafted account for ${form}`);

  const facts = treeFacts(one.history, FORM_CASE_DATE);
  if (facts.form !== form) {
    throw new Error(
      `the ${form} example now selects ${facts.form}. A threshold moved out from under ` +
        `it; fix the case in engine/src/form-cases.ts rather than relabelling the page.`,
    );
  }

  return render(one.history, FORM_CASE_DATE, {
    biome: "bonsai",
    theme: "ink",
    scale: "full",
    // Fourteen animated trees on one page is the motion problem the taste rules
    // exist to prevent, and a Lighthouse problem besides.
    animate: false,
    tint: "none",
    species: "classic",
    locale: "en",
  });
}

export function allFormSpecimenNames(): FormName[] {
  return FORM_CASES.map((one) => one.form);
}
