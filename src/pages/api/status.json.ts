import type { APIRoute } from "astro";
import { serverStatusService, statusHeaders } from "../../lib/serverStatus";
// Preserve the original string-valued API contract, now using real checks.
export const GET: APIRoute = async ({ locals }) => {
  const statuses = await serverStatusService(
    locals.runtime?.env?.HYTALE_QUERY_URL,
  );
  return new Response(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(statuses).map(([key, value]) => [key, value.state]),
      ),
    ),
    { headers: statusHeaders },
  );
};
