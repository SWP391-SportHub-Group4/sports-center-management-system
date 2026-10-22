"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AsyncSection } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type { UserAdminDto } from "@/lib/types";
import { WalletTopUp } from "@/features/wallet/wallet-top-up";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const member = useApi(
    (signal) => api.get<UserAdminDto>(`/api/users/${id}`, { signal }),
    [id],
  );

  return (
    <AppShell title="Add points" allow={["Receptionist"]}>
      <p>
        <Link href={`/receptionist/members/${id}`}>
          ← Back to member profile
        </Link>
      </p>
      <AsyncSection state={member}>
        {(person) => (
          <WalletTopUp
            memberId={id}
            memberName={person.fullName || person.email}
          />
        )}
      </AsyncSection>
    </AppShell>
  );
}
