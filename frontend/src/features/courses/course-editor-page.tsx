"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection } from "@/components/ui";
import { CourseEditor } from "./course-editor";
import type { ManagerCourseDto } from "@/lib/types";
export function CourseEditorPage({ classId }: { classId?: number }) {
  const router = useRouter();
  const { t } = useLanguage();
  const state = useApi(
    (signal) =>
      classId
        ? api.get<ManagerCourseDto>(`/api/manager/classes/${classId}`, {
            signal,
          })
        : Promise.resolve(null),
    [classId],
  );
  const close = () =>
    router.push(classId ? `/manager/classes/${classId}` : "/manager/classes");
  const editor = (course?: ManagerCourseDto) => (
    <CourseEditor
      key={`${course?.classId ?? "new"}-${course?.version ?? 0}`}
      course={course}
      onClose={close}
      onSaved={(saved) =>
        router.push(`/manager/classes/${saved?.classId ?? classId}`)
      }
    />
  );
  return (
    <>
      <Link className="btn btn--ghost" href="/manager/classes">
        {t.managerOperations.backToList}
      </Link>
      {classId ? (
        <AsyncSection state={state}>
          {(course) =>
            course &&
            (course.status === "DRAFT" ? (
              editor(course)
            ) : (
              <p role="alert">
                {t.operations.edit} · {t.wireStatus[course.status]}
              </p>
            ))
          }
        </AsyncSection>
      ) : (
        editor()
      )}
    </>
  );
}
