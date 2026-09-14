export interface TrainingRecord {
  id: string;
  className: string;
  date: string;
  attendance: "Present" | "Absent";
  result?: string;
  coachComment?: string;
}
export interface TrainingPlan {
  goal: string;
  coach: string;
  exercises: { name: string; sets: number; reps: string }[];
  comment: string;
}
