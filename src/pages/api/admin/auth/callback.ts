import { ADMIN_USERS } from "../../../../lib/adminAllowlist";
import { createSession } from "../../../../lib/adminSession";

export async function GET({ url, locals }: { url: URL; locals: any }) {
  const {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    ADMIN_SESSION_SECRET,
  } = locals.runtime.env;

  const code = url.searchParams.get("code");
  if (!code) return new Response("NO CODE", { status: 400 });

  // Exchange code → token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "HulettCraft-Admin",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return new Response("TOKEN FAIL", { status: 500 });
  }

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
      "User-Agent": "HulettCraft-Admin",
    },
  });

  const user = await userRes.json();
  const login = String(user.login).toLowerCase();

  if (!ADMIN_USERS.has(login)) {
    return new Response("ACCESS DENIED", { status: 403 });
  }

  const session = await createSession(login, ADMIN_SESSION_SECRET);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/pending",
      "Set-Cookie": [
        `admin_session=${session}`,
        "HttpOnly",
        "SameSite=Lax",
        "Path=/",
        "Max-Age=604800",
      ].join("; "),
    },
  });
}
