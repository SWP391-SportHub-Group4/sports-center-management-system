import type {
  MemberCommand,
  MemberRepository,
  MemberSnapshot,
} from "@/application/member/contracts";
import { bookingProblem } from "@/features/scheduling";
import { validateProfile } from "@/features/identity";
import { createSeed } from "./seed";

const KEY = "sporthub.member.demo.v1";
function isSnapshot(value: unknown): value is MemberSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as MemberSnapshot;
  return (
    v.version === 1 &&
    typeof v.profile?.fullName === "string" &&
    typeof v.profile?.id === "string" &&
    [
      "sessions",
      "enrollments",
      "packages",
      "catalog",
      "invoices",
      "coaches",
      "notifications",
      "history",
    ].every((k) => Array.isArray(v[k as keyof MemberSnapshot])) &&
    Array.isArray(v.training?.exercises) &&
    v.sessions.every(
      (s) => typeof s.id === "string" && Number.isFinite(Date.parse(s.startAt)),
    ) &&
    v.packages.every(
      (p) =>
        typeof p.id === "string" &&
        (p.remainingSessions === null || Number.isFinite(p.remainingSessions)),
    )
  );
}
export function createDemoRepository(): MemberRepository {
  let memory: MemberSnapshot | null = null;
  function read(): MemberSnapshot {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isSnapshot(parsed)) return parsed;
      }
    } catch {
      /* Browsers may block local storage; the demo still works in memory. */
    }
    return memory ?? createSeed();
  }
  return {
    async load() {
      memory = read();
      return memory;
    },
    async execute(command) {
      const state = structuredClone(read());
      applyCommand(state, command, Date.now());
      memory = state;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* Session-only fallback. */
      }
      return state;
    },
    subscribe(listener) {
      const handle = (event: StorageEvent) => {
        if (event.key === KEY) listener();
      };
      window.addEventListener("storage", handle);
      return () => window.removeEventListener("storage", handle);
    },
  };
}

export function applyCommand(
  state: MemberSnapshot,
  command: MemberCommand,
  now: number,
): void {
  if (command.type === "book") {
    const session = state.sessions.find((s) => s.id === command.sessionId);
    if (!session) throw new Error("Can't find the training session.");
    const problem = bookingProblem(
      session,
      state.sessions,
      state.enrollments,
      now,
    );
    if (problem) throw new Error(problem);
    const pack = state.packages.find((p) => p.id === command.memberPackageId);
    if (
      !pack ||
      pack.status !== "Active" ||
      Date.parse(pack.expiresAt) < Date.parse(session.startAt) ||
      pack.remainingSessions === 0
    )
      throw new Error(
        "Select the package which is in effect and the exercise is available for this session.",
      );
    if (pack.remainingSessions !== null) pack.remainingSessions -= 1;
    session.confirmedCount += 1;
    state.enrollments = state.enrollments.filter(
      (e) => e.sessionId !== session.id,
    );
    state.enrollments.push({
      sessionId: session.id,
      memberPackageId: pack.id,
      status: "Confirmed",
    });
  }
  if (command.type === "cancel") {
    const enrollment = state.enrollments.find(
      (e) => e.sessionId === command.sessionId && e.status === "Confirmed",
    );
    const session = state.sessions.find((s) => s.id === command.sessionId);
    if (!enrollment || !session)
      throw new Error("The enrollment is no longer in effect.");
    if (now >= Date.parse(session.startAt))
      throw new Error("The training session has begun.");
    const onTime = now <= Date.parse(session.cancellationDeadline);
    enrollment.status = onTime ? "CancelledOnTime" : "CancelledLate";
    session.confirmedCount = Math.max(0, session.confirmedCount - 1);
    const pack = state.packages.find(
      (p) => p.id === enrollment.memberPackageId,
    );
    if (onTime && pack && pack.remainingSessions !== null)
      pack.remainingSessions += 1;
  }
  if (command.type === "profile") {
    const errors = validateProfile(command.input);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    state.profile = {
      ...state.profile,
      ...command.input,
      fullName: command.input.fullName.trim(),
      phone: command.input.phone.trim(),
      goal: command.input.goal.trim(),
    };
  }
  if (command.type === "read") {
    const n = state.notifications.find((n) => n.id === command.notificationId);
    if (n) n.read = true;
  }
  if (command.type === "purchase") {
    const option = state.catalog.find((p) => p.id === command.packageId);
    if (!option) throw new Error("Training packages no longer exist.");
    if (
      state.packages.some(
        (p) => p.packageId === option.id && p.status === "PendingPayment",
      )
    )
      throw new Error("The package is waiting for payment at the counter.");
    state.packages.push({
      id: crypto.randomUUID(),
      packageId: option.id,
      name: option.name,
      status: "PendingPayment",
      expiresAt: "",
      remainingSessions: option.sessionLimit,
    });
    state.invoices.push({
      id: `DEMO-${crypto.randomUUID().slice(0, 8)}`,
      packageName: option.name,
      total: option.price,
      status: "Issued",
      createdAt: new Date(now).toISOString(),
    });
  }
}
