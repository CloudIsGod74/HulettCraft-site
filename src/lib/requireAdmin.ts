import { verifySession } from "./adminSession";
import { ADMIN_USERS } from "./adminAllowlist";

export async function requireAdmin(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.match(/admin_session=([^;]+)/)?.[1];

  const secret = import.meta.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const user = await verifySession(cookie, secret);
  if (!user) return null;

  return ADMIN_USERS.has(user) ? user : null;
}
