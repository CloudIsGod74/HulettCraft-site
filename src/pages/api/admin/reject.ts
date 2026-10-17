import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";
import { isPendingKey } from "../../../lib/galleryKeys";

export const POST: APIRoute = async ({ request, locals }) => {
  // Authenticate before parsing a request or touching storage. Fail closed on
  // malformed cookies too; session parsing is hardened in the follow-up patch.
  let admin: string | null;
  try {
    admin = await requireAdmin(request, locals);
  } catch {
    admin = null;
  }
  if (!admin) return new Response("Unauthorized", { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response("Forbidden origin", { status: 403 });
  }
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;

  if (!bucket) {
    console.error("R2 bucket binding missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > 65536) return new Response("Request too large", { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Support single or bulk
  const keys: unknown = body && typeof body === "object" && !Array.isArray(body)
    ? body.keys ?? (body.key ? [body.key] : [])
    : [];
  // Validate the ENTIRE batch before deletion: a mixed valid/invalid batch must
  // never partially delete objects. Published files cannot pass this check.
  if (!Array.isArray(keys) || !keys.length || keys.length > 100 || !keys.every(isPendingKey)) {
    return new Response("Only pending screenshot keys are allowed (maximum 100)", { status: 400 });
  }

  try {
    for (const key of new Set(keys)) await bucket.delete(key);
  } catch {
    console.error("Pending screenshot deletion failed");
    return new Response("Deletion failed; refresh before retrying", { status: 503 });
  }

  return new Response("OK");
};
