import { readCookie, verifySessionData } from "./adminSession";
import { ADMIN_USERS } from "./adminAllowlist";
export async function requireAdmin(
  request: Request,
  locals: App.Locals,
): Promise<string | null> {
  const env = locals.runtime?.env;
  if (!env?.ADMIN_SESSION_SECRET) return null;
  const data = await verifySessionData(
    readCookie(request, "admin_session"),
    env.ADMIN_SESSION_SECRET,
  );
  if (!data || !ADMIN_USERS.has(data.sub)) return null;
  if (data.sid && env.SESSION) {
    try {
      if (await env.SESSION.get("revoked:" + data.sid)) return null;
    } catch {
      return null;
    }
  }
  return data.sub;
}
