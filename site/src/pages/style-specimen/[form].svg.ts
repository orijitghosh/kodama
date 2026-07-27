import type { APIRoute, GetStaticPaths } from "astro";

import { allFormSpecimenNames, renderFormSpecimen } from "../../form-specimens";

/**
 * The style-reference images as real files, one per form.
 *
 * Not inlined, and this is the trap rather than a preference. A document holding
 * fourteen `<svg>` elements is not showing fourteen trees: `paletteStyles` emits
 * an unscoped `svg{--kd-*}` rule inside each one, so the last block parsed repaints
 * every tree on the page, and the first matching `<symbol>` id wins across all of
 * them. The taste gates learned this on a contact sheet that painted every crown
 * with one species' leaf. `<img>` gives each render its own document.
 *
 * The size argument applies too - fourteen full-scale trees inlined is ~200 KB of
 * HTML in the critical path, against a page that is entirely scrolled.
 *
 * Written at build time; nothing here runs on a request.
 */
export const getStaticPaths: GetStaticPaths = () =>
  allFormSpecimenNames().map((form) => ({ params: { form }, props: { form } }));

export const GET: APIRoute = ({ props }) =>
  new Response(renderFormSpecimen(props.form as Parameters<typeof renderFormSpecimen>[0]), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // The same crafted account at the same date is the same bytes forever; a
      // new engine version changes them only through a deploy.
      "cache-control": "public, max-age=3600",
    },
  });
