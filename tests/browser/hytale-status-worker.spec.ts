import { test, expect } from "@playwright/test";
import { Miniflare, createFetchMock } from "miniflare";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import { SERVERS } from "../../src/config/servers";
import { HYTALE_QUERY_ACCEPT } from "../../src/lib/hytaleStatus";

async function worker(code: number, body: unknown, type = HYTALE_QUERY_ACCEPT) {
  const mock = createFetchMock();
  mock.disableNetConnect();
  for (const server of SERVERS)
    if ("host" in server)
      mock
        .get("https://api.mcstatus.io")
        .intercept({ path: `/v2/status/java/${server.host}:${server.port}` })
        .reply(
          200,
          { online: false },
          { headers: { "Content-Type": "application/json" } },
        );
  mock
    .get("https://hytale.hulettcraft.com:5523")
    .intercept({
      path: "/Nitrado/Query",
      headers: { accept: HYTALE_QUERY_ACCEPT },
    })
    .reply(code, typeof body === "string" ? body : JSON.stringify(body), {
      headers: { "Content-Type": type },
    });
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
    serviceBindings: {
      ASSETS: async () => new Response("Not found", { status: 404 }),
    },
    fetchMock: mock,
  });
  return { runtime, mock };
}
test("compiled Pages status endpoints query Nitrado on its HTTPS port, share cached checks and omit identities", async () => {
  const { runtime, mock } = await worker(200, {
    Basic: { Version: "2026.test", CurrentPlayers: 2, MaxPlayers: 30 },
    Players: [{ Name: "Private player identity" }],
    Plugins: { private: true },
  });
  try {
    const response = await runtime.dispatchFetch(
      "https://hulettcraft.test/api/server-status.json",
    );
    expect(response.status).toBe(200);
    const statuses = await response.json();
    expect(statuses).toEqual(
      expect.objectContaining({
        hytale: {
          state: "online",
          players: { online: 2, max: 30 },
          version: "2026.test",
        },
      }),
    );
    expect(JSON.stringify(statuses)).not.toContain("Private player identity");
    const legacy = await runtime.dispatchFetch(
      "https://hulettcraft.test/api/status.json",
    );
    expect(await legacy.json()).toEqual(
      expect.objectContaining({ hytale: "online" }),
    );
    mock.assertNoPendingInterceptors();
  } finally {
    await runtime.dispose();
    await mock.close();
  }
});
test("compiled Pages reports query permission failures and HTML health pages as unavailable", async () => {
  for (const [code, body, type] of [
    [403, "Denied", "text/plain"],
    [200, "<html>website is up</html>", "text/html"],
  ] as const) {
    const { runtime, mock } = await worker(code, body, type);
    try {
      const response = await runtime.dispatchFetch(
        "https://hulettcraft.test/api/server-status.json",
      );
      expect(await response.json()).toEqual(
        expect.objectContaining({ hytale: { state: "unavailable" } }),
      );
      mock.assertNoPendingInterceptors();
    } finally {
      await runtime.dispose();
      await mock.close();
    }
  }
});
