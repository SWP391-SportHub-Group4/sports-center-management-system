"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { Pagination } from "@/features/operations";
import { InvoiceList } from "@/features/payments";
import type { Paged, UserAdminDto } from "@/lib/types";
import { useDeskMember } from "./desk-context";
import { GymVisits, MemberWallet } from "./front-desk";
import { SelectedMemberPanel } from "./selected-member";
import { BmiDesk, BmiRequestQueue } from "@/features/training";
import styles from "./desk.module.css";

/** Danh sách hội viên (H02): tên/SĐT/email, mở hồ sơ vận hành. */
export function MemberList() {
  const { t } = useLanguage();
  const l = t.frontDesk;
  const { setMember } = useDeskMember();
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(keyword.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [keyword]);
  const search = debounced.length === 1 ? "" : debounced;
  const state = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users", {
        signal,
        query: { keyword: search, role: "Member", page, pageSize: 20 },
      }),
    [search, page],
  );
  return (
    <div>
      <BmiRequestQueue basePath="/receptionist/members" />
      <Card title={l.membersSearch}>
        <div className={styles.search}>
          <Field label={l.findMember}>
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
            />
          </Field>
          <p className={styles.hint}>{l.membersPrompt}</p>
        </div>
        <AsyncSection state={state}>
          {(data) => {
            const rows = pagedItems(data);
            if (!rows.length)
              return <p className={styles.hint}>{l.membersEmpty}</p>;
            return (
              <>
                <Table headers={[l.colName, l.colContact, l.colStatus, ""]}>
                  {rows.map((m) => (
                    <tr key={m.userId}>
                      <td>{m.fullName || m.email}</td>
                      <td>
                        {m.email}
                        {m.phone ? ` · ${m.phone}` : ""}
                      </td>
                      <td>
                        <StatusChip value={m.status} />
                      </td>
                      <td>
                        <Link
                          className="btn btn--secondary btn--sm"
                          href={`/receptionist/members/${m.userId}`}
                          onClick={() => setMember(m)}
                        >
                          {l.openProfile}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Table>
                <Pagination
                  page={page}
                  count={data.totalCount}
                  onChange={setPage}
                />
              </>
            );
          }}
        </AsyncSection>
      </Card>
    </div>
  );
}

type TabId = "overview" | "visits" | "wallet" | "invoices" | "bmi";
const TABS: TabId[] = ["overview", "visits", "wallet", "invoices", "bmi"];

/** Hồ sơ vận hành (H02) + ví điểm của hội viên (H11). Chỉ dữ liệu phục vụ quầy. */
export function MemberProfile({ memberId }: { memberId: string }) {
  const { t, language } = useLanguage();
  const l = t.frontDesk;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { member, setMember } = useDeskMember();
  const loaded = useApi(
    (signal) => api.get<UserAdminDto>(`/api/users/${memberId}`, { signal }),
    [memberId],
  );
  const current = member?.userId === memberId ? member : loaded.data;
  useEffect(() => {
    if (loaded.data && member?.userId !== memberId) setMember(loaded.data);
  }, [loaded.data, member?.userId, memberId, setMember]);

  const requested = params.get("tab") as TabId | null;
  const tab: TabId =
    requested && TABS.includes(requested) ? requested : "overview";
  const labels: Record<TabId, string> = {
    overview: l.tabOverview,
    visits: l.tabVisits,
    wallet: l.tabWallet,
    invoices: l.tabInvoices,
    bmi: language === "vi" ? "Hồ sơ BMI" : "BMI Profile",
  };

  if (!current)
    return (
      <AsyncSection state={loaded}>
        {() => <p>{l.memberNotFound}</p>}
      </AsyncSection>
    );

  return (
    <div className={styles.work}>
      <SelectedMemberPanel
        key={current.userId}
        member={current}
        showProfileLink={false}
        onChange={(next) => {
          setMember(next);
          router.push(
            next
              ? `/receptionist/members/${next.userId}`
              : "/receptionist/members",
          );
        }}
      />
      <Tabs
        tabs={TABS.map((id) => ({ id, label: labels[id] }))}
        value={tab}
        ariaLabel={l.tabsLabel}
        onChange={(id) => router.replace(`${pathname}?tab=${id}`)}
      >
        <div className={styles.tabsBody}>
          {tab === "overview" && <OverviewHint />}
          {tab === "bmi" && (
            <BmiDesk key={current.userId} memberId={current.userId} />
          )}
          {tab === "visits" && <GymVisits memberId={current.userId} />}
          {tab === "wallet" && (
            <>
              <p className={styles.hint}>{l.walletNote}</p>
              <MemberWallet memberId={current.userId} />
            </>
          )}
          {tab === "invoices" && (
            <InvoiceList staff memberId={current.userId} />
          )}
        </div>
      </Tabs>
    </div>
  );
}

function OverviewHint() {
  const { t } = useLanguage();
  return <p className={styles.hint}>{t.frontDesk.nextAction}</p>;
}
