"use client";
import { useState } from "react";
import { AsyncSection, Field, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { Paged } from "@/lib/types";
import styles from "./notice-recipient-table.module.css";
export const noticeRoles = [
  "SYSTEM_ADMINISTRATOR",
  "CENTER_MANAGER",
  "RECEPTIONIST",
  "COACH",
  "MEMBER",
] as const;
export type NoticeRole = (typeof noticeRoles)[number];
export type NoticeRecipient = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: NoticeRole;
};
export type NoticeSelection = Record<string, NoticeRecipient>;
type FilterOptions = {
  classes: { classId: number; code: string; name: string }[];
  specialties: { sportId: number; name: string }[];
};
export function NoticeRecipients({
  value,
  onChange,
  disabled,
}: {
  value: NoticeSelection;
  onChange: (next: NoticeSelection) => void;
  disabled: boolean;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState<NoticeRole | "">("");
  const [classId, setClassId] = useState("");
  const [sportId, setSportId] = useState("");
  const filters = useApi(
    (signal) =>
      api.get<FilterOptions>("/api/manager/notices/recipient-filters", {
        signal,
      }),
    [],
  );
  const users = useApi(
    async (signal) => {
      const groups = await Promise.all(
        (role ? [role] : noticeRoles).map(async (selectedRole) => {
          const items: NoticeRecipient[] = [];
          let page = 1;
          while (true) {
            const result = await api.get<Paged<Omit<NoticeRecipient, "role">>>(
              "/api/manager/notices/recipient-options",
              {
                signal,
                query: {
                  role: selectedRole,
                  classId:
                    selectedRole === "MEMBER"
                      ? classId || undefined
                      : undefined,
                  sportId:
                    selectedRole === "COACH" ? sportId || undefined : undefined,
                  page,
                  pageSize: 100,
                },
              },
            );
            items.push(
              ...result.items.map((item) => ({ ...item, role: selectedRole })),
            );
            if (!result.items.length || items.length >= result.totalCount)
              break;
            page++;
          }
          return items;
        }),
      );
      return groups.flat().sort((a, b) => a.name.localeCompare(b.name));
    },
    [role, classId, sportId],
  );
  const visible = (users.data ?? []).filter((user) =>
    (user.name + " " + user.email)
      .toLocaleLowerCase()
      .includes(keyword.trim().toLocaleLowerCase()),
  );
  const allSelected =
    visible.length > 0 && visible.every((user) => !!value[user.userId]);
  const someSelected = visible.some((user) => !!value[user.userId]);
  const count = Object.keys(value).length;
  function toggleAll(checked: boolean) {
    const next = { ...value };
    for (const user of visible) {
      if (checked) next[user.userId] = user;
      else delete next[user.userId];
    }
    onChange(next);
  }
  return (
    <div className={styles.workspace}>
      <fieldset className={styles.filters} disabled={disabled}>
        <Field label={vi ? "Tên hoặc email" : "Name or email"}>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Field>
        <Field label={vi ? "Vai trò" : "Role"}>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as NoticeRole | "");
              setClassId("");
              setSportId("");
            }}
          >
            <option value="">{vi ? "Tất cả vai trò" : "All roles"}</option>
            {noticeRoles.map((r) => (
              <option key={r} value={r}>
                {t.manualNotices.roles[r]}
              </option>
            ))}
          </select>
        </Field>
        {role === "MEMBER" && (
          <Field label={t.manualNotices.currentCourse}>
            <select
              value={classId}
              disabled={filters.loading || !!filters.error}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">{t.manualNotices.allCourses}</option>
              {filters.data?.classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} · {c.code}
                </option>
              ))}
            </select>
          </Field>
        )}
        {role === "COACH" && (
          <Field label={t.manualNotices.specialty}>
            <select
              value={sportId}
              disabled={filters.loading || !!filters.error}
              onChange={(e) => setSportId(e.target.value)}
            >
              <option value="">{vi ? "Tất cả môn" : "All sports"}</option>
              {filters.data?.specialties.map((s) => (
                <option key={s.sportId} value={s.sportId}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </fieldset>
      {filters.error && (
        <p role="alert">
          {filters.error.message}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={filters.reload}
          >
            {t.common.retry}
          </button>
        </p>
      )}
      <span className="small muted" role="status">
        {count} {vi ? "người đã chọn" : "recipients selected"}
      </span>
      {count > 200 && (
        <p role="alert">
          {vi
            ? "Mỗi lần gửi tối đa 200 người nhận."
            : "Choose up to 200 recipients per notice."}
        </p>
      )}
      <AsyncSection state={users}>
        {() =>
          visible.length ? (
            <div className={styles.table}>
              <Table
                headers={[
                  {
                    text: vi
                      ? "Chọn tất cả người nhận"
                      : "Select all recipients",
                    content: (
                      <input
                        type="checkbox"
                        aria-label={
                          vi
                            ? "Chọn tất cả người nhận"
                            : "Select all recipients"
                        }
                        checked={allSelected}
                        disabled={disabled}
                        ref={(el) => {
                          if (el)
                            el.indeterminate = someSelected && !allSelected;
                        }}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    ),
                  },
                  vi ? "Người nhận" : "Recipient",
                  vi ? "Vai trò" : "Role",
                ]}
              >
                {visible.map((user) => (
                  <tr key={user.userId}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={(vi ? "Chọn " : "Select ") + user.name}
                        checked={!!value[user.userId]}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = { ...value };
                          if (e.target.checked) next[user.userId] = user;
                          else delete next[user.userId];
                          onChange(next);
                        }}
                      />
                    </td>
                    <td>
                      {user.name}
                      <br />
                      <small>{user.email}</small>
                    </td>
                    <td>{t.manualNotices.roles[user.role]}</td>
                  </tr>
                ))}
              </Table>
            </div>
          ) : (
            <p>
              {vi ? "Không có người nhận phù hợp." : "No matching recipients."}
            </p>
          )
        }
      </AsyncSection>
    </div>
  );
}
