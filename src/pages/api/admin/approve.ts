import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) {
    console.error("R2 bucket binding missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  const body = await request.json();
  const keys: string[] =
    body.keys ??
    (body.key ? [body.key] : []);

  if (!keys.length) {
    return new Response("No keys provided", { status: 400 });
  }

const { keys, updates } = await request.json();

await Promise.all(
  keys.map(async (pendingKey: string) => {
    const obj = await bucket.get(pendingKey);
    if (!obj) return;

    const existing = obj.customMetadata ?? {};
    const override = updates?.[pendingKey] ?? {};

    const meta = {
      ...existing,
      ...override,
    };

    const world = meta.world || "unknown";
    const season = meta.season
      ? `season-${meta.season}`
      : "season-unknown";

    const filename = pendingKey.split("/").pop();
    if (!filename) return;

    const approvedKey =
      `Screenshots/${world}/${season}/${filename}`;

    await bucket.put(approvedKey, obj.body, {
      httpMetadata: obj.httpMetadata,
      customMetadata: meta,
    });

    await bucket.delete(pendingKey);
  })
);


  return new Response("OK");
};
