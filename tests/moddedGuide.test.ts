import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/pages/api/admin/modded-guide";
import {
  EMPTY_MODDED_GUIDE,
  MODDED_GUIDE_KEY,
  readModdedGuide,
  validateModdedGuide,
} from "../src/lib/moddedGuide";
import { context, locals, request } from "./helpers";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    env: locals(undefined, {
      SESSION: {
        get: async (key: string) => values.get(key) ?? null,
        put: async (key: string, value: string) => {
          values.set(key, value);
        },
      },
    }),
  };
}
const guide = {
  ...EMPTY_MODDED_GUIDE,
  published: true,
  packName: "Synthetic test pack",
  packVersion: "2.0",
  minecraftVersion: "test-game",
  loader: "NeoForge",
  loaderVersion: "test-loader",
  packUrl: "https://www.curseforge.com/minecraft/modpacks/example",
  instructions: "Install the exact release.",
};
test("client setup reads require admin; writes additionally require exact Origin", async () => {
  const { env, values } = storage(),
    body = { revision: "unpublished", guide };
  assert.equal(
    (
      await GET(
        context(
          await request("/api/admin/modded-guide", undefined, false),
          env,
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await POST(
        context(await request("/api/admin/modded-guide", body, false), env),
      )
    ).status,
    401,
  );
  for (const origin of ["", "https://attacker.test"])
    assert.equal(
      (
        await POST(
          context(
            await request("/api/admin/modded-guide", body, true, origin),
            env,
          ),
        )
      ).status,
      403,
    );
  assert.equal(values.size, 0);
});
test("drafts, exact pack releases and custom lists persist without changing other KV records", async () => {
  const { env, values } = storage();
  values.set("public:community-roster:v1", "existing members");
  assert.equal((await readModdedGuide(env)).guide.published, false);
  let revision = "unpublished";
  for (const next of [
    EMPTY_MODDED_GUIDE,
    guide,
    {
      ...guide,
      mode: "custom",
      packUrl: "",
      requiredMods: "Example mod 1.2\nAnother mod 3.4",
    },
  ]) {
    const response = await POST(
      context(
        await request("/api/admin/modded-guide", { revision, guide: next }),
        env,
      ),
    );
    assert.equal(response.status, 200);
    const saved = await response.json();
    revision = saved.revision;
    assert.deepEqual((await readModdedGuide(env)).guide, next);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  assert.equal(values.get("public:community-roster:v1"), "existing members");
  assert.equal(values.size, 2);
});
test("incomplete published setups, unsafe links and excessive fields are rejected without overwriting saved data", async () => {
  const { env, values } = storage();
  for (const invalid of [
    { ...guide, packVersion: "" },
    { ...guide, loaderVersion: "" },
    { ...guide, minecraftVersion: "" },
    { ...guide, loader: "Unknown loader" },
    { ...guide, mode: ["pack"] },
    { ...guide, published: "yes" },
    { ...guide, instructions: "x".repeat(6001) },
    { ...guide, requiredMods: "x".repeat(12001) },
    { ...guide, unsupported: "extra" },
    { ...guide, mode: "custom", requiredMods: "" },
    ...[
      "javascript:alert(1)",
      "http://example.com",
      "https://user:pass@example.com",
    ].map((packUrl) => ({ ...guide, packUrl })),
  ]) {
    assert.equal(
      (
        await POST(
          context(
            await request("/api/admin/modded-guide", {
              revision: "unpublished",
              guide: invalid,
            }),
            env,
          ),
        )
      ).status,
      400,
    );
  }
  assert.equal(values.size, 0);
  assert.doesNotThrow(() =>
    validateModdedGuide({
      ...EMPTY_MODDED_GUIDE,
      packName: "Unconfirmed draft",
    }),
  );
});
test("stale edits, missing or corrupt storage cannot replace the saved setup", async () => {
  const { env, values } = storage();
  assert.equal(
    (
      await POST(
        context(
          await request("/api/admin/modded-guide", {
            revision: "unpublished",
            guide,
          }),
          env,
        ),
      )
    ).status,
    200,
  );
  const raw = values.get(MODDED_GUIDE_KEY);
  assert.equal(
    (
      await POST(
        context(
          await request("/api/admin/modded-guide", {
            revision: "unpublished",
            guide: EMPTY_MODDED_GUIDE,
          }),
          env,
        ),
      )
    ).status,
    409,
  );
  assert.equal(values.get(MODDED_GUIDE_KEY), raw);
  values.set(MODDED_GUIDE_KEY, "corrupt");
  assert.equal(
    (
      await POST(
        context(
          await request("/api/admin/modded-guide", {
            revision: "unpublished",
            guide,
          }),
          env,
        ),
      )
    ).status,
    503,
  );
  assert.equal(values.get(MODDED_GUIDE_KEY), "corrupt");
  assert.equal(
    (await GET(context(await request("/api/admin/modded-guide")))).status,
    503,
  );
});
