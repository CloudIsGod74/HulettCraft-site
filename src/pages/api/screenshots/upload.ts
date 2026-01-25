import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
    if (!bucket) {
      console.error("R2 bucket binding missing");
      return new Response("Server misconfigured", { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("screenshot");

    if (!(file instanceof File)) {
      return new Response("No file uploaded", { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return new Response("Invalid file type", { status: 400 });
    }

    const world = String(formData.get("world") ?? "unknown");
    const season = String(formData.get("season") ?? "");
    const description = String(formData.get("description") ?? "");
    const author = String(formData.get("author") ?? "");

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, "_");

    const objectKey = `Screenshots - Need Approval/${timestamp}-${safeName}`;

    await bucket.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        world: String(world ?? ""),
        season: String(season ?? ""),
        description: String(description ?? ""),
        author: String(author ?? ""),
      },
    });

    return new Response(null, {
      status: 303,
      headers: {
        Location: "/gallery/upload?success=1",
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    return new Response("Upload failed", { status: 500 });
  }
};
