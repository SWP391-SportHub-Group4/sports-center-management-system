"use client";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
export function HoldCountdown({
  expiresAtUtc,
  serverNow,
}: {
  expiresAtUtc: string;
  serverNow: number;
}) {
  const { t } = useLanguage();
  const remaining = Math.max(
    0,
    Math.ceil((Date.parse(expiresAtUtc) - serverNow) / 1000),
  );
  return (
    <p>
      {t.refactor.expires}:{" "}
      <time dateTime={expiresAtUtc}>{formatDateTime(expiresAtUtc)}</time> ·{" "}
      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
    </p>
  );
}
