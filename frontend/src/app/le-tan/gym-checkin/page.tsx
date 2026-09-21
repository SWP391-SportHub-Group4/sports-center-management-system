"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import { AsyncSection, Card, Feedback, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { GymCheckInDto, MemberPackageDto, UserAdminDto } from "@/lib/types";

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
        ? api.get<MemberPackageDto[]>(`/api/members/${member.userId}/packages`, { signal })
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

  const activePackages = packages.data?.filter((item) => item.status === "Active") ?? [];

  const checkIn = async () => {
    if (!member) return;

    const done = await action.run(
      () => api.post("/api/gym-checkins", { targetMemberId: member.userId }),
      `Đã ghi nhận check-in Gym cho ${member.fullName || member.email}.`,
    );

    if (done !== null) history.reload();
  };

  return (
    <AppShell
      title="Gym check-in"
      description="Ghi nhận hội viên vào tập Gym/Fitness tự do (BR-64)"
      allow={["Receptionist"]}
    >
      <Card
        title="Ghi nhận check-in"
        hint="Không giới hạn số lần trong ngày và không trừ buổi của bất kỳ gói nào."
      >
        <div className="stack" style={{ maxWidth: 620 }}>
          <MemberPicker value={member} onChange={setMember} />

          {member && (
            <AsyncSection state={packages} emptyMessage="Không đọc được gói của hội viên.">
              {(data) =>
                data && data.length > 0 ? (
                  activePackages.length > 0 ? (
                    <div className="alert alert--success">
                      Hội viên có {activePackages.length} gói đang hoạt động:{" "}
                      {activePackages
                        .map(
                          (item) =>
                            `${item.packageName} (đến ${formatDate(item.endDate)})`,
                        )
                        .join(", ")}
                      .
                    </div>
                  ) : (
                    <div className="alert alert--warn">
                      Hội viên không có gói nào ở trạng thái Hoạt động — hệ thống sẽ từ chối
                      check-in (BR-64). Hãy bán hoặc gia hạn gói trước.
                    </div>
                  )
                ) : (
                  <div className="alert alert--warn">
                    Hội viên chưa có gói thành viên nào.
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
              {action.busy ? "Đang ghi nhận…" : "Ghi nhận check-in"}
            </button>
          </div>
        </div>
      </Card>

      {member && (
        <Card title={`Lịch sử check-in — ${member.fullName || member.email}`} bodyless>
          <AsyncSection
            state={history}
            emptyMessage="Hội viên chưa có lần check-in Gym nào."
            isEmpty={(data) => !data || data.items.length === 0}
          >
            {(data) =>
              data ? (
                <Table headers={["Thời điểm", "Trạng thái"]}>
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
