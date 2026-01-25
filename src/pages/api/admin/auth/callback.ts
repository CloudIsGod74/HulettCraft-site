export async function GET({ locals }: { locals: any }) {
  const env = locals?.runtime?.env;

  return new Response(
    `ENV_PRESENT=${env ? "yes" : "no"}`,
    { headers: { "Content-Type": "text/plain" } }
  );
}
