"use client";

import { useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { AvatarImage } from "@/components/AvatarImage";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { AsyncSection, Dialog, Field } from "@/components/ui";
import { Pagination } from "@/features/operations";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { Paged } from "@/lib/types";
import styles from "./notice-recipient-picker.module.css";

export const noticeRoles = [
  "SYSTEM_ADMINISTRATOR",
  "CENTER_MANAGER",
  "RECEPTIONIST",
  "COACH",
  "MEMBER",
] as const;
export type NoticeRole = (typeof noticeRoles)[number];
type RecipientOption = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};
export type NoticeRecipient = RecipientOption & { role: NoticeRole };
export type NoticeSelection = Record<string, NoticeRecipient>;
type FilterOptions = {
  classes: { classId: number; code: string; name: string }[];
  specialties: { sportId: number; name: string }[];
};

export function NoticeRecipients({
  value,
  onChange,
  disabled,
  sendToAll,
  onSendToAllChange,
  sendToRoles,
  onSendToRoleChange,
}: {
  value: NoticeSelection;
  onChange: (next: NoticeSelection) => void;
  disabled: boolean;
  sendToAll: boolean;
  onSendToAllChange: (checked: boolean) => void;
  sendToRoles: NoticeRole[];
  onSendToRoleChange: (role: NoticeRole, checked: boolean) => void;
}) {
  const { t } = useLanguage();
  const l = t.manualNotices;
  const [openedRole, setOpenedRole] = useState<NoticeRole | null>(null);
  function remove(userId: string) {
    const next = { ...value };
    delete next[userId];
    onChange(next);
  }
  return (
    <section className={styles.section} aria-label={t.operations.recipients}>
      <header className={styles.heading}>
        <div>
          <h2>{t.operations.recipients}</h2>
          <p>{l.recipientHint}</p>
        </div>
        <div className={styles.broadcast}>
          <ActivitySwitch
            checked={sendToAll}
            disabled={disabled}
            label={l.sendToAll}
            hint={l.sendToAllHint}
            onChange={(checked) => {
              setOpenedRole(null);
              onSendToAllChange(checked);
            }}
          />
        </div>
      </header>
      <div className={styles.roles}>
        {noticeRoles.map((role) => {
          const wholeRole = sendToAll || sendToRoles.includes(role);
          const selected = Object.values(value).filter(
            (account) => account.role === role,
          );
          return (
            <article
              key={role}
              className={styles.role}
              aria-label={`${l.roles[role]} recipients`}
            >
              <div className={styles.roleHeading}>
                <h3>{l.roles[role]}</h3>
                <span>
                  {wholeRole
                    ? l.allActiveAccounts
                    : l.selectedCount.replace("{n}", String(selected.length))}
                </span>
              </div>
              <div className={styles.roleBroadcast}>
                <ActivitySwitch
                  checked={wholeRole}
                  disabled={disabled || sendToAll}
                  label={l.sendToRole.replace("{role}", l.roles[role])}
                  hint=""
                  onChange={(checked) => {
                    setOpenedRole(null);
                    onSendToRoleChange(role, checked);
                  }}
                />
              </div>
              <div className={styles.selectionArea}>
                {!wholeRole && selected.length > 0 && (
                  <ul
                    className={styles.selectedList}
                    tabIndex={0}
                    aria-label={`${l.roles[role]} selected recipients`}
                  >
                    {selected.map((account) => (
                      <li key={account.userId}>
                        <AvatarImage
                          name={account.name}
                          avatarUrl={account.avatarUrl}
                          size={28}
                        />
                        <span
                          className={styles.selectedName}
                          title={account.name}
                        >
                          {account.name}
                        </span>
                        <button
                          type="button"
                          className={styles.remove}
                          disabled={disabled}
                          aria-label={l.removeRecipient.replace(
                            "{name}",
                            account.name,
                          )}
                          onClick={() => remove(account.userId)}
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className={`btn btn--secondary ${styles.chooseButton}`}
                disabled={disabled || wholeRole}
                aria-label={`${l.chooseRecipients}: ${l.roles[role]}`}
                onClick={() => setOpenedRole(role)}
              >
                <UserPlus size={17} aria-hidden="true" />
                {l.chooseRecipients}
              </button>
            </article>
          );
        })}
      </div>
      {openedRole && (
        <RecipientDialog
          key={openedRole}
          role={openedRole}
          value={value}
          onChange={onChange}
          disabled={disabled}
          excludedRoles={sendToRoles}
          onClose={() => setOpenedRole(null)}
        />
      )}
    </section>
  );
}

function RecipientDialog({
  role,
  value,
  onChange,
  disabled,
  onClose,
  excludedRoles,
}: {
  role: NoticeRole;
  value: NoticeSelection;
  onChange: (next: NoticeSelection) => void;
  disabled: boolean;
  onClose: () => void;
  excludedRoles: NoticeRole[];
}) {
  const { t } = useLanguage();
  const l = t.manualNotices;
  const [keyword, setKeyword] = useState("");
  const [classId, setClassId] = useState("");
  const [sportId, setSportId] = useState("");
  const [page, setPage] = useState(1);
  const filters = useApi(
    (signal) =>
      role === "MEMBER" || role === "COACH"
        ? api.get<FilterOptions>("/api/manager/notices/recipient-filters", {
            signal,
          })
        : Promise.resolve(null),
    [role],
  );
  const users = useApi(
    (signal) =>
      api.get<Paged<RecipientOption>>(
        "/api/manager/notices/recipient-options",
        {
          signal,
          query: {
            role,
            keyword: keyword.trim() || undefined,
            classId: classId || undefined,
            sportId: sportId || undefined,
            page,
            pageSize: 20,
          },
        },
      ),
    [role, keyword, classId, sportId, page],
  );
  const selectedCount = Object.values(value).filter(
    (account) => account.role === role,
  ).length;
  const atLimit =
    Object.values(value).filter(
      (account) => !excludedRoles.includes(account.role),
    ).length >= 200;
  function toggle(account: RecipientOption, checked: boolean) {
    if (disabled || (checked && atLimit)) return;
    const next = { ...value };
    if (checked) next[account.userId] = { ...account, role };
    else delete next[account.userId];
    onChange(next);
  }
  return (
    <Dialog
      title={`${l.roles[role]} recipients`}
      description={l.selectionPersists}
      onClose={onClose}
      size="md"
      className={styles.dialog}
      footer={
        <div className={styles.footer}>
          <span aria-live="polite">
            {l.selectedCount.replace("{n}", String(selectedCount))}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            {l.finishSelection}
          </button>
        </div>
      }
    >
      <div className={styles.filters}>
        <Field label={l.searchName}>
          <span className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              maxLength={200}
              value={keyword}
              disabled={disabled}
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
            />
          </span>
        </Field>
        {role === "MEMBER" && (
          <Field label={l.currentCourse}>
            <select
              value={classId}
              disabled={disabled || filters.loading || !!filters.error}
              onChange={(event) => {
                setClassId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{l.allCourses}</option>
              {filters.data?.classes.map((course) => (
                <option key={course.classId} value={course.classId}>
                  {course.code} · {course.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {role === "COACH" && (
          <Field label={l.specialty}>
            <select
              value={sportId}
              disabled={disabled || filters.loading || !!filters.error}
              onChange={(event) => {
                setSportId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{l.allSpecialties}</option>
              {filters.data?.specialties.map((sport) => (
                <option key={sport.sportId} value={sport.sportId}>
                  {sport.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {filters.error && (
        <div className={styles.filterError} role="alert">
          <span>{l.filterUnavailable}</span>
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            onClick={filters.reload}
          >
            {t.common.retry}
          </button>
        </div>
      )}
      {atLimit && (
        <p className={styles.limit} role="status">
          {l.selectionLimit}
        </p>
      )}
      <div className={styles.results}>
        <AsyncSection state={users}>
          {(data) => (
            <>
              {data.items.length ? (
                <ul
                  className={styles.accounts}
                  tabIndex={0}
                  aria-label={`${l.roles[role]} recipient accounts`}
                >
                  {data.items.map((account) => (
                    <li key={account.userId}>
                      <label
                        className={styles.account}
                        data-selected={!!value[account.userId]}
                      >
                        <AvatarImage
                          name={account.name}
                          avatarUrl={account.avatarUrl}
                          size={42}
                        />
                        <span className={styles.identity}>
                          <strong>{account.name}</strong>
                          <span>{account.email}</span>
                        </span>
                        <input
                          type="checkbox"
                          aria-label={account.name}
                          checked={!!value[account.userId]}
                          disabled={
                            disabled || (!value[account.userId] && atLimit)
                          }
                          onChange={(event) =>
                            toggle(account, event.target.checked)
                          }
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyResults} role="status">
                  {l.noMatchingAccounts}
                </p>
              )}
              <Pagination
                page={page}
                count={data.totalCount}
                loading={users.loading}
                onChange={setPage}
              />
            </>
          )}
        </AsyncSection>
      </div>
    </Dialog>
  );
}
