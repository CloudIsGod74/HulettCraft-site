const encoder = new TextEncoder();

async function hmacSHA256(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );

  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function createSession(username: string, secret: string) {
  const payload = JSON.stringify({
    sub: username,
    iat: Date.now(),
  });

  const sig = await hmacSHA256(secret, payload);
  return btoa(`${payload}.${sig}`);
}
