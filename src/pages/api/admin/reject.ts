import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/requireAdmin";

export async function POST({ request, locals }) {
  const { key, keys } = await request.json();
  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;

  const targets = keys ?? (key ? [key] : []);
  if (!targets.length) {
    return new Response("No keys", { status: 400 });
  }

  await Promise.all(
    targets.map((k) => bucket.delete(k))
  );

  return new Response("OK");
}

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = await requireAdmin(request, locals);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const bucket = locals.runtime.env.HULETTCRAFT_BUCKET;
  if (!bucket) return new Response("R2 missing", { status: 500 });

  const { key } = await request.json();
  if (!key) return new Response("Missing key", { status: 400 });

  await bucket.delete(key);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
