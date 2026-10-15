"use client";

import { MemberSchedule } from "@/features/member";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { TrainingProfile } from "./training-profile";

/** Fitness profile bookmark. */
export function MemberTrainingLite() {
  const { values } = useUrlQuery({ tab: "sessions" });
  return values.tab === "profile" ? <TrainingProfile /> : <MemberSchedule />;
}
