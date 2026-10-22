"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { Paged, UserAdminDto } from "@/lib/types";
import { ApiTable, FilterBar, StatusChip } from "@/components/data";
import { AvatarImage } from "@/components/AvatarImage";
import {
  RegisterMemberDialog,
  PendingMemberActions,
} from "@/features/receptionist";
import styles from "./manager-people.module.css";

const coach = (user: UserAdminDto) => user.role.toUpperCase() === "COACH";

export function ManagerPeople() {
  const { t } = useLanguage();
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const { values, setValues } = useUrlQuery(
    { role: "", keyword: "", page: "1" },
    { role: choiceQuery(["", "Member", "Coach"], ""), page: pageQuery },
  );
  const page = Number(values.page);
  const state = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/manager/people", {
        signal,
        query: { ...values, page, pageSize: 20 },
      }),
    [values.role, values.keyword, page],
  );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <FilterBar
          fields={[
            {
              id: "keyword",
              label: "Search name, email or phone",
              kind: "search",
            },
            {
              id: "role",
              label: "Role",
              kind: "select",
              options: [
                { value: "", label: "All" },
                { value: "Member", label: "Member" },
                { value: "Coach", label: "Coach" },
              ],
            },
          ]}
          values={values}
          onChange={(next) => setValues({ ...next, page: "1" })}
          onReset={() => setValues({ role: "", keyword: "", page: "1" })}
        />
        <button
          type="button"
          className="btn"
          onClick={() => setRegistering(true)}
        >
          {t.frontDesk.openRegistration}
        </button>
      </div>
      <ApiTable
        state={state}
        caption="People"
        page={page}
        pageSize={20}
        onPageChange={(next) => setValues({ page: String(next) })}
        getRowId={(user) => user.userId}
        visibleRowActions={3}
        columns={[
          {
            id: "fullName",
            header: "Name",
            rowHeader: true,
            cell: (user) => (
              <span className={styles.name}>
                <AvatarImage
                  name={user.fullName || user.email}
                  avatarUrl={user.avatarUrl}
                  size={32}
                />
                <span>{user.fullName || user.email}</span>
              </span>
            ),
          },
          {
            id: "email",
            header: "Contact",
            cell: (user) => (
              <div className={styles.contact}>
                <span>{user.email}</span>
                {user.phone && <small>{user.phone}</small>}
              </div>
            ),
          },
          {
            id: "role",
            header: "Role",
            cell: (user) => (coach(user) ? "Coach" : "Member"),
          },
          {
            id: "status",
            header: "Status",
            cell: (user) =>
              user.activationPending ? (
                <StatusChip
                  value="PENDING_ACTIVATION"
                  tone="warning"
                  label={t.frontDesk.pendingActivation}
                />
              ) : (
                <StatusChip value={user.status} />
              ),
          },
        ]}
        rowActions={(user) => (
          <div className={styles.actions}>
            {!coach(user) && (
              <PendingMemberActions member={user} onChanged={state.reload} />
            )}
            <Link
              className="btn btn--secondary btn--sm"
              href={`/manager/${coach(user) ? "coaches" : "members"}/${user.userId}`}
            >
              View details
            </Link>
          </div>
        )}
      />
      {registering && (
        <RegisterMemberDialog
          onClose={() => setRegistering(false)}
          onCreated={(member) => {
            setRegistering(false);
            router.push(`/manager/members/${member.userId}`);
          }}
        />
      )}
    </div>
  );
}
