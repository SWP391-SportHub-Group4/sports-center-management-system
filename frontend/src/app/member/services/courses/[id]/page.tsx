"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CourseDetail } from "@/features/courses";
import { useLanguage } from "@/lib/language";
import styles from "./course-page.module.css";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const vi = language === "vi";
  return (
    <div className={styles.page}>
      <Link
        className={`btn btn--quiet ${styles.back}`}
        href="/member/services?section=courses&view=explore"
      >
        {vi ? "Trở về dịch vụ" : "Back to services"}
      </Link>
      <CourseDetail key={id} classId={Number(id)} headingLevel={1} />
    </div>
  );
}
