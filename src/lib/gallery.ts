import type {
  R2Bucket,
  R2Object,
} from "@cloudflare/workers-types/experimental";
import {
  isPendingKey,
  isPublishedKey,
  metadataText,
  PENDING_PREFIX,
  type World,
} from "./galleryKeys";
import { isRecord } from "./http";
export interface GalleryItem {
  key: string;
  url: string;
  previewUrl: string;
  filename: string;
  uploadedAt: string;
  metadata: Record<string, string>;
  size: number;
}
export async function listObjects(
  bucket: R2Bucket,
  prefix: string,
): Promise<R2Object[]> {
  const objects: R2Object[] = [],
    seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix,
      cursor,
      limit: 100,
      include: ["customMetadata", "httpMetadata"],
    });
    objects.push(...page.objects);
    if (!page.truncated) break;
    if (!page.cursor || seen.has(page.cursor))
      throw new Error("Invalid gallery pagination cursor");
    seen.add(page.cursor);
    cursor = page.cursor;
  } while (true);
  return objects;
}
export function galleryItem(obj: R2Object, pending = false): GalleryItem {
  const url =
    (pending ? "/api/admin/preview?key=" : "/api/gallery/image?key=") +
    encodeURIComponent(obj.key);
  return {
    key: obj.key,
    url,
    previewUrl: url,
    filename: obj.key.split("/").pop()!,
    uploadedAt: obj.uploaded.toISOString(),
    metadata: obj.customMetadata ?? {},
    size: obj.size,
  };
}
export async function listGallery(
  bucket: R2Bucket,
  world: World,
  season?: string,
) {
  const prefix =
    "Screenshots/" + world + "/" + (season ? "season-" + season + "/" : "");
  return (await listObjects(bucket, prefix))
    .filter((o) => isPublishedKey(o.key))
    .map((o) => galleryItem(o));
}
export async function listPending(bucket: R2Bucket) {
  return (await listObjects(bucket, PENDING_PREFIX))
    .filter((o) => isPendingKey(o.key))
    .map((o) => galleryItem(o, true));
}
export function mergeMetadata(
  original: Record<string, string>,
  updates: unknown,
) {
  if (!isRecord(updates))
    throw new Response("Invalid metadata updates", { status: 400 });
  if (
    Object.keys(updates).some(
      (k) => !["description", "author", "clearFields"].includes(k),
    )
  )
    throw new Response("Unsupported metadata field", { status: 400 });
  const clear = updates.clearFields ?? [];
  if (
    !Array.isArray(clear) ||
    clear.some((k) => k !== "description" && k !== "author")
  )
    throw new Response("Invalid metadata clearing request", { status: 400 });
  const result = { ...original };
  for (const field of ["description", "author"] as const) {
    if (clear.includes(field)) result[field] = "";
    else if (updates[field] !== undefined) {
      const value = metadataText(
        updates[field],
        field === "description" ? 2000 : 100,
      );
      // Blank submissions never erase existing information implicitly.
      if (value) result[field] = value;
    }
  }
  return result;
}
export function pendingKeys(body: Record<string, unknown>): string[] {
  const keys = body.keys ?? (body.key ? [body.key] : []);
  if (
    !Array.isArray(keys) ||
    !keys.length ||
    keys.length > 100 ||
    !keys.every(isPendingKey)
  )
    throw new Response(
      "Only pending screenshot keys are allowed (maximum 100)",
      { status: 400 },
    );
  return [...new Set(keys)];
}
