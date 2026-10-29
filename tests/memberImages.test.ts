import test from "node:test";
import assert from "node:assert/strict";
import { POST, GET } from "../src/pages/api/admin/member-image";
import {
  memberImage,
  memberImageKey,
  readMemberImage,
  memberAvatarSource,
} from "../src/lib/memberImages";
import { validateMembers, ROSTER_KEY } from "../src/lib/communityRoster";
import { context, locals, request, png } from "./helpers";

function store() {
  const values = new Map<string, string>();
  const kv = {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  return { values, env: locals(undefined, { SESSION: kv }) };
}
async function upload(
  env: App.Locals,
  bytes: Uint8Array | string = png,
  authenticated = true,
  origin = "https://example.test",
) {
  const signed = await request(
    "/api/admin/member-image",
    undefined,
    authenticated,
  );
  const form = new FormData();
  form.set(
    "image",
    new File([bytes as BlobPart], "portrait.png", { type: "image/png" }),
  );
  return POST(
    context(
      new Request(signed.url, {
        method: "POST",
        headers: { cookie: signed.headers.get("cookie") ?? "", origin },
        body: form,
      }),
      env,
    ),
  );
}
const member = { username: "Builder_1", displayName: "Builder", active: true };

test("member images require admin authentication and exact Origin; public arbitrary image references are rejected", async () => {
  const { env, values } = store();
  assert.equal((await upload(env, png, false)).status, 401);
  assert.equal(
    (await upload(env, png, true, "https://attacker.test")).status,
    403,
  );
  assert.equal(
    (
      await GET(
        context(
          await request(
            "/api/admin/member-image?id=" + "a".repeat(64),
            undefined,
            false,
          ),
          env,
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await GET(
        context(await request("/api/admin/member-image?id=../secret"), env),
      )
    ).status,
    400,
  );
  assert.equal(values.size, 0);
  for (const avatar of [
    { type: "upload", id: "../admin" },
    { type: "url", url: "https://attacker.test" },
    { type: "minecraft", url: "https://attacker.test" },
  ])
    assert.throws(() => validateMembers([{ ...member, avatar }]));
});
test("validated uploads persist deduplicated raster data separately from the roster and can be displayed without R2", async () => {
  const { env, values } = store();
  values.set(ROSTER_KEY, "existing roster");
  const response = await upload(env);
  assert.equal(response.status, 200);
  const image = await response.json();
  assert.match(image.id, /^[a-f0-9]{64}$/);
  assert.match(image.src, /^data:image\/png;base64,/);
  assert.equal(await readMemberImage(env, image.id), image.src);
  assert.equal(
    await memberAvatarSource(
      { ...member, avatar: { type: "upload", id: image.id } },
      env,
    ),
    image.src,
  );
  assert.equal((await upload(env)).status, 200);
  assert.equal(values.size, 2);
  assert.equal(values.get(ROSTER_KEY), "existing roster");
  const preview = await GET(
    context(await request(`/api/admin/member-image?id=${image.id}`), env),
  );
  assert.equal((await preview.json()).src, image.src);
  assert.match(preview.headers.get("cache-control")!, /no-store/);
});
test("unsafe, oversized and corrupt member images never replace a good image", async () => {
  const { env, values } = store();
  const good = await (await upload(env)).json();
  assert.equal((await upload(env, "<svg onload='alert(1)'/>")).status, 415);
  assert.equal((await upload(env, new Uint8Array(100 * 1024))).status, 413);
  const huge = new Uint8Array(png);
  new DataView(huge.buffer).setUint32(16, 1024);
  assert.equal((await upload(env, huge)).status, 400);
  assert.equal(await readMemberImage(env, good.id), good.src);
  values.set(memberImageKey(good.id), "data:image/svg+xml;base64,PHN2Zy8+");
  assert.equal(await readMemberImage(env, good.id), null);
  const different = await memberImage(new File([png], "same.png"));
  values.set(memberImageKey("b".repeat(64)), different.src);
  assert.equal(await readMemberImage(env, "b".repeat(64)), null);
});
test("Minecraft heads use a fixed provider and validated username; older initials-only rosters remain valid", async () => {
  const { env } = store();
  assert.deepEqual(validateMembers([member]), [member]);
  const [withHead] = validateMembers([
    { ...member, avatar: { type: "minecraft" } },
  ]);
  assert.equal(
    await memberAvatarSource(withHead, env),
    "https://mc-heads.net/avatar/Builder_1/128",
  );
  assert.equal(await memberAvatarSource(member, env), null);
  assert.equal(
    await memberAvatarSource(
      { ...member, avatar: { type: "upload", id: "a".repeat(64) } },
      env,
    ),
    null,
  );
});
