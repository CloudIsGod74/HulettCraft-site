import type { APIRoute } from "astro";
import { getBucket } from "../../../lib/runtime";
import { adminMutation, api, readJson } from "../../../lib/http";
import { pendingKeys } from "../../../lib/gallery";
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const keys = pendingKeys(await readJson(request)),
      bucket = getBucket(locals);
    try {
      for (const key of keys) await bucket.delete(key);
    } catch {
      return new Response("Deletion failed; refresh before retrying", {
        status: 503,
      });
    }
    return new Response("OK", { headers: { "Cache-Control": "no-store" } });
  });
