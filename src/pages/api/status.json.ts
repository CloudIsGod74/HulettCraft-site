import { getServerStatuses, statusHeaders } from "../../lib/serverStatus";
// Preserve the original string-valued API contract, now using real checks.
export async function GET() {
  const statuses = await getServerStatuses();
  return new Response(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(statuses).map(([key, value]) => [key, value.state]),
      ),
    ),
    { headers: statusHeaders },
  );
}
