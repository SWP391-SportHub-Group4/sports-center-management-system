import { test, expect, type Page } from "@playwright/test";
const coachId = "33333333-3333-4333-8333-333333333333";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6h4AAAAAASUVORK5CYII=",
  "base64",
);

function twoPagePdf() {
  const stream = (text: string) => {
    const value = `BT /F1 18 Tf 40 160 Td (${text}) Tj ET`;
    return `<< /Length ${Buffer.byteLength(value)} >>\nstream\n${value}\nendstream`;
  };
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 2 /Kids [3 0 R 5 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    stream("Certificate page one"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    stream("Certificate page two"),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startXref = Buffer.byteLength(source);
  source += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return Buffer.from(source);
}

const pdfFile = twoPagePdf();
const pdfUrl =
  "https://res.cloudinary.com/test/raw/upload/v1/coaching-certificate.pdf";
const pdfContentPath = `/api/coaches/${coachId}/credentials/55555555-5555-4555-8555-555555555555/file`;
const pdfDocument = {
  credentialId: "55555555-5555-4555-8555-555555555555",
  kind: "CERTIFICATE",
  title: "Multi-page Coaching Certificate",
  issuer: "Sports Federation",
  issuedOn: "2025-06-01",
  fileName: "coaching-certificate.pdf",
  fileUrl: pdfUrl,
  contentUrl: pdfContentPath,
  contentType: "application/pdf",
  sizeBytes: pdfFile.length,
  isPublished: true,
  version: 1,
  createdAtUtc: "2026-10-23T00:00:00Z",
};

async function pdfFixture(page: Page) {
  await fixture(page);
  await page.route(`**/api/coaches/${coachId}/credentials`, (route) =>
    route.fulfill({ json: [pdfDocument] }),
  );
  await page.route("**/api/coaches/me/credentials", (route) =>
    route.fulfill({ json: [pdfDocument] }),
  );
}
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
    name: "Certificates and awards",
  });
  await expect(
    credentials.getByText("Level 2 Coaching Certificate", { exact: true }),
  ).toBeVisible();
  await credentials
    .getByRole("button", { name: "Add document", exact: true })
    .click();
  await page.getByLabel("Document file").setInputFiles({
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
  await page.getByRole("tab", { name: "Certificates", exact: true }).click();
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
  await page.getByLabel("Document file").setInputFiles({
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
  await page.getByLabel("Document file").setInputFiles({
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
  test(`public PDF viewer loads all pages and offers a download at ${width}px`, async ({
    page,
  }) => {
    await pdfFixture(page);
    await page.addInitScript(() =>
      localStorage.removeItem("sporthub.accessToken"),
    );
    await page.setViewportSize({ width, height: 900 });
    let release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${pdfContentPath}`, async (route) => {
      expect(route.request().headers().authorization).toBeUndefined();
      await ready;
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        headers: {
          "access-control-allow-origin": "*",
          "content-disposition":
            "attachment; filename=coaching-certificate.pdf",
        },
        body: pdfFile,
      });
    });
    try {
      await page.goto(`/coaches/${coachId}?tab=certificates`);
      const button = page.getByRole("button", {
        name: `View ${pdfDocument.title}`,
        exact: true,
      });
      await button.click();
      const dialog = page.getByRole("dialog", {
        name: pdfDocument.title,
        exact: true,
      });
      await expect(dialog.getByRole("status")).toHaveText("Loading PDF…");
      release();
      const frame = dialog.locator(
        `iframe[title="${pdfDocument.title} PDF preview"]`,
      );
      await expect(frame).toBeVisible();
      await expect(frame).toHaveAttribute(
        "src",
        /^blob:.*#toolbar=1&navpanes=0$/,
      );
      const download = dialog.getByRole("link", {
        name: "Download PDF",
        exact: true,
      });
      await expect(download).toHaveAttribute("download", pdfDocument.fileName);
      const blobUrl = await download.getAttribute("href");
      const delivered = await page.evaluate(async (url) => {
        const response = await fetch(url!);
        return {
          type: response.headers.get("content-type"),
          text: await response.text(),
        };
      }, blobUrl);
      expect(delivered.type).toBe("application/pdf");
      expect(delivered.text).toContain("/Count 2");
      expect(delivered.text).toContain("Certificate page one");
      expect(delivered.text).toContain("Certificate page two");
      await expect(
        dialog.getByRole("link", { name: "Open original" }),
      ).toHaveAttribute("href", blobUrl!);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
      expect(
        await page.evaluate(async (url) => {
          try {
            await fetch(url!);
            return false;
          } catch {
            return true;
          }
        }, blobUrl),
      ).toBe(true);
    } finally {
      release();
    }
  });

  test(`public credentials and account controls fit ${width}px and viewer closes with Escape`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/account");
    const credentials = page.getByRole("region", {
      name: "Certificates and awards",
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
    await page.getByRole("tab", { name: "Certificates", exact: true }).click();
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

test("PDF viewer reports blocked delivery and retries without exposing a broken original link", async ({
  page,
}) => {
  await pdfFixture(page);
  let attempts = 0;
  let blocked = true;
  await page.route(`**${pdfContentPath}`, (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer coach-fixture-token",
    );
    attempts++;
    return blocked
      ? route.fulfill({
          status: 403,
          headers: { "access-control-allow-origin": "*" },
          body: "Delivery blocked",
        })
      : route.fulfill({
          contentType: "application/pdf",
          headers: { "access-control-allow-origin": "*" },
          body: pdfFile,
        });
  });
  await page.goto("/account");
  await page
    .getByRole("button", { name: `View ${pdfDocument.title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: pdfDocument.title,
    exact: true,
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not load this PDF.",
  );
  await expect(
    dialog.getByRole("button", { name: "Open original" }),
  ).toBeDisabled();
  await expect(dialog.getByRole("link", { name: "Open original" })).toHaveCount(
    0,
  );
  await expect(dialog.locator("iframe")).toHaveCount(0);
  blocked = false;
  const failedAttempts = attempts;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.locator("iframe")).toBeVisible();
  expect(attempts).toBeGreaterThan(failedAttempts);
});

test("PDF viewer supports an older public URL without forwarding the access token", async ({
  page,
}) => {
  await fixture(page);
  const legacy = { ...pdfDocument, contentUrl: undefined };
  await page.route("**/api/coaches/me/credentials", (route) =>
    route.fulfill({ json: [legacy] }),
  );
  await page.route(pdfUrl, (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({
      contentType: "application/pdf",
      headers: { "access-control-allow-origin": "*" },
      body: pdfFile,
    });
  });
  await page.goto("/account");
  await page
    .getByRole("button", { name: `View ${pdfDocument.title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: pdfDocument.title,
    exact: true,
  });
  await expect(dialog.locator("iframe")).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Open original" }),
  ).toHaveAttribute("href", /^blob:/);
});

test("coach uploads a PDF and reads its returned document through the API", async ({
  page,
}) => {
  await fixture(page);
  let uploaded = false;
  await page.route("**/api/coaches/me/credentials", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postData() ?? "";
      expect(body).toContain('filename="coaching-certificate.pdf"');
      expect(body).toContain("Content-Type: application/pdf");
      expect(body).toContain("%PDF-1.4");
      uploaded = true;
      return route.fulfill({ json: pdfDocument });
    }
    return uploaded ? route.fulfill({ json: [pdfDocument] }) : route.fallback();
  });
  await page.route(`**${pdfContentPath}`, (route) =>
    route.fulfill({ contentType: "application/pdf", body: pdfFile }),
  );
  await page.goto("/account");
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Document file").setInputFiles({
    name: pdfDocument.fileName,
    mimeType: "application/pdf",
    buffer: pdfFile,
  });
  await page.getByLabel("Title", { exact: true }).fill(pdfDocument.title);
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(
    page.getByText("Document saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `View ${pdfDocument.title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: pdfDocument.title,
    exact: true,
  });
  await expect(dialog.locator("iframe")).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Open original" }),
  ).toHaveAttribute("href", /^blob:/);
});

test("PDF viewer rejects an error page returned as a successful file response", async ({
  page,
}) => {
  await pdfFixture(page);
  await page.route(`**${pdfContentPath}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html>File unavailable</html>",
    }),
  );
  await page.goto("/account");
  await page
    .getByRole("button", { name: `View ${pdfDocument.title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: pdfDocument.title,
    exact: true,
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not load this PDF.",
  );
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Open original" }),
  ).toBeDisabled();
});
