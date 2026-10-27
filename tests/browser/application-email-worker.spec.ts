import { test, expect } from "@playwright/test";
import { Miniflare, createFetchMock } from "miniflare";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import { createSession } from "../../src/lib/adminSession";
import {
  emailTestAccount,
  cloudflareEmailPath,
  cloudflareQueued,
} from "../fixtures/applicationEmail";

import {
  APPLICATION_FORWARDING_HEADER,
  isApplicationNotification,
} from "../../src/lib/applicationForwarding";
const secret = "mail-runtime-test-only-not-a-real-secret";
async function worker(overrides: Record<string, string> = {}) {
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
      CLOUDFLARE_ACCOUNT_ID: emailTestAccount,
      CLOUDFLARE_EMAIL_API_TOKEN: "test-only-never-real",
      ...overrides,
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
    .get("https://api.cloudflare.com")
    .intercept({ path: cloudflareEmailPath, method: "POST" })
    .reply(
      200,
      (options) => {
        // Miniflare forwards POST bodies as streams; consume the actual bytes.
        payload = new Response(options.body as BodyInit).json();
        return JSON.stringify(cloudflareQueued);
      },
      { headers: { "Content-Type": "application/json" } },
    );
  try {
    const response = await submit(runtime);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ received: true });
    const sent = await payload;
    expect(sent.to).toBe("support@hulettcraft.com");
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
  const upstream = mock.get("https://api.cloudflare.com");
  upstream
    .intercept({ path: cloudflareEmailPath, method: "POST" })
    .reply(503, "test outage");
  upstream
    .intercept({ path: cloudflareEmailPath, method: "POST" })
    .reply(200, cloudflareQueued);
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

test("built Pages worker opted-in preview sends directly to Cloudflare with the test subject and same-host review link", async () => {
  const { runtime, mock } = await worker({
    APPLICATION_EMAIL_PREVIEW_ENABLED: "true",
  });
  let payload = Promise.resolve<Record<string, unknown>>({});
  mock
    .get("https://api.cloudflare.com")
    .intercept({ path: cloudflareEmailPath, method: "POST" })
    .reply(
      200,
      (options) => {
        payload = new Response(options.body as BodyInit).json();
        return JSON.stringify(cloudflareQueued);
      },
      { headers: { "Content-Type": "application/json" } },
    );
  try {
    expect(
      (await submit(runtime, "review.hulettcraft-site.pages.dev")).status,
    ).toBe(201);
    const sent = await payload;
    expect(sent.to).toBe("support@hulettcraft.com");
    expect(sent.subject).toMatch(/^\[PREVIEW TEST\]/);
    expect(sent.text).toContain(
      "https://review.hulettcraft-site.pages.dev/admin/applications/",
    );
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});

test("built Pages worker treats a bounced or wrong-recipient Cloudflare HTTP 200 as unconfirmed mail while preserving the application", async () => {
  const { runtime, mock } = await worker();
  const upstream = mock.get("https://api.cloudflare.com");
  for (const result of [
    {
      delivered: [],
      queued: [],
      permanent_bounces: ["support@hulettcraft.com"],
    },
    { delivered: ["other@example.test"], queued: [], permanent_bounces: [] },
  ])
    upstream
      .intercept({ path: cloudflareEmailPath, method: "POST" })
      .reply(200, { success: true, errors: [], messages: [], result });
  try {
    for (let i = 0; i < 2; i++)
      expect((await submit(runtime)).status).toBe(201);
    const kv = await runtime.getKVNamespace("SESSION");
    const saved = await kv.list({ prefix: "private:join-application:v1:" });
    expect(saved.keys).toHaveLength(2);
    for (const key of saved.keys) {
      expect(JSON.parse((await kv.get(key.name))!).minecraft).toBe(
        "RuntimeMailTest",
      );
      expect(
        JSON.parse((await kv.get("private:join-email:v1:" + key.name))!).state,
      ).toBe("failed");
    }
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});

test("administrator email retry requires a duplicate-risk confirmation and cancellation sends nothing", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = baseURL!;
  await context.addCookies([
    {
      name: "admin_session",
      value: encodeURIComponent(
        await createSession(
          "cloudisgod74",
          "browser-test-only-secret-never-use-in-production",
        ),
      ),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const submitted = await page.request.post("/api/join", {
    headers: { Origin: origin, Accept: "application/json" },
    multipart: {
      minecraft: "RetryDialogTest",
      discord: "synthetic.retry.test",
      engagement: "balanced",
      proud: "Synthetic test",
      building: "Testing",
      hopes: "Community",
      interactions: "Trading",
      acknowledgement: "yes",
    },
  });
  expect(submitted.status()).toBe(201);
  await page.goto("/admin/applications");
  await page.getByRole("link", { name: /RetryDialogTest/ }).click();
  const review = page.locator("#application-review");
  const id = await review.getAttribute("data-id");
  const revision = await review.getAttribute("data-revision");
  const retry = page.getByRole("button", { name: "Retry application email" });
  // This browser instance deliberately has sending disabled. Enable only this
  // fixture control to exercise its real built handler; intercept the retry API
  // so the UI test cannot send mail. Runtime configuration/auth are tested above.
  await expect(retry).toBeDisabled();
  await retry.evaluate((button: HTMLButtonElement) => {
    button.disabled = false;
  });
  let requests = 0;
  await page.route(`**/api/admin/applications/${id}/email`, (route) => {
    requests++;
    return route.fulfill({ json: { sent: true } });
  });
  try {
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("duplicate");
      void dialog.dismiss();
    });
    await retry.click();
    expect(requests).toBe(0);
    await expect(retry).toBeEnabled();
    page.once("dialog", (dialog) => void dialog.accept());
    await retry.click();
    await expect(retry).toBeHidden();
    expect(requests).toBe(1);
    await expect(page.locator("#application-email-result")).toContainText(
      "Cloudflare accepted",
    );
  } finally {
    expect(
      (
        await page.request.delete(`/api/admin/applications/${id}`, {
          headers: { Origin: origin },
          data: { revision },
        })
      ).status(),
    ).toBe(200);
  }
});

test("built Pages worker signs notification markers while keeping support as its only recipient", async () => {
  const markerSecret = "runtime-marker-test-only-not-a-real-secret-123";
  const { runtime, mock } = await worker({
    APPLICATION_FORWARDING_SECRET: markerSecret,
  });
  let payload = Promise.resolve<Record<string, unknown>>({});
  mock
    .get("https://api.cloudflare.com")
    .intercept({ path: cloudflareEmailPath, method: "POST" })
    .reply(200, (options) => {
      payload = new Response(options.body as BodyInit).json();
      return JSON.stringify(cloudflareQueued);
    });
  try {
    expect((await submit(runtime)).status).toBe(201);
    const sent = await payload;
    expect(sent.to).toBe("support@hulettcraft.com");
    const marker = (sent.headers as Record<string, string>)[
      APPLICATION_FORWARDING_HEADER
    ];
    expect(
      await isApplicationNotification(
        markerSecret,
        marker,
        String(sent.subject),
      ),
    ).toBe(true);
    expect(
      await isApplicationNotification(
        markerSecret,
        marker,
        "Ordinary support message",
      ),
    ).toBe(false);
    expect(JSON.stringify(sent)).not.toContain(markerSecret);
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});
