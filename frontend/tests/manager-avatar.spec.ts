import { expect, test } from "@playwright/test";

for (const actor of [
  { key: "manager", role: "CENTER_MANAGER", name: "Center Manager" },
  { key: "admin", role: "SYSTEM_ADMINISTRATOR", name: "System Administrator" },
]) {
  for (const width of [1440, 390]) {
    test(`${actor.key} can crop, upload and remove their account avatar at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      if (width === 390) await page.emulateMedia({ reducedMotion: "reduce" });
      // Non-uniform pixels make dragging and zooming observable, not just clickable.
      const png = Buffer.from(
        await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 800;
          canvas.height = 600;
          const ctx = canvas.getContext("2d")!;
          for (let i = 0; i < 8; i++) {
            ctx.fillStyle = ["#153d32", "#28735c", "#76a486", "#c2df61"][i % 4];
            ctx.fillRect(i * 100, 0, 100, 600);
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(280, 170, 240, 260);
          return canvas.toDataURL("image/png").split(",")[1];
        }),
        "base64",
      );
      const avatarUrl = `https://res.cloudinary.com/test/image/upload/${actor.key}.jpg`;
      const account = {
        userId: "11111111-1111-4111-8111-111111111111",
        fullName: actor.name,
        email: `${actor.key}@example.test`,
        role: actor.role,
        status: "ACTIVE",
        phone: "0901234567",
        createdAt: "2026-01-01T00:00:00Z",
        hasPassword: true,
        sportIds: [],
        avatarUrl: null as string | null,
      };
      const writes: string[] = [];
      let failNextUpload = true;
      await page.addInitScript((token) => {
        localStorage.setItem("sporthub.accessToken", token);
        localStorage.setItem("sporthub_lang", "en");
      }, `${actor.key}-avatar-fixture`);
      await page.route("https://res.cloudinary.com/**", (route) =>
        route.fulfill({ contentType: "image/png", body: png }),
      );
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/users/me") return route.fulfill({ json: account });
        if (path === `/api/avatars/${account.userId}`)
          return route.fulfill({
            json: { userId: account.userId, avatarUrl: account.avatarUrl },
          });
        if (path === "/api/avatars/me") {
          const method = route.request().method();
          writes.push(method);
          if (method === "POST") {
            if (failNextUpload) {
              failNextUpload = false;
              return route.fulfill({
                status: 503,
                json: {
                  error: "avatar_storage_unavailable",
                  message: "Could not save the avatar. Please try again.",
                },
              });
            }
            expect(route.request().headers()["content-type"]).toContain(
              "multipart/form-data",
            );
            expect(route.request().postData()).toContain(
              'filename="avatar.jpg"',
            );
            account.avatarUrl = avatarUrl;
          } else if (method === "DELETE") account.avatarUrl = null;
          else throw new Error(`Unexpected avatar method: ${method}`);
          return route.fulfill({
            json: { userId: account.userId, avatarUrl: account.avatarUrl },
          });
        }
        return route.fulfill({
          json: path.endsWith("unread-count") ? { count: 0 } : [],
        });
      });

      await page.goto("/account");
      const browse = page.getByRole("button", { name: "Browse", exact: true });
      await expect(browse).toBeVisible();
      const chooser = page.waitForEvent("filechooser");
      await browse.click();
      await (
        await chooser
      ).setFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
      const dialog = page.getByRole("dialog", { name: "Adjust your avatar" });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Save avatar", exact: true }),
      ).toBeEnabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(browse).toBeFocused();
      expect(writes).toEqual([]);
      await page.getByLabel("Choose avatar image").setInputFiles({
        name: "portrait.png",
        mimeType: "image/png",
        buffer: png,
      });
      const slider = dialog.getByLabel("Zoom", { exact: true });
      await expect(slider).toBeEnabled();
      const preview = dialog.locator("canvas");
      const original = await preview.evaluate((node: HTMLCanvasElement) =>
        node.toDataURL(),
      );
      await slider.focus();
      await slider.press("End");
      await expect(slider).toHaveValue("3");
      await expect(dialog.getByText("300%", { exact: true })).toBeVisible();
      await expect
        .poll(() =>
          preview.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
        )
        .not.toBe(original);
      const zoomed = await preview.evaluate((node: HTMLCanvasElement) =>
        node.toDataURL(),
      );
      const box = (await preview.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 40,
        box.y + box.height / 2 + 20,
        { steps: 5 },
      );
      await page.mouse.up();
      await expect
        .poll(() =>
          preview.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
        )
        .not.toBe(zoomed);
      await dialog.getByRole("button", { name: "Reset position" }).click();
      await expect(slider).toHaveValue("1");
      await expect
        .poll(() =>
          preview.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
        )
        .toBe(original);
      await preview.focus();
      await preview.press("ArrowRight");
      await expect
        .poll(() =>
          preview.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
        )
        .not.toBe(original);
      await expect(dialog).toBeInViewport();
      await page.screenshot({
        path: `../.tmp/${actor.key}-avatar-${width}.png`,
        fullPage: false,
      });
      await page
        .getByRole("button", { name: "Save avatar", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "Could not save the avatar",
      );
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Save avatar", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.locator(`img[src="${avatarUrl}"]`).first(),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="user-profile-button"] img'),
      ).toHaveAttribute("src", avatarUrl);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Remove avatar", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Remove avatar", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Remove avatar", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(`img[src="${avatarUrl}"]`)).toHaveCount(0);
      expect(writes).toEqual(["POST", "POST", "DELETE"]);
    });
  }
}
