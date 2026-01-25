import { verifySession } from "./adminSession";
import { ADMIN_USERS } from "./adminAllowlist";

export async function requireAdmin(
  request: Request,
  locals?: App.Locals
) {
  // ✅ READ SECRET AT RUNTIME
  const secret = import.meta.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    console.error("ADMIN_SESSION_SECRET is missing");
    return null;
  }

  const cookie = request.headers.get("cookie") ?? "";
  const session = cookie
    .split("; ")
    .find((c) => c.startsWith("admin_session="))
    ?.split("=")[1];

  if (!session) return null;

  const username = verifySession(session, secret);
  if (!username) return null;

  if (!ADMIN_USERS.has(username)) return null;

  return { username };
}
