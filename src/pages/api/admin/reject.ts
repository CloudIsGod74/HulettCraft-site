import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;

  if (!bucket) {
    console.error("R2 bucket binding missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Support single or bulk
  const keys: string[] =
    body.keys ??
    (body.key ? [body.key] : []);

  if (!keys.length) {
    return new Response("No keys provided", { status: 400 });
  }

  await Promise.all(
    keys.map((key) => bucket.delete(key))
  );

  return new Response("OK");
};
