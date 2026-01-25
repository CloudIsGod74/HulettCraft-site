export async function GET() {
  const url = new URL("https://github.com/login/oauth/authorize");

  url.searchParams.set("client_id", import.meta.env.GITHUB_CLIENT_ID);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", crypto.randomUUID());

  return Response.redirect(url.toString(), 302);
}
