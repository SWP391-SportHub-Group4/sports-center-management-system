"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
export const validReceiptId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function ReceiptLookup({ kind }: { kind: "notices" }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [id, setId] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!validReceiptId(id.trim())) {
          setError(true);
          return;
        }
        router.push(`/manager/${kind}/${id.trim()}`);
      }}
      className="stack"
    >
      <h2>{t.managerOperations.noticeLookup}</h2>
      <Field label={t.managerOperations.receiptId}>
        <input
          required
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setError(false);
          }}
          maxLength={36}
        />
      </Field>
      {error && <p role="alert">{t.managerOperations.invalidId}</p>}
      <button className="btn btn--secondary">{t.operations.details}</button>
    </form>
  );
}
