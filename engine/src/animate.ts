/**
 * The animation layer (SPEC-ENGINE §6, TASTE §6).
 *
 * CSS only, and entirely static: every value below is a constant, so the
 * emitted `<style>` bytes are identical for every tree. Motion is expressed as
 * class rules that only apply when the matching element exists, so the same
 * block can sit on a ghost and a whale alike.
 *
 * Four things move and nothing else (TASTE §6): the foliage pads sway from the
 * trunk base, falling petals and snow drift down, fireflies breathe and wander.
 * Fruit, lanterns, blossoms, the bird and the chime hold still.
 *
 * Two rules are encoded here and asserted by tests:
 *   - the caller strips this block entirely for `animate=off`, so a static card
 *     is byte-identical to one that never had an animation layer;
 *   - no opacity or motion cycle runs faster than 3 s (WCAG 2.3.1, with margin),
 *     and `prefers-reduced-motion: reduce` turns everything off.
 */

import { BASE_X, BASE_Y } from "./skeleton.js";

/**
 * The animation stylesheet, as CSS text for a `<style>` element.
 *
 * The sway pivots every pad about the trunk base (`BASE_X,BASE_Y`), so the crown
 * rocks as one plant rather than each pad spinning on its own centre; the small
 * per-pad differences in period and phase are what keep it from reading as a
 * rigid cut-out. Petals and flakes fall on a linear loop and fade before they
 * reset, so the jump back to the top is never seen. Fireflies ease between dim
 * and bright over 4 s, wandering a few pixels - the star grammar, given air.
 */
export function animationStyles(): string {
  return (
    // Sway: pads rock ±0.8° about the shared trunk base, desynced by period/phase.
    `.kd-pad{transform-box:view-box;transform-origin:${String(BASE_X)}px ${String(BASE_Y)}px;` +
    `animation:kd-sway 8s ease-in-out infinite}` +
    `.kd-pad:nth-of-type(2n){animation-duration:7s;animation-delay:-1.5s}` +
    `.kd-pad:nth-of-type(3n){animation-duration:9s;animation-delay:-3.5s}` +
    // Falling petals (broken streak and hanami) drift down over 6 s.
    `.kd-petal{animation:kd-fall 6s linear infinite}` +
    `.kd-petal:nth-of-type(2n){animation-delay:-2s}` +
    `.kd-petal:nth-of-type(3n){animation-delay:-4s}` +
    // Snow falls a touch slower, so it reads as lighter than petals.
    `.kd-flake{animation:kd-fall 7s linear infinite}` +
    `.kd-flake:nth-of-type(2n){animation-delay:-2.5s}` +
    `.kd-flake:nth-of-type(3n){animation-delay:-4.5s}` +
    // Fireflies breathe dim→bright and wander, never faster than the 3 s floor.
    `.kd-firefly{animation:kd-drift 4s ease-in-out infinite}` +
    `.kd-firefly:nth-of-type(2n){animation-delay:-1.3s}` +
    `.kd-firefly:nth-of-type(3n){animation-delay:-2.6s}` +
    // Butterflies are the day form of the same mark, so they wander on the same
    // path - but they do not breathe. A firefly's dim-to-bright is the whole
    // point of a firefly and reads as a flicker on anything with wings, so this
    // is `kd-wander`: the drift without the opacity.
    `.kd-butterfly{animation:kd-wander 5s ease-in-out infinite}` +
    `.kd-butterfly:nth-of-type(2n){animation-delay:-1.7s}` +
    `.kd-butterfly:nth-of-type(3n){animation-delay:-3.3s}` +
    `@keyframes kd-sway{0%,100%{transform:rotate(-0.8deg)}50%{transform:rotate(0.8deg)}}` +
    `@keyframes kd-fall{0%{transform:translateY(0);opacity:.85}80%{opacity:.85}` +
    `100%{transform:translateY(46px);opacity:0}}` +
    `@keyframes kd-drift{0%,100%{transform:translate(0,0);opacity:.3}` +
    `50%{transform:translate(10px,-6px);opacity:.8}}` +
    `@keyframes kd-wander{0%,100%{transform:translate(0,0)}` +
    `50%{transform:translate(9px,-7px)}}` +
    // Respect the OS setting: no motion at all when the reader asked for none.
    `@media(prefers-reduced-motion:reduce){` +
    `.kd-pad,.kd-petal,.kd-flake,.kd-firefly,.kd-butterfly{animation:none}}`
  );
}
