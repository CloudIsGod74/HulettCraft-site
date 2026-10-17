import type { APIRoute } from "astro";
import { cookieAttributes } from "../../../../lib/adminSession";
export const GET: APIRoute = ({ locals }) => {
  const clientId = locals.runtime?.env?.GITHUB_CLIENT_ID;
  if (!clientId)
    return new Response("GitHub login is unavailable", { status: 503 });
  const state = crypto.randomUUID(),
    url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie":
        "admin_oauth_state=" +
        state +
        "; " +
        cookieAttributes +
        "; Max-Age=600",
    },
  });
};
