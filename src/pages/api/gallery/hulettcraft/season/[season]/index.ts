import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, locals }) => {
  const season = params.season;
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;

  if (!season || !bucket) {
    return new Response("Invalid request", { status: 400 });
  }

  const prefix = `Screenshots/hulettcraft/season-${season}/`;

  const list = await bucket.list({ prefix });

  const items = list.objects.map(obj => ({
    key: obj.key,
    url: `/api/gallery/image?key=${encodeURIComponent(obj.key)}`,
    uploadedAt: obj.uploaded,
    metadata: obj.customMetadata ?? {}
  }));

  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json" }
  });
};
