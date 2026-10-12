"use client";

import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { ManagerCourseDto, PtSessionDto, UserAdminDto } from "@/lib/types";

export function CourseName({ id }: { id: number }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const state = useApi(
    () =>
      reference(user?.userId ?? "", `/api/manager/classes/${id}`, () =>
        api.get<ManagerCourseDto>(`/api/manager/classes/${id}`),
      ),
    [id, user?.userId],
  );
  return (
    <span>
      {state.data?.name ||
        (state.loading ? t.common.loading : t.managerAudit.nameUnavailable)}
    </span>
  );
}

// Share reference reads within the current account; names expire rather than becoming
// permanent snapshots. The ID stays in requests and never becomes display text.
const references = new Map<
  string,
  { expires: number; result: Promise<unknown> }
>();
function reference<T>(
  account: string,
  endpoint: string,
  load: () => Promise<T>,
): Promise<T> {
  const key = `${account}:${endpoint}`;
  const cached = references.get(key);
  if (cached && cached.expires > Date.now()) return cached.result as Promise<T>;
  if (references.size > 200) references.clear();
  const result = load().catch((error) => {
    references.delete(key);
    throw error;
  });
  references.set(key, { expires: Date.now() + 30000, result });
  return result;
}

export function MemberName({ id, name }: { id: string; name?: string | null }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const state = useApi(
    () =>
      name?.trim()
        ? Promise.resolve(name.trim())
        : reference(user?.userId ?? "", `/api/users/${id}`, async () => {
            const member = await api.get<UserAdminDto>(`/api/users/${id}`);
            return member.fullName?.trim() || member.email;
          }),
    [id, name, user?.userId],
  );
  return (
    <span aria-busy={state.loading || undefined}>
      {state.data ||
        (state.loading ? t.common.loading : t.managerAudit.nameUnavailable)}
    </span>
  );
}

export function PtSessionName({
  id,
  memberId,
}: {
  id: string;
  memberId?: string;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const state = useApi(async () => {
    const sessions = await reference(
      user?.userId ?? "",
      `pt-sessions:${memberId ?? "all"}`,
      async () => {
        const rows: PtSessionDto[] = [];
        let page = 1;
        while (page <= 20) {
          const next = await api.get<PtSessionDto[]>(
            "/api/manager/pt-sessions",
            { query: { memberId, page, pageSize: 100 } },
          );
          rows.push(...next);
          if (next.length < 100) break;
          page++;
        }
        return rows;
      },
    );
    return sessions.find((session) => session.sessionId === id) ?? null;
  }, [id, memberId, user?.userId]);
  return (
    <span aria-busy={state.loading || undefined}>
      {state.data
        ? `${formatDateTime(state.data.startAtUtc)} · ${state.data.coachName}`
        : state.loading
          ? t.common.loading
          : t.managerAudit.nameUnavailable}
    </span>
  );
}
