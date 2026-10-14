"use client";

import { StatusChip } from "@/components/data";
import type { StatusTone } from "@/components/contracts/table";
import { useLanguage } from "@/lib/language";
import type { UserAdminDto } from "@/lib/types";

const statusTones: Partial<Record<string, StatusTone>> = {
  ACTIVE: "success",
  BANNED: "danger",
  DEACTIVATED: "neutral",
};

export function AccountStatusChip({ account }: { account: UserAdminDto }) {
  const { t } = useLanguage();
  const activationRequired = requiresStaffActivation(account);
  const labels: Record<string, string> = {
    ACTIVE: t.staffWork.accountActive,
    BANNED: t.staffWork.accountLocked,
    DEACTIVATED: t.staffWork.accountDeactivated,
  };

  return (
    <StatusChip
      value={activationRequired ? "ACTIVATION_REQUIRED" : account.status}
      tone={activationRequired ? "warning" : statusTones[account.status]}
      label={
        activationRequired
          ? t.adminWork.pendingActivation
          : labels[account.status]
      }
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
