import type { APIRoute } from "astro";
import { getBucket } from "../../../lib/runtime";
import {
  adminMutation,
  api,
  isRecord,
  json,
  readJson,
} from "../../../lib/http";
import { mergeMetadata, pendingKeys } from "../../../lib/gallery";
import { isWorld, normalizedSeason } from "../../../lib/galleryKeys";
import { validateImage, MAX_IMAGE_BYTES } from "../../../lib/uploads";
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const bucket = getBucket(locals),
      body = await readJson(request),
      keys = pendingKeys(body);
    const updates = body.updates ?? {};
    if (
      !isRecord(updates) ||
      Object.keys(updates).some((k) => !keys.includes(k))
    )
      return new Response("Invalid metadata updates", { status: 400 });
    const results = [];
    for (const key of keys) {
      try {
        const obj = await bucket.get(key);
        if (!obj) throw new Error("Pending image not found; refresh the queue");
        if (obj.size > MAX_IMAGE_BYTES)
          throw new Error("Pending image exceeds the upload limit");
        const meta = mergeMetadata(
          obj.customMetadata ?? {},
          updates[key] ?? {},
        );
        const world = meta.world || "hulettcraft";
        if (!isWorld(world)) throw new Error("Invalid world metadata");
        const season = normalizedSeason(meta.season, world);
        const bytes = await new Response(
          obj.body as unknown as BodyInit,
        ).arrayBuffer();
        const image = await validateImage(
          new File([bytes], key.split("/").pop()!),
        );
        // Preserve the pending filename; the conditional write prevents overwrites.
        const publishedKey =
          "Screenshots/" +
          world +
          "/season-" +
          season +
          "/" +
          key.split("/").pop();
        const saved = await bucket.put(publishedKey, image.bytes, {
          httpMetadata: { contentType: image.type },
          customMetadata: { ...meta, world, season },
          onlyIf: { etagDoesNotMatch: "*" },
        });
        if (!saved)
          throw new Error(
            "Published filename already exists; pending image was retained",
          );
        await bucket.delete(key);
        results.push({ key, ok: true, publishedKey });
      } catch (error) {
        results.push({
          key,
          ok: false,
          message:
            error instanceof Response
              ? await error.text()
              : error instanceof Error
                ? error.message
                : "Approval failed; refresh before retrying",
        });
      }
    }
    return json({ results }, results.every((r) => r.ok) ? 200 : 207);
  });
