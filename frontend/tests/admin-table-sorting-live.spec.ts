import { expect, test } from "@playwright/test";
import { loginApi } from "./helpers/auth";
import { bearer, liveApiBase } from "./helpers/api";

test("Admin API sorts before pagination, validates sorting and keeps audit account scope", async ({
  request,
}) => {
  test.skip(!liveApiBase, "Requires P2_LIVE_API and demo admin account.");
  const { accessToken } = await loginApi(request, "admin@sporthub.vn");
  const headers = bearer(accessToken);
  const get = async (path: string) => {
    const response = await request.get(`${liveApiBase}${path}`, { headers });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const all = await get(
    "/api/users/admin?pageSize=100&sortBy=email&sortDirection=asc",
  );
  const emails: string[] = all.items.map(
    (item: { email: string }) => item.email,
  );
  expect(emails.length).toBeGreaterThan(3);
  expect(emails).toEqual([...emails].sort());
  for (const direction of ["asc", "desc"]) {
    const first = await get(
      `/api/users/admin?pageSize=3&page=1&sortBy=email&sortDirection=${direction}`,
    );
    const second = await get(
      `/api/users/admin?pageSize=3&page=2&sortBy=email&sortDirection=${direction}`,
    );
    const expected = direction === "asc" ? emails : [...emails].reverse();
    expect(
      [...first.items, ...second.items].map(
        (item: { email: string }) => item.email,
      ),
    ).toEqual(expected.slice(0, 6));
    expect(first.totalCount).toBe(all.totalCount);
  }
  for (const column of ["fullName", "role", "status"]) {
    await get(`/api/users/admin?sortBy=${column}&sortDirection=desc`);
  }
  for (const column of ["timestamp", "actorEmail", "action", "targetEntity"]) {
    const result = await get(
      `/api/audit-logs?sortBy=${column}&sortDirection=asc&pageSize=200`,
    );
    expect(
      result.items.every(
        (item: { targetEntity: string }) => item.targetEntity === "UserAccount",
      ),
    ).toBeTruthy();
    if (column === "timestamp") {
      const times = result.items.map((item: { timestamp: string }) =>
        new Date(item.timestamp).getTime(),
      );
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  }
  for (const path of ["/api/users/admin", "/api/audit-logs"]) {
    for (const [query, code] of [
      ["sortBy=unsupported", "invalid_sort_column"],
      ["sortDirection=sideways", "invalid_sort_direction"],
    ]) {
      const response = await request.get(`${liveApiBase}${path}?${query}`, {
        headers,
      });
      expect(response.status()).toBe(400);
      expect(await response.text()).toContain(code);
    }
  }
});
