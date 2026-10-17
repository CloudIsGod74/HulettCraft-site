import type { APIRoute } from "astro";
import { getBucket } from "../../../lib/runtime";
import { api } from "../../../lib/http";
import { PENDING_PREFIX, submissionMetadata } from "../../../lib/galleryKeys";
import {
  limitedForm,
  MAX_IMAGE_BYTES,
  safeFilename,
  validateImage,
} from "../../../lib/uploads";
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return new Response("Forbidden origin", { status: 403 });
    const env = locals.runtime.env;
    if (env.UPLOAD_RATE_LIMITER) {
      const result = await env.UPLOAD_RATE_LIMITER.limit({
        key: request.headers.get("CF-Connecting-IP") ?? "unknown",
      });
      if (!result.success)
        return new Response("Too many uploads. Please try again later.", {
          status: 429,
          headers: { "Retry-After": "60" },
        });
    }
    const form = await limitedForm(request, MAX_IMAGE_BYTES + 64 * 1024);
    const file = form.get("screenshot");
    if (!(file instanceof File))
      return new Response("Choose an image", { status: 400 });
    const image = await validateImage(file),
      metadata = submissionMetadata(form);
    const key =
      PENDING_PREFIX +
      crypto.randomUUID() +
      "-" +
      safeFilename(file.name) +
      "." +
      image.extension;
    const saved = await getBucket(locals).put(key, image.bytes, {
      httpMetadata: { contentType: image.type },
      customMetadata: metadata,
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!saved)
      return new Response("Could not save upload. Try again.", { status: 409 });
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/gallery/upload?success=1",
        "Cache-Control": "no-store",
      },
    });
  });
