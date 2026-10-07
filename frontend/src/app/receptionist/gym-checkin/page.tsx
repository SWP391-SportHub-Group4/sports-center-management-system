"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type { UserAdminDto } from "@/lib/types";
import { OperationsPage } from "@/features/operations/ui";
import { MemberDesk } from "@/features/receptionist/front-desk";

/** Nếu URL có ?member=<id> (từ màn quét QR) thì chọn sẵn hội viên đó. */
function GymDesk() {
  const memberId = useSearchParams().get("member");
  const found = useApi(
    (signal) =>
      memberId
        ? api.get<UserAdminDto>(`/api/users/${memberId}`, { signal })
        : Promise.resolve(null),
    [memberId],
  );
  if (memberId && found.loading) return null;
  return (
    <MemberDesk
      key={memberId ?? "none"}
      mode="gym"
      initialMember={found.data}
    />
  );
}

export default function Page() {
  return (
    <OperationsPage title="gymCheckin" roles={["Receptionist"]}>
      <Suspense>
        <GymDesk />
      </Suspense>
    </OperationsPage>
  );
}
