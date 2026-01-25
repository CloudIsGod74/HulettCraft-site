import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";

export const GET: APIRoute = async ({ request, locals }) => {
  // ---- AUTH ----
  const admin = await requireAdmin(request, locals);
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ---- R2 BINDING ----
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) {
    console.error("R2 bucket binding missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  // ---- LIST OBJECTS ----
  const prefix = "Screenshots - Need Approval/";

  const list = await bucket.list({
    prefix,
  });

  // ---- BUILD RESPONSE ----
  const screenshots = list.objects
    .filter((obj) => !obj.key.endsWith("/")) // ignore pseudo-directories
    .map((obj) => {
      return {
        key: obj.key,
        filename: obj.key.split("/").pop(),
        uploadedAt: obj.uploaded?.toISOString() ?? null,
        size: obj.size,
        metadata: obj.customMetadata ?? {},
	previewUrl: `/api/admin/preview?key=${encodeURIComponent(obj.key)}`
        // later: generate signed URL here if needed
      };
    });

  return new Response(JSON.stringify(screenshots), {
    headers: { "Content-Type": "application/json" },
  });
};
