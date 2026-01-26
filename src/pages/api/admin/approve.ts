import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = await requireAdmin(request, locals);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) return new Response("Server misconfigured", { status: 500 });

  const body = await request.json();
  const keys: string[] = body.keys ?? (body.key ? [body.key] : []);
  const updates: Record<string, any> = body.updates ?? {};

  if (!keys.length) {
    return new Response("No keys provided", { status: 400 });
  }

  await Promise.all(
    keys.map(async (pendingKey) => {
      const obj = await bucket.get(pendingKey);
      if (!obj) return;

      const originalMeta = obj.customMetadata ?? {};
      const overrideMeta = updates[pendingKey] ?? {};

      const finalMeta = {
        ...originalMeta,
        ...overrideMeta,
      };

      const world = finalMeta.world || "hulettcraft";
      const season = finalMeta.season
        ? `season-${finalMeta.season}`
        : "season-unknown";

      const filename = pendingKey.split("/").pop();
      if (!filename) return;

      const approvedKey = `Screenshots/${world}/${season}/${filename}`;

      await bucket.put(approvedKey, obj.body, {
        httpMetadata: obj.httpMetadata,
        customMetadata: finalMeta,
      });

      await bucket.delete(pendingKey);
    })
  );

  return new Response("OK");
};
