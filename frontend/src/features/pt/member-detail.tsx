"use client";

import Link from "next/link";
import { useState } from "react";
import { Tabs } from "@/components/primitives";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { ptApi } from "./api";
import { PtStudentPreparation, PtStudentHistory } from "./pt-student-panel";

export function CoachMemberDetail({
  memberId,
  embedded = false,
}: {
  memberId: string;
  embedded?: boolean;
}) {
  const { t, language } = useLanguage();
  const [panelTab, setPanelTab] = useState("prepare");

  const relationship = useApi(
    (signal) => ptApi.relationships(1, signal, true, memberId),
    [memberId],
  );

  return (
    <AsyncSection
      state={relationship}
      isEmpty={(rows) => !rows.length}
      emptyMessage={t.coach.members.emptyMembers}
    >
      {(relationships) => {
        const assigned = relationships[0];

        if (!assigned) {
          return null;
        }

        return embedded ? (
          <Tabs
            value={panelTab}
            onChange={setPanelTab}
            ariaLabel={
              language === "vi" ? "Thông tin học viên" : "Student information"
            }
            tabs={[
              {
                id: "prepare",
                label:
                  language === "vi" ? "Hồ sơ & kế hoạch" : "Profile & plan",
              },
              {
                id: "history",
                label: language === "vi" ? "Lịch sử" : "History",
              },
            ]}
          >
            {panelTab === "prepare" ? (
              <PtStudentPreparation memberId={memberId} editable={false} />
            ) : (
              <PtStudentHistory memberId={memberId} />
            )}
          </Tabs>
        ) : (
          <MemberContent
            memberId={memberId}
            memberName={assigned.memberName}
            relationship={assigned}
            embedded={embedded}
          />
        );
      }}
    </AsyncSection>
  );
}

function MemberContent({
  memberId,
  memberName,
  relationship,
  embedded,
}: {
  memberId: string;
  memberName: string;
  embedded: boolean;
  relationship: {
    relationshipId: string;
    sourceType: string;
    className: string | null;
    status: string;
    startedAt: string;
  };
}) {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState("profile");

  const profile = useApi(
    (signal) => ptApi.memberProfile(memberId, signal),
    [memberId],
  );

  const progress = useApi(
    (signal) => ptApi.progress(memberId, 1, signal),
    [memberId],
  );

  const plans = useApi(
    (signal) => ptApi.plans(1, signal, memberId),
    [memberId],
  );

  return (
    <div className="stack">
      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel={language === "vi" ? "Thông tin học viên" : "Student details"}
        tabs={[
          { id: "profile", label: language === "vi" ? "Hồ sơ" : "Profile" },
          { id: "progress", label: language === "vi" ? "Tiến bộ" : "Progress" },
          { id: "plans", label: language === "vi" ? "Kế hoạch" : "Plans" },
        ]}
      >
        {tab === "profile" && (
          <>
            <Card
              title={t.coach.members.profileTitle.replace("{name}", memberName)}
            >
              <div className="stack">
                <div className="row spread">
                  <span>{t.staffWork.status}</span>

                  <StatusChip value={relationship.status} />
                </div>

                <div className="row spread">
                  <span>{t.coach.members.columnSource}</span>

                  <strong>
                    {relationship.sourceType === "PT"
                      ? language === "vi"
                        ? "Huấn luyện cá nhân"
                        : "Personal training"
                      : (relationship.className ?? relationship.sourceType)}
                  </strong>
                </div>

                {relationship.className && (
                  <div className="row spread">
                    <span>{t.coach.members.columnClass}</span>

                    <strong>{relationship.className}</strong>
                  </div>
                )}

                <div className="row spread">
                  <span>{t.coach.members.columnStart}</span>

                  <strong>{formatDateTime(relationship.startedAt)}</strong>
                </div>
              </div>
            </Card>

            <Card title={t.common.fitnessProfile}>
              <AsyncSection
                state={profile}
                emptyMessage={t.coach.members.noProfileNotice}
              >
                {(data) => (
                  <div className="stack">
                    <div className="row spread">
                      <span>{t.coach.members.goal}</span>

                      <strong>{data.goal}</strong>
                    </div>

                    <div className="row spread">
                      <span>{t.coach.members.level}</span>

                      <strong>{data.experienceLevel}</strong>
                    </div>

                    <div className="row spread">
                      <span>{t.coach.members.healthNotes}</span>

                      <span>{data.notes || "—"}</span>
                    </div>

                    <p className="small muted">
                      {t.coach.members.updatedAt.replace(
                        "{date}",
                        formatDateTime(data.updatedAt),
                      )}
                    </p>
                  </div>
                )}
              </AsyncSection>
            </Card>
          </>
        )}
        {tab === "progress" && (
          <Card
            title={t.coach.members.historyTitle}
            actions={
              !embedded ? (
                <Link
                  className="btn btn--secondary"
                  href={`/coach/progress?memberId=${memberId}`}
                >
                  {t.staffWork.results}
                </Link>
              ) : undefined
            }
          >
            <AsyncSection
              state={progress}
              isEmpty={(data) => !data.items.length}
              emptyMessage={t.coach.members.emptyHistory}
            >
              {(data) => (
                <Table
                  headers={[
                    t.coach.members.columnClassSession,
                    t.coach.members.columnProgress,
                    t.coach.members.columnComment,
                    t.coach.members.columnRecordedAt,
                  ]}
                >
                  {data.items.map((item) => (
                    <tr key={item.ptSessionId}>
                      <td>{formatDateTime(item.startAtUtc)}</td>

                      <td>{item.progressNote || "—"}</td>

                      <td>{item.coachComment || "—"}</td>

                      <td>
                        {item.recordedAt
                          ? formatDateTime(item.recordedAt)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </AsyncSection>
          </Card>
        )}
        {tab === "plans" && (
          <Card
            title={t.staffWork.plans}
            actions={
              !embedded ? (
                <Link
                  className="btn btn--secondary"
                  href={`/coach/members?memberId=${memberId}&tab=plan`}
                >
                  {t.staffWork.plans}
                </Link>
              ) : undefined
            }
          >
            <AsyncSection state={plans} isEmpty={(rows) => !rows.length}>
              {(rows) => (
                <div className="stack">
                  {rows.map((plan) => (
                    <article className="stack" key={plan.planId}>
                      <div className="row spread">
                        <div>
                          <strong>{plan.goal}</strong>

                          <div className="small muted">{plan.level}</div>
                        </div>

                        <StatusChip value={plan.status} />
                      </div>
                      {embedded && (
                        <ul>
                          {plan.items.map((item) => (
                            <li key={item.itemId}>
                              <strong>{item.exercise}</strong> · {item.sets} ×{" "}
                              {item.reps}
                              {item.notes && (
                                <p className="muted">{item.notes}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </AsyncSection>
          </Card>
        )}
      </Tabs>
    </div>
  );
}
