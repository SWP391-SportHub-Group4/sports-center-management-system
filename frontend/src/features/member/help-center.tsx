"use client";

import { HelpRequestForm } from "./help-request-form";
import { MyRequests } from "./help-my-requests";
import { needsMemberConfirmation, useMySupportRequests } from "./support-api";
import styles from "./help-center.module.css";

export type HelpTab = "new" | "requests";

/**
 * Help for members, two sub-pages: send a request, and follow the requests already sent.
 * The "My requests" tab carries a badge while a transfer is waiting for the member's confirmation.
 */
export function HelpCenter({
  initialTopic,
  invoiceId,
  invoiceItemId,
  tab,
  requestId,
  onChange,
}: {
  initialTopic?: string;
  invoiceId?: string;
  invoiceItemId?: string;
  tab: HelpTab;
  requestId: string;
  onChange: (next: { tab: HelpTab; requestId: string }) => void;
}) {
  const mine = useMySupportRequests();
  const waiting = (mine.data ?? []).filter(needsMemberConfirmation).length;

  return (
    <div className={styles.page}>
      <div className={styles.tabs} role="tablist" aria-label="Help">
        <button
          type="button"
          role="tab"
          id="help-tab-new"
          aria-selected={tab === "new"}
          aria-controls="help-panel"
          className={styles.tab}
          onClick={() => onChange({ tab: "new", requestId: "" })}
        >
          Send a request
        </button>
        <button
          type="button"
          role="tab"
          id="help-tab-requests"
          aria-selected={tab === "requests"}
          aria-controls="help-panel"
          className={styles.tab}
          onClick={() => onChange({ tab: "requests", requestId: "" })}
        >
          My requests
          {waiting > 0 && (
            <span
              className={styles.tabBadge}
              aria-label={`${waiting} need your confirmation`}
            >
              {waiting}
            </span>
          )}
        </button>
      </div>
      <div
        id="help-panel"
        role="tabpanel"
        aria-labelledby={tab === "new" ? "help-tab-new" : "help-tab-requests"}
      >
        {tab === "new" ? (
          <div className={styles.formWrap}>
            <HelpRequestForm
              initialTopic={initialTopic}
              initialInvoiceId={invoiceId}
              initialInvoiceItemId={invoiceItemId}
              onSent={mine.reload}
              onViewRequests={(id) =>
                onChange({ tab: "requests", requestId: id })
              }
            />
          </div>
        ) : (
          <MyRequests
            state={mine}
            selectedId={requestId}
            onSelect={(id) => onChange({ tab: "requests", requestId: id })}
          />
        )}
      </div>
    </div>
  );
}
