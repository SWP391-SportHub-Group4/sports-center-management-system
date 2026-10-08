"use client";
import { useState } from "react";
import { AsyncSection, Field } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { ptApi } from "./api";
import { ListPager } from "./ui";
export function PtMemberSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const state = useApi((signal) => ptApi.relationships(page, signal), [page]);
  return (
    <AsyncSection state={state}>
      {(rows) => (
        <>
          <Field label={t.staffWork.member}>
            <select
              required
              value={value}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">—</option>
              {rows
                .filter((r) => r.status === "ACTIVE")
                .map((r) => (
                  <option key={r.relationshipId} value={r.memberId}>
                    {r.memberName} · {r.memberEmail}
                  </option>
                ))}
            </select>
          </Field>
          <ListPager
            page={page}
            count={rows.length}
            onChange={(p) => {
              onChange("");
              setPage(p);
            }}
          />
        </>
      )}
    </AsyncSection>
  );
}
