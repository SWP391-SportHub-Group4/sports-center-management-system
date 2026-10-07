"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import {
  PtPage,
  Specialty,
} from "@/features/pt/ui";

import {
  TrainingPlans,
} from "@/features/pt/training-plans";

import { useLanguage } from "@/lib/language";

function Content() {
  const { t } = useLanguage();

  const memberId =
    useSearchParams().get(
      "memberId",
    ) ?? "";

  return (
    <Specialty>
      {(hasPt) =>
        hasPt ? (
          <TrainingPlans
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
    <PtPage title="plans">
      <Suspense>
        <Content />
      </Suspense>
    </PtPage>
  );
}