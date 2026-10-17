import { createSession } from "../src/lib/adminSession";
export const secret = "test-only-session-secret-not-a-production-credential";
export const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
type Stored = {
  bytes: Uint8Array<ArrayBuffer>;
  customMetadata: Record<string, string>;
  httpMetadata: { contentType?: string };
  etag: string;
};
export class MemoryBucket {
  objects = new Map<string, Stored>();
  deleted: string[] = [];
  listCalls: Record<string, unknown>[] = [];
  async put(
    key: string,
    body: unknown,
    options: {
      customMetadata?: Record<string, string>;
      httpMetadata?: { contentType?: string };
      onlyIf?: { etagDoesNotMatch?: string; etagMatches?: string };
    } = {},
  ) {
    const old = this.objects.get(key);
    if (options.onlyIf?.etagDoesNotMatch === "*" && old) return null;
    if (options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches)
      return null;
    const bytes = new Uint8Array(
      await new Response(body as BodyInit).arrayBuffer(),
    );
    const etag = crypto.randomUUID();
    this.objects.set(key, {
      bytes,
      etag,
      customMetadata: { ...options.customMetadata },
      httpMetadata: { ...options.httpMetadata },
    });
    return this.get(key);
  }
  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) return null;
    return {
      ...value,
      key,
      size: value.bytes.length,
      uploaded: new Date("2026-01-01"),
      httpEtag: '"' + value.etag + '"',
      body: new Response(value.bytes).body,
    };
  }
  async delete(key: string) {
    this.deleted.push(key);
    this.objects.delete(key);
  }
  async list(
    options: {
      prefix?: string;
      cursor?: string;
      include?: string[];
      limit?: number;
    } = {},
  ) {
    this.listCalls.push({ ...options });
    const entries = [...this.objects]
      .filter(([k]) => k.startsWith(options.prefix ?? ""))
      .sort(([a], [b]) => a.localeCompare(b));
    const offset = Number(options.cursor ?? 0),
      size = Math.min(options.limit ?? 2, 2);
    const objects = await Promise.all(
      entries.slice(offset, offset + size).map(async ([key]) => {
        const obj = (await this.get(key))!;
        return {
          ...obj,
          customMetadata: options.include?.includes("customMetadata")
            ? obj.customMetadata
            : undefined,
        };
      }),
    );
    return {
      objects,
      truncated: offset + size < entries.length,
      cursor:
        offset + size < entries.length ? String(offset + size) : undefined,
    };
  }
}
export function locals(
  bucket = new MemoryBucket(),
  overrides: Record<string, unknown> = {},
) {
  return {
    runtime: {
      env: {
        ADMIN_SESSION_SECRET: secret,
        HULETTCRAFT_BUCKET: bucket,
        ...overrides,
      },
    },
  } as unknown as App.Locals;
}
export async function request(
  path: string,
  body?: unknown,
  authenticated = true,
  origin = "https://example.test",
) {
  const token = authenticated
    ? await createSession("cloudisgod74", secret)
    : undefined;
  return new Request("https://example.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body !== undefined
        ? { "Content-Type": "application/json", origin }
        : {}),
      ...(token
        ? { cookie: "admin_session=" + encodeURIComponent(token) }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
export function context(
  req: Request,
  env = locals(),
  params: Record<string, string> = {},
) {
  return { request: req, url: new URL(req.url), locals: env, params } as never;
}
