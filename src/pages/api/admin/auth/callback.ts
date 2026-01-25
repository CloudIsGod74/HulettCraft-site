export async function GET({ url }: { url: URL }) {
  const code = url.searchParams.get("code");

  return new Response(
    `CODE=${code ?? "none"}`,
    { headers: { "Content-Type": "text/plain" } }
  );
}
