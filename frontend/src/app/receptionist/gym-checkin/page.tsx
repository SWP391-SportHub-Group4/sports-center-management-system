"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import {
  AsyncSection,
  Card,
  Feedback,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type {
  GymCheckInDto,
  MemberPackageDto,
  UserAdminDto,
} from "@/lib/types";

interface PagedCheckIns {
  items: GymCheckInDto[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/**
 * Gym check-in (BR-64) — Gym/Fitness ra vào tự do, KHÔNG đặt lịch qua lớp.
 *
 * Điều kiện duy nhất là hội viên có ≥1 gói ở trạng thái Hoạt động; không giới hạn số lần
 * check-in trong ngày và KHÔNG trừ số buổi còn lại của bất kỳ gói nào. Kiểm tra thật nằm ở
 * API (một transaction) — phần hiển thị dưới đây chỉ giúp lễ tân biết trước kết quả.
 */
export default function GymCheckInPage() {
  const [member, setMember] = useState<UserAdminDto | null>(null);
  const action = useAction();

  const packages = useApi(
    (signal) =>
      member
        ? api.get<MemberPackageDto[]>(
            `/api/members/${member.userId}/packages`,
            { signal },
          )
        : Promise.resolve(null),
    [member?.userId],
  );

  const history = useApi(
    (signal) =>
      member
        ? api.get<PagedCheckIns>(`/api/members/${member.userId}/gym-checkins`, {
            signal,
            query: { pageSize: 15 },
          })
        : Promise.resolve(null),
    [member?.userId],
  );

  const activePackages =
    packages.data?.filter((item) => item.status === "Active") ?? [];

  const checkIn = async () => {
    if (!member) return;

    const done = await action.run(
      () => api.post("/api/gym-checkins", { targetMemberId: member.userId }),
      `Gym check-in recorded for ${member.fullName || member.email}.`,
    );

    if (done !== null) history.reload();
  };

  return (
    <AppShell
      title="Gym check-in"
      description="Register member to episode Gym/Fitness Free (BR-64)"
      allow={["Receptionist"]}
    >
      <Card
        title="Check-in Notes"
        hint="No limiting number of times in the day and no exception to the session of any package."
      >
        <div className="stack" style={{ maxWidth: 620 }}>
          <MemberPicker value={member} onChange={setMember} />

          {member && (
            <AsyncSection
              state={packages}
              emptyMessage="Couldn't read the membership package."
            >
              {(data) =>
                data && data.length > 0 ? (
                  activePackages.length > 0 ? (
                    <div className="alert alert--success">
                      Members have {activePackages.length} Active packages:{" "}
                      {activePackages
                        .map(
                          (item) =>
                            `${item.packageName} (until ${formatDate(item.endDate)})`,
                        )
                        .join(", ")}
                      .
                    </div>
                  ) : (
                    <div className="alert alert--warn">
                      The member has no packages in active state — the system
                      will refuse check-in (BR-64). Sell or renew the previous
                      package.
                    </div>
                  )
                ) : (
                  <div className="alert alert--warn">
                    This member does not have a membership plan yet.
                  </div>
                )
              }
            </AsyncSection>
          )}

          <Feedback error={action.error} success={action.success} />

          <div>
            <button
              type="button"
              className="btn"
              disabled={!member || action.busy}
              onClick={() => void checkIn()}
            >
              {action.busy ? "Noting..." : "Check-in Notes"}
            </button>
          </div>
        </div>
      </Card>

      {member && (
        <Card
          title={`Check-in history — ${member.fullName || member.email}`}
          bodyless
        >
          <AsyncSection
            state={history}
            emptyMessage="The members never check-in Gym."
            isEmpty={(data) => !data || data.items.length === 0}
          >
            {(data) =>
              data ? (
                <Table headers={["Schedule", "Status"]}>
                  {data.items.map((item) => (
                    <tr key={item.checkInId}>
                      <td>{formatDateTime(item.checkInTime)}</td>
                      <td>
                        <StatusChip value="Present" />
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : null
            }
          </AsyncSection>
        </Card>
      )}
    </AppShell>
  );
}
