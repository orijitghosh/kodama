/**
 * @kodama/engine - the pure renderer.
 *
 * Everything reachable from here is a pure function of its arguments. There is
 * no clock, no network, no environment and no randomness beyond the seeded
 * PRNG; see SPEC-ENGINE §1 and the lint rules that enforce it.
 */

export type {
  Biome,
  DerivedSignals,
  DormancySpell,
  FruitFact,
  HistoryStreak,
  HistoryTotals,
  LangShare,
  NormalizedHistory,
  OrnamentCounts,
  Palette,
  Plaque,
  PlaqueKind,
  PotTier,
  PRStub,
  RenderOptions,
  RepoAnchor,
  RepoMix,
  Scale,
  Season,
  SeasonalEvent,
  SpiritTrigger,
  Theme,
  ThemeName,
  TreeFacts,
  VisitorKind,
  Weather,
  WeekCell,
} from "./types.js";

export { BIOMES, SCALES, THEME_NAMES } from "./types.js";

export { assertHistory, KodamaSchemaError } from "./validate.js";

export {
  addDays,
  daysBetween,
  isoWeekOf,
  isoWeekStart,
  isValidDate,
  KodamaDateError,
  wholeYearsBetween,
  yearsBetween,
} from "./date.js";

export { fnv1a32, mulberry32, seedFromLogin, streamsFor, streamsForLogin } from "./rng.js";
export type { Rng, RngStreams } from "./rng.js";

export { DEFAULT_SPECIES, isClassic, SPECIES_NAMES, speciesByName } from "./species.js";
export type { BlossomKind, FruitKind, LeafKind, Species, SpeciesName } from "./species.js";

export { treeFacts } from "./facts.js";
export {
  activeWeeks,
  burstiness,
  cadenceCV,
  declineRatio,
  derivedSignalsFor,
  dormancyHistory,
  langCount15,
} from "./facts.js";
/**
 * Form selection (D-042). Exported before anything draws from it, because the
 * calibration harness in the service is what gates the thresholds shipping at
 * all (PROPOSAL-VARIETALS §7.6, D-043).
 */
export {
  DEFAULT_FORM,
  FORM_LADDER,
  FORM_MIN_ACTIVE_WEEKS,
  FORM_NAMES,
  FORM_THRESHOLDS,
  mayRestyle,
  selectForm,
} from "./form.js";
export type { FormInput, FormName, FormRung } from "./form.js";

export { receiptsFor } from "./receipts.js";
export type { Receipt } from "./receipts.js";
export { render, SCALE_SIZES } from "./render.js";
export { paletteStyles, slot, themeByName } from "./themes.js";
export { biographyFor, labelsFor } from "./locale.js";
export type { Labels } from "./locale.js";

/**
 * The document builder and the byte ruler.
 *
 * Exposed so the service can draw the designed error states (SPEC-SERVICE §4)
 * in the same theme system as a real tree - an empty pot has to look like it
 * belongs to the same product, and dual-scheme theming is not worth
 * reimplementing on the other side of the package boundary.
 */
export { byteLength, svgDocument } from "./svg.js";
export type { SvgDocumentOptions } from "./svg.js";
