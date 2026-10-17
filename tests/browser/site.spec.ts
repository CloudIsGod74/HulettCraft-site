import { test, expect } from "@playwright/test";
import { createSession } from "../../src/lib/adminSession";
import { png } from "../helpers";
const secret = "browser-test-only-secret-never-use-in-production";
test.beforeEach(async ({ page }) => {
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
  await page
    .locator('input[name="screenshot"]')
    .setInputFiles({
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
