import type {
  R2Object,
  R2ObjectBody,
} from "@cloudflare/workers-types/experimental";
export function rasterContentType(obj: Pick<R2Object, "key" | "httpMetadata">) {
  const contentType = obj.httpMetadata?.contentType?.toLowerCase();
  const types: Record<string, string> = {
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
  };
  // Older R2 uploads sometimes have no content type: infer only known raster
  // extensions, never reflect an arbitrary stored content type into HTML.
  const extension = obj.key.split(".").pop()?.toLowerCase();
  const fallback: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  const allowed = contentType ? types : fallback;
  const name = contentType || extension || "";
  return Object.hasOwn(allowed, name) ? allowed[name] : undefined;
}
export function imageResponse(obj: R2ObjectBody, isPublic: boolean) {
  const type = rasterContentType(obj);
  if (!type) return new Response("Unsupported image type", { status: 415 });
  return new Response(obj.body as unknown as BodyInit, {
    headers: {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
      ETag: obj.httpEtag,
    },
  });
}
