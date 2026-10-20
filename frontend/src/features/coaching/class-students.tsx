"use client";

import { useState } from "react";
import { Search, Users } from "lucide-react";
import { useLanguage } from "@/lib/language";
import type { TeachingMember } from "./teaching-api";
import styles from "./class-students.module.css";

export function ClassStudents({
  members,
  onPlan,
}: {
  members: TeachingMember[];
  onPlan?: (memberId: string) => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase(language);
  const visible = members.filter((member) =>
    `${member.memberName} ${member.email}`
      .toLocaleLowerCase(language)
      .includes(term),
  );

  return (
    <section
      className={styles.students}
      aria-label={vi ? "Học viên của lớp" : "Class students"}
    >
      <header className={styles.heading}>
        <h3>
          <Users size={20} aria-hidden="true" />
          {vi ? "Học viên" : "Students"}
        </h3>
        <span>{members.length}</span>
      </header>
      <label className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={
            vi
              ? "Tìm học viên theo tên hoặc email"
              : "Search students by name or email"
          }
          placeholder={vi ? "Tìm tên hoặc email…" : "Search name or email…"}
        />
      </label>
      <ul className={styles.studentList}>
        {visible.map((member) => (
          <li key={member.memberId} className={styles.student}>
            <span className={styles.avatar} aria-hidden="true">
              {member.memberName.slice(0, 1)}
            </span>
            <div className={styles.studentBody}>
              <strong>{member.memberName}</strong>
              <span className={styles.email}>{member.email}</span>
              <p className={styles.goal}>
                {member.goal ||
                  (vi
                    ? "Chưa cập nhật mục tiêu tập luyện"
                    : "Training goal not provided")}
              </p>
              <div className={styles.studentMeta}>
                {member.experienceLevel && (
                  <span>{member.experienceLevel}</span>
                )}
                <span>
                  {vi ? "Có mặt" : "Present"}: <b>{member.present}</b>
                </span>
                <span>
                  {vi ? "Vắng" : "Absent"}: <b>{member.absent}</b>
                </span>
              </div>
            </div>
            {onPlan && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => onPlan(member.memberId)}
              >
                {vi ? "Lập kế hoạch" : "Plan"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!visible.length && (
        <p className={styles.empty} role="status">
          {members.length
            ? vi
              ? "Không tìm thấy học viên phù hợp."
              : "No students match your search."
            : vi
              ? "Học viên sẽ xuất hiện ở đây sau khi đăng ký lớp."
              : "Students appear here once they enroll in this class."}
        </p>
      )}
    </section>
  );
}
