import type { Page } from "@playwright/test";
import { en } from "../../src/locales/en";

export async function fillIncidentDateTime(
  page: Page,
  label: string,
  value: string,
) {
  const group = page.getByRole("group", { name: label, exact: true });
  const [date, time] = value.split("T");
  await group.getByLabel(en.operations.date, { exact: true }).fill(date);
  await group.getByLabel(en.incidentHistory.time24, { exact: true }).fill(time);
}
