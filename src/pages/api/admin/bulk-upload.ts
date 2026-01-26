import type { APIRoute } from "astro";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2 } from "@/lib/r2";

export const POST: APIRoute = async ({ request, locals }) => {
  requireAdmin(locals);

  const form = await request.formData();
  const files = form.getAll("files") as File[];
  const manifestRaw = form.get("manifest");

  if (!manifestRaw || typeof manifestRaw !== "string") {
    return new Response("Missing manifest", { status: 400 });
  }

  let manifest: Array<{
    filename: string;
    world: string;
    season: number;
    description?: string;
    author?: string;
  }>;

  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return new Response("Invalid manifest JSON", { status: 400 });
  }

  const uploads = files.map(async (file) => {
    const meta = manifest.find((m) => m.filename === file.name);
    if (!meta) return;

    const world = meta.world || "hulettcraft";
    const season = meta.season;

    const key = `Screenshots/${world}/season-${season}/${file.name}`;

    await r2.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        world,
        season: String(season),
        description: meta.description ?? "",
        author: meta.author ?? "",
        approved: "true",
      },
    });
  });

  await Promise.all(uploads);

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
