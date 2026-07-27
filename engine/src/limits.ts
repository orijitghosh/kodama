/**
 * Engine limits that more than one layer has to agree on.
 *
 * `MAX_MATURITY` lived in `facts.ts` until C.4, which is where it belongs by
 * subject - it is the top of the maturity ladder. But form selection needs it
 * (capped accounts restyle on their anniversary, D-042) and the facts layer now
 * needs form selection, so leaving it there made `facts.ts` and `form.ts` import
 * each other. The cycle would in fact have run - `form.ts` only reads the constant
 * inside a function body, so ESM hoisting covers it - and that is exactly the kind
 * of thing that works until someone adds a top-level use and gets an undefined
 * constant instead of an error.
 *
 * `facts.ts` still re-exports it, so nothing downstream had to change.
 */

/** Top of the maturity ladder. Accounts here re-evaluate form on their anniversary. */
export const MAX_MATURITY = 13;
