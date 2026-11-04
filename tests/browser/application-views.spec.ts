import { test, expect, type Page } from "@playwright/test";
import { createSession } from "../../src/lib/adminSession";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function createApplication(
  page: Page,
  origin: string,
  minecraft: string,
) {
  const response = await page.request.post("/api/join", {
    headers: { Origin: origin, Accept: "application/json" },
    multipart: {
      minecraft,
      discord: "synthetic.archive",
      engagement: "balanced",
      proud: "Keep my private application answers",
      building: "Towns",
      hopes: "Community",
      interactions: "Trading",
      acknowledgement: "yes",
      screenshot: { name: "private.png", mimeType: "image/png", buffer: pixel },
    },
  });
  expect(response.status()).toBe(201);
  await page.goto("/admin/applications");
  const href = await page
    .getByRole("link", { name: new RegExp(minecraft) })
    .getAttribute("href");
  return href!.split("/").at(-1)!;
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: await createSession(
        "cloudisgod74",
        "browser-test-only-secret-never-use-in-production",
      ),
      url: baseURL!,
    },
  ]);
});

test("completed decisions leave the active inbox, preserve private records, and can be reopened", async ({
  page,
  baseURL,
}) => {
  const ids: string[] = [];
  try {
    for (const [name, status] of [
      ["ArchiveAccept", "accepted"],
      ["ArchiveDecline", "declined"],
    ] as const) {
      const id = await createApplication(page, baseURL!, name);
      ids.push(id);
      await page.getByRole("link", { name: new RegExp(name) }).click();
      await page
        .locator("#application-note")
        .fill("Retain these private review notes");
      await page.locator("#application-status").selectOption(status);
      // A failed save must not announce completion or hide the saved active record.
      if (status === "accepted") {
        await page.route(`**/api/admin/applications/${id}`, (route) =>
          route.fulfill({ status: 503, body: "Synthetic save failure" }),
        );
        await page
          .getByRole("button", { name: "Save review", exact: true })
          .click();
        await expect(page.locator("#review-result")).toContainText(
          "Your review edits are still here",
        );
        await expect(page.locator("#completed-applications-link")).toBeHidden();
        expect(
          (
            await (
              await page.request.get(`/api/admin/applications/${id}`)
            ).json()
          ).status,
        ).toBe("new");
        await page.unroute(`**/api/admin/applications/${id}`);
      }
      await page
        .getByRole("button", { name: "Save review", exact: true })
        .click();
      await expect(page.locator("#review-result")).toContainText(
        "hidden from Active",
      );
      await expect(
        page.getByRole("link", { name: "View completed applications" }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "← Join applications", exact: true })
        .click();
      await expect(page).toHaveURL(/\/admin\/applications$/);
      await expect(
        page.getByRole("link", { name: new RegExp(name) }),
      ).toHaveCount(0);
      await page
        .getByRole("navigation", { name: "Application views" })
        .getByRole("link", { name: "Completed", exact: true })
        .click();
      await page.getByRole("link", { name: new RegExp(name) }).click();
      await expect(page.locator("#application-status")).toHaveValue(status);
      await expect(page.locator("#application-note")).toHaveValue(
        "Retain these private review notes",
      );
      await expect(
        page.getByText("Keep my private application answers", { exact: true }),
      ).toBeVisible();
      expect(
        await (
          await page.request.get(`/api/admin/applications/${id}/screenshot`)
        ).body(),
      ).toEqual(pixel);
      await expect(
        page.getByRole("link", { name: "← Join applications", exact: true }),
      ).toHaveAttribute("href", "/admin/applications?view=completed");
      if (status === "accepted") {
        await page.locator("#application-status").selectOption("reviewing");
        await page
          .getByRole("button", { name: "Save review", exact: true })
          .click();
        await expect(page.locator("#review-result")).toContainText("in Active");
        await expect(page.locator("#completed-applications-link")).toBeHidden();
        await page
          .getByRole("link", { name: "← Join applications", exact: true })
          .click();
        await expect(
          page.getByRole("link", { name: new RegExp(name) }),
        ).toHaveCount(0);
        await page
          .getByRole("navigation", { name: "Application views" })
          .getByRole("link", { name: "Active", exact: true })
          .click();
        await expect(
          page.getByRole("link", { name: new RegExp(name) }),
        ).toBeVisible();
      }
    }
    await page.goto("/admin/applications?view=all");
    await expect(
      page.getByRole("link", { name: /ArchiveAccept/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /ArchiveDecline/ }),
    ).toBeVisible();
  } finally {
    for (const id of ids) {
      const response = await page.request.get(`/api/admin/applications/${id}`);
      if (response.ok()) {
        const app = await response.json();
        expect(
          (
            await page.request.delete(`/api/admin/applications/${id}`, {
              headers: { Origin: baseURL! },
              data: { revision: app.revision },
            })
          ).status(),
        ).toBe(200);
      }
    }
  }
});

test("mobile archive navigation and pagination work without JavaScript and stay private", async ({
  browser,
  baseURL,
  request,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  });
  await context.addCookies([
    {
      name: "admin_session",
      value: await createSession(
        "cloudisgod74",
        "browser-test-only-secret-never-use-in-production",
      ),
      url: baseURL!,
    },
  ]);
  const page = await context.newPage();
  try {
    const response = await page.goto(baseURL! + "/admin/applications");
    expect(response!.headers()["cache-control"]).toContain("private, no-store");
    const views = page.getByRole("navigation", { name: "Application views" });
    await expect(
      views.getByRole("link", { name: "Active", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".application-list")).not.toContainText(
      "HistoryMember",
    );
    await views.getByRole("link", { name: "Completed", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=completed$/);
    await expect(
      views.getByRole("link", { name: "Completed", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".application-summary")).toHaveCount(25);
    const next = page.getByRole("link", { name: "Next page" });
    await expect(next).toHaveAttribute("href", /view=completed&cursor=/);
    await page.locator(".application-views").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("completed-applications-mobile.png"),
    });
    await next.click();
    await expect(page).toHaveURL(/view=completed&cursor=/);
    await expect(page.locator(".application-summary")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Back to newest applications" }),
    ).toHaveAttribute("href", "/admin/applications?view=completed");
    await page
      .getByRole("link", { name: "Back to newest applications" })
      .click();
    await expect(page.locator(".application-summary")).toHaveCount(25);
    await views
      .getByRole("link", { name: "All applications", exact: true })
      .click();
    await expect(page).toHaveURL(/view=all$/);
    expect(
      (
        await request.get("/admin/applications?view=completed", {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(302);
    expect(await (await request.get("/community")).text()).not.toContain(
      "HistoryMember",
    );
  } finally {
    await context.close();
  }
});
