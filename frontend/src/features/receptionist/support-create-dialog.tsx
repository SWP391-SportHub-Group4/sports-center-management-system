"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import { ApiError, api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney, formatDateTime } from "@/lib/format";
import { DAY_PASS_PACKAGE_ID } from "@/lib/day-pass";
import {
  SUPPORT_CATEGORIES,
  type SupportCategory,
} from "@/lib/support-categories";
import { useApi } from "@/lib/useApi";
import type { InvoiceSummaryDto, MemberPackageDto, UserAdminDto } from "@/lib/types";
import type { SupportAssignee } from "./support-request-actions";
import { ROLE_LABELS, ROLE_RANK, roleKey } from "./support-shared";
import styles from "./support-center.module.css";

function MemberPlanLine({ memberId }: { memberId: string }) {
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>(`/api/members/${memberId}/packages`, {
        signal,
      }),
    [memberId],
  );
  if (packages.loading) return <p className={styles.planLine}>Loading plan…</p>;
  const usable = (packages.data ?? []).filter(
    (p) => p.status === "ACTIVE" && p.isUsable,
  );
  const plan =
    usable.find((p) => p.packageId !== DAY_PASS_PACKAGE_ID) ?? usable[0];
  return (
    <p className={styles.planLine}>
      Membership:{" "}
      <strong>
        {plan
          ? plan.packageId === DAY_PASS_PACKAGE_ID
            ? "Day pass"
            : `${plan.packageName} · until ${formatDate(plan.endDate)}`
          : "No active plan"}
      </strong>
    </p>
  );
}

function cleanInvoiceDescription(invoice: InvoiceSummaryDto) {
  const text = (invoice.itemDescription || "").trim();
  if (!text) return "Service";

  if (/^pt coach /i.test(text)) {
    const sessions = text.match(/(\d+)\/week/i)?.[1] ?? "1";
    return `Personal training · ${sessions} session(s)/week`;
  }

  return text
    .replace(/\s*;\s*priceVersion\s+\d+/gi, "")
    .replace(/\s*;\s*Membership\s+[0-9a-f-]+/gi, "")
    .replace(/\s*;\s*PT coach\s+[0-9a-f-]+/gi, "Personal training")
    .replace(/\s+/g, " ")
    .trim();
}

function invoiceLabel(invoice: InvoiceSummaryDto) {
  return [
    invoice.invoiceNumber,
    cleanInvoiceDescription(invoice),
    formatMoney(invoice.totalAmount),
    formatDateTime(invoice.paidAtUtc ?? invoice.issuedAt),
    invoice.status,
  ].join(" · ");
}

/** "+ Record a request for member": lookup, channel, topic, description, then create and handle or hand over. */
export function SupportCreateDialog({
  assignees,
  onClose,
  onCreated,
  workspace = "receptionist",
  initialMember = null,
}: {
  assignees: SupportAssignee[];
  onClose: () => void;
  onCreated: (message: string) => void;
  workspace?: "manager" | "receptionist";
  initialMember?: UserAdminDto | null;
}) {
  const { user } = useAuth();
  const isManager = workspace === "manager";
  const [member, setMember] = useState<UserAdminDto | null>(initialMember);
  const [category, setCategory] = useState<SupportCategory | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [handoverTo, setHandoverTo] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState(0);
  const paidInvoices = useApi(
    (signal) => member && category === "PAYMENT"
      ? api.get<{ items: InvoiceSummaryDto[] }>("/api/invoices", {
          signal, query: { memberId: member.userId, status: "Paid", page: 1, pageSize: 100 },
        })
      : Promise.resolve(null),
    [member?.userId, category],
  );
  const paidInvoiceItems = useMemo(() =>
    (paidInvoices.data?.items ?? []).filter((invoice) =>
      ["PAID", "PAIDAFTERRECONCILIATION", "PAID_AFTER_RECONCILIATION"].includes(
        invoice.status.toUpperCase().replace(/\s+/g, ""),
      ),
    ),
  [paidInvoices.data]);

  const filteredInvoices = useMemo(() => {
    const term = invoiceQuery.trim().toLowerCase();
    if (!term) return paidInvoiceItems;
    return paidInvoiceItems.filter((invoice) =>
      invoiceLabel(invoice).toLowerCase().includes(term),
    );
  }, [invoiceQuery, paidInvoiceItems]);


  function pickInvoice(nextInvoiceId: string) {
    const selectedInvoice = paidInvoiceItems.find((invoice) => invoice.invoiceId === nextInvoiceId);
    setInvoiceId(nextInvoiceId);
    setInvoiceQuery(selectedInvoice ? invoiceLabel(selectedInvoice) : "");
    setInvoiceOpen(false);
    setActiveInvoice(0);
  }

  function onInvoiceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && filteredInvoices.length) {
      event.preventDefault();
      setInvoiceOpen(true);
      setActiveInvoice((index) => (index + 1) % filteredInvoices.length);
      return;
    }
    if (event.key === "ArrowUp" && filteredInvoices.length) {
      event.preventDefault();
      setInvoiceOpen(true);
      setActiveInvoice((index) => (index - 1 + filteredInvoices.length) % filteredInvoices.length);
      return;
    }
    if (event.key === "Enter") {
      if (invoiceOpen && filteredInvoices[activeInvoice]) {
        event.preventDefault();
        pickInvoice(filteredInvoices[activeInvoice].invoiceId);
      }
      return;
    }
    if (event.key === "Escape") {
      setInvoiceOpen(false);
    }
  }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const target = assignees.find((x) => x.userId === handoverTo);
  const myRank = ROLE_RANK[roleKey(user?.role)];
  const escalating = !!target && ROLE_RANK[roleKey(target.role)] > myRank;
  const baseReady =
    !!member &&
    !member.activationPending &&
    (category !== "PAYMENT" || invoiceId !== "") &&
    category !== "" &&
    (isManager || subject.trim().length >= 3) &&
    description.trim().length >= 3;
  const paymentToReceptionist = category === "PAYMENT" &&
    (handoverTo ? roleKey(target?.role) === "receptionist" : !isManager);
  const handoverBlock = paymentToReceptionist
    ? "Payment requests cannot be assigned to Receptionist. Choose Center Manager."
    : !handoverTo
    ? "Choose who to hand over to."
    : escalating && handoverNote.trim().length < 3
      ? "Add a handover note to escalate to a higher role."
      : null;

  async function submit(handover: boolean) {
    if (member?.activationPending) {
      setError("Activate the member account before creating a support request.");
      return;
    }
    if (category === "PAYMENT" &&
        ((handover && roleKey(target?.role) !== "manager") ||
         (!handover && !isManager))) {
      setError("Payment requests must be handled by Center Manager, not Receptionist.");
      return;
    }
    if (lock.current || !baseReady || !member || (handover && handoverBlock))
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/member-support-requests", {
        memberId: member.userId,
        category,
        invoiceId: category === "PAYMENT" ? invoiceId : undefined,
        subject: isManager ? undefined : subject.trim(),
        description: description.trim(),
        assigneeUserId: handover ? handoverTo : user?.userId,
        handoverNote: handover ? handoverNote.trim() : undefined,
      });
      onCreated(
        handover
          ? `Request created and handed over to ${target?.name ?? "staff"}.`
          : "Request created. You are handling it.",
      );
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Could not create the request.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Record a request for member"
      size="lg"
      closeIconOnly
      onClose={() => !busy && onClose()}
    >
      <div className={styles.dialogBody}>
        <div>
          <MemberPicker
            value={member}
            onChange={(nextMember) => {
              setMember(nextMember);
              setInvoiceId("");
              setInvoiceQuery("");
              setInvoiceOpen(false);
              setActiveInvoice(0);
            }}
            label="Member"
            scanner={false}
            autoFocus
            placeholder="Search by name, phone or email…"
          />
          {member?.activationPending && (
            <p role="alert" className={styles.helper}>
              Member account is pending activation. Support requests are unavailable.
            </p>
          )}
          {member && !member.activationPending && <MemberPlanLine memberId={member.userId} />}
        </div>

        <label className={styles.field}>
          {isManager ? "What is your request about? *" : "Topic"}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as SupportCategory);
              setHandoverTo("");
              setInvoiceId("");
              setInvoiceQuery("");
              setInvoiceOpen(false);
              setActiveInvoice(0);
            }}
          >
            <option value="">Select a topic</option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value} >
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {isManager && (
          <label className={styles.field}>
            Email
            <input
              aria-label="Email"
              type="email"
              value={member?.email ?? ""}
              readOnly
            />
            <span className={styles.muted}>
              The email registered on the member’s account.
            </span>
          </label>
        )}

        {!isManager && (
          <label className={styles.field}>
            Subject
            <input
              value={subject}
              maxLength={200}
              placeholder="Short summary"
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
        )}

        {category === "PAYMENT" && (
          <label className={styles.field}>
            Paid VNPay invoice (required)
            <div className={styles.comboBox}>
              <input
                value={invoiceQuery}
                placeholder={paidInvoices.loading ? "Loading paid invoices…" : "Select a paid invoice"}
                onChange={(event) => {
                  setInvoiceQuery(event.target.value);
                  setInvoiceId("");
                  setInvoiceOpen(true);
                  setActiveInvoice(0);
                }}
                onFocus={() => setInvoiceOpen(true)}
                onBlur={() => window.setTimeout(() => setInvoiceOpen(false), 150)}
                onKeyDown={onInvoiceKeyDown}
                autoComplete="off"
                role="combobox"
                aria-expanded={invoiceOpen}
                aria-controls="paid-invoice-listbox"
                aria-autocomplete="list"
              />
              <button
                type="button"
                className={styles.comboToggle}
                aria-label="Toggle invoice list"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setInvoiceOpen((open) => !open)}
              >
                ▾
              </button>
              {invoiceOpen && (
                <ul className={styles.comboList} id="paid-invoice-listbox" role="listbox">
                  <li className={styles.comboPlaceholder}>Select a paid invoice</li>
                  {paidInvoices.loading && (
                    <li className={styles.comboEmpty}>Loading paid invoices…</li>
                  )}
                  {!paidInvoices.loading && filteredInvoices.length === 0 && (
                    <li className={styles.comboEmpty}>No matching paid invoices.</li>
                  )}
                  {!paidInvoices.loading && filteredInvoices.map((invoice, index) => (
                    <li
                      key={invoice.invoiceId}
                      role="option"
                      aria-selected={invoice.invoiceId === invoiceId}
                      className={styles.comboOption}
                      data-active={index === activeInvoice || undefined}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pickInvoice(invoice.invoiceId);
                      }}
                      onMouseEnter={() => setActiveInvoice(index)}
                    >
                      {invoiceLabel(invoice)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {paidInvoices.error && <span role="alert">{paidInvoices.error.message}</span>}
            <small>Only Center Manager can handle payment requests.</small>
          </label>
        )}
        <label className={styles.field}>
          {isManager ? "Your message *" : "Description"}
          <textarea
            value={description}
            maxLength={2000}
            placeholder="What does the member need?"
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className={styles.muted}>{description.length}/2000</span>
        </label>

        <div className={styles.box}>
          <label className={styles.field}>
            Hand over to (optional)
            <select
              value={handoverTo}
              onChange={(e) => setHandoverTo(e.target.value)}
            >
              <option value="">Select a staff member</option>
              {assignees
                .map((x) => (
                  <option key={x.userId} value={x.userId} disabled={category === "PAYMENT" && roleKey(x.role) !== "manager"}>
                    {x.name} ({ROLE_LABELS[roleKey(x.role)]})
                  </option>
                ))}
            </select>
          </label>
          {escalating && (
            <label className={styles.field}>
              Handover note (required)
              <textarea
                value={handoverNote}
                maxLength={1000}
                placeholder="Why does this need a higher role?"
                onChange={(e) => setHandoverNote(e.target.value)}
              />
            </label>
          )}
        </div>

        {error && (
          <p
            className={`${styles.feedback} ${styles.feedbackError}`}
            role="alert"
          >
            {error}
          </p>
        )}

        <div className={styles.dialogFoot}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy || !baseReady || handoverBlock !== null}
            title={handoverBlock ?? undefined}
            onClick={() => void submit(true)}
          >
            Create &amp; hand over
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !baseReady || (category === "PAYMENT" && !isManager)}
            onClick={() => void submit(false)}
          >
            Create &amp; handle myself
          </button>
        </div>
        {baseReady && handoverBlock && (
          <p className={styles.helper}>
            To hand over: {handoverBlock.toLowerCase()}
          </p>
        )}
      </div>
    </Dialog>
  );
}
