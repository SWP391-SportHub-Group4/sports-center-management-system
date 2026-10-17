"use client";

import { OperationsPage } from "@/features/operations/ui";
import { SupportQueue } from "@/features/receptionist/support-queue";

export default function Page() {
  return <OperationsPage title="subject" roles={["Receptionist"]}><SupportQueue /></OperationsPage>;
}
