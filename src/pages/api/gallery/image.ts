import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request, locals }) => {
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) {
    return new Response("R2 not configured", { status: 500 });
  }

  const key = new URL(request.url).searchParams.get("key");
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
      "Cache-Control": "public, max-age=86400",
    },
  });
};
