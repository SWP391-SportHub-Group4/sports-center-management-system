"use client";

import { useSearchParams } from "next/navigation";
import { AsyncSection } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { InvoiceDetailDto, UserAdminDto } from "@/lib/types";
import { MemberDesk } from "./front-desk";

type InvoiceReference = { id: string; byItem: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ResolvedInvoiceDesk({ reference }: { reference: InvoiceReference }) {
  const member = useApi(
    async (signal) => {
      const invoice = await api.get<InvoiceDetailDto>(
        reference.byItem
          ? `/api/invoices/by-item/${reference.id}`
          : `/api/invoices/${reference.id}`,
        { signal },
      );
      return api.get<UserAdminDto>(`/api/users/${invoice.summary.memberId}`, {
        signal,
      });
    },
    [reference.id, reference.byItem],
  );

  return (
    <AsyncSection state={member}>
      {(selectedMember) => (
        <MemberDesk mode="invoices" initialMember={selectedMember} />
      )}
    </AsyncSection>
  );
}

export function InvoiceDesk() {
  const query = useSearchParams();
  const { t } = useLanguage();
  const invoiceId = query.get("invoiceId");
  const itemId = query.get("invoiceItemId");
  const id = invoiceId ?? itemId;

  if (id === null) return <MemberDesk mode="invoices" />;
  if (!uuid.test(id))
    return <p role="alert">{t.operations.invalidInvoiceLink}</p>;

  return (
    <ResolvedInvoiceDesk
      key={`${invoiceId === null ? "item" : "invoice"}-${id}`}
      reference={{ id, byItem: invoiceId === null }}
    />
  );
}
