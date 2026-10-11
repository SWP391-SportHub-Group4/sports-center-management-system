"use client";

import { useState } from "react";
import { AsyncSection, Pager, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { api } from "@/lib/apiClient";
import { MutationFeedback, useMutation } from "@/features/operations";
import { ptApi } from "./api";
import { PlanEditor } from "./training-plans";
import { CoachAiDrawer } from "./coach-ai-drawer";
import { IconSparkles } from "@/components/icons";
import styles from "./pt-coach-workspace.module.css";

export function PtStudentPreparation({
  memberId,
  onSaved,
  editable = true,
  includeProfile = true,
  manageArchive = false,
  onDiscard,
}: {
  memberId: string;
  onSaved?: () => void;
  editable?: boolean;
  includeProfile?: boolean;
  manageArchive?: boolean;
  onDiscard?: () => void;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const [editing, setEditing] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const mutation = useMutation();
  const profile = useApi(
    (signal) =>
      includeProfile
        ? ptApi.memberProfile(memberId, signal)
        : Promise.resolve(null),
    [memberId, includeProfile],
  );
  const plans = useApi(
    async (signal) => {
      const rows = [];
      for (let page = 1; ; page++) {
        const batch = await ptApi.plans(page, signal, memberId);
        rows.push(...batch);
        if (batch.length < 20)
          return manageArchive
            ? rows
            : rows.filter((plan) => plan.status !== "ARCHIVED");
      }
    },
    [memberId, manageArchive],
  );
  return (
    <div className={styles.section}>
      {includeProfile && (
        <section className={styles.panelSection}>
          <h3>{vi ? "Mục tiêu & lưu ý" : "Goals & precautions"}</h3>
          <AsyncSection
            state={profile}
            emptyMessage={t.coach.members.noProfileNotice}
          >
            {(data) =>
              data && (
                <dl className={styles.profileFacts}>
                  <div>
                    <dt>{t.coach.members.goal}</dt>
                    <dd>{data.goal}</dd>
                  </div>
                  <div>
                    <dt>{t.coach.members.level}</dt>
                    <dd>
                      {(
                        {
                          Beginner: vi ? "Cơ bản" : "Beginner",
                          Intermediate: vi ? "Trung cấp" : "Intermediate",
                          Advanced: vi ? "Nâng cao" : "Advanced",
                        } as Record<string, string>
                      )[data.experienceLevel] ?? data.experienceLevel}
                    </dd>
                  </div>
                  {data.notes && (
                    <div>
                      <dt>{t.coach.members.healthNotes}</dt>
                      <dd>{data.notes}</dd>
                    </div>
                  )}
                </dl>
              )
            }
          </AsyncSection>
        </section>
      )}
      <section className={styles.panelSection}>
        <div className={styles.toolbar}>
          <h3>{vi ? "Kế hoạch tập luyện" : "Training plan"}</h3>
          {editable && !aiOpen && editing === null && (
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={mutation.busy}
                onClick={() => setEditing("new")}
              >
                {vi ? "Tạo kế hoạch" : "Create plan"}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={editing !== null || mutation.busy}
                onClick={() => setAiOpen(true)}
              >
                <IconSparkles size={16} />{" "}
                {vi ? "AI gợi ý kế hoạch" : "AI plan suggestion"}
              </button>
            </div>
          )}
        </div>
        {editable && aiOpen ? (
          <CoachAiDrawer
            embedded
            memberId={memberId}
            onClose={() => setAiOpen(false)}
            onSaved={() => {
              plans.reload();
              onSaved?.();
            }}
          />
        ) : (
          <AsyncSection state={plans}>
            {(rows) => (
              <>
                {!rows.some((plan) => plan.status !== "ARCHIVED") &&
                  editing === null && (
                    <p className="muted">
                      {vi
                        ? "Chưa có kế hoạch. Tạo mới hoặc dùng AI gợi ý dựa trên mục tiêu của học viên."
                        : "No plan yet. Create one or use AI suggestions based on the student's goals."}
                    </p>
                  )}
                {rows
                  .filter((plan) => plan.status !== "ARCHIVED")
                  .filter((plan) => editing === null || editing === plan.planId)
                  .map((plan) => (
                    <article key={plan.planId} className={styles.section}>
                      <div className={styles.toolbar}>
                        <strong>{plan.goal}</strong>
                        <StatusChip value={plan.status} />
                      </div>
                      <ol className={styles.exerciseList}>
                        {plan.items.map((item) => (
                          <li key={item.itemId}>
                            <div>
                              <strong>{item.exercise}</strong>
                              {item.notes && (
                                <p className="muted">{item.notes}</p>
                              )}
                            </div>
                            <span>
                              {item.sets} {vi ? "hiệp" : "sets"} × {item.reps}
                            </span>
                          </li>
                        ))}
                      </ol>
                      {editable && (
                        <div className="btn-row">
                          <button
                            className="btn btn--secondary"
                            disabled={editing !== null}
                            onClick={() => setEditing(plan.planId)}
                          >
                            {vi ? "Chỉnh kế hoạch" : "Edit plan"}
                          </button>
                          {plan.status !== "ACTIVE" && (
                            <button
                              className="btn"
                              disabled={mutation.busy || editing !== null}
                              onClick={async () => {
                                if (
                                  await mutation.run(() =>
                                    api.post(
                                      `/api/workout-plans/${plan.planId}/activate`,
                                    ),
                                  )
                                ) {
                                  plans.reload();
                                  onSaved?.();
                                }
                              }}
                            >
                              {vi ? "Áp dụng kế hoạch" : "Activate plan"}
                            </button>
                          )}
                          {manageArchive && (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              disabled={mutation.busy || editing !== null}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    vi
                                      ? "Lưu trữ kế hoạch này? Kế hoạch sẽ không còn được áp dụng."
                                      : "Archive this plan? It will no longer be active.",
                                  )
                                )
                                  return;
                                if (
                                  await mutation.run(() =>
                                    api.post(
                                      `/api/workout-plans/${plan.planId}/archive`,
                                    ),
                                  )
                                ) {
                                  plans.reload();
                                  onSaved?.();
                                }
                              }}
                            >
                              {vi ? "Lưu trữ" : "Archive"}
                            </button>
                          )}
                        </div>
                      )}
                      {editable && editing === plan.planId && (
                        <PlanEditor
                          plan={plan}
                          onCancel={() => {
                            if (
                              window.confirm(
                                vi
                                  ? "Bỏ các thay đổi chưa lưu?"
                                  : "Discard unsaved changes?",
                              )
                            ) {
                              setEditing(null);
                              onDiscard?.();
                            }
                          }}
                          reload={() => {
                            setEditing(null);
                            plans.reload();
                            onSaved?.();
                          }}
                        />
                      )}
                    </article>
                  ))}
                <MutationFeedback mutation={mutation} />
                {editable && editing === "new" && (
                  <PlanEditor
                    initialMemberId={memberId}
                    onCancel={() => {
                      if (
                        window.confirm(
                          vi
                            ? "Bỏ các thay đổi chưa lưu?"
                            : "Discard unsaved changes?",
                        )
                      ) {
                        setEditing(null);
                        onDiscard?.();
                      }
                    }}
                    reload={() => {
                      setEditing(null);
                      plans.reload();
                      onSaved?.();
                    }}
                  />
                )}
                {manageArchive &&
                  editing === null &&
                  rows.some((plan) => plan.status === "ARCHIVED") && (
                    <details className={styles.archivedPlans}>
                      <summary>
                        {vi ? "Kế hoạch đã lưu trữ" : "Archived plans"} ·{" "}
                        {
                          rows.filter((plan) => plan.status === "ARCHIVED")
                            .length
                        }
                      </summary>
                      {rows
                        .filter((plan) => plan.status === "ARCHIVED")
                        .map((plan) => (
                          <article
                            key={plan.planId}
                            className={styles.panelSection}
                          >
                            <strong>{plan.goal}</strong>
                            <ol className={styles.exerciseList}>
                              {plan.items.map((item) => (
                                <li key={item.itemId}>
                                  <div>
                                    <strong>{item.exercise}</strong>
                                    {item.notes && (
                                      <p className="muted">{item.notes}</p>
                                    )}
                                  </div>
                                  <span>
                                    {item.sets} {vi ? "hiệp" : "sets"} ×{" "}
                                    {item.reps}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </article>
                        ))}
                    </details>
                  )}
              </>
            )}
          </AsyncSection>
        )}
      </section>
    </div>
  );
}

export function PtStudentHistory({ memberId }: { memberId: string }) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const [page, setPage] = useState(1);
  const history = useApi(
    (signal) => ptApi.progress(memberId, page, signal),
    [memberId, page],
  );
  return (
    <section className={styles.panelSection}>
      <h3>{vi ? "Lịch sử tập luyện" : "Training history"}</h3>
      <AsyncSection
        state={history}
        isEmpty={(data) => !data.items.length}
        emptyMessage={t.coach.members.emptyHistory}
      >
        {(data) => (
          <>
            <div className={styles.historyList}>
              {data.items.map((item) => (
                <article key={item.ptSessionId}>
                  <div className={styles.toolbar}>
                    <strong>{formatDateTime(item.startAtUtc)}</strong>
                    <StatusChip
                      value={item.sessionStatus}
                      label={
                        item.sessionStatus === "COMPLETED"
                          ? "Present"
                          : item.sessionStatus === "NO_SHOW"
                            ? "Absent"
                            : undefined
                      }
                    />
                  </div>
                  {item.progressNote && (
                    <p>
                      <strong>{t.staffWork.progressNote}: </strong>
                      {item.progressNote}
                    </p>
                  )}
                  {item.coachComment && (
                    <p>
                      <strong>{t.staffWork.coachComment}: </strong>
                      {item.coachComment}
                    </p>
                  )}
                  {!item.progressNote && !item.coachComment && (
                    <p className="muted">
                      {vi
                        ? "Chưa có ghi nhận kết quả."
                        : "No results recorded."}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {data.totalCount > data.pageSize && (
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                totalCount={data.totalCount}
                onChange={setPage}
              />
            )}
          </>
        )}
      </AsyncSection>
    </section>
  );
}
