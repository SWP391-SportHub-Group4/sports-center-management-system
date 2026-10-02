"use client";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import type {
  MembershipPackageDto,
  MemberPackageDto,
  SportDto,
} from "@/lib/types";
import { CheckoutPanel } from "@/features/payments";
export function MembershipCatalog({
  purchase = false,
}: {
  purchase?: boolean;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const state = useApi(
    (signal) =>
      api.get<MembershipPackageDto[]>(
        purchase
          ? "/api/membership-packages"
          : "/api/membership-packages/public",
        { anonymous: !purchase, signal },
      ),
    [purchase],
  );
  return (
    <section id="pricing">
      <h2>{t.refactor.gym}</h2>
      {state.loading ? (
        <p>{t.refactor.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : !state.data?.length ? (
        <p>{t.refactor.empty}</p>
      ) : (
        <div className="refactor-grid">
          {state.data
            .filter((p) => p.isActive)
            .map((p) => (
              <Card key={p.packageId} title={p.name}>
                <p>
                  {formatMoney(p.price)} · {p.durationDays} {t.refactor.days}
                </p>
                <p>{p.description}</p>
                {purchase ? (
                  <button onClick={() => setSelected(p.packageId)}>
                    {t.refactor.buy}
                  </button>
                ) : user?.role === "Member" ? (
                  <Link href="/member/my-plans">{t.refactor.buy}</Link>
                ) : !user ? (
                  <Link href="/login?next=%2Fmember%2Fmy-plans">
                    {t.refactor.login}
                  </Link>
                ) : null}
              </Card>
            ))}
        </div>
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
export function PtPurchase({ packages }: { packages: MemberPackageDto[] }) {
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
            intent={{
              kind: "pt",
              body: {
                memberPackageId: packageId,
                coachId,
                frequencyPerWeek: frequency,
                priceVersion: quote.priceVersion,
              },
            }}
          />
        </>
      )}
    </Card>
  );
}
