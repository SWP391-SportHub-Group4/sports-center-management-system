import type { MemberProfile, ProfileInput } from "@/features/identity";
import type {
  MemberPackage,
  PackageOption,
  Invoice,
} from "@/features/membership";
import type { ClassSession, Enrollment } from "@/features/scheduling";
import type { Coach } from "@/features/coaches";
import type { MemberNotification } from "@/features/notifications";
import type { TrainingPlan, TrainingRecord } from "@/features/training";

export interface MemberSnapshot {
  version: 1;
  profile: MemberProfile;
  sessions: ClassSession[];
  enrollments: Enrollment[];
  packages: MemberPackage[];
  catalog: PackageOption[];
  invoices: Invoice[];
  coaches: Coach[];
  notifications: MemberNotification[];
  training: TrainingPlan;
  history: TrainingRecord[];
}
export type MemberCommand =
  | { type: "book"; sessionId: string; memberPackageId: string }
  | { type: "cancel"; sessionId: string }
  | { type: "profile"; input: ProfileInput }
  | { type: "purchase"; packageId: string }
  | { type: "read"; notificationId: string };
export interface MemberRepository {
  load(): Promise<MemberSnapshot>;
  execute(command: MemberCommand): Promise<MemberSnapshot>;
  subscribe(listener: () => void): () => void;
}
