import { requireAdmin } from "./requireAdmin";
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Response("Expected application/json", { status: 415 });
  const text = await request.text();
  if (text.length > 65536)
    throw new Response("Request too large", { status: 413 });
  try {
    const body: unknown = JSON.parse(text);
    if (isRecord(body)) return body;
  } catch {
    /* invalid JSON */
  }
  throw new Response("Invalid JSON object", { status: 400 });
}
export async function adminMutation(request: Request, locals: App.Locals) {
  if (!(await requireAdmin(request, locals)))
    throw new Response("Unauthorized", { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Forbidden origin", { status: 403 });
}
export async function api(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(
      "Request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return new Response("Service unavailable. Please try again.", {
      status: 503,
    });
  }
}
