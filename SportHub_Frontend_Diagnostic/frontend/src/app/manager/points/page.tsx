"use client";
import { StaffPage } from "@/features/coaching/ui";
import { ManagerWallet } from "@/features/wallet/manager-wallet";
export default function Page() {
  return (
    <StaffPage title="wallet" manager>
      <ManagerWallet />
    </StaffPage>
  );
}
