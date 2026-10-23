import { test, expect } from "@playwright/test";
import { createSession } from "../../src/lib/adminSession";
import { png } from "../helpers";
import { creeperIcon, icon } from "../fixtures/serverIcon";
import { LOCAL_ARCHIVE } from "../../src/config/spotlight";
const secret = "browser-test-only-secret-never-use-in-production";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/favicon.png?*", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "X-Favicon-Source": "mcstatus" },
      body: creeperIcon().bytes,
    }),
  );
  await page.route("**/api/server-status.json", (route) =>
    route.fulfill({
      json: {
        hulettcraft: {
          state: "online",
          players: { online: 3, max: 20 },
          version: "1.21 <img src=x onerror=alert(1)>",
        },
        creative: {
          state: "online",
          players: { online: 1, max: 20 },
          version: "1.21",
        },
        modded: { state: "offline" },
        hytale: { state: "unavailable" },
      },
    }),
  );
});
test("world pages render and contain no live-map navigation, embeds, or horizontal overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/worlds",
      "/status",
      "/hytale",
      "/gallery",
      "/gallery/hulettcraft",
      "/gallery/hulettcraft/season-8",
      "/gallery/hytale",
      "/gallery/modded",
      "/gallery/upload",
      "/community",
      "/admin/login",
    ]) {
      errors.length = 0;
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(
        page.locator(
          'iframe,a[href*="map.hulettcraft.com"],a[href*="modmap.hulettcraft.com"],a[href*="hpmap.hulettcraft.com"]',
        ),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        path + " at " + width,
      ).toBe(true);
      expect(errors, path).toEqual([]);
    }
  }
  await page.goto("/worlds");
  await page.screenshot({
    path: test.info().outputPath("desktop-worlds.png"),
    fullPage: true,
  });
  await page.route("**/api/server-status.json", (route) =>
    route.fulfill({
      json: {
        hulettcraft: {
          state: "online",
          players: { online: 3, max: 20 },
          version: "1.21.4",
        },
        creative: { state: "offline" },
        modded: { state: "offline" },
        hytale: { state: "unavailable" },
      },
    }),
  );
  await page.goto("/status");
  await expect(
    page.locator('[data-status-server="hulettcraft"]'),
  ).toContainText("3/20");
  await page.screenshot({
    path: test.info().outputPath("desktop-status.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({
    path: test.info().outputPath("mobile-status.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.screenshot({
    path: test.info().outputPath("desktop-home.png"),
    fullPage: true,
  });
  await page.goto("/gallery/hulettcraft/season-8");
  await page.screenshot({
    path: test.info().outputPath("desktop-gallery.png"),
    fullPage: true,
  });
});
test("mobile navigation opens by keyboard and Escape returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Toggle navigation" }),
    nav = page.getByRole("navigation");
  await expect(toggle).toBeVisible();
  await expect(nav).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("mobile-navigation.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
});
test("galleries show approved uploads and the lightbox supports arrows and Escape", async ({
  page,
}) => {
  await page.goto("/gallery/hulettcraft/season-8");
  const images = page.locator("[data-gallery-open]");
  await expect(images).toHaveCount(3);
  await images.first().click();
  const dialog = page.getByRole("dialog", { name: "Screenshot viewer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveAttribute(
    "alt",
    "Browser build one",
  );
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("img")).toHaveAttribute(
    "alt",
    "Browser build two",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(images.first()).toBeFocused();
  for (const world of ["hytale", "modded"]) {
    await page.goto("/gallery/" + world);
    await expect(page.locator("[data-gallery-open]")).toHaveCount(3);
  }
});
test("status pages share results and render external values as text", async ({
  page,
}) => {
  await page.goto("/status");
  await expect(
    page.getByRole("link", { name: "Status", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "play.hulettcraft.com", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copied!", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "play.hulettcraft.com",
  );
  await expect(page).toHaveURL(/\/status$/);
  await expect(
    page.locator('[data-status-server="hulettcraft"]'),
  ).toContainText("3/20");
  await expect(
    page.locator('[data-status-server="hulettcraft"]'),
  ).toContainText("<img src=x");
  await expect(
    page.locator('[data-status-server="hulettcraft"] img'),
  ).toHaveCount(0);
  await expect(page.locator('[data-status-server="hytale"]')).toContainText(
    "Status unavailable",
  );
  await page.goto("/worlds");
  await expect(page.locator('[data-status-server="modded"]')).toContainText(
    "Offline",
  );
});
test("authenticated metadata editing preserves author and saves the entered caption", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: encodeURIComponent(await createSession("cloudisgod74", secret)),
      url: "http://127.0.0.1:4321",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/gallery/hulettcraft/season-8");
  const card = page.locator("figure").first();
  await expect(card.locator(".edit-author")).toHaveValue("BrowserBuilder");
  await card.locator(".edit-description").fill("Updated through the browser");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.locator(".save-result")).toHaveText("Saved");
  await page.reload();
  await expect(
    page.locator("figure").first().locator(".edit-description"),
  ).toHaveValue("Updated through the browser");
  await expect(
    page.locator("figure").first().locator(".edit-author"),
  ).toHaveValue("BrowserBuilder");
});
test("local moderation approves and rejects pending images without deleting published ones", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: encodeURIComponent(await createSession("cloudisgod74", secret)),
      url: "http://127.0.0.1:4321",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/admin/pending");
  await expect(page.locator(".pending-card")).toHaveCount(3);
  await page
    .locator(".pending-card")
    .first()
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(page.locator(".pending-card")).toHaveCount(2);
  await page
    .locator(".pending-card")
    .first()
    .getByRole("button", { name: "Reject", exact: true })
    .click();
  await expect(page.locator(".pending-card")).toHaveCount(1);
  await page.goto("/gallery/hulettcraft/season-8");
  await expect(page.locator("[data-gallery-open]")).toHaveCount(4);
});
test("public submission stays private until approval", async ({
  page,
  context,
}) => {
  await page.goto("/gallery/upload");
  await page.locator('input[name="screenshot"]').setInputFiles({
    name: "public-browser.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await page.locator('select[name="world"]').selectOption("modded");
  await page
    .locator('textarea[name="description"]')
    .fill("Public browser upload");
  await page.locator('input[name="author"]').fill("SubmissionBuilder");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page).toHaveURL(/success=1/);
  await expect(
    page.getByText("Submission successful!", { exact: true }),
  ).toBeVisible();
  await context.addCookies([
    {
      name: "admin_session",
      value: encodeURIComponent(await createSession("cloudisgod74", secret)),
      url: "http://127.0.0.1:4321",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const response = await page.request.get("/api/admin/pending");
  const pending = (await response.json()).find(
    (item: { metadata: { description: string } }) =>
      item.metadata.description === "Public browser upload",
  );
  expect(pending).toBeTruthy();
  expect(
    (
      await page.request.get(
        "/api/gallery/image?key=" + encodeURIComponent(pending.key),
      )
    ).status(),
  ).toBe(404);
  expect((await page.request.get(pending.previewUrl)).status()).toBe(200);
});
test("bulk upload preserves edited fields through rerenders and safely displays filenames", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: encodeURIComponent(await createSession("cloudisgod74", secret)),
      url: "http://127.0.0.1:4321",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/bulk-upload");
  await page.locator("#fileInput").setInputFiles([
    {
      name: "<img src=x onerror=alert(1)>.png",
      mimeType: "image/png",
      buffer: Buffer.from(png),
    },
    { name: "same.png", mimeType: "image/png", buffer: Buffer.from(png) },
  ]);
  const first = page.locator("tbody tr").first();
  await first
    .getByRole("textbox", { name: "author for image 1" })
    .fill("BulkBuilder");
  await first
    .getByRole("textbox", { name: "description for image 1" })
    .fill("Bulk caption");
  await page.locator("#bulkSeasonHeader").selectOption("7");
  await expect(
    first.getByRole("textbox", { name: "author for image 1" }),
  ).toHaveValue("BulkBuilder");
  await expect(first.locator("td").nth(1)).toHaveText(
    "<img src=x onerror=alert(1)>.png",
  );
  await expect(first.locator("td").nth(1).locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Upload all" }).click();
  await expect(page.locator("#upload-result")).toHaveText("Upload complete.");
  const response = await page.request.get("/api/gallery/hulettcraft/season/7");
  const images = await response.json();
  expect(images).toHaveLength(2);
  expect(
    images.some(
      (image: { metadata: { author: string; description: string } }) =>
        image.metadata.author === "BulkBuilder" &&
        image.metadata.description === "Bulk caption",
    ),
  ).toBe(true);
});

test("favicon stays unchanged through repeat queries, offline responses and fallback redirects", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-17T12:00:01Z") });
  let mode = "good",
    calls = 0;
  await page.route("**/api/favicon.png?*", async (route) => {
    calls++;
    if (mode === "fallback")
      return route.fulfill({
        status: 302,
        headers: { Location: "/favicon.ico" },
      });
    if (mode === "offline") return route.abort("failed");
    if (mode === "unchanged") return route.fulfill({ status: 304 });
    if (mode === "invalid")
      return route.fulfill({
        contentType: "image/png",
        headers: { "X-Favicon-Source": "mcstatus" },
        body: Buffer.from("invalid PNG"),
      });
    return route.fulfill({
      contentType: "image/png",
      headers: { "X-Favicon-Source": "mcstatus" },
      body: mode === "changed" ? icon(200).bytes : creeperIcon().bytes,
    });
  });
  await page.goto("/");
  const link = page.locator("link[data-server-favicon]");
  await expect(link).toHaveAttribute("href", creeperIcon().uri);
  const initialCalls = calls;
  for (const next of ["good", "unchanged", "offline", "fallback", "invalid"]) {
    mode = next;
    const before = calls;
    await page.clock.fastForward(5 * 60 * 1000);
    await expect.poll(() => calls).toBeGreaterThan(before);
    // Wait until the fetch/decoding attempt has completed before checking retention.
    await page.waitForTimeout(50);
    await expect(link).toHaveAttribute("href", creeperIcon().uri);
  }
  expect(calls).toBeGreaterThan(initialCalls);
  mode = "changed";
  await page.clock.setSystemTime(new Date("2026-10-17T13:00:01Z"));
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(link).toHaveAttribute("href", icon(200).uri);
  const count = calls;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(link).toHaveAttribute("href", icon(200).uri);
  expect(calls).toBe(count);
});

test("compiled Pages favicon endpoint reads local KV and honors conditional requests", async ({
  request,
}) => {
  const response = await request.get("/api/favicon.png?v=runtime-test", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(response.headers().location).toBeUndefined();
  expect(response.headers()["x-favicon-source"]).toBe("mcstatus");
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["cache-control"]).toContain("max-age=300");
  const bytes = await response.body();
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(64);
  const conditional = await request.get("/api/favicon.png?v=different", {
    headers: { "If-None-Match": response.headers().etag },
  });
  expect(conditional.status()).toBe(304);
});

test("screenshot banners rotate automatically, pause, retain a good image on failure and honor reduced motion", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/community");
  const hero = page.locator("[data-hero-slideshow]");
  await expect(hero).toHaveAttribute("data-hero-index", "0");
  const images = JSON.parse((await hero.getAttribute("data-hero-images"))!);
  await page.route("**" + images[1].src.replace(/ /g, "%20"), (route) =>
    route.abort(),
  );
  await page.clock.fastForward(8100);
  await page.waitForTimeout(100);
  await expect(hero).toHaveAttribute("data-hero-index", "0");
  await page.clock.fastForward(8100);
  await expect(hero).toHaveAttribute("data-hero-index", "2");
  await page
    .getByRole("button", { name: "Pause photos in banner slideshow" })
    .click();
  await page.clock.fastForward(20_000);
  await expect(hero).toHaveAttribute("data-hero-index", "2");
  await page.goto("/status");
  await expect(hero).toHaveAttribute("data-hero-paused", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.clock.fastForward(20_000);
  await expect(hero).toHaveAttribute("data-hero-index", "0");
  await expect(
    page.getByRole("button", { name: "Play photos in banner slideshow" }),
  ).toBeVisible();
});

test("Community provides a usable directory empty state and working ways to participate", async ({
  page,
}) => {
  await page.goto("/community");
  await expect(
    page.getByRole("heading", { name: "Meet the members" }),
  ).toBeVisible();
  await expect(
    page.getByText("Our member directory is taking shape"),
  ).toBeVisible();
  await expect(page.locator(".member-card")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Submit a screenshot/ }),
  ).toHaveAttribute("href", "/gallery/upload");
  await page.screenshot({
    path: test.info().outputPath("community-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("community-mobile.png"),
    fullPage: true,
  });
});

test("roster editor redirects guests and protects API reads and writes", async ({
  page,
  request,
}) => {
  await page.goto("/admin/roster");
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await request.get("/api/admin/roster")).status()).toBe(401);
  expect(
    (
      await request.post("/api/admin/roster", {
        data: { revision: "unpublished", members: [] },
      })
    ).status(),
  ).toBe(401);
});

test("administrator edits persist in local KV, publish safely and retain changes after failure", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: await createSession("cloudisgod74", secret),
      url: "http://127.0.0.1:4321",
    },
  ]);
  await page.goto("/admin/pending");
  await page.getByRole("link", { name: "Manage member roster" }).click();
  await expect(page.locator("#roster-form")).toBeVisible();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await page.getByLabel("Minecraft username").fill("RosterBuilder");
  await page.getByLabel("Display name").fill("Roster <img src=x>");
  await page
    .getByLabel("Short bio (optional)")
    .fill("A synthetic local test profile.");
  await page.getByRole("button", { name: "Add social link" }).click();
  await page.getByLabel("Link label").fill("Website");
  await page
    .getByLabel("HTTPS address")
    .fill("https://example.com/roster-builder");
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: test.info().outputPath("roster-editor-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath("roster-editor-desktop.png"),
    fullPage: true,
  });
  // A rejected save must not clear the edits or falsely report success.
  await page.route("**/api/admin/roster", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          body: "The roster changed. Review the latest version.",
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save roster" }).click();
  await expect(page.locator("#roster-result")).toContainText(
    "Your edits are still here",
  );
  await expect(page.getByLabel("Minecraft username")).toHaveValue(
    "RosterBuilder",
  );
  await expect(page.getByRole("button", { name: "Save roster" })).toBeEnabled();
  await page.unroute("**/api/admin/roster");
  await page.getByRole("button", { name: "Save roster" }).click();
  await expect(page.locator("#roster-result")).toContainText("Roster saved.");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue(
    "Roster <img src=x>",
  );
  await page.goto("/community");
  await expect(page.locator(".member-card")).toHaveCount(1);
  await expect(page.locator(".member-card h3")).toHaveText(
    "Roster <img src=x>",
  );
  await expect(page.locator(".member-card img")).toHaveCount(0);
  await expect(
    page.locator(".member-card").getByRole("link", { name: /Website/ }),
  ).toHaveAttribute("href", "https://example.com/roster-builder");
  await page.screenshot({
    path: test.info().outputPath("community-with-member.png"),
    fullPage: true,
  });
  await page.goto("/admin/roster");
  await page.getByLabel("Show in directory").uncheck();
  await page.getByRole("button", { name: "Save roster" }).click();
  await expect(page.locator("#roster-result")).toContainText("Roster saved.");
  await page.goto("/community");
  await expect(page.locator(".member-card")).toHaveCount(0);
  expect(await page.content()).not.toContain("RosterBuilder");
  await page.goto("/admin/roster");
  await expect(page.getByLabel("Minecraft username")).toHaveValue(
    "RosterBuilder",
  );
  await expect(page.getByLabel("Show in directory")).not.toBeChecked();
  await page
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save roster" }).click();
  await expect(page.locator("#roster-result")).toContainText("Roster saved.");
  await page.reload();
  await expect(page.locator("#roster-count")).toHaveText(
    "0 members · 0 visible",
  );
});

test("roster storage load failures disable editing instead of presenting an empty roster", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: await createSession("cloudisgod74", secret),
      url: "http://127.0.0.1:4321",
    },
  ]);
  await page.route("**/api/admin/roster", (route) =>
    route.fulfill({ status: 503, body: "Member storage is unavailable." }),
  );
  await page.goto("/admin/roster");
  await expect(page.locator("#roster-result")).toContainText(
    "Editing is disabled until the saved roster can be loaded.",
  );
  await expect(page.locator("#roster-form")).toBeHidden();
});

test("home archive has matching frames, rotates distinct pairs, shuffles manually and retains photos on failures", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0,
    mode = "good";
  const queries: string[][] = [];
  await page.route("**/api/gallery/spotlight.json?*", (route) => {
    calls++;
    queries.push(new URL(route.request().url()).searchParams.getAll("exclude"));
    if (mode === "unavailable")
      return route.fulfill({ status: 503, body: "Unavailable" });
    if (mode === "invalid")
      return route.fulfill({
        json: {
          photos: [
            { ...LOCAL_ARCHIVE[0], src: "https://attacker.test/unsafe.png" },
          ],
        },
      });
    if (mode === "broken-image")
      return route.fulfill({
        json: { photos: [LOCAL_ARCHIVE[6], LOCAL_ARCHIVE[0]] },
      });
    return route.fulfill({
      json: {
        photos:
          calls === 1 ? LOCAL_ARCHIVE.slice(2, 4) : LOCAL_ARCHIVE.slice(4, 6),
      },
    });
  });
  await page.goto("/");
  expect(calls).toBe(0); // The archive is below the fold; don't fetch unused photos.
  const spotlight = page.locator("[data-archive-spotlight]");
  const images = spotlight.locator(".spotlight-frame img");
  const sources = () =>
    images.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("src")),
    );
  await spotlight.scrollIntoViewIfNeeded();
  await expect(spotlight).toHaveAttribute("data-spotlight-loaded", "true");
  expect(await sources()).toEqual(
    LOCAL_ARCHIVE.slice(2, 4).map((photo) => photo.src),
  );
  const frames = await spotlight
    .locator(".spotlight-frame")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      })),
    );
  expect(frames[0].width).toBeCloseTo(frames[1].width, 1);
  expect(frames[0].height).toBeCloseTo(frames[1].height, 1);
  expect(frames[0].width / frames[0].height).toBeCloseTo(16 / 9, 1);
  await page.clock.fastForward(12_100);
  await expect
    .poll(() => sources())
    .toEqual(LOCAL_ARCHIVE.slice(4, 6).map((photo) => photo.src));
  expect(queries[1]).toEqual(
    LOCAL_ARCHIVE.slice(2, 4).map((photo) => photo.src),
  );
  await spotlight.getByRole("button", { name: "Pause slideshow" }).click();
  const before = calls;
  await page.clock.fastForward(30_000);
  expect(calls).toBe(before);
  const retained = await sources();
  for (mode of ["unavailable", "invalid", "broken-image"]) {
    if (mode === "broken-image")
      await page.route("**/images/gallery/hytale/hytaleserver.jpg", (route) =>
        route.fulfill({ contentType: "image/png", body: "corrupt image" }),
      );
    await spotlight
      .getByRole("button", { name: /Shuffle screenshots/ })
      .click();
    await expect(spotlight.locator("[data-spotlight-message]")).toContainText(
      "Keeping the current photos",
    );
    await expect(
      spotlight.getByRole("button", { name: /Shuffle screenshots/ }),
    ).toBeEnabled();
    expect(await sources()).toEqual(retained);
  }
  mode = "good";
  await spotlight.getByRole("button", { name: /Shuffle screenshots/ }).click();
  await expect(spotlight.locator("[data-spotlight-message]")).toHaveText(
    "New screenshots from the archive.",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath("home-archive-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("home-archive-mobile.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(spotlight).toHaveAttribute("data-spotlight-paused", "true");
});

test("reduced motion keeps the home archive still while allowing manual shuffle and explicit play", async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  let calls = 0;
  await page.route("**/api/gallery/spotlight.json?*", (route) => {
    calls++;
    return route.fulfill({
      json: {
        photos:
          calls === 1 ? LOCAL_ARCHIVE.slice(2, 4) : LOCAL_ARCHIVE.slice(4, 6),
      },
    });
  });
  await page.goto("/");
  const spotlight = page.locator("[data-archive-spotlight]");
  await spotlight.scrollIntoViewIfNeeded();
  await expect(spotlight).toHaveAttribute("data-spotlight-loaded", "true");
  await expect(spotlight).toHaveAttribute("data-spotlight-paused", "true");
  await page.clock.fastForward(60_000);
  expect(calls).toBe(1);
  await spotlight.getByRole("button", { name: /Shuffle screenshots/ }).click();
  await expect(spotlight.locator("[data-spotlight-message]")).toHaveText(
    "New screenshots from the archive.",
  );
  expect(calls).toBe(2);
  await spotlight.getByRole("button", { name: "Play slideshow" }).click();
  await page.clock.fastForward(12_100);
  await expect.poll(() => calls).toBe(3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const hiddenCalls = calls;
  await page.clock.fastForward(60_000);
  expect(calls).toBe(hiddenCalls);
});

test("compiled Pages archive API serves two distinct public photos and the home frames work without JavaScript", async ({
  request,
  browser,
}) => {
  const response = await request.get("/api/gallery/spotlight.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const { photos } = await response.json();
  expect(photos).toHaveLength(2);
  expect(new Set(photos.map((photo: { src: string }) => photo.src)).size).toBe(
    2,
  );
  for (const photo of photos) {
    expect(photo.src).not.toContain("/api/admin/");
    expect(photo.src).not.toContain("Need%20Approval");
    const image = await request.get(photo.src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toMatch(/^image\//);
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4321/");
    const frames = page.locator(".spotlight-frame");
    await expect(frames).toHaveCount(2);
    await expect(page.locator(".spotlight-controls")).toBeHidden();
    for (const frame of await frames.all())
      await expect(frame).toHaveAttribute("href", "/gallery/hulettcraft");
  } finally {
    await context.close();
  }
});
