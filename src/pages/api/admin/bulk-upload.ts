import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = await requireAdmin(request, locals);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) return new Response("Server misconfigured", { status: 500 });

  const form = await request.formData();
  const files = form.getAll("files") as File[];
  const manifestRaw = form.get("manifest");

  if (!manifestRaw || typeof manifestRaw !== "string") {
    return new Response("Missing manifest", { status: 400 });
  }

  let manifest: Array<{
    filename: string;
    world?: string;
    season?: string | number;
    description?: string;
    author?: string;
  }>;

  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return new Response("Invalid manifest JSON", { status: 400 });
  }

  await Promise.all(
    files.map(async (file) => {
      const meta = manifest.find((m) => m.filename === file.name);
      if (!meta) return;

      const world = meta.world || "hulettcraft";
      const season = meta.season
        ? `season-${meta.season}`
        : "season-unknown";

      const key = `Screenshots/${world}/${season}/${file.name}`;

      await bucket.put(key, file.stream(), {
        httpMetadata: {
          contentType: file.type,
        },
        customMetadata: {
          world,
          season: meta.season ? String(meta.season) : "",
          description: meta.description ?? "",
          author: meta.author ?? "",
        },
      });
    })
  );

  return new Response("OK");
};
