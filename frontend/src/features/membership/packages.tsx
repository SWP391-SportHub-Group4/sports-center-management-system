"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Modal } from "@/shared/ui";
import { money, dateLabel } from "@/shared/lib/date";
import type { PackageOption, Invoice } from "./model";
export function PackageList({
  catalog,
  invoices,
  busy,
  onPurchase,
}: {
  catalog: PackageOption[];
  invoices: Invoice[];
  busy: boolean;
  onPurchase: (id: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(catalog[0]?.id ?? "");
  const [confirm, setConfirm] = useState(false);
  const option = catalog.find((p) => p.id === selected);
  return (
    <div className="stack">
      <h1>Select a member package</h1>
      <p className="muted">Select the appropriate package to start training.</p>
      <fieldset className="package-options">
        <legend className="sr-only">Membership plans</legend>
        {catalog.map((p) => (
          <label
            className={`card package-option ${selected === p.id ? "selected" : ""}`}
            key={p.id}
          >
            <span className="row between">
              <span>
                {p.durationDays >= 365 ? "12 months" : "6 months"}{" "}
                {selected === p.id && "‹ Selected"}
              </span>
              <input
                type="radio"
                name="package"
                value={p.id}
                checked={selected === p.id}
                onChange={() => setSelected(p.id)}
              />
            </span>
            <h2>{p.name}</h2>
            <strong className="price">{money(p.price)}</strong>
            <span>
              Total price of packages ·{" "}
              {p.sessionLimit === null
                ? "Unlimited session"
                : `${p.sessionLimit} sessions`}
            </span>
            <ul>
              {p.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </label>
        ))}
      </fieldset>
      {option && (
        <>
          <p>
            Total payment: <strong>{money(option.price)}</strong>
          </p>
          <Button onClick={() => setConfirm(true)}>Registers</Button>
        </>
      )}
      <Link className="text-link" href="/member/profile">
        Go back to the page.
      </Link>
      {invoices.length > 0 && (
        <Card>
          <h2>Payment Requirement</h2>
          {invoices.map((i) => (
            <div className="list-row" key={i.id}>
              <div>
                <strong>{i.packageName}</strong>
                <p className="muted">
                  {dateLabel(i.createdAt)} · {i.id}
                </p>
              </div>
              <div>
                <strong>{money(i.total)}</strong>
                <p>Waiting for payment at the counter</p>
              </div>
            </div>
          ))}
        </Card>
      )}
      {confirm && option && (
        <Modal
          title="Confirm package registration"
          onClose={() => setConfirm(false)}
        >
          <div className="stack">
            <h3>{option.name}</h3>
            <p>{money(option.price)}</p>
            <p>
              Packages will be in check pending status. Only used after the
              centre confirms the payment.
            </p>
            <p className="muted">
              The preview did not generate any actual deposits or transactions.
            </p>
            <div className="row">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Turn around.
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  if (await onPurchase(option.id)) setConfirm(false);
                }}
              >
                {busy ? "Processing..." : "Confirm package registration"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
