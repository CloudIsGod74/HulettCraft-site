import type { APIRoute } from "astro";
import { serverStatusService, statusHeaders } from "../../lib/serverStatus";
export const GET: APIRoute = async ({ locals }) => {
  return new Response(
    JSON.stringify(
      await serverStatusService(locals.runtime?.env?.HYTALE_QUERY_URL),
    ),
    {
      headers: statusHeaders,
    },
  );
};
