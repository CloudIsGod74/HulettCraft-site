import { verifySession } from "./adminSession";
import { ADMIN_USERS } from "./adminAllowlist";

export async function requireAdmin(
  request: Request,
  locals: any
): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const rawToken = cookieHeader.match(/admin_session=([^;]+)/)?.[1];
  const token = rawToken ? decodeURIComponent(rawToken) : null;
  if (!secret) return null;

  const secret = locals?.runtime?.env?.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const user = await verifySession(token, secret);
  if (!user) return null;

  return ADMIN_USERS.has(user) ? user : null;
}
