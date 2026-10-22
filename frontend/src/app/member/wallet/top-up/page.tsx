"use client";
import { MemberShell } from "@/components/MemberShell";
import { WalletTopUp } from "@/features/wallet/wallet-top-up";

/** Member points top-up: choose an amount, then pay through VNPay. */
export default function Page() {
  return (
    <MemberShell title="Add points">
      <WalletTopUp />
    </MemberShell>
  );
}
