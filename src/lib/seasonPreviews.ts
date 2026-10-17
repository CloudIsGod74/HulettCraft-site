import type { R2Bucket } from "@cloudflare/workers-types/experimental";
import { HULETTCRAFT } from "../config/hulettcraft";
import { listGallery } from "./gallery";
export async function seasonPreviews(bucket: R2Bucket) {
  const seasons = Object.keys(HULETTCRAFT.seasons)
    .map(Number)
    .sort((a, b) => b - a);
  return Promise.all(
    seasons.map(async (season) => {
      const images = await listGallery(bucket, "hulettcraft", String(season));
      return {
        season,
        ...HULETTCRAFT.seasons[season],
        previews: images.slice(0, 3).map((i) => i.url),
        count: images.length,
      };
    }),
  );
}
