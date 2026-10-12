"use client";

import { MemberSchedule } from "@/features/member";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { TrainingProfile } from "./training-profile";

/** Keep the fitness profile bookmark while PT sessions are retired. */
export function MemberTrainingLite() {
  const { values } = useUrlQuery({ tab: "sessions" });
  return values.tab === "profile" ? <TrainingProfile /> : <MemberSchedule />;
}
