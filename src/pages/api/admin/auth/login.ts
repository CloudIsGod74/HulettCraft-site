export async function GET({ locals }: { locals: any }) {
  const { GITHUB_CLIENT_ID } = locals.runtime.env;

  if (!GITHUB_CLIENT_ID) {
    return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", GITHUB_CLIENT_ID);
  url.searchParams.set("scope", "read:user");

  return Response.redirect(url.toString(), 302);
}
