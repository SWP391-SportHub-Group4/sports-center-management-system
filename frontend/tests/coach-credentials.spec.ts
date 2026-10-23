import { test, expect, type Page } from "@playwright/test";
const coachId = "33333333-3333-4333-8333-333333333333";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6h4AAAAAASUVORK5CYII=",
  "base64",
);
const coach = {
  userId: coachId,
  fullName: "Morgan Nguyen",
  email: "coach@example.test",
  role: "COACH",
  status: "ACTIVE",
  sportIds: [3],
  avatarUrl: null,
  hasPassword: true,
  createdAt: "2025-01-01T00:00:00Z",
  phone: "0901234567",
  title: "Badminton coach",
  bio: "Helping players develop confident movement and match technique.",
  yearsExperience: 8,
  credentialCount: 2,
};
function record(
  id: string,
  title: string,
  kind = "CERTIFICATE",
  published = true,
) {
  return {
    credentialId: id,
    kind,
    title,
    issuer: "Sports Federation",
    issuedOn: "2025-06-01",
    fileName: "certificate.png",
    fileUrl: `https://res.cloudinary.com/test/image/upload/v1/${id}.png`,
    contentType: "image/png",
    sizeBytes: 500000,
    isPublished: published,
    version: 1,
    createdAtUtc: "2026-10-23T00:00:00Z",
  };
}
async function fixture(page: Page) {
  let documents = [
    record(
      "11111111-1111-4111-8111-111111111111",
      "Level 2 Coaching Certificate",
    ),
    record(
      "22222222-2222-4222-8222-222222222222",
      "Regional Coaching Award",
      "AWARD",
    ),
  ];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "coach-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("https://res.cloudinary.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    if (path === "/api/users/me") return route.fulfill({ json: coach });
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    if (path === "/api/coaches/me/profile")
      return route.fulfill({
        json: {
          ...coach,
          studentCount: 0,
          philosophy: "Practice with purpose.",
        },
      });
    if (path === "/api/coaches") return route.fulfill({ json: [coach] });
    if (path === "/api/sports")
      return route.fulfill({ json: [{ sportId: 3, name: "Badminton" }] });
    if (path === "/api/coaches/me/credentials" && method === "POST") {
      const body = route.request().postData() ?? "";
      expect(body).toContain('name="file"');
      const title =
        /name="title"\r\n\r\n([^\r]+)/.exec(body)?.[1] ?? "New credential";
      const row = record("44444444-4444-4444-8444-444444444444", title);
      documents = [row, ...documents];
      return route.fulfill({ json: row });
    }
    if (path === "/api/coaches/me/credentials")
      return route.fulfill({ json: documents });
    if (path === `/api/coaches/${coachId}/credentials`)
      return route.fulfill({ json: documents.filter((d) => d.isPublished) });
    if (path.startsWith("/api/coaches/me/credentials/")) {
      const id = path.split("/").at(-1);
      if (method === "DELETE") {
        documents = documents.filter((d) => d.credentialId !== id);
        return route.fulfill({ status: 204 });
      }
      if (method === "PUT") {
        const update = route.request().postDataJSON();
        documents = documents.map((d) =>
          d.credentialId === id
            ? { ...d, ...update, version: d.version + 1 }
            : d,
        );
        return route.fulfill({
          json: documents.find((d) => d.credentialId === id),
        });
      }
    }
    return route.fulfill({ json: [] });
  });
}
test("coach uploads a document, edits public visibility and removes it", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/account");
  const credentials = page.getByRole("region", {
    name: "Credentials and awards",
  });
  await expect(
    credentials.getByText("Level 2 Coaching Certificate", { exact: true }),
  ).toBeVisible();
  await credentials
    .getByRole("button", { name: "Add document", exact: true })
    .click();
  await page
    .getByLabel("Document file")
    .setInputFiles({
      name: "coaching.png",
      mimeType: "image/png",
      buffer: png,
    });
  await page
    .getByLabel("Title", { exact: true })
    .fill("Advanced Badminton Coaching");
  await page
    .getByLabel("Issuing organization (optional)")
    .fill("National Sports Academy");
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(
    credentials.getByText("Document saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    credentials.getByText("Advanced Badminton Coaching", { exact: true }),
  ).toBeVisible();
  await credentials
    .getByRole("button", {
      name: "Edit Advanced Badminton Coaching",
      exact: true,
    })
    .click();
  await page.getByLabel("Show on my public profile").uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const row = credentials
    .getByRole("listitem")
    .filter({ hasText: "Advanced Badminton Coaching" });
  await expect(row).toContainText("Not displayed");
  await page.goto(`/coaches/${coachId}`);
  await expect(
    page.getByText("Advanced Badminton Coaching", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Level 2 Coaching Certificate", { exact: true }),
  ).toBeVisible();
  await page.goto("/account");
  await credentials
    .getByRole("button", {
      name: "Remove Advanced Badminton Coaching",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Confirm remove", exact: true })
    .click();
  await expect(
    credentials.getByText("Document removed.", { exact: true }),
  ).toBeVisible();
  await expect(
    credentials.getByText("Advanced Badminton Coaching", { exact: true }),
  ).toHaveCount(0);
});
test("file validation blocks unsupported documents and upload failures keep the form", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page
    .getByLabel("Document file")
    .setInputFiles({
      name: "unsafe.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await expect(
    page.getByText(
      "Choose a JPG, PNG, WebP or PDF document no larger than 10 MB.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload document", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Document file")
    .setInputFiles({
      name: "certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n%%EOF"),
    });
  await page.getByLabel("Title", { exact: true }).fill("Certificate PDF");
  await page.route("**/api/coaches/me/credentials", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: {
            error: "credential_storage_unavailable",
            message: "Could not connect to Cloudinary. Please try again.",
          },
        })
      : route.fallback(),
  );
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(
    page.getByText("Could not connect to Cloudinary. Please try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Certificate PDF",
  );
});
for (const width of [1440, 320]) {
  test(`public credentials and account controls fit ${width}px and viewer closes with Escape`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/account");
    const credentials = page.getByRole("region", {
      name: "Credentials and awards",
    });
    await expect(
      credentials.getByText("Level 2 Coaching Certificate", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    if (process.env.CREDENTIAL_SCREENSHOTS === "1") {
      await credentials.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.tmp/coach-credentials-editor-${width}.png`,
      });
    }
    await page.goto(`/coaches/${coachId}`);
    const button = page.getByRole("button", {
      name: "View Level 2 Coaching Certificate",
      exact: true,
    });
    await button.click();
    const dialog = page.getByRole("dialog", {
      name: "Level 2 Coaching Certificate",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Open original" }),
    ).toHaveAttribute("target", "_blank");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    if (process.env.CREDENTIAL_SCREENSHOTS === "1") {
      await page
        .getByRole("region", { name: "Certificates and awards" })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.tmp/coach-credentials-public-${width}.png`,
      });
    }
  });
}
