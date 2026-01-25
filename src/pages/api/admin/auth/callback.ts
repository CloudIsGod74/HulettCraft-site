export async function GET({ url, locals }: { url: URL; locals: any }) {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = locals.runtime.env;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return new Response("Missing GitHub OAuth env vars", { status: 500 });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("NO CODE RECEIVED", { status: 400 });
  }

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

  return new Response(
    JSON.stringify(tokenData, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}
