import crypto from "node:crypto";

const SECRET = import.meta.env.ADMIN_SESSION_SECRET;

/**
 * Create an HMAC signature for a string
 */
function sign(data: string) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("hex");
}

/**
 * Create a signed session cookie value
 */
export function createSession(username: string) {
  const payload = {
    sub: username,
    iat: Date.now(),
  };

  const json = JSON.stringify(payload);
  const sig = sign(json);

  return Buffer.from(`${json}.${sig}`).toString("base64");
}

/**
 * Verify and decode a session cookie
 */
export function verifySession(cookie: string): string | null {
  try {
    const decoded = Buffer.from(cookie, "base64").toString("utf8");
    const [json, sig] = decoded.split(".");

    if (!json || !sig) return null;
    if (sign(json) !== sig) return null;

    const payload = JSON.parse(json);

    return payload.sub as string;
  } catch {
    return null;
  }
}
