import { ADMIN_USERS } from "../../../../lib/adminAllowlist";

export async function GET({ url, locals }: { url: URL; locals: any }) {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = locals.runtime.env;

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("NO CODE RECEIVED", { status: 400 });
  }

  // Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return new Response("TOKEN EXCHANGE FAILED", { status: 500 });
  }

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });

  const user = await userRes.json();
  const login = String(user.login).toLowerCase();

  const authorized = ADMIN_USERS.has(login);

  return new Response(
    `GITHUB LOGIN: ${user.login}\nAUTHORIZED: ${authorized}`,
    { headers: { "Content-Type": "text/plain" } }
  );
}
