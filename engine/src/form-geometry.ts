/**
 * The geometry each form draws with (C.4, D-042, PROPOSAL-VARIETALS §3).
 *
 * This is the whole of "form changes the tree" in one table. Four styles are
 * trunk plans, five are reparameterised crowns, and five change nothing about the
 * skeleton at all - they are draw-layer work (a bleached vein, lifted roots, a
 * stone, a moss ball) or they are today's tree.
 *
 * Keeping it a table rather than a switch is deliberate: the properties in
 * `engine/test/form-geometry.test.ts` iterate it, so a style added later cannot
 * quietly skip the frame and pad-count assertions every other style has to pass.
 */

import { FORM_NAMES, type FormName } from "./form.js";
import { SINGLE_TRUNK, TRUNK_PLANS, type CloudShape, type TrunkPlan } from "./skeleton.js";

/** Everything `buildSkeleton` needs to draw a form. */
export interface FormGeometry {
  trunks: readonly TrunkPlan[];
  cloud: CloudShape;
}

/**
 * The default: one trunk, the seeded crown, no overrides. Shared by reference by
 * every form that does not change the skeleton, so `moyogi` and the draw-layer
 * styles provably take the same path the tree has always taken (D-042).
 */
const AS_ALWAYS: FormGeometry = { trunks: SINGLE_TRUNK, cloud: {} };

export const FORM_GEOMETRY: Record<FormName, FormGeometry> = {
  // --- Trunk plans. Geometry lifted from C.3, already frame-tested. ---
  sokan: { trunks: TRUNK_PLANS.sokan, cloud: {} },
  kabudachi: { trunks: TRUNK_PLANS.kabudachi, cloud: {} },
  yoseUe: { trunks: TRUNK_PLANS.yoseUe, cloud: {} },
  ikadabuki: { trunks: TRUNK_PLANS.ikadabuki, cloud: {} },

  // --- Reparameterised crowns. ---

  /**
   * Formal upright: a symmetric column. Tilt and lean are pinned to zero and the
   * crown is narrowed, because what reads as "formal" is the absence of the
   * per-seed character every other tree has. Heaviness is dropped to the bottom
   * of the seeded range rather than to zero - at zero the crown is a perfect
   * ellipse, which TASTE §2 calls an instant failure.
   */
  chokkan: {
    trunks: SINGLE_TRUNK,
    cloud: { leanX: 0, leanY: -6, tilt: 0, heaviness: 0.3, heavySide: -Math.PI / 2, rxScale: 0.72, ryScale: 1.08 },
  },

  /**
   * Broom: one trunk splitting into a fan, foliage a hemisphere above the split.
   * `domed` flattens the underside; the crown is widened slightly to keep the
   * silhouette from reading as a lollipop.
   */
  hokidachi: {
    trunks: SINGLE_TRUNK,
    cloud: { leanX: 0, tilt: -0.05, domed: 0.5, rxScale: 0.86, ryScale: 0.82, heaviness: 0.32 },
  },

  /**
   * Literati: a long bare trunk with the foliage gathered at the apex.
   *
   * The proposal words this as "2-3 pads regardless of maturity", which would
   * break C.6 rule 1 - pad count may never fall. So the pads are redistributed
   * instead of reduced: the same `padCountFor(maturity)` masses are packed into a
   * small high crown, which is what makes a literati read as sparse without ever
   * shedding foliage. The crown cannot shrink much further than this without
   * starving `buildPads` of the tips it needs to place that many pads, and the
   * pad-count property is what holds that line.
   */
  bunjin: {
    trunks: SINGLE_TRUNK,
    cloud: { leanY: -30, rxScale: 0.54, ryScale: 0.5, heaviness: 0.5 },
  },

  /**
   * Windswept: the seeded heavy-side bias pushed to its extreme, so the whole
   * crown is combed to one side. Fixed to +x rather than seeded, because a form
   * has to be legible as itself for every login.
   *
   * The crown is narrowed and started left of centre to pay for the bias. At
   * `heaviness` 0.9 a point on the heavy side reaches `1 + heaviness` times the
   * crown radius, so the full-width crown put nodes at x = 477 - outside the
   * tree region TASTE §4 allows. Narrowing rather than lowering the heaviness
   * keeps the comb extreme, which is the entire style.
   */
  fukinagashi: {
    trunks: SINGLE_TRUNK,
    cloud: { heavySide: 0, heaviness: 0.85, leanX: -22, tilt: -0.1, rxScale: 0.6, ryScale: 0.88 },
  },

  /**
   * Slant: the crown rotated about the trunk base, 18° - inside the 15-25° window
   * the style is specified over. Rotating about the base rather than the crown
   * centre is what makes the tree lean out of its pot instead of wearing its
   * crown crooked.
   *
   * `leanX` is pinned rather than seeded, and that is the load-bearing part. The
   * crown ceiling in `buildSkeleton` guards the top of the frame; nothing guards
   * the sides, because a seeded lean of at most ±30px at full crown width never
   * needed it. Rotation stacks on whatever lean the seed already had, so a
   * right-leaning seed - `awakening` was the worst, at x = 482 - slid straight out
   * of the tree region. Starting every slant from the same place left of centre
   * fixes it by construction and makes the style read as itself for every login,
   * the same reason fukinagashi's heavy side is fixed.
   */
  shakan: {
    trunks: SINGLE_TRUNK,
    cloud: { rotate: 0.314, leanX: -22, rxScale: 0.88, ryScale: 0.9 },
  },

  // --- Draw-layer styles: same skeleton, extra elements in C.7. ---
  /** Deadwood. The bleached vein is a draw-layer element beside the live trunk. */
  sharimiki: AS_ALWAYS,
  /** Exposed root. The roots lift clear of the soil in the draw layer. */
  neagari: AS_ALWAYS,
  /** Root over rock. The stone is a draw-layer element; the receipt names the repo. */
  sekijoju: AS_ALWAYS,
  /** Moss ball. Replaces the pot, not the tree. */
  kokedama: AS_ALWAYS,

  /** Informal upright: today's tree, unchanged, and the fallback. */
  moyogi: AS_ALWAYS,
};

/** The geometry for a form. Total over `FormName`, so there is no fallback here. */
export function geometryFor(form: FormName): FormGeometry {
  return FORM_GEOMETRY[form];
}

/** Forms that leave the skeleton exactly as it has always been drawn. */
export const UNCHANGED_SKELETON_FORMS: readonly FormName[] = FORM_NAMES.filter(
  (name) => FORM_GEOMETRY[name] === AS_ALWAYS,
);
