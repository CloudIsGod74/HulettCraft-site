import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";
import { isPendingKey } from "../../../lib/galleryKeys";
import { getBucket } from "../../../lib/runtime";
import { api } from "../../../lib/http";
import { imageResponse } from "../../../lib/images";
export const GET: APIRoute = ({ request, url, locals }) =>
  api(async () => {
    if (!(await requireAdmin(request, locals)))
      return new Response("Unauthorized", { status: 401 });
    const key = url.searchParams.get("key");
    if (!isPendingKey(key)) return new Response("Not found", { status: 404 });
    const obj = await getBucket(locals).get(key);
    return obj
      ? imageResponse(obj, false)
      : new Response("Not found", { status: 404 });
  });
