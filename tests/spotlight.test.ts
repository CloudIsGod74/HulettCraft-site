import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { LOCAL_ARCHIVE } from "../src/config/spotlight";
import {
  archivePhotos,
  createSpotlightService,
  pickPhotos,
} from "../src/lib/spotlight";
import { GET } from "../src/pages/api/gallery/spotlight.json";
import { MemoryBucket, context, locals, request, png } from "./helpers";

test("archive includes every page, world and season but never pending, unsafe keys or unsupported formats", async () => {
  const bucket = new MemoryBucket();
  const keys = [
    "Screenshots/hulettcraft/season-1/old.png",
    "Screenshots/hulettcraft/season-99/new.jpg",
    "Screenshots/hytale/season-unknown/early.webp",
    "Screenshots/modded/season-2/build.gif",
  ];
  for (const key of keys)
    await bucket.put(key, png, {
      customMetadata: { description: "A community build", author: "Builder" },
    });
  for (const key of [
    "Screenshots - Need Approval/private.png",
    "Screenshots/hulettcraft/season-8/nested/private.png",
    "Screenshots/other/season-8/unrelated.png",
    "Screenshots/hulettcraft/season-8/page.html",
    "unrelated.png",
  ])
    await bucket.put(key, png);
  await bucket.put("Screenshots/hulettcraft/season-8/disguised.png", png, {
    httpMetadata: { contentType: "image/svg+xml" },
  });
  await bucket.put("Screenshots/hulettcraft/season-8/prototype.png", png, {
    httpMetadata: { contentType: "constructor" },
  });
  await bucket.put(
    "Screenshots/hulettcraft/season-8/prototype.constructor",
    png,
  );
  const photos = await archivePhotos(bucket as never);
  assert.equal(photos.length, LOCAL_ARCHIVE.length + keys.length);
  const remote = photos.filter((photo) => photo.src.startsWith("/api/"));
  assert.deepEqual(
    remote
      .map((photo) =>
        new URL(photo.src, "https://example.test").searchParams.get("key"),
      )
      .sort(),
    keys.sort(),
  );
  assert.ok(
    remote.every(
      (photo) =>
        photo.caption === "A community build" && photo.credit === "Builder",
    ),
  );
  assert.ok(
    remote.some((photo) => photo.collection === "HulettCraft · Season 99"),
  );
  assert.ok(bucket.listCalls.some((call) => call.cursor));
  assert.deepEqual(bucket.deleted, []);
});

test("random picks are distinct, avoid the previous pair and can reach either end of the archive", () => {
  const first = pickPhotos(LOCAL_ARCHIVE, [], () => 0);
  assert.deepEqual(first, LOCAL_ARCHIVE.slice(0, 2));
  const next = pickPhotos(
    LOCAL_ARCHIVE,
    first.map((photo) => photo.src),
    () => 0,
  );
  assert.deepEqual(next, LOCAL_ARCHIVE.slice(2, 4));
  assert.equal(
    pickPhotos(LOCAL_ARCHIVE, [], () => 0.999)[0],
    LOCAL_ARCHIVE.at(-1),
  );
  assert.deepEqual(pickPhotos([LOCAL_ARCHIVE[0], LOCAL_ARCHIVE[0]]), [
    LOCAL_ARCHIVE[0],
  ]);
  assert.deepEqual(pickPhotos([]), []);
  assert.equal(
    pickPhotos(
      LOCAL_ARCHIVE.slice(0, 2),
      first.map((photo) => photo.src),
    ).length,
    2,
  );
});

test("cached archive avoids repeated R2 listings and refreshes new approvals after five minutes", async () => {
  const bucket = new MemoryBucket(),
    service = createSpotlightService(),
    now = 1_000_000;
  await bucket.put("Screenshots/modded/season-2/first.png", png);
  const first = await Promise.all([
    service(bucket as never, undefined, undefined, now),
    service(bucket as never, undefined, undefined, now),
  ]);
  assert.equal(first[0].length, LOCAL_ARCHIVE.length + 1);
  const calls = bucket.listCalls.length;
  assert.equal(calls, 1, "concurrent cold requests share one listing");
  await bucket.put("Screenshots/hytale/season-2/new.png", png);
  assert.equal(
    (await service(bucket as never, undefined, undefined, now + 299_999))
      .length,
    LOCAL_ARCHIVE.length + 1,
  );
  assert.equal(bucket.listCalls.length, calls);
  assert.equal(
    (await service(bucket as never, undefined, undefined, now + 300_000))
      .length,
    LOCAL_ARCHIVE.length + 2,
  );
});

test("edge snapshots survive a fresh service and listing failures preserve the recent archive", async () => {
  const bucket = new MemoryBucket(),
    responses = new Map<string, Response>(),
    now = 1_000_000;
  const key = new Request(
    "https://example.test/__internal/spotlight-archive-v1",
  );
  const edge = {
    async match(req: Request) {
      return responses.get(req.url)?.clone();
    },
    async put(req: Request, res: Response) {
      responses.set(req.url, res);
    },
  } as Cache;
  await bucket.put("Screenshots/hulettcraft/season-8/saved.png", png);
  const first = await createSpotlightService()(bucket as never, edge, key, now);
  const calls = bucket.listCalls.length;
  const service = createSpotlightService();
  assert.deepEqual(
    await service(bucket as never, edge, key, now + 1000),
    first,
  );
  assert.equal(bucket.listCalls.length, calls);
  bucket.list = async () => {
    throw new Error("Storage unavailable");
  };
  assert.deepEqual(
    await service(bucket as never, edge, key, now + 301_000),
    first,
  );
  assert.deepEqual(
    await service(bucket as never, edge, key, now + 302_000),
    first,
  );
  assert.deepEqual(
    await service(bucket as never, edge, key, now + 86_400_001),
    LOCAL_ARCHIVE,
  );
});

test("missing or unavailable R2 still provides local photos without leaking storage failures", async () => {
  const res = await GET(
    context(
      await request("/api/gallery/spotlight.json", undefined, false),
      locals(undefined, { HULETTCRAFT_BUCKET: undefined }),
    ),
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control")!, /no-store/);
  assert.equal((await res.json()).photos.length, 2);
  const broken = {
    async list() {
      throw new Error("Unavailable");
    },
  };
  const service = createSpotlightService();
  assert.deepEqual(await service(broken as never), LOCAL_ARCHIVE);
});

test("public API respects exclusions without accepting arbitrary image sources", async () => {
  const excluded = LOCAL_ARCHIVE.slice(0, 2).map((photo) => photo.src);
  const query = new URLSearchParams();
  for (const src of excluded) query.append("exclude", src);
  const res = await GET(
    context(
      await request("/api/gallery/spotlight.json?" + query, undefined, false),
    ),
  );
  const photos = (await res.json()).photos;
  assert.equal(photos.length, 2);
  assert.ok(
    photos.every((photo: { src: string }) => !excluded.includes(photo.src)),
  );
});

test("local fallback uses existing archive assets", () => {
  for (const photo of LOCAL_ARCHIVE)
    assert.ok(existsSync("public" + photo.src), photo.src);
});
