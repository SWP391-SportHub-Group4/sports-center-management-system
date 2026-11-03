"use client";

import { StatusChip } from "@/components/data";
import type { StatusTone } from "@/components/contracts/table";
import { useLanguage } from "@/lib/language";
import type { UserAdminDto } from "@/lib/types";

const statusTones: Partial<Record<string, StatusTone>> = {
  ACTIVE: "success",
  DEACTIVATED: "neutral",
};

export function AccountStatusChip({ account }: { account: UserAdminDto }) {
  const { t } = useLanguage();
  const status = account.status === "ACTIVE" ? "ACTIVE" : "DEACTIVATED";
  const labels: Record<string, string> = {
    ACTIVE: t.staffWork.accountActive,
    DEACTIVATED: t.staffWork.accountDeactivated,
  };

  return (
    <StatusChip
      value={status}
      tone={statusTones[status]}
      label={labels[status]}
    />
  );
}

export function requiresStaffActivation(account: UserAdminDto): boolean {
  return (
    account.status === "ACTIVE" &&
    account.role !== "MEMBER" &&
    (account.activationPending ??
      (account.hasPassword === false && account.hasGoogleLink === false))
  );
}
