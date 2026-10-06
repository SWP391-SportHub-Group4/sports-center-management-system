"use client";
import { useAuth } from "@/lib/auth";
import { useState, type PointerEvent } from "react";
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

function PublicMembershipCard({
  plan,
  index,
  dayLabel,
  sessionLabel,
  benefitLabel,
  revealHint,
  fallbackBenefit,
  action,
}: {
  plan: {
    packageId: number;
    name: string;
    price: number;
    durationDays: number;
    sessionLimit: number | null;
    description: string | null;
    nameLanguage?: string | null;
    descriptionLanguage?: string | null;
  };
  index: number;
  dayLabel: string;
  sessionLabel: string;
  benefitLabel: string;
  revealHint: string;
  fallbackBenefit: string;
  action: { href: string; label: string } | null;
}) {
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;

    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    card.style.setProperty(
      "--pointer-x",
      `${((event.clientX - bounds.left) / bounds.width) * 100}%`,
    );
    card.style.setProperty(
      "--pointer-y",
      `${((event.clientY - bounds.top) / bounds.height) * 100}%`,
    );

    const benefit = card.querySelector<HTMLElement>("[data-benefit-copy]");
    if (benefit) {
      const benefitBounds = benefit.getBoundingClientRect();
      benefit.style.setProperty(
        "--benefit-x",
        `${event.clientX - benefitBounds.left}px`,
      );
      benefit.style.setProperty(
        "--benefit-y",
        `${event.clientY - benefitBounds.top}px`,
      );
    }
    card.style.setProperty("--benefit-reveal", "1");
  };

  return (
    <article
      className={styles.publicPlanCard}
      aria-labelledby={`membership-plan-${plan.packageId}`}
      tabIndex={0}
      onPointerMove={onPointerMove}
      onPointerLeave={(event) =>
        event.currentTarget.style.setProperty("--benefit-reveal", "0")
      }
    >
      <span className={styles.publicPlanIndex}>
        {String(index + 1).padStart(2, "0")}
        <span aria-hidden="true"> / </span>
        MEMBERSHIP
      </span>
      <h3
        id={`membership-plan-${plan.packageId}`}
        lang={catalogContentLanguage(plan.name, plan.nameLanguage)}
        dir="auto"
      >
        {plan.name}
      </h3>
      <div className={styles.publicPlanPrice}>
        <strong>{formatMoney(plan.price)}</strong>
        <span>
          {plan.durationDays} {dayLabel}
          {plan.sessionLimit !== null &&
            ` · ${plan.sessionLimit} ${sessionLabel}`}
        </span>
      </div>
      <div className={styles.benefitReveal}>
        <span className={styles.benefitLabel} aria-hidden="true">
          <span className={styles.benefitDot} />
          {benefitLabel}
          <span className={styles.revealHint}>{revealHint}</span>
        </span>
        <p
          className={styles.benefitCopy}
          data-benefit-copy
          lang={catalogContentLanguage(
            plan.description ?? "",
            plan.descriptionLanguage,
          )}
          dir="auto"
        >
          {plan.description?.trim() || fallbackBenefit}
        </p>
      </div>
      {action && (
        <Link className={styles.publicPlanAction} href={action.href}>
          {action.label}
          <span aria-hidden="true">↗</span>
        </Link>
      )}
    </article>
  );
}

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
    <section
      id="pricing"
      className={`${styles.catalog} ${!purchase ? styles.publicCatalog : ""}`}
      aria-busy={state.loading}
    >
      {purchase && (
        <h2>{text("Gói Gym đang mở bán", "Gym membership packages")}</h2>
      )}
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
                    "You cannot access this catalog right now. You can explore programs or try again later.",
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
            <Link href="/#activities">
              {text("Xem các môn tập", "Explore programs")}
            </Link>
          </p>
        </div>
      ) : !activePackages.length ? (
        <p role="status">
          {text(
            "Hiện chưa có gói đang mở bán. Bạn có thể xem các môn tập đang hoạt động.",
            "No packages are available right now. You can explore active programs.",
          )}{" "}
          <Link href="/#activities">
            {text("Xem các môn tập", "Explore programs")}
          </Link>
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
          {purchase ? (
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
                  <button onClick={() => setSelected(p.packageId)}>
                    {text("Kiểm tra & thanh toán", "Review & checkout")}
                  </button>
                </Card>
              ))}
            </div>
          ) : (
            <div className={styles.publicPlanGrid}>
              {activePackages.map((plan, index) => (
                <PublicMembershipCard
                  key={plan.packageId}
                  plan={plan}
                  index={index}
                  dayLabel={t.refactor.days}
                  sessionLabel={text("buổi", "sessions")}
                  benefitLabel={text("QUYỀN LỢI", "BENEFITS")}
                  revealHint={text("Rê chuột để khám phá", "Move to reveal")}
                  fallbackBenefit={text(
                    "Trung tâm chưa cung cấp mô tả quyền lợi cho gói này.",
                    "The center has not published benefits for this plan yet.",
                  )}
                  action={
                    user?.role === "Member"
                      ? {
                          href: "/member/my-plans",
                          label: text("Chọn gói", "Choose plan"),
                        }
                      : !user
                        ? {
                            href: "/login?next=%2Fmember%2Fmy-plans",
                            label: text("Đăng nhập để mua", "Sign in to join"),
                          }
                        : null
                  }
                />
              ))}
            </div>
          )}
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
  const ptSport = sports.data?.find((s) => s.operationType === "ONE_ON_ONE");
  const coaches = useApi(
    (signal) =>
      ptSport
        ? api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
            signal,
            query: { sportId: ptSport.sportId },
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
