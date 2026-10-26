import { expect, test, type Page } from "@playwright/test";

const coachId = "11111111-1111-4111-8111-111111111111";
const base = `/manager/coaches/${coachId}`;
const certificate = {
  credentialId: "22222222-2222-4222-8222-222222222222",
  kind: "CERTIFICATE", title: "Professional Badminton Coaching Certificate",
  issuer: "National Sports Federation", issuedOn: "2025-06-01",
  fileName: "coaching-certificate.pdf", fileUrl: "https://res.cloudinary.com/demo/raw/upload/certificate.pdf",
  contentType: "application/pdf", sizeBytes: 102400, isPublished: true, version: 1,
  createdAtUtc: "2026-10-25T01:00:00Z",
};

async function setup(page: Page, state: "ready" | "empty" | "error" = "ready") {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-certificates");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const json = (data: unknown) => route.fulfill({ json: data });
    if (path === "/api/users/me") return json({ userId: "manager", role: "CENTER_MANAGER", fullName: "Center Manager", email: "manager@example.test", sportIds: [] });
    if (path === `/api/manager/coaches/${coachId}`) return json({
      userId: coachId, fullName: "Alex Coach", email: "coach@example.test", phone: "0900000000",
      status: "ACTIVE", sportIds: [3], bio: "Helping players build confident badminton technique.",
      avatarUrl: null, yearsExperience: 8, title: "Badminton coach",
    });
    if (path === `/api/coaches/${coachId}/credentials`) {
      if (state === "error") return route.fulfill({ status: 503, json: { error: "unavailable", message: "Certificates are temporarily unavailable." } });
      return json(state === "empty" ? [] : [certificate, { ...certificate, credentialId: "award", kind: "AWARD", title: "National championship award" }]);
    }
    if (path === "/api/manager/classes") return json({ items: [], totalCount: 0, page: 1, pageSize: 20 });
    if (path === "/api/manager/sports") return json([{ sportId: 3, name: "Badminton", services: [] }]);
    if (path.endsWith("unread-count")) return json({ count: 0 });
    return json([]);
  });
}

for (const width of [1440, 390]) {
  test(`manager navigates to the separate certificate page and views a document at ${width}px`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base);
    await page.getByRole("tab", { name: "Certificate", exact: true }).click();
    await expect(page).toHaveURL(`${base}/certificates`);
    await expect(page.getByRole("tab", { name: "Certificate", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Certificate", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: certificate.title, exact: true })).toBeVisible();
    await expect(page.getByText("National championship award", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `../.tmp/manager-coach-certificates/page-${width}.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: `View ${certificate.title}`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: certificate.title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(certificate.issuer);
    await expect(dialog.getByRole("link", { name: "Open original" })).toHaveAttribute("href", certificate.fileUrl);
    await page.screenshot({ path: `../.tmp/manager-coach-certificates/document-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("tab", { name: "Certificate", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(`${base}?tab=overview`);
    await expect(page.getByRole("heading", { name: "About this coach" })).toBeVisible();
  });
}

test("certificate page has empty and error states", async ({ page }) => {
  await setup(page, "empty");
  await page.goto(`${base}/certificates`);
  await expect(page.getByText("No certificates shared yet.", { exact: true })).toBeVisible();
  await page.route(`**/api/coaches/${coachId}/credentials`, route => route.fulfill({ status: 503, json: { error: "unavailable", message: "Certificates are temporarily unavailable." } }));
  await page.reload();
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText("Certificates are temporarily unavailable.");
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
});
