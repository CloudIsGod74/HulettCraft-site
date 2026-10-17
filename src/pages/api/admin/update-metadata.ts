import type { APIRoute } from "astro";
import { getBucket } from "../../../lib/runtime";
import { adminMutation, api, json, readJson } from "../../../lib/http";
import { isPublishedKey } from "../../../lib/galleryKeys";
import { mergeMetadata } from "../../../lib/gallery";
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const { key, updates } = await readJson(request);
    if (!isPublishedKey(key))
      return new Response("Invalid published screenshot key", { status: 400 });
    const bucket = getBucket(locals),
      obj = await bucket.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    if (obj.size > 25 * 1024 * 1024)
      return new Response("Metadata editing supports images up to 25 MiB", {
        status: 413,
      });
    const metadata = mergeMetadata(obj.customMetadata ?? {}, updates);
    const bytes = new Uint8Array(
      await new Response(obj.body as unknown as BodyInit).arrayBuffer(),
    );
    const saved = await bucket.put(key, bytes, {
      httpMetadata: obj.httpMetadata,
      customMetadata: metadata,
      onlyIf: { etagMatches: obj.etag },
    });
    if (!saved)
      return new Response("Image changed. Refresh before editing again.", {
        status: 409,
      });
    return json({ metadata });
  });
