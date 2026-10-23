import { test, expect } from "@playwright/test";
import { Miniflare, createFetchMock } from "miniflare";
import { resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { creeperIcon, icon } from "../fixtures/serverIcon";
import { FAVICON_KV_KEY } from "../../src/lib/favicon";

async function worker(candidate: Uint8Array) {
  const mock = createFetchMock();
  mock.disableNetConnect();
  const upstream = mock.get("https://api.mcstatus.io");
  upstream
    .intercept({ path: "/v2/icon/play.hulettcraft.com" })
    .reply(200, Buffer.from(candidate), {
      headers: { "Content-Type": "image/png" },
    });
  upstream
    .intercept({ path: "/v2/icon/" })
    .reply(200, icon(1).bytes, { headers: { "Content-Type": "image/png" } });
  const root = resolve("dist/_worker.js");
  // Astro contains an optional variable session-driver import. Supply the built
  // modules explicitly, as Pages/Wrangler do, instead of guessing its target.
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
    serviceBindings: {
      ASSETS: async () => new Response("Not found", { status: 404 }),
    },
    fetchMock: mock,
  });
  return { runtime, mock };
}

test("built Pages worker retrieves exact Creeper PNG from upstream with empty KV, without redirecting", async () => {
  const { runtime, mock } = await worker(creeperIcon().bytes);
  try {
    expect(
      await (await runtime.getKVNamespace("SESSION")).get(FAVICON_KV_KEY),
    ).toBeNull();
    const response = await runtime.dispatchFetch(
      "https://hulettcraft.test/api/favicon.png?source=icon-v2&v=1",
      { redirect: "manual" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("X-Favicon-Source")).toBe("mcstatus");
    expect(response.headers.get("Content-Type")).toBe("image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes).toEqual(creeperIcon().bytes);
    expect(bytes).not.toEqual(icon(1).bytes);
    expect(bytes).not.toEqual(readFileSync("public/favicon.ico"));
    mock.assertNoPendingInterceptors();
    const stored = JSON.parse(
      (await (await runtime.getKVNamespace("SESSION")).get(FAVICON_KV_KEY))!,
    );
    expect(stored.icon).toBe(creeperIcon().uri);
    const conditional = await runtime.dispatchFetch(
      "https://hulettcraft.test/api/favicon.png?v=2",
      { headers: { "If-None-Match": response.headers.get("ETag")! } },
    );
    expect(conditional.status).toBe(304);
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});

test("built Pages worker keeps stale Creeper PNG when upstream serves its HTTP 200 offline default", async () => {
  const { runtime, mock } = await worker(icon(1).bytes);
  try {
    await (
      await runtime.getKVNamespace("SESSION")
    ).put(
      FAVICON_KV_KEY,
      JSON.stringify({
        checkedAt: Date.now() - 600_000,
        icon: creeperIcon().uri,
      }),
    );
    const response = await runtime.dispatchFetch(
      "https://hulettcraft.test/api/favicon.png",
      { redirect: "manual" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("X-Favicon-Source")).toBe("last-known-good");
    expect(response.headers.get("X-Favicon-Failure")).toBe("provider-default");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      creeperIcon().bytes,
    );
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});

test("built Pages worker reports emergency fallback explicitly when no custom icon is available", async () => {
  const { runtime, mock } = await worker(icon(1).bytes);
  try {
    const response = await runtime.dispatchFetch(
      "https://hulettcraft.test/api/favicon.png",
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/favicon.ico");
    expect(response.headers.get("X-Favicon-Source")).toBe("local-fallback");
    expect(response.headers.get("X-Favicon-Failure")).toBe("provider-default");
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});
