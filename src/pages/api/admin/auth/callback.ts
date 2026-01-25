export async function GET({ url }: { url: URL }) {
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
      client_id: import.meta.env.GITHUB_CLIENT_ID,
      client_secret: import.meta.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return new Response(
      "FAILED TO GET ACCESS TOKEN\n" + JSON.stringify(tokenData, null, 2),
      { status: 500 }
    );
  }

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });

  const user = await userRes.json();

  return new Response(
    `OAUTH SUCCESS\n\nGitHub username: ${user.login}`,
    {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }
  );
}
