import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";

export const GET: APIRoute = async ({ request, locals, url }) => {
  const admin = await requireAdmin(request, locals);
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) {
    return new Response("R2 not configured", { status: 500 });
  }

  const key = url.searchParams.get("key");
  if (!key) {
    return new Response("Missing key", { status: 400 });
  }

  const obj = await bucket.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "image/png",
      "Cache-Control": "no-store",
    },
  });
};
