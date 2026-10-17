import { getServerStatuses, statusHeaders } from "../../lib/serverStatus";
export async function GET() {
  return new Response(JSON.stringify(await getServerStatuses()), {
    headers: statusHeaders,
  });
}
