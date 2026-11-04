// Authenticates the application's notification marker, not general support mail.
// This module contains no recipient addresses or runtime secrets.
export const APPLICATION_FORWARDING_HEADER = "X-Hulettcraft-Application";
const encoder = new TextEncoder();
const lifetimeSeconds = 7 * 24 * 60 * 60;
function validSecret(secret: string | undefined): secret is string {
  return (
    !!secret &&
    secret.length >= 32 &&
    secret.length <= 256 &&
    /^[\x21-\x7e]+$/.test(secret)
  );
}
async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function payload(issued: string, id: string, subject: string) {
  return encoder.encode(
    `hulettcraft-application-v1\n${issued}\n${id}\n${subject}`,
  );
}
export async function applicationForwardingHeader(
  secret: string | undefined,
  id: string,
  subject: string,
  now = Date.now(),
): Promise<string | undefined> {
  if (!validSecret(secret)) return undefined;
  if (
    !/^[a-z0-9-]{1,100}$/i.test(id) ||
    subject.length > 160 ||
    /[\r\n]/.test(subject)
  )
    throw new Error("Invalid application forwarding marker input");
  const issued = String(Math.floor(now / 1000));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await key(secret),
      payload(issued, id, subject),
    ),
  );
  return `v1:${issued}:${id}:${Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
export async function isApplicationNotification(
  secret: string | undefined,
  header: string | null,
  subject: string | null,
  now = Date.now(),
): Promise<boolean> {
  if (
    !validSecret(secret) ||
    !header ||
    header.length > 300 ||
    !subject ||
    subject.length > 160 ||
    /[\r\n]/.test(subject)
  )
    return false;
  const match = /^v1:(\d{10}):([a-z0-9-]{1,100}):([a-f0-9]{64})$/i.exec(header);
  if (!match) return false;
  const [, issued, id, signature] = match;
  const age = Math.floor(now / 1000) - Number(issued);
  if (age < -300 || age > lifetimeSeconds) return false;
  try {
    const bytes = Uint8Array.from(signature.match(/../g)!, (byte) =>
      parseInt(byte, 16),
    );
    return await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      bytes,
      payload(issued, id, subject),
    );
  } catch {
    return false;
  }
}
