"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import {
  PtPage,
  Specialty,
} from "@/features/pt/ui";

import {
  CoachHomework,
} from "@/features/pt/homework-editor";

import {
  useLanguage,
} from "@/lib/language";

function Content() {
  const { t } =
    useLanguage();

  const memberId =
    useSearchParams().get(
      "memberId",
    ) ?? "";

  return (
    <Specialty>
      {(hasPt) =>
        hasPt ? (
          <CoachHomework
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
    <PtPage title="homework">
      <Suspense>
        <Content />
      </Suspense>
    </PtPage>
  );
}