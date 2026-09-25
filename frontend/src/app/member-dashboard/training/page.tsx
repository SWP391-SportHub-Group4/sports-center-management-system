"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { MemberShell } from "@/components/MemberShell";
import { api } from "@/lib/apiClient";
import { formatDateTime, formatDate, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { WorkoutPlanDto, WorkoutResultDto } from "@/lib/types";
import styles from "./training.module.css";

type TrainingTab = "plans" | "results";

/**
 * BR-25 — hội viên XEM kế hoạch tập, kết quả và nhận xét của HLV, nhưng KHÔNG sửa được.
 * Vì vậy trang này hoàn toàn là giao diện hiển thị (Read-only); backend cũng không mở
 * endpoint ghi cho vai trò Member.
 */
export default function MyTrainingPage() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<TrainingTab>("plans");

  const plans = useApi(
    (signal) =>
      api.get<WorkoutPlanDto[]>("/api/members/me/workout-plans", { signal }),
    [],
  );

  const results = useApi(
    (signal) =>
      api.get<WorkoutResultDto[]>("/api/members/me/workout-results", {
        signal,
      }),
    [],
  );

  const planList = useMemo(() => plans.data ?? [], [plans.data]);
  const resultList = useMemo(() => results.data ?? [], [results.data]);

  // Primary active goal from the latest plan or default
  const primaryGoal = useMemo(() => {
    if (planList.length > 0) {
      return planList[0].goal;
    }
    return language === "en"
      ? "Strength Development & Comprehensive Body Conditioning"
      : "Phát triển thể lực & Cải thiện vóc dáng toàn diện";
  }, [planList, language]);

  return (
    <MemberShell
      title={
        language === "en"
          ? "Training & Workout Regimen"
          : "Lộ trình & Kết quả rèn luyện"
      }
      description={
        language === "en"
          ? "Personalized workout routines and professional coaching evaluations from your instructor"
          : "Giáo án bài tập cá nhân hóa và nhật ký đánh giá chuyên môn từ Huấn luyện viên"
      }
    >
      <div className={styles.container}>
        {/* Top Goal & Profile Bridge Banner */}
        <div className={styles.goalBanner}>
          <div className={styles.goalInfo}>
            <div className={styles.goalIconWrapper}>🎯</div>
            <div className={styles.goalTexts}>
              <span className={styles.goalSubtitle}>
                {language === "en" ? "Personal Training Goal" : "Mục tiêu rèn luyện cá nhân"}
              </span>
              <h2 className={styles.goalTitle}>{primaryGoal}</h2>
            </div>
          </div>

          <Link href="/member-dashboard/profile" className={styles.profileLinkBtn}>
            <span>
              {language === "en"
                ? "📋 View Fitness Profile (BMI, Weight) →"
                : "📋 Xem hồ sơ thể lực (BMI, Cân nặng) →"}
            </span>
          </Link>
        </div>

        {/* Tab Switcher */}
        <div className={styles.tabsBar}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "plans" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("plans")}
          >
            <span>{language === "en" ? "🏋️ Workout Regimens" : "🏋️ Giáo án bài tập"}</span>
            <span className={styles.tabBadge}>{planList.length}</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "results" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("results")}
          >
            <span>{language === "en" ? "📝 Coach Logs & Feedback" : "📝 Nhật ký & Nhận xét HLV"}</span>
            <span className={styles.tabBadge}>{resultList.length}</span>
          </button>
        </div>

        {/* Tab 1: Workout Plans */}
        {activeTab === "plans" && (
          <div>
            {plans.loading ? (
              <div className={styles.emptyCard}>
                <div className={styles.emptyIcon}>⏳</div>
                <h3 className={styles.emptyTitle}>
                  {language === "en" ? "Loading workout routines..." : "Đang tải giáo án rèn luyện..."}
                </h3>
                <p className={styles.emptyDesc}>
                  {language === "en" ? "Please wait a moment." : "Vui lòng chờ trong giây lát."}
                </p>
              </div>
            ) : planList.length === 0 ? (
              <div className={styles.emptyCard}>
                <div className={styles.emptyIcon}>📋</div>
                <h3 className={styles.emptyTitle}>
                  {language === "en"
                    ? "No assigned workout routines yet"
                    : "Chưa có giáo án bài tập nào được giao"}
                </h3>
                <p className={styles.emptyDesc}>
                  {language === "en"
                    ? "Your assigned coach will prepare a customized workout routine based on your fitness level and goals (BR-23, BR-25). Speak with your coach in your next session or explore the center's class timetable!"
                    : "Huấn luyện viên phụ trách sẽ lập giáo án cá nhân hóa dựa trên thể lực và mục tiêu của bạn (BR-23, BR-25). Hãy trao đổi với HLV trong buổi tập tới hoặc tham khảo lịch lớp tại trung tâm!"}
                </p>
                <Link href="/member-dashboard/class-schedule" className={styles.emptyActionBtn}>
                  {language === "en" ? "Explore Class Schedule Now" : "Xem lịch lớp học ngay"}
                </Link>
              </div>
            ) : (
              <div className={styles.plansStack}>
                {planList.map((plan) => (
                  <div key={plan.planId} className={styles.planCard}>
                    <div className={styles.planHead}>
                      <div>
                        <h3 className={styles.planGoal}>{plan.goal}</h3>
                        <div className={styles.planMeta}>
                          <span>
                            {language === "en" ? "Assigned Coach: " : "HLV phụ trách: "}
                            <strong>{plan.coachName}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            {language === "en" ? "Created: " : "Ngày lập: "}
                            {formatDate(plan.createdAt)}
                          </span>
                        </div>
                      </div>

                      <span className={styles.planLevelBadge}>
                        {language === "en"
                          ? `Level: ${label(plan.level)}`
                          : `Cấp độ: ${label(plan.level)}`}
                      </span>
                    </div>

                    <div className={styles.exercisesGrid}>
                      {plan.items.map((item) => (
                        <div key={item.itemId} className={styles.exerciseCard}>
                          <div className={styles.exerciseTop}>
                            <h4 className={styles.exerciseName}>{item.exercise}</h4>
                            <span className={styles.setsPill}>
                              {language === "en"
                                ? `${item.sets} sets × ${item.reps} reps`
                                : `${item.sets} hiệp × ${item.reps} lần`}
                            </span>
                          </div>

                          {item.notes ? (
                            <div className={styles.exerciseNotes}>
                              <strong>
                                {language === "en" ? "Form & Cues: " : "Lưu ý kỹ thuật: "}
                              </strong>
                              {item.notes}
                            </div>
                          ) : (
                            <div className={styles.exerciseNotes}>
                              {language === "en"
                                ? "Maintain full range of motion and steady breathing."
                                : "Thực hiện đúng biên độ động tác và hít thở đều đặn."}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Coaching Timeline & Results */}
        {activeTab === "results" && (
          <div>
            {results.loading ? (
              <div className={styles.emptyCard}>
                <div className={styles.emptyIcon}>⏳</div>
                <h3 className={styles.emptyTitle}>
                  {language === "en" ? "Loading feedback history..." : "Đang tải lịch sử nhận xét..."}
                </h3>
                <p className={styles.emptyDesc}>
                  {language === "en" ? "Please wait a moment." : "Vui lòng chờ trong giây lát."}
                </p>
              </div>
            ) : resultList.length === 0 ? (
              <div className={styles.emptyCard}>
                <div className={styles.emptyIcon}>💬</div>
                <h3 className={styles.emptyTitle}>
                  {language === "en"
                    ? "No workout logs recorded yet"
                    : "Chưa có ghi nhận kết quả buổi tập nào"}
                </h3>
                <p className={styles.emptyDesc}>
                  {language === "en"
                    ? "Following each group class or personal training session, your coach will document your strength progress and performance remarks here (BR-25)."
                    : "Sau mỗi buổi học hoặc buổi tập cá nhân, Huấn luyện viên sẽ ghi nhận tiến độ cơ lực và nhận xét phong độ của bạn tại đây (BR-25)."}
                </p>
                <Link href="/member-dashboard/class-schedule" className={styles.emptyActionBtn}>
                  {language === "en" ? "Book Your First Session" : "Đặt lịch tập buổi đầu tiên"}
                </Link>
              </div>
            ) : (
              <div className={styles.timelineFeed}>
                {resultList.map((item) => (
                  <div key={item.resultId} className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                      <div className={styles.resultTitleGroup}>
                        <h3 className={styles.resultClassName}>{item.className}</h3>
                        <span className={styles.resultSessionTime}>
                          {language === "en"
                            ? `Session time: ${formatDateTime(item.sessionStartAtUtc)}`
                            : `Thời gian buổi tập: ${formatDateTime(item.sessionStartAtUtc)}`}
                        </span>
                      </div>

                      <div className={styles.coachTag}>
                        <div className={styles.coachAvatar}>
                          {item.coachName ? item.coachName.charAt(0).toUpperCase() : "H"}
                        </div>
                        <span>
                          {language === "en" ? `Coach ${item.coachName}` : `HLV ${item.coachName}`}
                        </span>
                      </div>
                    </div>

                    <div className={styles.resultBody}>
                      {/* Coach Comment */}
                      <div className={styles.commentBlock}>
                        <span className={styles.commentLabel}>
                          {language === "en" ? "Coach Feedback & Advice" : "Lời khuyên từ HLV"}
                        </span>
                        <p className={styles.commentText}>
                          {item.coachComment ?? (language === "en" ? "No additional notes from coach." : "Không có ghi chú thêm từ HLV.")}
                        </p>
                      </div>

                      {/* Progress Note */}
                      <div className={styles.progressBlock}>
                        <span className={styles.progressLabel}>
                          {language === "en" ? "Strength Progress & Performance" : "Tiến độ cơ lực & Phong độ"}
                        </span>
                        <p className={styles.progressText}>
                          {item.progressNote ?? (language === "en" ? "Successfully completed full workout volume." : "Đã hoàn thành đầy đủ khối lượng bài tập.")}
                        </p>
                      </div>
                    </div>

                    <div className={styles.resultRecordedAt}>
                      {language === "en"
                        ? `Recorded at: ${formatDateTime(item.recordedAt)}`
                        : `Đã ghi nhận lúc: ${formatDateTime(item.recordedAt)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </MemberShell>
  );
}
