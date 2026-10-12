"use client";
import styles from "./manager-wallet.module.css";
import { pagedItems } from "@/lib/paged";
import { useState } from "react";
import {
  AsyncSection,
  Card,
  Dialog,
  Field,
  Pager,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { WalletBalanceDto, UserAdminDto, Paged } from "@/lib/types";
import { WalletBalance } from "./wallet-balance";
import { WalletLedger } from "./wallet-ledger";
import { ManagerAdjustmentForm } from "./manager-adjustment-form";
function OwnerWallet({ owner }: { owner: UserAdminDto }) {
  const [revision, setRevision] = useState(0);
  const [balance, setBalance] = useState<WalletBalanceDto | null>(null);
  const state = useApi(
    async (signal) => {
      const data = await api.get<WalletBalanceDto>(
        `/api/manager/wallets/${owner.userId}`,
        { signal },
      );
      if (!signal.aborted) setBalance(data);
      return data;
    },
    [owner.userId, revision],
  );
  return (
    <div className={styles.wallet}>
      <AsyncSection state={state}>
        {(data) => <WalletBalance balance={data} />}
      </AsyncSection>
      {balance && (
        <ManagerAdjustmentForm
          balance={balance}
          disabled={state.loading || !!state.error}
          ownerName={`${owner.fullName} · ${owner.email}`}
          onSaved={() => setRevision((v) => v + 1)}
        />
      )}
      <WalletLedger
        key={`${owner.userId}-${revision}`}
        ownerId={owner.userId}
      />
    </div>
  );
}
export function ManagerWallet() {
  const { t } = useLanguage();
  const l = t.staffWork;
  const role = "MEMBER";
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [owner, setOwner] = useState<UserAdminDto | null>(null);
  const users = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users", {
        signal,
        query: { role, keyword, page, pageSize: 20 },
      }),
    [role, keyword, page],
  );
  return (
    <>
      <Card title={l.owner}>
        <div className={styles.search}>
          <Field label={l.keyword}>
            <input
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
                setOwner(null);
              }}
            />
          </Field>
        </div>
        <AsyncSection state={users}>
          {(data) => (
            <>
              <Table headers={[l.fullName, l.email, l.actions]}>
                {pagedItems(data).map((u) => (
                  <tr key={u.userId}>
                    <td>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>
                      <button
                        className="btn btn--secondary"
                        onClick={() => setOwner(u)}
                      >
                        {l.wallet}
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                totalCount={data.totalCount}
                onChange={setPage}
              />
            </>
          )}
        </AsyncSection>
      </Card>
      {owner && (
        <Dialog
          title={t.staffWork.adjustment}
          size="lg"
          className={styles.dialog}
          onClose={() => setOwner(null)}
        >
          <OwnerWallet key={owner.userId} owner={owner} />
        </Dialog>
      )}
    </>
  );
}
