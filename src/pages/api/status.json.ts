export async function GET() {
  const status = {
    vanilla: "online",
    creative: "online",
    modded: "offline",
    hytale: "online"
  };

  return new Response(JSON.stringify(status), {
    headers: { "Content-Type": "application/json" }
  });
}
