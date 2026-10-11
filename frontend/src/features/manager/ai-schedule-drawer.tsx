"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { Drawer } from "@/components/primitives";
import { useLanguage } from "@/lib/language";

type ScheduleRule = {
  dayOfWeek: number;
  startTimeLocal: string;
};

type ManagerAiRequest = {
  sportId: number;
  coachId: string | null;
  defaultRoomId: number;
  capacity: number;

  startDate: string;
  numSessions: number;

  scheduleRules: ScheduleRule[];

  operation?: "CREATE" | "UPDATE";

  classId?: number | null;

  version?: number | null;
};

type ValidationSession = {
  sessionNo: number;
  startAtUtc: string;
  endAtUtc: string;
  available: boolean;
  reasons: string[];
};

type ManagerAiResponse = {
  startDate: string;

  numSessions: number;

  scheduleRules: ScheduleRule[];

  rationale: string;

  validation: {
    allAvailable: boolean;
    sessions: ValidationSession[];
  };

  logId: string;

  provider: string;

  model: string;

  responseTimeMs: number;

  generatedAt: string;
};

function formatDateTime(
  value: string,
): string {
  return new Date(
    value,
  ).toLocaleString();
}

function reasonLabel(
  reason: string,
): string {
  switch (reason) {
    case "sport_inactive":
      return "Bộ môn đã ngừng hoạt động.";

    case "room_not_found":
      return "Không tìm thấy sân/phòng.";

    case "room_inactive":
      return "Sân/phòng đã ngừng hoạt động.";

    case "room_incompatible":
      return "Sân/phòng không hỗ trợ bộ môn.";

    case "room_capacity_exceeded":
      return "Sức chứa sân/phòng không đủ.";

    case "outside_opening_hours":
      return "Buổi học nằm ngoài giờ mở cửa.";

    case "room_busy":
      return "Sân/phòng đang bận.";

    case "coach_inactive":
      return "HLV không còn hoạt động.";

    case "coach_specialty_mismatch":
      return "HLV không có chuyên môn phù hợp.";

    case "coach_busy":
      return "HLV đang bận.";

    case "coach_required":
      return "Chưa chọn HLV.";

    case "draft_overlap":
      return "Các buổi trong lịch đề xuất bị trùng nhau.";

    default:
      return reason;
  }
}

export function AiScheduleDrawer({
  onClose,
  value,
  onApply,
}: {
  onClose: () => void;

  value: ManagerAiRequest;

  onApply: (
    suggestion: {
      startDate: string;
      numSessions: number;
      scheduleRules: ScheduleRule[];
    },
  ) => void;
}) {
  const { t } =
    useLanguage();

  const l =
    t.managerOperations;

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    suggestion,
    setSuggestion,
  ] =
    useState<
      ManagerAiResponse | null
    >(null);

  async function generate() {
    setLoading(true);

    setError(null);

    /*
     * Clear the previous result while
     * generating a new suggestion.
     */
    setSuggestion(null);

    try {
      const result =
        await api.post<
          ManagerAiResponse
        >(
          "/api/ai/manager/schedule-suggestions",
          value,
        );

      setSuggestion(
        result,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "AI schedule generation failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  const canGenerate =
    !loading &&
    value.sportId > 0 &&
    value.defaultRoomId > 0 &&
    value.capacity > 0 &&
    !!value.coachId;

  const hasConflict =
    !!suggestion &&
    !suggestion.validation
      .allAvailable;

  return (
    <Drawer
      title={
        l.aiTitle
      }
      description={
        l.aiWorkflow
      }
      onClose={
        onClose
      }
    >
      <div className="stack">
        <p>
          AI đề xuất lịch.
          SportHub backend sẽ
          tự kiểm tra toàn bộ
          các buổi và có thể
          yêu cầu AI tạo lại
          lịch khi phát hiện
          xung đột.
        </p>

        <dl>
          <div>
            <dt>
              Sport ID
            </dt>

            <dd>
              {
                value.sportId
              }
            </dd>
          </div>

          <div>
            <dt>
              Coach
            </dt>

            <dd>
              {
                value.coachId ??
                "Chưa chọn"
              }
            </dd>
          </div>

          <div>
            <dt>
              Room ID
            </dt>

            <dd>
              {
                value.defaultRoomId
              }
            </dd>
          </div>

          <div>
            <dt>
              Capacity
            </dt>

            <dd>
              {
                value.capacity
              }
            </dd>
          </div>

          <div>
            <dt>
              Start date
            </dt>

            <dd>
              {
                value.startDate
              }
            </dd>
          </div>

          <div>
            <dt>
              Sessions
            </dt>

            <dd>
              {
                value.numSessions
              }
            </dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn"
          disabled={
            !canGenerate
          }
          onClick={() =>
            void generate()
          }
        >
          {loading
            ? "AI đang tìm lịch phù hợp..."
            : "Tạo gợi ý AI"}
        </button>

        {!value.coachId && (
          <p role="alert">
            Hãy chọn HLV
            trước khi dùng AI.
          </p>
        )}

        {value.capacity <=
          0 && (
          <p role="alert">
            Sĩ số phải lớn
            hơn 0.
          </p>
        )}

        {error && (
          <p role="alert">
            {error}
          </p>
        )}

        {suggestion && (
          <>
            <hr />

            <h3>
              Gợi ý của AI
            </h3>

            <p>
              <strong>
                Ngày bắt đầu:
              </strong>{" "}
              {
                suggestion.startDate
              }
            </p>

            <p>
              <strong>
                Số buổi:
              </strong>{" "}
              {
                suggestion.numSessions
              }
            </p>

            <p>
              <strong>
                Lý do:
              </strong>{" "}
              {
                suggestion.rationale
              }
            </p>

            <ul>
              {suggestion
                .scheduleRules
                .map(
                  (
                    rule,
                    index,
                  ) => (
                    <li
                      key={
                        `${rule.dayOfWeek}-${rule.startTimeLocal}-${index}`
                      }
                    >
                      Day{" "}
                      {
                        rule.dayOfWeek
                      }{" "}
                      ·{" "}
                      {
                        rule.startTimeLocal
                      }
                    </li>
                  ),
                )}
            </ul>

            <hr />

            <h3>
              Backend validation
            </h3>

            <p>
              {suggestion
                .validation
                .allAvailable
                ? "Tất cả buổi hiện đều khả dụng."
                : "Sau các lần thử, lịch hiện tại vẫn còn xung đột."}
            </p>

            <div
              style={{
                overflowX:
                  "auto",
              }}
            >
              <table>
                <thead>
                  <tr>
                    <th>
                      #
                    </th>

                    <th>
                      Bắt đầu
                    </th>

                    <th>
                      Kết thúc
                    </th>

                    <th>
                      Trạng thái
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {suggestion
                    .validation
                    .sessions
                    .map(
                      (
                        session,
                      ) => (
                        <tr
                          key={
                            session.sessionNo
                          }
                        >
                          <td>
                            {
                              session.sessionNo
                            }
                          </td>

                          <td>
                            {formatDateTime(
                              session.startAtUtc,
                            )}
                          </td>

                          <td>
                            {formatDateTime(
                              session.endAtUtc,
                            )}
                          </td>

                          <td>
                            {session.available ? (
                              "Available"
                            ) : (
                              <>
                                <strong>
                                  Conflict
                                </strong>

                                {session
                                  .reasons
                                  .map(
                                    (
                                      reason,
                                    ) => (
                                      <p
                                        key={
                                          reason
                                        }
                                        className="small"
                                      >
                                        {reasonLabel(
                                          reason,
                                        )}
                                      </p>
                                    ),
                                  )}
                              </>
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                </tbody>
              </table>
            </div>

            {hasConflict && (
              <p role="alert">
                AI chưa tìm
                được lịch hoàn
                toàn khả dụng.
                Bạn có thể bấm
                "Tạo lại" hoặc
                chỉnh lịch thủ
                công.
              </p>
            )}

            <p className="small">
              Backend validation
              là kiểm tra tại
              thời điểm hiện tại.
              Khi publish, server
              vẫn kiểm tra lại để
              tránh race condition.
            </p>

            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={
                  !suggestion
                    .validation
                    .allAvailable
                }
                onClick={() => {
                  onApply({
                    startDate:
                      suggestion.startDate,

                    numSessions:
                      suggestion.numSessions,

                    scheduleRules:
                      suggestion.scheduleRules,
                  });

                  onClose();
                }}
              >
                Áp dụng gợi ý
              </button>

              <button
                type="button"
                className="btn btn--secondary"
                disabled={
                  loading
                }
                onClick={() =>
                  void generate()
                }
              >
                Tạo lại
              </button>
            </div>

            <p className="small muted">
              {
                suggestion.provider
              }{" "}
              ·{" "}
              {
                suggestion.model
              }{" "}
              ·{" "}
              {
                suggestion.responseTimeMs
              }{" "}
              ms
            </p>
          </>
        )}

        <p>
          {
            l.draftHint
          }
        </p>
      </div>
    </Drawer>
  );
}