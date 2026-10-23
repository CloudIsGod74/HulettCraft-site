import test from "node:test";
import { icon, chunk, creeperIcon } from "./fixtures/serverIcon";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFaviconService, FAVICON_KV_KEY } from "../src/lib/favicon";
import { parseServerIcon, validateServerPng } from "../src/lib/serverIcon";
import { faviconUrl, FAVICON_INTERVAL_MS } from "../src/config/favicon";
import { GET } from "../src/pages/api/favicon.png";

const pngResponse = (bytes: Uint8Array) =>
  new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/png" },
  });
const request = (version = 1, headers?: HeadersInit) =>
  new Request(`https://hulettcraft.com/api/favicon.png?v=${version}`, {
    headers,
  });
function setup() {
  let time = 1_000_000,
    calls = 0;
  let answer: () => Promise<Response> = async () =>
    pngResponse(creeperIcon().bytes);
  const values = new Map<string, string>();
  const store = {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(options?.redirect, "manual");
    assert.equal(new Headers(options?.headers).get("Accept"), "image/png");
    assert.ok(options?.signal);
    if (String(url) === "https://api.mcstatus.io/v2/icon/")
      return pngResponse(icon(1).bytes);
    assert.equal(
      String(url),
      "https://api.mcstatus.io/v2/icon/play.hulettcraft.com",
    );
    calls++;
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
  const padded = new Uint8Array(creeperIcon().bytes.length + 8);
  padded.set(creeperIcon().bytes, 8);
  assert.deepEqual(
    await validateServerPng(padded.subarray(8)),
    new Uint8Array(creeperIcon().bytes),
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
  assert.equal(response.headers.get("Location"), null);
  assert.equal(response.headers.get("X-Favicon-Source"), "mcstatus");
  assert.notDeepEqual(creeperIcon().bytes, readFileSync("public/favicon.ico"));
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.match(response.headers.get("Cache-Control")!, /max-age=300/);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    creeperIcon().bytes,
  );
  assert.equal(s.values.size, 1);
  const cached = await s.service(
    request(999, { "If-None-Match": response.headers.get("ETag")! }),
    s.store,
  );
  assert.equal(cached.status, 304);
  assert.equal(s.calls(), 1);
  s.advance();
  s.answer(async () => pngResponse(icon(100).bytes));
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
    async () => pngResponse(icon(1).bytes), // Provider default, despite HTTP 200.
    async () =>
      Response.json({ online: true, icon: "data:image/png;base64,bad" }),
    async () => Response.json({ online: "true", icon: icon(20).uri }),
    async () =>
      new Response("<html>upstream error</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    async () => pngResponse(new Uint8Array([137, 80, 78, 71])),
    async () => pngResponse(new Uint8Array(64 * 1024 + 1)),
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://untrusted.test/icon.png" },
      }),
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
    assert.equal(response.headers.get("Location"), null);
    assert.equal(response.headers.get("X-Favicon-Source"), "last-known-good");
    assert.ok(response.headers.get("X-Favicon-Failure"));
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      creeperIcon().bytes,
    );
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
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    creeperIcon().bytes,
  );
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
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    creeperIcon().bytes,
  );
});

test("no valid saved icon redirects to local fallback, throttles retries, then recovers", async () => {
  const s = setup();
  s.values.set(FAVICON_KV_KEY, '{"checkedAt":1,"icon":"corrupt"}');
  s.answer(async () => Response.json({ online: false }));
  const response = await s.service(request(), s.store);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("X-Favicon-Source"), "local-fallback");
  assert.equal(response.headers.get("Location"), "/favicon.ico");
  assert.deepEqual(
    [...readFileSync("public/favicon.ico").subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  await s.service(request(2), s.store);
  assert.equal(s.calls(), 1);
  s.advance();
  s.answer(async () => pngResponse(creeperIcon().bytes));
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

test("HTTP 200 provider default is rejected before any last-good icon exists", async () => {
  const s = setup();
  s.answer(async () => pngResponse(icon(1).bytes));
  const response = await s.service(request(), s.store);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/favicon.ico");
  assert.equal(response.headers.get("X-Favicon-Failure"), "provider-default");
  assert.equal(s.values.size, 0);
});

test("default comparison failure cannot silently store an unverified icon", async () => {
  const service = createFaviconService({
    fetcher: async (url) => {
      if (String(url).endsWith("/v2/icon/"))
        throw new Error("default comparison unavailable");
      return pngResponse(creeperIcon().bytes);
    },
  });
  const response = await service(request());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("X-Favicon-Failure"), "network");
});
