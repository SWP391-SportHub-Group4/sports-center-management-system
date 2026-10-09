"use client";

import Link from "next/link";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { ptApi } from "./api";

export function CoachMemberDetail({ memberId }: { memberId: string }) {
  const { t } = useLanguage();

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

        return (
          <MemberContent
            memberId={memberId}
            memberName={assigned.memberName}
            relationship={assigned}
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
}: {
  memberId: string;
  memberName: string;
  relationship: {
    relationshipId: string;
    sourceType: string;
    className: string | null;
    status: string;
    startedAt: string;
  };
}) {
  const { t } = useLanguage();

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
      <Card title={t.coach.members.profileTitle.replace("{name}", memberName)}>
        <div className="stack">
          <div className="row spread">
            <span>{t.staffWork.status}</span>

            <StatusChip value={relationship.status} />
          </div>

          <div className="row spread">
            <span>{t.coach.members.columnSource}</span>

            <strong>{relationship.sourceType}</strong>
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

      <Card
        title={t.coach.members.historyTitle}
        actions={
          <Link
            className="btn btn--secondary"
            href={`/coach/progress?memberId=${memberId}`}
          >
            {t.staffWork.results}
          </Link>
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
                    {item.recordedAt ? formatDateTime(item.recordedAt) : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <Card
        title={t.staffWork.plans}
        actions={
          <Link
            className="btn btn--secondary"
            href={`/coach/training-plans?memberId=${memberId}`}
          >
            {t.staffWork.plans}
          </Link>
        }
      >
        <AsyncSection state={plans} isEmpty={(rows) => !rows.length}>
          {(rows) => (
            <div className="stack">
              {rows.map((plan) => (
                <div className="row spread" key={plan.planId}>
                  <div>
                    <strong>{plan.goal}</strong>

                    <div className="small muted">{plan.level}</div>
                  </div>

                  <StatusChip value={plan.status} />
                </div>
              ))}
            </div>
          )}
        </AsyncSection>
      </Card>
    </div>
  );
}
