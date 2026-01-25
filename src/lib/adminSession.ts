const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function hmacSHA256(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return key;
}

export async function createSession(username: string, secret: string) {
  const payload = JSON.stringify({
    sub: username,
    iat: Date.now(),
  });

  const key = await hmacSHA256(secret, payload);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const sigBase64 = btoa(
    String.fromCharCode(...new Uint8Array(sig))
  );

  return btoa(`${payload}.${sigBase64}`);
}

export async function verifySession(
  token: string | undefined,
  secret: string
): Promise<string | null> {
  if (!token) return null;

  let decoded: string;
  try {
    decoded = atob(token);
  } catch {
    return null;
  }

  const [payload, sig] = decoded.split(".");
  if (!payload || !sig) return null;

  const key = await hmacSHA256(secret, payload);

  const sigBytes = Uint8Array.from(
    atob(sig),
    (c) => c.charCodeAt(0)
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    encoder.encode(payload)
  );

  if (!valid) return null;

  try {
    const data = JSON.parse(payload);
    return data.sub ?? null;
  } catch {
    return null;
  }
}
