import { verifySession } from "@/lib/adminSession";
import { ADMIN_USERS } from "@/lib/adminAllowlist";

export function requireAdmin(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.match(/admin_session=([^;]+)/)?.[1];

  if (!cookie) return null;

  const username = verifySession(cookie);
  if (!username) return null;

  if (!ADMIN_USERS.has(username)) return null;

  return username;
}
