import type { APIRoute } from "astro";
import { LOCAL_ARCHIVE } from "../../../config/spotlight";
import { createSpotlightService, pickPhotos } from "../../../lib/spotlight";
import { json } from "../../../lib/http";

const photosFor = createSpotlightService();
export const GET: APIRoute = async ({ locals, request }) => {
  const url = new URL(request.url);
  const bucket = locals.runtime?.env?.HULETTCRAFT_BUCKET;
  let edge: Cache | undefined;
  try {
    edge = (caches as unknown as { default?: Cache }).default;
  } catch {
    /* Node has no Cache API. */
  }
  const photos = bucket
    ? await photosFor(
        bucket,
        edge,
        new Request(new URL("/__internal/spotlight-archive-v1", url.origin)),
      )
    : LOCAL_ARCHIVE;
  const exclude = url.searchParams
    .getAll("exclude")
    .slice(0, 2)
    .map((src) => src.slice(0, 2048));
  // Random selections must not be cached as one fixed pair for all visitors.
  return json({ photos: pickPhotos(photos, exclude) });
};
