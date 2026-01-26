import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = await requireAdmin(request, locals);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) return new Response("Server misconfigured", { status: 500 });

  const { key, updates } = await request.json();
  if (!key || !updates) {
    return new Response("Invalid request", { status: 400 });
  }

  const obj = await bucket.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const finalMeta = {
    ...(obj.customMetadata ?? {}),
    ...updates,
  };

  await bucket.put(key, obj.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: finalMeta,
  });

  return new Response("OK");
};
