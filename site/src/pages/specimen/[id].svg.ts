import type { APIRoute, GetStaticPaths } from "astro";

import { allSpecimenIds, renderSpecimen, specimenId } from "../../specimens";

/**
 * The gallery images as real files.
 *
 * Inlining twenty-four full-scale trees into one HTML document would put a
 * third of a megabyte in the critical path for a page that is mostly scrolled.
 * As files they are lazy-loadable, separately cacheable, and the HTML stays
 * small - which is the difference between passing the Lighthouse budget in
 * SPEC-SERVICE §6 and arguing about it.
 *
 * Written at build time; nothing here runs on a request.
 */
export const getStaticPaths: GetStaticPaths = () =>
  allSpecimenIds().map((id) => ({ params: { id: specimenId(id) }, props: { id } }));

export const GET: APIRoute = ({ props }) =>
  new Response(renderSpecimen(props.id as Parameters<typeof renderSpecimen>[0]), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Immutable in practice: the same fixture at the same date is the same
      // bytes forever, and a new engine version changes the path's contents
      // only through a deploy.
      "cache-control": "public, max-age=3600",
    },
  });
