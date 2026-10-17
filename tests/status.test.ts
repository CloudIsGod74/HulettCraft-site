import test from "node:test";
import assert from "node:assert/strict";
import { getServerStatuses } from "../src/lib/serverStatus";
test("Minecraft status preserves counts and versions; Hytale never uses a map", async () => {
  const urls: string[] = [];
  const data = await getServerStatuses((async (url) => {
    urls.push(String(url));
    return Response.json({
      online: true,
      players: { online: 3, max: 20 },
      version: { name_clean: "1.21 <img onerror=alert(1)>" },
    });
  }) as typeof fetch);
  assert.equal(urls.length, 3);
  assert.ok(
    urls.every((u) => u.startsWith("https://api.mcstatus.io/v2/status/java/")),
  );
  assert.equal(data.hulettcraft.state, "online");
  assert.deepEqual(data.hulettcraft.players, { online: 3, max: 20 });
  assert.equal(data.hytale.state, "unavailable");
});
test("offline servers differ from provider failures or malformed responses", async () => {
  assert.equal(
    (
      await getServerStatuses((async () =>
        Response.json({ online: false })) as typeof fetch)
    ).modded.state,
    "offline",
  );
  for (const fn of [
    async () => new Response("error", { status: 500 }),
    async () => Response.json({ online: true }),
    async () => {
      throw new Error("timeout");
    },
  ]) {
    assert.equal(
      (await getServerStatuses(fn as typeof fetch)).creative.state,
      "unavailable",
    );
  }
});
