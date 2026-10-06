"use client";
import { useState } from "react";
import Link from "next/link";

import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";

import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { WalletBalance } from "@/features/wallet";
import { WalletLedger } from "@/features/wallet";
import { walletApi } from "@/features/wallet";
import { InvoiceList } from "@/features/payments";
import { MutationFeedback, useMutation } from "@/features/operations";

import type { SportDto } from "@/lib/types";
import { rentalApi } from "./api";
import { RentalList } from "./rental-list";
export function ExternalDashboard() {
  const { t, language } = useLanguage();
  const l = t.operations;
  const profile = useApi((s) => rentalApi.profile(s), []);
  const wallet = useApi((s) => walletApi.balance(s), []);
  return (
    <>
      <Card title={l.profile}>
        <AsyncSection state={profile}>
          {(p) => (
            <>
              <StatusChip value={p.approvalStatus} />
              <p>{p.reviewNote}</p>
              {p.approvalStatus === "APPROVED" ? (
                <Link className="btn" href="/external-coach/book">
                  {language === "vi"
                    ? "Tìm sân phù hợp"
                    : "Find an available court"}
                </Link>
              ) : (
                <p>{l.approvalRequired}</p>
              )}
              <button className="btn btn--secondary" onClick={profile.reload}>
                {l.refresh}
              </button>
            </>
          )}
        </AsyncSection>
      </Card>
      <Card title={l.wallet}>
        <AsyncSection state={wallet}>
          {(w) => <WalletBalance balance={w} />}
        </AsyncSection>
        <Link className="btn btn--ghost" href="/external-coach/wallet">
          {l.history}
        </Link>
      </Card>
      <RentalList />
    </>
  );
}
export function ExternalWallet() {
  const state = useApi((s) => walletApi.balance(s), []);
  return (
    <>
      <AsyncSection state={state}>
        {(w) => <WalletBalance balance={w} />}
      </AsyncSection>
      <WalletLedger />
    </>
  );
}
export function ExternalProfile() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => rentalApi.profile(s), []);
  const sports = useApi(
    (s) => api.get<SportDto[]>("/api/sports", { signal: s }),
    [],
  );
  const [bio, setBio] = useState<string | null>(null);
  const mutation = useMutation();
  return (
    <AsyncSection state={state}>
      {(p) => (
        <Card title={l.profile}>
          <p>
            {p.fullName} · {p.email} · {p.phone}
          </p>
          <StatusChip value={p.approvalStatus} />
          <p>{p.reviewNote}</p>
          <p>
            {l.specialties}:{" "}
            {p.sportIds
              .map(
                (id) => sports.data?.find((s) => s.sportId === id)?.name ?? id,
              )
              .join(", ")}
          </p>
          <p>{l.profileHint}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutation.run(() =>
                  api.put("/api/external-coaches/me", {
                    bio: bio ?? p.bio ?? "",
                  }),
                )
              ) {
                state.reload();
                setBio(null);
              }
            }}
          >
            <Field label={l.bio}>
              <textarea
                maxLength={1000}
                value={bio ?? p.bio ?? ""}
                onChange={(e) => setBio(e.target.value)}
              />
            </Field>
            <button className="btn" disabled={mutation.busy}>
              {l.save}
            </button>
          </form>
          <MutationFeedback mutation={mutation} />
          <Link className="btn btn--ghost" href="/account">
            {t.navigation.myAccount}
          </Link>
        </Card>
      )}
    </AsyncSection>
  );
}
export function ExternalInvoices() {
  return <InvoiceList rental />;
}
