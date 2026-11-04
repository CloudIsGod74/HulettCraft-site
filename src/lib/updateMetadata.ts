import type { R2Bucket } from "@cloudflare/workers-types/experimental";
import { mergeMetadata } from "./gallery";

export async function updateMetadata(
  bucket: R2Bucket,
  key: string,
  updates: unknown,
) {
  const obj = await bucket.get(key);
  if (!obj) throw new Response("Image not found", { status: 404 });
  if (obj.size > 25 * 1024 * 1024)
    throw new Response("Metadata editing supports images up to 25 MiB", {
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
    throw new Response("Image changed. Refresh before editing again.", {
      status: 409,
    });
  return metadata;
}
