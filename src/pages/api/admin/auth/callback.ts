export async function GET() {
  return new Response("CALLBACK ALIVE", {
    headers: { "Content-Type": "text/plain" },
  });
}
