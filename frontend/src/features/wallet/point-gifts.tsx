"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { GiftClassFilter } from "./gift-class-filter";
import styles from "./point-gifts.module.css";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AsyncSection,
  Card,
  Dialog,
  Field,
  Pager,
  Table,
} from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import type { Paged } from "@/lib/types";

type Recipient = {
  memberId: string;
  name: string;
  email: string;
  requiresAgreement: boolean;
  alreadyGifted: boolean;
};
type Selected = Recipient & { points: string; memberAgreed: boolean };
type GiftFilters = {
  sports: { sportId: number; name: string }[];
  classes: { classId: number; sportId: number; name: string; code: string }[];
};
type GiftLimit = {
  fromDate: string;
  toDate: string;
  vndPerPoint: number;
  maxPoints: number;
};
const validPoints = (value: string) =>
  /^\d+$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0 &&
  Number(value) <= 2147483647;
type Intent = {
  batchId: string;
  incidentId?: string;
  reason: string;
  recipients: (Omit<Selected, "points"> & { points: number })[];
};
type Gift = {
  giftId: string;
  memberName: string;
  email: string;
  points: number;
  reason: string;
  managerName: string;
  createdAtUtc: string;
  incidentId?: string;
};

function GiftHistory({
  incidentId,
  revision,
}: {
  incidentId?: string;
  revision: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<Paged<Gift>>("/api/manager/point-gifts", {
        signal,
        query: { incidentId, page, pageSize: 20 },
      }),
    [incidentId, page, revision],
  );
  return (
    <Card title={vi ? "Lịch sử tặng điểm" : "Gift history"}>
      <AsyncSection state={state}>
        {(data) => (
          <>
            {!data.totalCount ? (
              <p>
                {vi ? "Chưa có khoản tặng điểm nào." : "No points gifts yet."}
              </p>
            ) : (
              <Table
                headers={[
                  vi ? "Hội viên" : "Member",
                  vi ? "Điểm" : "Points",
                  vi ? "Lý do" : "Reason",
                  vi ? "Người tặng / Thời gian" : "Manager / Date",
                ]}
              >
                {data.items.map((g) => (
                  <tr key={g.giftId}>
                    <td>
                      {g.memberName}
                      <br />
                      <small>{g.email}</small>
                    </td>
                    <td>{formatPoints(g.points)}</td>
                    <td>
                      {g.reason}
                      {g.incidentId && (
                        <p>
                          <Link href={`/manager/incidents/${g.incidentId}`}>
                            {vi ? "Xem sự cố" : "View incident"}
                          </Link>
                        </p>
                      )}
                    </td>
                    <td>
                      {g.managerName}
                      <br />
                      {formatDateTime(g.createdAtUtc)}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              totalCount={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
    </Card>
  );
}

export function PointGifts({ onGifted }: { onGifted?: () => void }) {
  const params = useSearchParams();
  const incidentId = params.get("incidentId") || undefined;
  // Context changes remount the selection and recovery state rather than reusing another incident's draft.
  return (
    <GiftComposer
      key={incidentId ?? "general"}
      incidentId={incidentId}
      onGifted={onGifted}
    />
  );
}

function GiftComposer({
  incidentId,
  onGifted,
}: {
  incidentId?: string;
  onGifted?: () => void;
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const vi = language === "vi";
  const [keyword, setKeyword] = useState("");
  const [sportId, setSportId] = useState("");
  const [classId, setClassId] = useState("");
  const [allSelected, setAllSelected] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [selectingAll, setSelectingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, Selected>>({});
  const [points, setPoints] = useState("1");
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const storageKey = `sporthub:point-gift:${user?.userId}:${incidentId ?? "general"}`;
  const [pending, setPending] = useState<Intent | null>(() => {
    try {
      const draft = JSON.parse(
        sessionStorage.getItem(storageKey) ?? "null",
      ) as Intent | null;
      return draft?.batchId &&
        Array.isArray(draft.recipients) &&
        draft.incidentId === incidentId
        ? draft
        : null;
    } catch {
      return null;
    }
  });
  const [review, setReview] = useState<Intent | null>(pending);
  const limits = useApi(
    (signal) =>
      api.get<GiftLimit>("/api/manager/point-gifts/limits", { signal }),
    [revision],
  );
  const refreshLimit = limits.reload;
  useEffect(() => {
    window.addEventListener("focus", refreshLimit);
    return () => window.removeEventListener("focus", refreshLimit);
  }, [refreshLimit]);
  const withinLimit = (value: string) =>
    validPoints(value) &&
    !limits.loading &&
    !!limits.data &&
    Number(value) <= limits.data.maxPoints;
  const filters = useApi(
    (signal) =>
      api.get<GiftFilters>("/api/manager/point-gifts/filters", { signal }),
    [],
  );
  const recipients = useApi(
    (signal) =>
      api.get<Paged<Recipient>>("/api/manager/point-gifts/recipients", {
        signal,
        query: {
          incidentId,
          keyword,
          sportId: sportId && sportId !== "unregistered" ? sportId : undefined,
          unregistered: sportId === "unregistered" || undefined,
          classId: classId || undefined,
          page,
          pageSize: 20,
        },
      }),
    [incidentId, keyword, sportId, classId, page, revision],
  );
  const rows = Object.values(selected);
  const valid =
    withinLimit(points) &&
    rows.length > 0 &&
    reason.trim().length >= 3 &&
    reason.trim().length <= 1000 &&
    rows.every(
      (r) => withinLimit(r.points) && (!r.requiresAgreement || r.memberAgreed),
    );
  function filter(set: (s: string) => void, value: string) {
    set(value);
    setPage(1);
    setAllSelected(false);
    setBulkSelectedIds([]);
  }
  function remove(id: string) {
    setAllSelected(false);
    setSelected((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  async function selectAll(checked: boolean) {
    if (!checked) {
      setAllSelected(false);
      setSelected((current) => {
        const next = { ...current };
        for (const id of bulkSelectedIds) delete next[id];
        return next;
      });
      setBulkSelectedIds([]);
      return;
    }
    setSelectingAll(true);
    setError("");
    try {
      const next: Record<string, Selected> = { ...selected };
      const matchingIds: string[] = [];
      let currentPage = 1;
      let totalPages = 1;
      do {
        const result = await api.get<Paged<Recipient>>(
          "/api/manager/point-gifts/recipients",
          {
            query: {
              incidentId,
              keyword,
              sportId:
                sportId && sportId !== "unregistered" ? sportId : undefined,
              unregistered: sportId === "unregistered" || undefined,
              classId: classId || undefined,
              page: currentPage,
              pageSize: 100,
            },
          },
        );
        for (const recipient of result.items) {
          if (!recipient.alreadyGifted) {
            matchingIds.push(recipient.memberId);
            next[recipient.memberId] = selected[recipient.memberId] ?? {
              ...recipient,
              points,
              memberAgreed: false,
            };
          }
        }
        totalPages = Math.ceil(result.totalCount / result.pageSize);
        currentPage++;
      } while (currentPage <= totalPages);
      setSelected(next);
      setBulkSelectedIds(matchingIds);
      setAllSelected(matchingIds.length > 0);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : vi
            ? "Không tải được toàn bộ người nhận. Vui lòng thử lại."
            : "Could not load all recipients. Please retry.",
      );
    } finally {
      setSelectingAll(false);
    }
  }
  async function send() {
    if (!review || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    const intent = pending ?? review;
    setPending(intent);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(intent));
    } catch {
      /* Same intent remains in memory. */
    }
    try {
      await api.post("/api/manager/point-gifts", {
        batchId: intent.batchId,
        incidentId: intent.incidentId,
        reason: intent.reason,
        recipients: intent.recipients.map((r) => ({
          memberId: r.memberId,
          points: r.points,
          memberAgreed: r.memberAgreed,
        })),
      });
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Completion is still idempotent on retry. */
      }
      setPending(null);
      setReview(null);
      setSelected({});
      setAllSelected(false);
      setBulkSelectedIds([]);
      setReason("");
      setRevision((r) => r + 1);
      onGifted?.();
      setSuccess(
        vi
          ? "Đã cộng điểm vào ví và gửi thông báo cho hội viên."
          : "Points added to the members’ wallets and notifications queued.",
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "point_gift_limit_exceeded")
        limits.reload();
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408 &&
        e.status !== 429
      ) {
        setPending(null);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Keep the review available. */
        }
      }
      setError(
        e instanceof Error
          ? e.message
          : vi
            ? "Không thể tặng điểm. Hãy thử lại."
            : "Could not send the gift. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function closeReview() {
    if (busy || pending) return;
    setReview(null);
    setError("");
  }
  function changeCommonPoints(value: string) {
    setPoints(value);
    setSelected((current) =>
      Object.fromEntries(
        Object.values(current).map((r) => [
          r.memberId,
          { ...r, points: value },
        ]),
      ),
    );
  }
  const invalidPoints = vi
    ? "Điểm không hợp lệ. Nhập số nguyên dương."
    : "Invalid points. Enter a positive whole number.";
  function pointError(value: string) {
    if (!validPoints(value)) return invalidPoints;
    if (limits.data && Number(value) > limits.data.maxPoints)
      return vi
        ? `Tối đa ${formatPoints(limits.data.maxPoints)} điểm mỗi người trong mỗi lần tặng.`
        : `Cannot exceed ${formatPoints(limits.data.maxPoints)} points per recipient per submission.`;
    return undefined;
  }
  return (
    <div className="stack">
      <Card title={vi ? "Tặng điểm" : "Gift points"}>
        <p>
          {vi
            ? "Chọn người nhận, nhập số điểm và lý do. Xác nhận sẽ cộng điểm ngay vào ví."
            : "Select recipients, enter points and a reason. Confirmation adds points to their wallets immediately."}
        </p>
        {incidentId && (
          <p>
            <Link href={`/manager/incidents/${incidentId}`}>
              {vi
                ? "Đang hỗ trợ sự cố Gym — xem chi tiết"
                : "Supporting a Gym incident: view details"}
            </Link>{" "}
            ·{" "}
            <Link href="/manager/points">
              {vi ? "Tặng điểm ngoài sự cố" : "Gift outside this incident"}
            </Link>
          </p>
        )}
        {success && <p role="status">{success}</p>}
        {error && !review && <p role="alert">{error}</p>}
        <fieldset className={styles.form} disabled={!!review || selectingAll}>
          <div className={styles.filters}>
            <Field label={vi ? "Tên hoặc email" : "Name or email"}>
              <input
                value={keyword}
                onChange={(e) => filter(setKeyword, e.target.value)}
              />
            </Field>
            <Field label={vi ? "Môn thể thao" : "Sport"}>
              <select
                value={sportId}
                disabled={filters.loading || !!filters.error}
                onChange={(e) => {
                  filter(setSportId, e.target.value);
                  setClassId("");
                }}
              >
                <option value="">{vi ? "Tất cả môn" : "All sports"}</option>
                <option value="unregistered">
                  {vi ? "Chưa đăng ký" : "Not registered"}
                </option>
                {filters.data?.sports.map((p) => (
                  <option key={p.sportId} value={p.sportId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <GiftClassFilter
              value={classId}
              onChange={(value) => filter(setClassId, value)}
              classes={(filters.data?.classes ?? []).filter(
                (item) => !sportId || item.sportId === Number(sportId),
              )}
              disabled={
                filters.loading ||
                !!filters.error ||
                !!review ||
                selectingAll ||
                sportId === "unregistered"
              }
              vi={vi}
            />
          </div>
          {filters.error && (
            <p role="alert">
              {vi ? "Không tải được bộ lọc." : "Could not load filters."}{" "}
              <button
                type="button"
                className="btn btn--secondary"
                onClick={filters.reload}
              >
                {vi ? "Thử lại" : "Retry"}
              </button>
            </p>
          )}
          <p className="small muted">
            {vi
              ? "Tặng điểm cho mọi hội viên, kể cả chưa mua gì. Các lựa chọn được giữ khi tìm kiếm hoặc đổi bộ lọc."
              : "Gift points to any member, including those with no purchases. Selections are kept when searching or changing filters."}
          </p>
          <ActivitySwitch
            checked={allSelected}
            onChange={(checked) => void selectAll(checked)}
            disabled={
              selectingAll ||
              recipients.loading ||
              !!recipients.error ||
              !recipients.data?.totalCount
            }
            label={vi ? "Chọn tất cả người nhận" : "Select all recipients"}
            hint={
              selectingAll
                ? vi
                  ? "Đang tải toàn bộ người nhận…"
                  : "Loading all recipients…"
                : vi
                  ? "Chọn mọi hội viên khớp bộ lọc trên tất cả các trang."
                  : "Select every matching member across all pages."
            }
          />
          <span className="small muted" role="status">
            {selectingAll
              ? vi
                ? "Đang chọn…"
                : "Selecting…"
              : `${rows.length} ${vi ? "người đã chọn" : "recipients selected"}`}
          </span>
          {rows.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSelected({});
                setAllSelected(false);
                setBulkSelectedIds([]);
              }}
            >
              {vi ? "Bỏ chọn tất cả" : "Clear selection"}
            </button>
          )}
          <AsyncSection state={recipients}>
            {(data) => (
              <>
                {!data.totalCount ? (
                  <p>
                    {vi
                      ? "Không có hội viên phù hợp. Thử đổi bộ lọc."
                      : "No matching members. Try changing the filters."}
                  </p>
                ) : (
                  <div className={styles.selectionTable}>
                    <Table
                      headers={[
                        vi ? "Hội viên" : "Member",
                        vi ? "Chọn" : "Select",
                      ]}
                    >
                      {data.items.map((r) => (
                        <tr key={r.memberId}>
                          <td>
                            {r.name}
                            <br />
                            <small>{r.email}</small>
                            {r.alreadyGifted && (
                              <p className="small muted">
                                {vi
                                  ? "Đã tặng cho sự cố này"
                                  : "Already gifted for this incident"}
                              </p>
                            )}
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`${vi ? "Chọn" : "Select"} ${r.name}`}
                              checked={!!selected[r.memberId]}
                              disabled={r.alreadyGifted}
                              onChange={(e) =>
                                e.target.checked
                                  ? setSelected((current) => ({
                                      ...current,
                                      [r.memberId]: {
                                        ...r,
                                        points,
                                        memberAgreed: false,
                                      },
                                    }))
                                  : remove(r.memberId)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}
                <Pager
                  page={data.page}
                  pageSize={data.pageSize}
                  totalCount={data.totalCount}
                  onChange={setPage}
                />
              </>
            )}
          </AsyncSection>
          <section
            className="stack"
            aria-label={vi ? "Người nhận đã chọn" : "Selected recipients"}
          >
            <h3>
              {vi ? "Người nhận đã chọn" : "Selected recipients"} ({rows.length}
              )
            </h3>
            <div className={styles.commonPoints}>
              {limits.loading && (
                <p role="status">
                  {vi
                    ? "Đang tải giới hạn tặng điểm…"
                    : "Loading the gift limit…"}
                </p>
              )}
              {limits.error && (
                <div role="alert">
                  <p>
                    {vi
                      ? "Không tải được giới hạn tặng điểm. Vui lòng thử lại."
                      : "Could not load the gift limit. Please retry."}
                  </p>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={limits.reload}
                  >
                    {vi ? "Thử lại" : "Retry limit"}
                  </button>
                </div>
              )}
              {limits.data && (
                <p className="small muted">
                  {vi ? "Giới hạn mỗi người" : "Maximum per recipient"}:{" "}
                  {formatPoints(limits.data.maxPoints)} {vi ? "điểm" : "points"}{" "}
                  · {vi ? "Mỗi lần tặng" : "Per submission"} · 1{" "}
                  {vi ? "điểm" : "point"} ={" "}
                  {formatMoney(limits.data.vndPerPoint)}
                </p>
              )}
              <Field
                label={vi ? "Số điểm chung" : "Common points amount"}
                error={pointError(points)}
                hint={
                  vi
                    ? "Áp dụng cùng số điểm cho tất cả người nhận đã chọn."
                    : "The same points amount applies to all selected recipients."
                }
              >
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={limits.loading || !limits.data}
                  value={points}
                  onChange={(e) => changeCommonPoints(e.target.value)}
                />
              </Field>
            </div>
            {rows.some((r) => r.requiresAgreement) && (
              <div
                className="stack"
                role="group"
                aria-label={vi ? "Đồng ý nhận điểm" : "Recipient agreements"}
              >
                {rows
                  .filter((r) => r.requiresAgreement)
                  .map((r) => (
                    <label key={r.memberId}>
                      <input
                        type="checkbox"
                        checked={r.memberAgreed}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [r.memberId]: {
                              ...r,
                              memberAgreed: event.target.checked,
                            },
                          }))
                        }
                      />{" "}
                      {vi
                        ? "Member đã đồng ý nhận điểm"
                        : "Member agreed to receive points"}
                      : {r.name}
                    </label>
                  ))}
              </div>
            )}
            <Field
              label={
                vi ? "Lý do tặng điểm (bắt buộc)" : "Gift reason (required)"
              }
            >
              <textarea
                value={reason}
                minLength={3}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <p>
              {vi ? "Tổng điểm đã chọn" : "Selected points total"}:{" "}
              {rows.every((r) => validPoints(r.points))
                ? formatPoints(rows.reduce((n, r) => n + Number(r.points), 0))
                : "—"}
            </p>
            <button
              className="btn"
              disabled={!valid}
              onClick={() => {
                setError("");
                setSuccess("");
                setReview({
                  batchId: crypto.randomUUID(),
                  incidentId,
                  reason: reason.trim(),
                  recipients: rows.map((r) => ({
                    ...r,
                    points: Number(r.points),
                  })),
                });
              }}
            >
              {vi ? "Xem lại khoản tặng" : "Review gift"}
            </button>
          </section>
        </fieldset>
      </Card>
      {review &&
        createPortal(
          <Dialog
            title={vi ? "Xem lại khoản tặng" : "Review gift"}
            size="lg"
            onClose={closeReview}
            showCloseButton={!busy && !pending}
            description={
              vi
                ? "Kiểm tra danh sách người nhận, số điểm và lý do trước khi xác nhận."
                : "Check the recipients, gift amounts and reason before confirming."
            }
            footer={
              <div className="btn-row">
                {!pending && (
                  <button
                    className="btn btn--secondary"
                    disabled={busy}
                    onClick={closeReview}
                  >
                    {vi ? "Quay lại chỉnh sửa" : "Back to edit"}
                  </button>
                )}
                <button
                  className="btn"
                  disabled={
                    busy ||
                    (!pending &&
                      (limits.loading ||
                        !limits.data ||
                        review.recipients.some(
                          (r) => r.points > limits.data!.maxPoints,
                        )))
                  }
                  onClick={() => void send()}
                >
                  {busy
                    ? vi
                      ? "Đang gửi…"
                      : "Sending…"
                    : pending
                      ? vi
                        ? "Thử lại khoản tặng"
                        : "Retry gift"
                      : vi
                        ? "Xác nhận tặng điểm"
                        : "Confirm gift"}
                </button>
              </div>
            }
          >
            <div className="stack">
              <h3>{vi ? "Danh sách người nhận" : "Gift recipients"}</h3>
              <Table
                headers={[
                  vi ? "Hội viên" : "Member",
                  vi ? "Điểm được tặng" : "Gift points",
                ]}
              >
                {review.recipients.map((r) => (
                  <tr key={r.memberId}>
                    <td>
                      {r.name}
                      <br />
                      <small>{r.email}</small>
                    </td>
                    <td>{formatPoints(r.points)}</td>
                  </tr>
                ))}
              </Table>
              <section>
                <h3>{vi ? "Lý do tặng" : "Gift reason"}</h3>
                <p className={styles.reason}>{review.reason}</p>
              </section>
              {error && <p role="alert">{error}</p>}
              {pending && (
                <p role="status">
                  {vi
                    ? "Đang chờ xác nhận kết quả. Thử lại cùng khoản tặng để tránh cộng trùng."
                    : "The result is unconfirmed. Retry the same gift safely; points will not be added twice."}
                </p>
              )}
            </div>
          </Dialog>,
          document.body,
        )}
      <GiftHistory incidentId={incidentId} revision={revision} />
    </div>
  );
}
