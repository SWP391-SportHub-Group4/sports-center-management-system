"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import {
  PtPage,
  Specialty,
} from "@/features/pt/ui";

import {
  CoachProgress,
} from "@/features/pt/workout-result-form";

import {
  useLanguage,
} from "@/lib/language";

function Content() {
  const params =
    useSearchParams();

  const sessionId =
    params.get(
      "sessionId",
    ) ?? "";

  const memberId =
    params.get(
      "memberId",
    ) ?? "";

  const { t } =
    useLanguage();

  return (
    <Specialty>
      {(hasPt) =>
        hasPt ? (
          <CoachProgress
            key={`${sessionId}-${memberId}`}
            initialSessionId={
              sessionId
            }
            initialMemberId={
              memberId
            }
          />
        ) : (
          <p role="alert">
            {
              t.staffWork
                .specialtyWarning
            }
          </p>
        )
      }
    </Specialty>
  );
}

export default function Page() {
  return (
    <PtPage title="results">
      <Suspense>
        <Content />
      </Suspense>
    </PtPage>
  );
}