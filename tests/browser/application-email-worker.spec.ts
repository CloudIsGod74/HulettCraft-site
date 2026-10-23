import { test, expect } from "@playwright/test";
import { Miniflare, createFetchMock } from "miniflare";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import { createSession } from "../../src/lib/adminSession";

const secret = "mail-runtime-test-only-not-a-real-secret";
async function worker() {
  const mock = createFetchMock();
  mock.disableNetConnect();
  const root = resolve("dist/_worker.js");
  const files = readdirSync(root, { recursive: true }).filter(
    (file): file is string =>
      typeof file === "string" && /\.(m?js)$/.test(file) && file !== "index.js",
  );
  const runtime = new Miniflare({
    modulesRoot: root,
    modules: ["index.js", ...files].map((file) => ({
      type: "ESModule" as const,
      path: resolve(root, file),
    })),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    kvNamespaces: ["SESSION"],
    bindings: {
      ADMIN_SESSION_SECRET: secret,
      APPLICATION_EMAIL_ENABLED: "true",
      APPLICATION_EMAIL_FROM: "applications@hulettcraft.com",
      RESEND_API_KEY: "test-only-never-real",
    },
    serviceBindings: {
      ASSETS: async () => new Response("Not found", { status: 404 }),
    },
    fetchMock: mock,
  });
  return { runtime, mock };
}
async function submit(runtime: Miniflare, host = "hulettcraft.com") {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    minecraft: "RuntimeMailTest",
    discord: "synthetic.runtime.test",
    engagement: "balanced",
    proud: "A synthetic test build",
    building: "Testing",
    hopes: "Community",
    interactions: "Trading",
    acknowledgement: "yes",
  }))
    form.set(key, value);
  const request = new Request(`https://${host}/api/join`, {
    method: "POST",
    headers: { Origin: `https://${host}`, Accept: "application/json" },
    body: form,
  });
  return runtime.dispatchFetch(request.url, {
    method: "POST",
    headers: Object.fromEntries(request.headers),
    body: Buffer.from(await request.arrayBuffer()),
  });
}

test("built Pages worker submits an application and sends its actual answers to support through the mocked email API", async () => {
  const { runtime, mock } = await worker();
  let payload = Promise.resolve<Record<string, unknown>>({});
  mock
    .get("https://api.resend.com")
    .intercept({ path: "/emails", method: "POST" })
    .reply(
      200,
      (options) => {
        // Miniflare forwards POST bodies as streams; consume the actual bytes.
        payload = new Response(options.body as BodyInit).json();
        return JSON.stringify({ id: "synthetic-accepted-message" });
      },
      { headers: { "Content-Type": "application/json" } },
    );
  try {
    const response = await submit(runtime);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ received: true });
    const sent = await payload;
    expect(sent.to).toEqual(["support@hulettcraft.com"]);
    expect(sent.text).toContain("synthetic.runtime.test");
    expect(sent.text).toContain("A synthetic test build");
    expect(sent.text).toContain("https://hulettcraft.com/admin/applications/");
    const kv = await runtime.getKVNamespace("SESSION");
    const list = await kv.list({ prefix: "private:join-email:v1:" });
    expect(list.keys).toHaveLength(1);
    expect(JSON.parse((await kv.get(list.keys[0].name))!).state).toBe("sent");
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});

test("built Pages worker keeps an application during an email outage and permits only an authenticated same-origin retry", async () => {
  const { runtime, mock } = await worker();
  const upstream = mock.get("https://api.resend.com");
  upstream
    .intercept({ path: "/emails", method: "POST" })
    .reply(503, "test outage");
  upstream
    .intercept({ path: "/emails", method: "POST" })
    .reply(200, { id: "synthetic-retry" });
  try {
    expect((await submit(runtime)).status).toBe(201);
    const kv = await runtime.getKVNamespace("SESSION");
    const applications = await kv.list({
      prefix: "private:join-application:v1:production:",
    });
    expect(applications.keys).toHaveLength(1);
    const app = JSON.parse((await kv.get(applications.keys[0].name))!);
    const emailKey = "private:join-email:v1:" + applications.keys[0].name;
    expect(JSON.parse((await kv.get(emailKey))!).state).toBe("failed");
    const path = `https://hulettcraft.com/api/admin/applications/${app.id}/email`;
    expect(
      (
        await runtime.dispatchFetch(path, {
          method: "POST",
          headers: { Origin: "https://hulettcraft.com" },
        })
      ).status,
    ).toBe(401);
    const cookie =
      "admin_session=" +
      encodeURIComponent(await createSession("cloudisgod74", secret));
    expect(
      (
        await runtime.dispatchFetch(path, {
          method: "POST",
          headers: { cookie, Origin: "https://attacker.test" },
        })
      ).status,
    ).toBe(403);
    const response = await runtime.dispatchFetch(path, {
      method: "POST",
      headers: { cookie, Origin: "https://hulettcraft.com" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
    expect(JSON.parse((await kv.get(emailKey))!).state).toBe("sent");
    expect(JSON.parse((await kv.get(applications.keys[0].name))!).discord).toBe(
      "synthetic.runtime.test",
    );
    // Already accepted notifications must not send a second message.
    expect(
      (
        await runtime.dispatchFetch(path, {
          method: "POST",
          headers: { cookie, Origin: "https://hulettcraft.com" },
        })
      ).status,
    ).toBe(200);
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});

test("built Pages worker preview submissions never email support unless explicitly enabled", async () => {
  const { runtime, mock } = await worker();
  try {
    expect(
      (await submit(runtime, "review.hulettcraft-site.pages.dev")).status,
    ).toBe(201);
    const kv = await runtime.getKVNamespace("SESSION");
    expect(
      (await kv.list({ prefix: "private:join-application:v1:preview:" })).keys,
    ).toHaveLength(1);
    expect(
      (await kv.list({ prefix: "private:join-email:v1:" })).keys,
    ).toHaveLength(0);
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});
