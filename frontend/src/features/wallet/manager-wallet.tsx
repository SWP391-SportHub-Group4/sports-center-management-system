"use client";
import styles from "./manager-wallet.module.css";
import { Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { PointGifts } from "./point-gifts";
import { AsyncSection, Dialog } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { WalletBalanceDto, UserAdminDto } from "@/lib/types";
import { WalletBalance } from "./wallet-balance";
import { WalletLedger } from "./wallet-ledger";
type WalletOwner = Pick<UserAdminDto, "userId" | "fullName" | "email">;

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
      <div>
        <strong>{owner.fullName}</strong>
        <p className="small muted">{owner.email}</p>
      </div>
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
      <Suspense>
        <PointGifts
          onGifted={() => setRevision((value) => value + 1)}
          onManageWallet={(recipient) =>
            setOwner({
              userId: recipient.memberId,
              fullName: recipient.name,
              email: recipient.email,
            })
          }
        />
      </Suspense>
      {owner &&
        createPortal(
          <Dialog
            title={t.staffWork.wallet}
            size="lg"
            className={styles.dialog}
            onClose={() => setOwner(null)}
          >
            <OwnerWallet key={`${owner.userId}:${revision}`} owner={owner} />
          </Dialog>,
          document.body,
        )}
    </>
  );
}
