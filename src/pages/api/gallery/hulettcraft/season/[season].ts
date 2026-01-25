import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, locals }) => {
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) {
    return new Response("R2 not configured", { status: 500 });
  }

  const season = params.season;
  if (!season) {
    return new Response("Missing season", { status: 400 });
  }

  const prefix = `Screenshots/hulettcraft/season-${season}/`;

  const list = await bucket.list({ prefix });

  const images = list.objects
    .filter((obj) => !obj.key.endsWith("/"))
    .map((obj) => ({
      key: obj.key,
      url: `/api/gallery/image?key=${encodeURIComponent(obj.key)}`,
      uploadedAt: obj.uploaded,
      metadata: obj.customMetadata ?? {},
    }));

  return new Response(JSON.stringify(images), {
    headers: { "Content-Type": "application/json" },
  });
};
