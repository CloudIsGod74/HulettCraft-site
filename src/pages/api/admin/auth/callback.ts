import { ADMIN_USERS } from "../../../../lib/adminAllowlist";
import { createSession } from "../../../../lib/adminSession";

export async function GET({ url }: { url: URL }) {
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  // Exchange code for token
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: import.meta.env.GITHUB_CLIENT_ID,
        client_secret: import.meta.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return new Response("Auth failed", { status: 401 });
  }

  // Fetch user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });

  const user = await userRes.json();

  console.log("GitHub OAuth user.login =", user.login);

  if (!ADMIN_USERS.has(user.login)) {
    return new Response("Access denied", { status: 403 });
  }

  console.log("OAuth success for:", user.login);
	 
  const session = createSession(user.login);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/pending",
      "Set-Cookie": [
        `admin_session=${session}`,
        "HttpOnly",
        //"Secure",//
        "SameSite=Strict",
        "Path=/",
        "Max-Age=604800", // 7 days
      ].join("; "),
    },
  });
}
