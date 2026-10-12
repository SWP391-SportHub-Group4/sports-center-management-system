"use client";

import { usePathname } from "next/navigation";
import { CourseSticker } from "@/features/courses";
import { useLanguage } from "@/lib/language";
import { PtStudentDirectory } from "./pt-students-page";
import styles from "./coach-workspace.module.css";
import ptStyles from "./pt-coach-workspace.module.css";
export function PtCoachWorkspaceHeader() {
  const path = usePathname();
  const { language } = useLanguage();
  const vi = language === "vi";
  const group = /training-plans|ai-suggestions/.test(path)
    ? "plans"
    : /members|progress/.test(path)
      ? "members"
      : "schedule";
  if (group === "members") return null;
  return (
    <>
      <header className={`${styles.intro} ${ptStyles.intro}`}>
        <div>
          <h2>
            {group === "schedule"
              ? vi
                ? "Sẵn sàng cho buổi PT"
                : "Ready for your next PT session"
              : vi
                ? "Lộ trình phù hợp từng học viên"
                : "A plan for each student"}
          </h2>
          <p>
            {vi
              ? "Chuẩn bị kế hoạch, theo dõi buổi tập và ghi nhận tiến bộ trong cùng một không gian."
              : "Prepare training plans, follow your sessions and record progress in one workspace."}
          </p>
        </div>
        <CourseSticker sport="Gym" compact />
      </header>
    </>
  );
}

export function PtCoachStudents() {
  return <PtStudentDirectory />;
}
