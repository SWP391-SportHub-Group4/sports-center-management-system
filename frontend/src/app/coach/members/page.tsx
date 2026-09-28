"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Table } from "@/components/ui";
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconDumbbell,
  IconHeartbeat,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconUser,
  IconYoga,
  StickerGoalTarget,
  StickerRegistrationsEmpty,
  StickerTrainingEmpty,
} from "@/components/icons";
import { api } from "@/lib/apiClient";
import { formatDateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type {
  CoachMemberRelationshipDto,
  MemberTrainingProfileDto,
  WorkoutResultDto,
} from "@/lib/types";
import styles from "../coach.module.css";

/**
 * Hội viên đang phụ trách và hồ sơ tập luyện của họ.
 * Endpoint /api/coach-member-relationships tự ép coachId về người đang đăng nhập.
 */
export default function CoachMembersPage() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const initialMemberId = searchParams.get("memberId");

  const [selected, setSelected] = useState<CoachMemberRelationshipDto | null>(null);
  const [filterType, setFilterType] = useState<"ALL" | "PT" | "CLASS">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const relationships = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: true },
      }),
    [],
  );

  useEffect(() => {
    if (initialMemberId && relationships.data) {
      const match = relationships.data.find((r) => r.memberId === initialMemberId);
      if (match) setSelected(match);
    }
  }, [initialMemberId, relationships.data]);

  const profile = useApi(
    (signal) =>
      selected
        ? api.get<MemberTrainingProfileDto | null>(
            `/api/members/${selected.memberId}/training-profile`,
            { signal },
          )
        : Promise.resolve(null),
    [selected?.memberId],
  );

  const results = useApi(
    (signal) =>
      selected
        ? api.get<WorkoutResultDto[]>(
            `/api/members/${selected.memberId}/workout-results`,
            { signal },
          )
        : Promise.resolve(null),
    [selected?.memberId],
  );

  const filteredList = useMemo(() => {
    if (!relationships.data) return [];
    let list = relationships.data;

    if (filterType === "PT") {
      list = list.filter((r) => r.sourceType === "Personal");
    } else if (filterType === "CLASS") {
      list = list.filter((r) => r.sourceType === "ClassBased");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.memberName?.toLowerCase().includes(q) ||
          r.memberEmail.toLowerCase().includes(q) ||
          r.className?.toLowerCase().includes(q),
      );
    }

    return list;
  }, [relationships.data, filterType, searchQuery]);

  const ptCount = useMemo(
    () => relationships.data?.filter((r) => r.sourceType === "Personal").length ?? 0,
    [relationships.data],
  );

  const classCount = useMemo(
    () => relationships.data?.filter((r) => r.sourceType === "ClassBased").length ?? 0,
    [relationships.data],
  );

  return (
    <AppShell
      title={language === "en" ? "Assigned Trainees & Training Profiles" : "Học viên phụ trách & Hồ sơ tập luyện"}
      description={
        language === "en"
          ? "Manage 1:1 Personal Training clients and Studio group class attendees (Yoga, Group X) (BR-23)"
          : "Quản lý đồng thời học viên cá nhân 1:1 (PT) và học viên tham gia các lớp Yoga / Group X (BR-23)"
      }
      allow={["Coach"]}
    >
      <Card
        title={language === "en" ? "Trainee Roster" : "Danh sách học viên"}
        hint={
          language === "en"
            ? "Active coaching relationships assigned to you. Formed upon class enrollment or 1:1 PT contract execution."
            : "Chỉ các học viên có quan hệ huấn luyện đang hoạt động với bạn. Mối quan hệ phát sinh khi hội viên đăng ký lớp hoặc hợp đồng PT."
        }
        bodyless
      >
        <div style={{ padding: "16px 20px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div className={styles.filterBar} style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={`${styles.filterBtn} ${filterType === "ALL" ? styles.filterBtnActive : ""}`}
                onClick={() => setFilterType("ALL")}
              >
                {language === "en" ? "All" : "Tất cả"} ({relationships.data?.length ?? 0})
              </button>
              <button
                type="button"
                className={`${styles.filterBtn} ${filterType === "PT" ? styles.filterBtnActive : ""}`}
                onClick={() => setFilterType("PT")}
              >
                <IconDumbbell size={14} /> {language === "en" ? "1:1 PT Clients" : "Học viên PT 1:1"} ({ptCount})
              </button>
              <button
                type="button"
                className={`${styles.filterBtn} ${filterType === "CLASS" ? styles.filterBtnActive : ""}`}
                onClick={() => setFilterType("CLASS")}
              >
                <IconYoga size={14} /> {language === "en" ? "Group Class Trainees" : "Học viên Lớp nhóm"} ({classCount})
              </button>
            </div>

            <div className={styles.searchBarWrapper}>
              <IconSearch size={16} className={styles.searchBarIcon} />
              <input
                type="text"
                placeholder={language === "en" ? "Search by name, email, class..." : "Tìm theo tên, email, lớp..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchBarInput}
              />
            </div>
          </div>
        </div>

        <AsyncSection
          state={relationships}
          emptyMessage={
            <div className={styles.emptyPlaceholder}>
              <StickerRegistrationsEmpty size={68} />
              <div className={styles.emptyPlaceholderTitle}>
                {searchQuery || filterType !== "ALL"
                  ? language === "en"
                    ? "No trainees match your search or filter"
                    : "Không tìm thấy học viên nào phù hợp"
                  : language === "en"
                    ? "You currently have no assigned trainees"
                    : "Bạn chưa phụ trách học viên nào"}
              </div>
              <p className={styles.emptyPlaceholderDesc}>
                {searchQuery || filterType !== "ALL"
                  ? language === "en"
                    ? "Try adjusting your search query or reset the filter to 'All'."
                    : "Thử thay đổi từ khóa tìm kiếm hoặc chọn bộ lọc 'Tất cả' để xem toàn bộ danh sách."
                  : language === "en"
                    ? "Trainees will appear here automatically when they book your sessions or activate 1:1 PT contracts."
                    : "Học viên sẽ tự động xuất hiện khi họ đăng ký lớp học do bạn dạy hoặc hợp đồng PT 1:1 có hiệu lực."}
              </p>
            </div>
          }
          isEmpty={() => filteredList.length === 0}
        >
          {() => (
            <Table
              headers={[
                language === "en" ? "Trainee" : "Học viên",
                language === "en" ? "Modality" : "Hình thức",
                language === "en" ? "Class / Program" : "Lớp / Chương trình",
                language === "en" ? "Active Since" : "Bắt đầu từ",
                { text: "", numeric: true },
              ]}
            >
              {filteredList.map((item) => {
                const isSelected = selected?.relationshipId === item.relationshipId;
                const isPt = item.sourceType === "Personal";

                return (
                  <tr
                    key={item.relationshipId}
                    style={{
                      backgroundColor: isSelected ? "rgba(56, 189, 248, 0.08)" : undefined,
                    }}
                  >
                    <td>
                      <strong>{item.memberName || item.memberEmail}</strong>
                      <div className="small muted">{item.memberEmail}</div>
                    </td>
                    <td>
                      {isPt ? (
                        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--pt"]}`}>
                          <IconDumbbell size={13} /> {language === "en" ? "1:1 PT" : "PT kèm 1:1"}
                        </span>
                      ) : (
                        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--yoga"]}`}>
                          <IconYoga size={13} /> {language === "en" ? "Group Class" : "Lớp nhóm"}
                        </span>
                      )}
                    </td>
                    <td>{item.className ?? (isPt ? (language === "en" ? "Personal Training 1:1" : "Kèm riêng cá nhân 1:1") : "—")}</td>
                    <td className="nowrap small">
                      {formatDateTime(item.startedAt)}
                    </td>
                    <td className="right nowrap">
                      <button
                        type="button"
                        className={`btn btn--sm ${isSelected ? "" : "btn--ghost"}`}
                        onClick={() => setSelected(item)}
                      >
                        {isSelected
                          ? language === "en"
                            ? "Viewing Profile"
                            : "Đang xem hồ sơ"
                          : language === "en"
                            ? "View Profile"
                            : "Xem hồ sơ"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </AsyncSection>
      </Card>

      {!selected ? (
        <div className="card" style={{ marginTop: "20px" }}>
          <div className={styles.emptyPlaceholder}>
            <StickerGoalTarget size={72} />
            <div className={styles.emptyPlaceholderTitle}>
              {language === "en"
                ? "Select a Trainee to Inspect Profile & History"
                : "Chọn học viên để tra cứu Hồ sơ & Tiến độ"}
            </div>
            <p className={styles.emptyPlaceholderDesc}>
              {language === "en"
                ? "Click 'View Profile' on any trainee in the table above to check their declared fitness goals, conditioning level, injury background (BR-26), and workout assessment log (BR-24)."
                : "Bấm nút 'Xem hồ sơ' của học viên trong bảng trên để kiểm tra mục tiêu rèn luyện, trình độ thể lực, tiền sử chấn thương (BR-26) và lịch sử kết quả các buổi tập luyện (BR-24)."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <Card
            title={
              language === "en"
                ? `Training Profile — ${selected.memberName || selected.memberEmail}`
                : `Hồ sơ tập luyện — ${selected.memberName || selected.memberEmail}`
            }
            hint={
              language === "en"
                ? "Goals and physical conditions declared by the trainee upon registration (BR-26)"
                : "Mục tiêu và tình trạng sức khỏe của học viên do chính họ khai báo (BR-26)"
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "20px",
                padding: "12px 16px",
                background: "var(--ice)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--navy)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                  }}
                >
                  <IconUser size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--navy)" }}>
                    {selected.memberName || selected.memberEmail}
                  </div>
                  <div className="small muted">
                    {selected.sourceType === "Personal"
                      ? language === "en"
                        ? "1:1 Personal Training Client"
                        : "Học viên kèm riêng PT 1:1"
                      : language === "en"
                        ? "Group Class Trainee"
                        : "Học viên Lớp nhóm"} · {selected.className ?? (language === "en" ? "Personal Training" : "Huấn luyện cá nhân")}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Link
                  className="btn btn--sm btn--secondary"
                  href={`/coach/training-plans?memberId=${selected.memberId}`}
                >
                  <IconClipboard size={14} />
                  <span>{language === "en" ? "Build Routine" : "Soạn giáo án"}</span>
                </Link>
                <Link
                  className="btn btn--sm btn--ghost"
                  href={`/coach/ai-suggestions?memberId=${selected.memberId}`}
                >
                  <IconSparkles size={14} />
                  <span>{language === "en" ? "AI Suggestion" : "Gợi ý AI"}</span>
                </Link>
                <Link
                  className="btn btn--sm btn--ghost"
                  href="/coach/attendance"
                >
                  <IconCheck size={14} />
                  <span>{language === "en" ? "Check Attendance" : "Điểm danh ca dạy"}</span>
                </Link>
              </div>
            </div>

            <AsyncSection
              state={profile}
              emptyMessage={
                <div className={styles.emptyPlaceholder} style={{ padding: "24px 16px" }}>
                  <IconAlert size={36} color="var(--slate)" />
                  <div className={styles.emptyPlaceholderTitle} style={{ fontSize: "0.95rem" }}>
                    {language === "en"
                      ? "Trainee has not declared a training profile yet"
                      : "Học viên chưa cập nhật hồ sơ tập luyện"}
                  </div>
                  <p className={styles.emptyPlaceholderDesc} style={{ fontSize: "0.82rem" }}>
                    {language === "en"
                      ? "The trainee must submit their goal and level in the member portal. AI suggestions require this input baseline (BR-26)."
                      : "Hội viên cần khai báo mục tiêu và trình độ trong cổng thành viên. Tính năng AI gợi ý giáo án yêu cầu dữ liệu này làm đầu vào (BR-26)."}
                  </p>
                </div>
              }
            >
              {(data) =>
                data ? (
                  <div className="stack" style={{ gap: "14px" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "14px",
                      }}
                    >
                      <div
                        style={{
                          padding: "14px",
                          background: "var(--surface)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--slate)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>
                          <IconTarget size={14} color="var(--navy)" />
                          <span>{language === "en" ? "Fitness Goal" : "Mục tiêu rèn luyện"}</span>
                        </div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)", marginTop: "6px" }}>
                          {data.goal}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "14px",
                          background: "var(--surface)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--slate)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>
                          <IconDumbbell size={14} color="var(--navy)" />
                          <span>{language === "en" ? "Conditioning Level" : "Trình độ hiện tại"}</span>
                        </div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)", marginTop: "6px" }}>
                          {label(data.experienceLevel)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "14px 16px",
                        background: data.notes ? "rgba(245, 158, 11, 0.08)" : "var(--surface)",
                        border: `1px solid ${data.notes ? "rgba(245, 158, 11, 0.4)" : "var(--line)"}`,
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: data.notes ? "#b45309" : "var(--slate)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>
                        {data.notes ? <IconAlert size={14} color="#b45309" /> : <IconHeartbeat size={14} color="var(--slate)" />}
                        <span>{language === "en" ? "Health Notes & Injury Background" : "Lưu ý sức khỏe & Tiền sử chấn thương"}</span>
                      </div>
                      <div
                        style={{
                          color: data.notes ? "#92400e" : "var(--slate)",
                          fontWeight: data.notes ? 600 : 400,
                          marginTop: "6px",
                          fontSize: "0.92rem",
                          lineHeight: 1.5,
                        }}
                      >
                        {data.notes || (language === "en" ? "No specific injury or health restrictions noted." : "Không có ghi chú bệnh lý hoặc chấn thương đặc biệt.")}
                      </div>
                    </div>

                    <div className="small muted" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <IconCalendar size={13} />
                      <span>{language === "en" ? "Last updated:" : "Cập nhật lần cuối:"} {formatDateTime(data.updatedAt)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="muted">
                    {language === "en"
                      ? "Trainee has not declared their profile — AI recommendations require this profile baseline (BR-26)."
                      : "Hội viên chưa khai báo hồ sơ — tính năng gợi ý AI yêu cầu phải có hồ sơ tập luyện đầu vào (BR-26)."}
                  </p>
                )
              }
            </AsyncSection>
          </Card>

          <Card
            title={language === "en" ? "Workout Session Assessment History" : "Lịch sử kết quả buổi tập"}
            hint={
              language === "en"
                ? "Reviews and progress metrics recorded by coaches upon completing each session (BR-24)"
                : "Ghi nhận đánh giá buổi tập và tiến độ từ Huấn luyện viên sau mỗi ca hoàn thành (BR-24)"
            }
            bodyless
          >
            <AsyncSection
              state={results}
              emptyMessage={
                <div className={styles.emptyPlaceholder} style={{ padding: "32px 16px" }}>
                  <StickerTrainingEmpty size={64} />
                  <div className={styles.emptyPlaceholderTitle}>
                    {language === "en" ? "No workout results recorded yet" : "Chưa có kết quả buổi tập nào"}
                  </div>
                  <p className={styles.emptyPlaceholderDesc}>
                    {language === "en"
                      ? "Assessments are automatically archived when you complete a teaching session and submit feedback under Attendance & Results (BR-24)."
                      : "Kết quả sẽ tự động lưu lại khi bạn hoàn thành buổi dạy và nhập đánh giá chuyên môn trong mục Điểm danh & Kết quả (BR-24)."}
                  </p>
                </div>
              }
              isEmpty={(data) => !data || data.length === 0}
            >
              {(data) =>
                data ? (
                  <Table
                    headers={[
                      language === "en" ? "Class / Session" : "Buổi học / Ca tập",
                      language === "en" ? "Assessing Coach" : "HLV đánh giá",
                      language === "en" ? "Progress Metrics" : "Chỉ số tiến độ",
                      language === "en" ? "Coach Notes" : "Nhận xét của HLV",
                      language === "en" ? "Recorded At" : "Thời điểm ghi",
                    ]}
                  >
                    {data.map((item) => (
                      <tr key={item.resultId}>
                        <td>
                          <strong>{item.className}</strong>
                          <div className="small muted">
                            {formatDateTime(item.sessionStartAtUtc)}
                          </div>
                        </td>
                        <td className="small">{item.coachName}</td>
                        <td className="small" style={{ fontWeight: 600 }}>{item.progressNote ?? "—"}</td>
                        <td className="small">{item.coachComment ?? "—"}</td>
                        <td className="nowrap small muted">
                          {formatDateTime(item.recordedAt)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : null
              }
            </AsyncSection>
          </Card>
        </>
      )}
    </AppShell>
  );
}
