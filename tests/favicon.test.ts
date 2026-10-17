import test from "node:test";
import { icon, chunk } from "./fixtures/serverIcon";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFaviconService, FAVICON_KV_KEY } from "../src/lib/favicon";
import { parseServerIcon } from "../src/lib/serverIcon";
import { faviconUrl, FAVICON_INTERVAL_MS } from "../src/config/favicon";
import { GET } from "../src/pages/api/favicon.png";

const request = (version = 1, headers?: HeadersInit) =>
  new Request(`https://hulettcraft.com/api/favicon.png?v=${version}`, {
    headers,
  });
function setup() {
  let time = 1_000_000,
    calls = 0;
  let answer: () => Promise<Response> = async () =>
    Response.json({ online: true, icon: icon().uri });
  const values = new Map<string, string>();
  const store = {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(
      String(url),
      "https://api.mcstatus.io/v2/status/java/play.hulettcraft.com",
    );
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    return answer();
  };
  const options = { now: () => time, fetcher };
  return {
    service: createFaviconService(options),
    options,
    store,
    values,
    calls: () => calls,
    advance: () => {
      time += FAVICON_INTERVAL_MS;
    },
    answer: (next: typeof answer) => {
      answer = next;
    },
  };
}

test("favicon validates a fully decodable 64x64 PNG and rejects corrupt/impostor icons", async () => {
  assert.deepEqual(
    await parseServerIcon(icon().uri),
    new Uint8Array(icon().bytes),
  );
  const broken = icon().bytes;
  broken[50] ^= 255;
  const headerOnly = icon().bytes.subarray(0, 33);
  const cases: unknown[] = [
    null,
    {},
    "https://attacker.test/a.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YWJj",
    icon(0, 32).uri,
    "data:image/png;base64," + broken.toString("base64"),
    "data:image/png;base64," + headerOnly.toString("base64"),
    "data:image/png;base64," +
      Buffer.concat([icon().bytes, Buffer.from("extra")]).toString("base64"),
    "data:image/png;base64," + "A".repeat(100000),
  ];
  for (const value of cases) assert.equal(await parseServerIcon(value), null);
  // Valid CRC/chunk framing alone is insufficient: IDAT must decompress correctly.
  const valid = icon().bytes;
  const badCompression = Buffer.concat([
    valid.subarray(0, 33),
    chunk("IDAT", Buffer.from("fake pixels")),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  assert.equal(
    await parseServerIcon(
      "data:image/png;base64," + badCompression.toString("base64"),
    ),
    null,
  );
});

test("valid icon is served, cached independently of browser query, and revalidated with ETag", async () => {
  const s = setup();
  const response = await s.service(request(), s.store);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.match(response.headers.get("Cache-Control")!, /max-age=300/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), icon().bytes);
  assert.equal(s.values.size, 1);
  const cached = await s.service(
    request(999, { "If-None-Match": response.headers.get("ETag")! }),
    s.store,
  );
  assert.equal(cached.status, 304);
  assert.equal(s.calls(), 1);
  s.advance();
  s.answer(async () => Response.json({ online: true, icon: icon(100).uri }));
  const updated = await s.service(request(1000), s.store);
  assert.notEqual(updated.headers.get("ETag"), response.headers.get("ETag"));
  assert.deepEqual(Buffer.from(await updated.arrayBuffer()), icon(100).bytes);
  assert.equal(s.calls(), 2);
});

test("offline, invalid, oversized, HTTP error and network failure preserve last good icon", async () => {
  const s = setup();
  await s.service(request(), s.store);
  const saved = s.values.get(FAVICON_KV_KEY);
  const failures = [
    async () => Response.json({ online: false, icon: icon(20).uri }),
    async () =>
      Response.json({ online: true, icon: "data:image/png;base64,bad" }),
    async () => Response.json({ online: "true", icon: icon(20).uri }),
    async () => new Response("not JSON"),
    async () => new Response("x".repeat(256 * 1024 + 1)),
    async () => new Response("bad gateway", { status: 502 }),
    async () => {
      throw new Error("timeout");
    },
  ];
  for (const failure of failures) {
    s.advance();
    s.answer(failure);
    const response = await s.service(request(), s.store);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), icon().bytes);
    assert.equal(s.values.get(FAVICON_KV_KEY), saved);
    const count = s.calls();
    await s.service(request(42), s.store);
    assert.equal(s.calls(), count);
  }
});

test("cold starts restore last good icon from KV, including during an outage", async () => {
  const s = setup();
  await s.service(request(), s.store);
  assert.equal(
    (await createFaviconService(s.options)(request(), s.store)).status,
    200,
  );
  assert.equal(s.calls(), 1);
  s.advance();
  s.answer(async () => {
    throw new Error("offline");
  });
  const response = await createFaviconService(s.options)(request(), s.store);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), icon().bytes);
});

test("edge cache retains last good icon without KV and coalesces concurrent requests", async () => {
  const s = setup();
  const entries = new Map<string, Response>();
  const cache = {
    match: async (key: Request) => entries.get(key.url)?.clone(),
    put: async (key: Request, value: Response) => {
      entries.set(key.url, value.clone());
    },
  };
  const service = createFaviconService({ ...s.options, cache });
  await Promise.all([
    service(request()),
    service(request(2)),
    service(request(3)),
  ]);
  assert.equal(s.calls(), 1);
  assert.equal(entries.size, 1);
  s.advance();
  s.answer(async () => Response.json({ online: false }));
  const response = await createFaviconService({ ...s.options, cache })(
    request(900),
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), icon().bytes);
});

test("no valid saved icon redirects to local fallback, throttles retries, then recovers", async () => {
  const s = setup();
  s.values.set(FAVICON_KV_KEY, '{"checkedAt":1,"icon":"corrupt"}');
  s.answer(async () => Response.json({ online: false }));
  const response = await s.service(request(), s.store);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/favicon.ico");
  assert.deepEqual(
    [...readFileSync("public/favicon.ico").subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  await s.service(request(2), s.store);
  assert.equal(s.calls(), 1);
  s.advance();
  s.answer(async () => Response.json({ online: true, icon: icon().uri }));
  assert.equal((await s.service(request(3), s.store)).status, 200);
});

test("storage errors do not prevent valid icon delivery or memory fallback", async () => {
  const s = setup();
  const unavailable = {
    get: async () => {
      throw new Error("KV unavailable");
    },
    put: async () => {
      throw new Error("KV unavailable");
    },
  };
  assert.equal((await s.service(request(), unavailable)).status, 200);
  s.advance();
  s.answer(async () => {
    throw new Error("unavailable");
  });
  assert.equal((await s.service(request(), unavailable)).status, 200);
});

test("favicon URL changes each five minutes and endpoint is exported for Pages", () => {
  assert.equal(faviconUrl(0), faviconUrl(FAVICON_INTERVAL_MS - 1));
  assert.notEqual(faviconUrl(0), faviconUrl(FAVICON_INTERVAL_MS));
  assert.equal(typeof GET, "function");
});
