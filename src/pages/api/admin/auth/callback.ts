export async function GET({ url }: { url: URL }) {
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("NO CODE RECEIVED", { status: 400 });
  }

  return new Response(
    `CALLBACK HIT. CODE=${code}`,
    { status: 200 }
  );
}
