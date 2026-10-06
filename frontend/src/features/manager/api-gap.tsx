"use client";
import { useLanguage } from "@/lib/language";

export function ApiGap({ code, message }: { code: string; message: string }) {
  const { t } = useLanguage();
  return (
    <div className="alert alert--info" role="note">
      <strong>
        {t.managerOperations.waitingApi} · {code}
      </strong>
      <p>{message}</p>
    </div>
  );
}
