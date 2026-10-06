"use client";
import { findSportWithService } from "@/lib/sports";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { Button } from "@/components/primitives/Button";
import type { MemberPackageDto, SportDto } from "@/lib/types";
import { CheckoutPanel } from "@/features/payments";
import {
  catalogContentLanguage,
  parseMembershipCatalog,
} from "./catalog-content";
import styles from "./catalog.module.css";
export function MembershipCatalog({
  purchase = false,
}: {
  purchase?: boolean;
}) {
  const { t, language } = useLanguage();
  const text = (vi: string, en: string) => (language === "vi" ? vi : en);
  const { user } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const state = useApi(
    async (signal) =>
      parseMembershipCatalog(
        await api.get<unknown>(
          purchase
            ? "/api/membership-packages"
            : "/api/membership-packages/public",
          { anonymous: !purchase, signal },
        ),
      ),
    [purchase],
  );
  const activePackages =
    state.data?.filter((packageItem) => packageItem.isActive) ?? [];
  return (
    <section id="pricing" className={styles.catalog} aria-busy={state.loading}>
      <h2>{text("Gói Gym đang mở bán", "Gym membership packages")}</h2>
      {state.loading ? (
        <p role="status">
          {text("Đang tải danh mục gói…", "Loading available packages…")}
        </p>
      ) : state.error ? (
        <div role="alert">
          <p>
            {state.error.status === 429
              ? text(
                  "Bạn tải danh mục quá nhiều lần. Vui lòng đợi một chút rồi thử lại.",
                  "Too many requests. Please wait a moment before reloading the packages.",
                )
              : state.error.status === 401 || state.error.status === 403
                ? text(
                    "Hiện bạn chưa thể truy cập danh mục này. Bạn có thể xem khóa học hoặc thử lại sau.",
                    "You cannot access this catalog right now. You can browse courses or try again later.",
                  )
                : text(
                    "Chưa tải được danh mục gói. Thử lại để xem giá và điều kiện mua.",
                    "We could not load the packages. Try again to see prices and purchase conditions.",
                  )}
          </p>
          <Button variant="secondary" onClick={state.reload}>
            {text("Tải lại danh mục", "Reload packages")}
          </Button>
          {purchase && state.error.status === 401 && (
            <p>
              <Link href="/login?next=%2Fmember%2Fmy-plans">
                {text(
                  "Đăng nhập lại để chọn gói",
                  "Sign in again to choose a package",
                )}
              </Link>
            </p>
          )}
          <p>
            <Link href="/courses">
              {text("Xem khóa học", "Browse courses")}
            </Link>
          </p>
        </div>
      ) : !activePackages.length ? (
        <p role="status">
          {text(
            "Hiện chưa có gói đang mở bán. Bạn có thể xem các khóa cầu lông và bóng rổ.",
            "No packages are available right now. You can browse badminton and basketball courses.",
          )}{" "}
          <Link href="/courses">{text("Xem khóa học", "Browse courses")}</Link>
        </p>
      ) : (
        <>
          {!purchase && (
            <p>
              {text(
                "Tên gói và mô tả do trung tâm cung cấp. Đọc quyền lợi và điều kiện của từng gói trước khi chọn mua.",
                "Package names and descriptions are published by the center and may be in Vietnamese. Read each package’s benefits and conditions before choosing.",
              )}
            </p>
          )}
          <div className="refactor-grid">
            {activePackages.map((p) => (
              <Card
                key={p.packageId}
                title={
                  <h3
                    lang={catalogContentLanguage(p.name, p.nameLanguage)}
                    dir="auto"
                  >
                    {p.name}
                  </h3>
                }
              >
                <p>
                  {formatMoney(p.price)} · {p.durationDays} {t.refactor.days}
                </p>
                {p.description?.trim() ? (
                  <p
                    lang={catalogContentLanguage(
                      p.description,
                      p.descriptionLanguage,
                    )}
                    dir="auto"
                  >
                    {p.description}
                  </p>
                ) : (
                  <p>
                    {text(
                      "Trung tâm chưa cung cấp mô tả. Kiểm tra quyền lợi trước khi mua.",
                      "The center has not provided a description. Check the benefits before buying.",
                    )}
                  </p>
                )}
                {purchase ? (
                  <button onClick={() => setSelected(p.packageId)}>
                    {text("Kiểm tra & thanh toán", "Review & checkout")}
                  </button>
                ) : user?.role === "Member" ? (
                  <Link href="/member/my-plans">
                    {text("Đến trang chọn gói", "Go to package selection")}
                  </Link>
                ) : !user ? (
                  <Link href="/login?next=%2Fmember%2Fmy-plans">
                    {text(
                      "Đăng nhập để chọn gói",
                      "Sign in to choose a package",
                    )}
                  </Link>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      )}
      {selected && (
        <CheckoutPanel
          key={selected}
          intent={{
            kind: "membership",
            body: { packageId: selected, allowStacking: false },
          }}
        />
      )}
      <p>{t.refactor.ptSeparate}</p>
    </section>
  );
}
interface PtQuote {
  memberPackageId: string;
  coachId: string;
  frequencyPerWeek: number;
  totalQuota: number;
  pricePerSession: number;
  totalPrice: number;
  priceVersion: string;
  validityEndDate: string;
}
export function PtPurchase({
  packages,
  memberId,
}: {
  packages: MemberPackageDto[];
  memberId?: string;
}) {
  const { t } = useLanguage();
  const [packageId, setPackage] = useState("");
  const [coachId, setCoach] = useState("");
  const [frequency, setFrequency] = useState(1);
  const [quote, setQuote] = useState<PtQuote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  const ptSport = findSportWithService(sports.data, "PERSONAL_TRAINING");
  const coaches = useApi(
    (signal) =>
      ptSport
        ? api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
            signal,
            query: { service: "PERSONAL_TRAINING" },
          })
        : Promise.resolve([]),
    [ptSport?.sportId],
  );
  return (
    <Card title={t.refactor.pt}>
      <p>{t.refactor.ptSeparate}</p>
      <label>
        {t.refactor.gym}
        <select
          value={packageId}
          onChange={(e) => {
            setPackage(e.target.value);
            setQuote(null);
          }}
        >
          <option value="">—</option>
          {packages
            .filter((p) => p.isUsable && p.status === "ACTIVE")
            .map((p) => (
              <option key={p.memberPackageId} value={p.memberPackageId}>
                {p.packageName} · {formatDate(p.endDate)}
              </option>
            ))}
        </select>
      </label>
      <label>
        {t.refactor.coach}
        <select
          value={coachId}
          onChange={(e) => {
            setCoach(e.target.value);
            setQuote(null);
          }}
        >
          <option value="">—</option>
          {coaches.data?.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.fullName}
            </option>
          ))}
        </select>
      </label>
      {coaches.error && <p role="alert">{coaches.error.message}</p>}
      <label>
        {t.refactor.frequency}
        <select
          value={frequency}
          onChange={(e) => {
            setFrequency(Number(e.target.value));
            setQuote(null);
          }}
        >
          {[1, 2, 3].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn--secondary"
        disabled={busy || !packageId || !coachId}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setQuote(
              await api.post<PtQuote>("/api/checkouts/pt/quote", {
                memberPackageId: packageId,
                coachId,
                frequencyPerWeek: frequency,
                targetMemberId: memberId,
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.refactor.quote}
      </button>
      {error && <p role="alert">{error}</p>}
      {quote && (
        <>
          <p>
            {quote.totalQuota} {t.refactor.quota} ×{" "}
            {formatMoney(quote.pricePerSession)} ={" "}
            {formatMoney(quote.totalPrice)} ·{" "}
            {formatDate(quote.validityEndDate)}
          </p>
          <CheckoutPanel
            key={`${packageId}-${coachId}-${frequency}-${quote.priceVersion}`}
            memberId={memberId}
            intent={{
              kind: "pt",
              body: {
                memberPackageId: packageId,
                coachId,
                frequencyPerWeek: frequency,
                priceVersion: quote.priceVersion,
                targetMemberId: memberId,
              },
            }}
          />
        </>
      )}
    </Card>
  );
}
