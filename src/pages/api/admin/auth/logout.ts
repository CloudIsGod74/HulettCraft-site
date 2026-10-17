import type { APIRoute } from "astro";
import {
  cookieAttributes,
  readCookie,
  verifySessionData,
} from "../../../../lib/adminSession";
import { api } from "../../../../lib/http";
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return new Response("Forbidden origin", { status: 403 });
    const env = locals.runtime.env;
    const session = await verifySessionData(
      readCookie(request, "admin_session"),
      env.ADMIN_SESSION_SECRET ?? "",
    );
    if (session?.sid && env.SESSION) {
      await env.SESSION.put("revoked:" + session.sid, "1", {
        expirationTtl: Math.max(
          60,
          Math.ceil(((session.exp ?? session.iat) - Date.now()) / 1000),
        ),
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/admin/login",
        "Cache-Control": "no-store",
        "Set-Cookie": "admin_session=; " + cookieAttributes + "; Max-Age=0",
      },
    });
  });
