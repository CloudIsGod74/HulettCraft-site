import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HYTALE_QUERY_URL,
  HYTALE_QUERY_ACCEPT,
  getHytaleStatus,
  hytaleQueryUrl,
} from "../src/lib/hytaleStatus";
import { createServerStatusService } from "../src/lib/serverStatus";

const basic = {
  Basic: {
    Name: "Test server",
    Version: "2026.test",
    MaxPlayers: 40,
    CurrentPlayers: 0,
  },
  Players: [{ Name: "Not public" }],
  Plugins: { private: "not public" },
};
test("Hytale uses the documented Nitrado Basic query and exposes only totals and version", async () => {
  const result = await getHytaleStatus((async (url, init) => {
    assert.equal(String(url), DEFAULT_HYTALE_QUERY_URL);
    assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("Accept"), HYTALE_QUERY_ACCEPT);
    return Response.json(basic, {
      headers: { "Content-Type": HYTALE_QUERY_ACCEPT },
    });
  }) as typeof fetch);
  assert.deepEqual(result, {
    state: "online",
    players: { online: 0, max: 40 },
    version: "2026.test",
  });
});
test("older query plugins can supply Server and Universe without Basic", async () => {
  assert.deepEqual(
    await getHytaleStatus((async () =>
      Response.json({
        Server: { Version: "old-build", MaxPlayers: 20 },
        Universe: { CurrentPlayers: 3 },
      })) as typeof fetch),
    { state: "online", players: { online: 3, max: 20 }, version: "old-build" },
  );
});
test("network, TLS, permissions, redirects, invalid and oversized responses never establish online or offline", async () => {
  const responses = [
    () => new Response("denied", { status: 403 }),
    () =>
      new Response("redirect", {
        status: 302,
        headers: { Location: "https://attacker.test" },
      }),
    () => new Response("bad gateway", { status: 502 }),
    () =>
      new Response("<html>Website is running</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    () =>
      new Response("{", { headers: { "Content-Type": "application/json" } }),
    () => Response.json({ online: true }),
    () => Response.json({ online: false }),
    () => Response.json({ Basic: { ...basic.Basic, CurrentPlayers: -1 } }),
    () => Response.json({ Basic: { ...basic.Basic, MaxPlayers: "40" } }),
    () => Response.json({ Basic: { ...basic.Basic, Version: "" } }),
    () => Response.json({ Basic: { ...basic.Basic, CurrentPlayers: 1.5 } }),
    () => Response.json(basic, { headers: { "Content-Length": "65537" } }),
    () =>
      new Response(JSON.stringify({ ...basic, extra: "x".repeat(65536) }), {
        headers: { "Content-Type": "application/json" },
      }),
    () => {
      throw new Error("TLS or network error");
    },
  ];
  for (const response of responses)
    assert.deepEqual(
      await getHytaleStatus((async () => response()) as typeof fetch),
      { state: "unavailable" },
    );
});
test("query destinations are fixed public Hytale hosts with no credentials, arbitrary paths or redirects", async () => {
  for (const value of [
    "",
    "http://hytale.hulettcraft.com:5523/Nitrado/Query",
    "https://localhost/Nitrado/Query",
    "https://hytale.hulettcraft.com.attacker.test/Nitrado/Query",
    "https://user:pass@hytale.hulettcraft.com/Nitrado/Query",
    "https://hytale.hulettcraft.com/admin",
    "https://hytale.hulettcraft.com/Nitrado/Query?url=secret",
  ]) {
    assert.equal(hytaleQueryUrl(value), null);
    assert.deepEqual(
      await getHytaleStatus(
        (async () => {
          throw new Error("Must not fetch");
        }) as typeof fetch,
        value,
      ),
      { state: "unavailable" },
    );
  }
  assert.equal(
    hytaleQueryUrl("https://hytale-status.hulettcraft.com/Nitrado/Query"),
    "https://hytale-status.hulettcraft.com/Nitrado/Query",
  );
});
test("status checks share concurrent requests and expire without retaining a stale Online result", async () => {
  let time = 1000,
    calls = 0,
    available = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = createServerStatusService(
    (async (url) => {
      calls++;
      await gate;
      if (String(url) === DEFAULT_HYTALE_QUERY_URL)
        return available
          ? Response.json(basic)
          : new Response("Unavailable", { status: 503 });
      return Response.json({
        online: true,
        players: { online: 1, max: 20 },
        version: { name_clean: "test" },
      });
    }) as typeof fetch,
    () => time,
  );
  const first = service(),
    concurrent = service();
  release();
  assert.equal((await first).hytale.state, "online");
  assert.deepEqual(await concurrent, await service());
  assert.equal(calls, 4);
  time += 30001;
  available = false;
  assert.equal((await service()).hytale.state, "unavailable");
  assert.equal(calls, 8);
});
