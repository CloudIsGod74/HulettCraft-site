const encoder = new TextEncoder();
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const cookieAttributes = "HttpOnly; Secure; SameSite=Lax; Path=/";
export interface Session {
  sub: string;
  iat: number;
  exp?: number;
  sid?: string;
}
async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function createSession(username: string, secret: string) {
  if (!secret) throw new Error("Session secret missing");
  const now = Date.now();
  const payload = JSON.stringify({
    sub: username,
    iat: now,
    exp: now + SESSION_SECONDS * 1000,
    sid: crypto.randomUUID(),
  });
  const sig = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(payload),
  );
  return btoa(
    payload + "." + btoa(String.fromCharCode(...new Uint8Array(sig))),
  );
}
export async function verifySessionData(
  token: string | undefined,
  secret: string,
): Promise<Session | null> {
  if (!token || !secret || token.length > 4096) return null;
  try {
    const decoded = atob(token),
      dot = decoded.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = decoded.slice(0, dot);
    const signature = Uint8Array.from(atob(decoded.slice(dot + 1)), (c) =>
      c.charCodeAt(0),
    );
    if (
      signature.length !== 32 ||
      !(await crypto.subtle.verify(
        "HMAC",
        await signingKey(secret),
        signature,
        encoder.encode(payload),
      ))
    )
      return null;
    const data = JSON.parse(payload) as Session,
      now = Date.now();
    if (
      typeof data.sub !== "string" ||
      !Number.isSafeInteger(data.iat) ||
      data.iat > now + 60_000
    )
      return null;
    // Honor the seven-day lifetime of existing cookies that only contain iat.
    const expires = data.exp ?? data.iat + SESSION_SECONDS * 1000;
    if (
      !Number.isSafeInteger(expires) ||
      expires <= now ||
      expires > data.iat + SESSION_SECONDS * 1000
    )
      return null;
    if (
      data.sid !== undefined &&
      (typeof data.sid !== "string" || !/^[a-f0-9-]{36}$/.test(data.sid))
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
export async function verifySession(token: string | undefined, secret: string) {
  return (await verifySessionData(token, secret))?.sub ?? null;
}
export function readCookie(request: Request, name: string): string | undefined {
  try {
    const matches = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c.startsWith(name + "="));
    return matches.length === 1
      ? decodeURIComponent(matches[0].slice(name.length + 1))
      : undefined;
  } catch {
    return undefined;
  }
}
