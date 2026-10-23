import type { R2Bucket } from "@cloudflare/workers-types/experimental";
import { LOCAL_ARCHIVE, type SpotlightPhoto } from "../config/spotlight";
import { listObjects } from "./gallery";
import { isPublishedKey } from "./galleryKeys";
import { rasterContentType } from "./images";

const FRESH_MS = 5 * 60_000;
const STALE_MS = 24 * 60 * 60_000;
interface Snapshot {
  checkedAt: number;
  photos: SpotlightPhoto[];
}
export async function archivePhotos(
  bucket: R2Bucket,
): Promise<SpotlightPhoto[]> {
  const objects = await listObjects(bucket, "Screenshots/");
  return [
    ...LOCAL_ARCHIVE,
    ...objects
      .filter((obj) => isPublishedKey(obj.key) && rasterContentType(obj))
      .map((obj) => {
        const [, world, season] = obj.key.split("/");
        const name =
          world === "hulettcraft"
            ? "HulettCraft"
            : world === "hytale"
              ? "Hytale"
              : "Modded";
        return {
          src: "/api/gallery/image?key=" + encodeURIComponent(obj.key),
          caption: (
            obj.customMetadata?.description ??
            "A moment from our shared worlds."
          ).slice(0, 2000),
          credit: (obj.customMetadata?.author ?? "").slice(0, 100),
          collection:
            name +
            (season === "season-unknown"
              ? " archive"
              : " · Season " + season.slice(7)),
          href: "/gallery/" + world,
        };
      }),
  ];
}
export function pickPhotos(
  photos: SpotlightPhoto[],
  exclude: string[] = [],
  random = Math.random,
) {
  const unique = [
    ...new Map(photos.map((photo) => [photo.src, photo])).values(),
  ];
  const preferred = unique.filter((photo) => !exclude.includes(photo.src));
  const previous = unique.filter((photo) => exclude.includes(photo.src));
  const result: SpotlightPhoto[] = [];
  while (result.length < 2 && (preferred.length || previous.length)) {
    const pool = preferred.length ? preferred : previous;
    result.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return result;
}
// Per-bucket memory plus an edge snapshot avoids listing R2 on every shuffle.
// No gallery objects, metadata or KV keys are written.
export function createSpotlightService() {
  const states = new WeakMap<
    R2Bucket,
    {
      snapshot?: Snapshot;
      retryAt: number;
      loading?: Promise<Snapshot | undefined>;
    }
  >();
  return async (
    bucket: R2Bucket,
    edge?: Cache,
    key?: Request,
    now = Date.now(),
  ) => {
    let state = states.get(bucket);
    if (!state) {
      state = { retryAt: 0 };
      states.set(bucket, state);
    }
    if (!state.snapshot && edge && key) {
      try {
        const saved = await edge.match(key);
        if (saved) {
          const snapshot = (await saved.json()) as Snapshot;
          if (
            Number.isFinite(snapshot.checkedAt) &&
            Array.isArray(snapshot.photos) &&
            now - snapshot.checkedAt < STALE_MS
          )
            state.snapshot = snapshot;
        }
      } catch {
        /* Edge caching is optional. */
      }
    }
    if (state.snapshot && now - state.snapshot.checkedAt < FRESH_MS)
      return state.snapshot.photos;
    if (now < state.retryAt)
      return state.snapshot && now - state.snapshot.checkedAt < STALE_MS
        ? state.snapshot.photos
        : LOCAL_ARCHIVE;
    state.loading ??= (async () => {
      try {
        const snapshot = {
          checkedAt: now,
          photos: await archivePhotos(bucket),
        };
        state.snapshot = snapshot;
        if (edge && key) {
          try {
            await edge.put(
              key,
              new Response(JSON.stringify(snapshot), {
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "public, max-age=86400",
                },
              }),
            );
          } catch {
            /* Keep the in-memory snapshot. */
          }
        }
        return snapshot;
      } catch {
        state.retryAt = now + 60_000;
        return state.snapshot && now - state.snapshot.checkedAt < STALE_MS
          ? state.snapshot
          : undefined;
      } finally {
        state.loading = undefined;
      }
    })();
    return (await state.loading)?.photos ?? LOCAL_ARCHIVE;
  };
}
