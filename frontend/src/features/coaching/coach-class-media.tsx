"use client";

import {
  ServiceCover,
  ServicePhotoGallery,
  useCoachClassGallery,
} from "@/features/service-media";
import { StatusChip } from "@/components/ui";
import type { CourseDto, CourseSessionDto } from "@/lib/types";
import styles from "./coach-class-media.module.css";

export function CoachClassGallery({ course }: { course: CourseDto }) {
  const gallery = useCoachClassGallery(course.classId);
  return (
    <ServicePhotoGallery
      gallery={gallery.data}
      loading={gallery.loading}
      error={gallery.error?.message}
      onRetry={gallery.reload}
      kind="class"
      sportName={course.sportName}
      alt={course.name}
    />
  );
}

export function CoachSessionMedia({
  course,
  session,
}: {
  course: CourseDto;
  session?: CourseSessionDto;
}) {
  const gallery = useCoachClassGallery(course.classId);
  return (
    <div className={styles.context}>
      <ServiceCover
        gallery={gallery.data}
        kind="class"
        sportName={course.sportName}
        alt={course.name}
        className={styles.thumbnail}
        sizes="120px"
      />
      <div className={styles.identity}>
        <span className={styles.sport}>
          {course.sportName} · {course.code}
        </span>
        <strong>{course.name}</strong>
        {session && (
          <div className={styles.session}>
            <span>Lesson {session.sessionNo}</span>
            <StatusChip value={session.status} />
          </div>
        )}
      </div>
    </div>
  );
}
