import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";
import { getBucket } from "../../../lib/runtime";
import { api, json } from "../../../lib/http";
import { listPending } from "../../../lib/gallery";
export const GET: APIRoute = ({ request, locals }) =>
  api(async () => {
    if (!(await requireAdmin(request, locals)))
      return new Response("Unauthorized", { status: 401 });
    return json(await listPending(getBucket(locals)));
  });
