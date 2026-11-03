"use client";
import Link from "next/link";
import styles from "./manager-wallet.module.css";
import { Suspense, useState } from "react";
import { PointGifts } from "./point-gifts";
import { AsyncSection, Dialog } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { WalletBalanceDto, UserAdminDto } from "@/lib/types";
import { WalletBalance } from "./wallet-balance";
import { WalletLedger } from "./wallet-ledger";
type WalletOwner = Pick<UserAdminDto, "userId" | "fullName">;
function OwnerWallet({ owner }: { owner: WalletOwner }) {
  const state = useApi(
    async (signal) => {
      const data = await api.get<WalletBalanceDto>(
        `/api/manager/wallets/${owner.userId}`,
        { signal },
      );
      return data;
    },
    [owner.userId],
  );
  return (
    <div className={styles.wallet}>
      <AsyncSection state={state}>
        {(data) => <WalletBalance balance={data} />}
      </AsyncSection>
      <WalletLedger key={owner.userId} ownerId={owner.userId} />
    </div>
  );
}
export function ManagerWallet() {
  const { t } = useLanguage();
  const [owner, setOwner] = useState<WalletOwner | null>(null);
  const [revision, setRevision] = useState(0);
  return (
    <>
      <p className={styles.reportLink}>
        View balances and point activity in{" "}
        <Link href="/manager/reports?tab=points">Reports · Points</Link>.
      </p>
      <Suspense>
        <PointGifts
          onGifted={() => setRevision((value) => value + 1)}
          onManageWallet={(recipient) =>
            setOwner({ userId: recipient.memberId, fullName: recipient.name })
          }
        />
      </Suspense>
      {owner && (
        <Dialog
          title={t.staffWork.wallet}
          description={owner.fullName}
          closeIconOnly
          size="lg"
          className={styles.dialog}
          onClose={() => setOwner(null)}
        >
          <OwnerWallet key={`${owner.userId}:${revision}`} owner={owner} />
        </Dialog>
      )}
    </>
  );
}
