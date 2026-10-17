import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  verifySession,
  readCookie,
  verifySessionData,
} from "../src/lib/adminSession";
import { requireAdmin } from "../src/lib/requireAdmin";
import { GET as publicImage } from "../src/pages/api/gallery/image";
import { GET as preview } from "../src/pages/api/admin/preview";
import { GET as login } from "../src/pages/api/admin/auth/login";
import { GET as callback } from "../src/pages/api/admin/auth/callback";
import { POST as logout } from "../src/pages/api/admin/auth/logout";
import { POST as upload } from "../src/pages/api/screenshots/upload";
import { validateImage, MAX_IMAGE_BYTES } from "../src/lib/uploads";
import { MemoryBucket, locals, request, context, secret, png } from "./helpers";
import { readFile } from "node:fs/promises";
test("existing JPEG screenshots and GIF/WebP fixtures use their detected raster content types", async () => {
  const jpeg = new Uint8Array(await readFile("public/images/home/HCS4.jpg"));
  const gif = new Uint8Array(
    Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
  );
  const webp = new Uint8Array(
    Buffer.from(
      "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
      "base64",
    ),
  );
  for (const [bytes, type] of [
    [jpeg, "image/jpeg"],
    [gif, "image/gif"],
    [webp, "image/webp"],
  ] as const) {
    assert.equal(
      (
        await validateImage(
          new File([bytes], "wrong-name.txt", { type: "text/html" }),
        )
      ).type,
      type,
    );
  }
});
test("OAuth callback validates the allowlist and sets a new secure session after a matching state", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async () =>
      Response.json(
        ++calls === 1
          ? { access_token: "dummy-oauth-token" }
          : { login: "CloudIsGod74" },
      )) as typeof fetch;
    const req = new Request(
      "https://example.test/api/admin/auth/callback?code=dummy&state=nonce",
      { headers: { cookie: "admin_oauth_state=nonce" } },
    );
    const response = await callback(
      context(
        req,
        locals(undefined, {
          GITHUB_CLIENT_ID: "dummy",
          GITHUB_CLIENT_SECRET: "dummy",
        }),
      ),
    );
    assert.equal(response.status, 302);
    assert.equal(calls, 2);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(
      cookies.some(
        (c) =>
          c.startsWith("admin_session=") &&
          c.includes("Secure") &&
          c.includes("HttpOnly"),
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("sessions expire server-side and reject tampering or malformed values", async () => {
  const now = Date.now;
  let token: string;
  try {
    Date.now = () => now() - 8 * 86400000;
    token = await createSession("cloudisgod74", secret);
  } finally {
    Date.now = now;
  }
  assert.equal(await verifySession(token!, secret), null);
  const valid = await createSession("cloudisgod74", secret);
  assert.equal(await verifySession(valid, secret), "cloudisgod74");
  for (const t of ["%", btoa("{}.%%%"), valid + "x", btoa("null.a"), ""])
    assert.equal(await verifySession(t, secret), null);
  assert.equal(await verifySession(valid, "wrong-secret"), null);
  const req = new Request("https://example.test", {
    headers: {
      cookie: "notadmin_session=" + valid + "; admin_session=%broken",
    },
  });
  assert.equal(readCookie(req, "admin_session"), undefined);
  assert.equal(await requireAdmin(req, locals()), null);
});
test("logout revokes new sessions in KV and clears the secure cookie", async () => {
  const kv = new Map<string, string>(),
    env = locals(undefined, {
      SESSION: {
        get: async (k: string) => kv.get(k) ?? null,
        put: async (k: string, v: string) => {
          kv.set(k, v);
        },
      },
    });
  const req = await request("/api/admin/auth/logout", {}),
    token = readCookie(req, "admin_session")!;
  assert.equal(await requireAdmin(req, env), "cloudisgod74");
  const res = await logout(context(req, env));
  assert.equal(res.status, 303);
  assert.match(res.headers.get("set-cookie")!, /Secure/);
  assert.equal(await requireAdmin(req, env), null);
  assert.ok(kv.has("revoked:" + (await verifySessionData(token, secret))!.sid));
});
test("pending objects are inaccessible publicly but available in authenticated preview", async () => {
  const bucket = new MemoryBucket(),
    key = "Screenshots - Need Approval/example.png";
  await bucket.put(key, png, { httpMetadata: { contentType: "image/png" } });
  const env = locals(bucket);
  assert.equal(
    (
      await publicImage(
        context(
          await request(
            "/api/gallery/image?key=" + encodeURIComponent(key),
            undefined,
            false,
          ),
          env,
        ),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await preview(
        context(
          await request(
            "/api/admin/preview?key=" + encodeURIComponent(key),
            undefined,
            false,
          ),
          env,
        ),
      )
    ).status,
    401,
  );
  const res = await preview(
    context(
      await request("/api/admin/preview?key=" + encodeURIComponent(key)),
      env,
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const approved = "Screenshots/hulettcraft/season-8/example.png";
  await bucket.put(approved, png, {
    httpMetadata: { contentType: "image/png" },
  });
  assert.equal(
    (
      await publicImage(
        context(
          await request(
            "/api/gallery/image?key=" + encodeURIComponent(approved),
            undefined,
            false,
          ),
          env,
        ),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await publicImage(
        context(
          await request("/api/gallery/image?key=private.txt", undefined, false),
          env,
        ),
      )
    ).status,
    404,
  );
});
test("OAuth issues a secure nonce and rejects callbacks without a matching state", async () => {
  const env = locals(undefined, { GITHUB_CLIENT_ID: "test-client" });
  const res = await login(context(await request("/api/admin/auth/login"), env));
  assert.equal(res.status, 302);
  const state = new URL(res.headers.get("location")!).searchParams.get("state");
  assert.ok(state);
  assert.match(
    res.headers.get("set-cookie")!,
    /HttpOnly; Secure; SameSite=Lax/,
  );
  for (const suffix of ["?code=anything", "?code=anything&state=wrong"]) {
    assert.equal(
      (
        await callback(
          context(await request("/api/admin/auth/callback" + suffix), env),
        )
      ).status,
      400,
    );
  }
});
test("actual raster signatures are validated and SVG, fake, oversized or truncated images fail", async () => {
  const valid = await validateImage(
    new File([png], "fake.svg", { type: "text/html" }),
  );
  assert.equal(valid.type, "image/png");
  for (const file of [
    new File(["<svg></svg>"], "image.png", { type: "image/png" }),
    new File([png.slice(0, 20)], "x.png"),
    new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "x.png"),
  ]) {
    await assert.rejects(
      () => validateImage(file),
      (e: unknown) => e instanceof Response && [413, 415].includes(e.status),
    );
  }
});
test("public uploads preserve metadata, get unique names, and respect the optional rate limiter", async () => {
  const bucket = new MemoryBucket(),
    env = locals(bucket);
  async function req() {
    const form = new FormData();
    form.set("screenshot", new File([png], "same.png", { type: "text/html" }));
    form.set("world", "hulettcraft");
    form.set("description", "A build");
    form.set("author", "Builder");
    return new Request("https://example.test/api/screenshots/upload", {
      method: "POST",
      headers: { origin: "https://example.test" },
      body: form,
    });
  }
  for (let i = 0; i < 2; i++)
    assert.equal((await upload(context(await req(), env))).status, 303);
  assert.equal(bucket.objects.size, 2);
  for (const [key, obj] of bucket.objects) {
    assert.match(key, /^Screenshots - Need Approval\//);
    assert.equal(obj.httpMetadata.contentType, "image/png");
    assert.equal(obj.customMetadata.description, "A build");
    assert.equal(obj.customMetadata.season, "8");
  }
  const blocked = locals(bucket, {
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal((await upload(context(await req(), blocked))).status, 429);
  assert.equal(bucket.objects.size, 2);
});
