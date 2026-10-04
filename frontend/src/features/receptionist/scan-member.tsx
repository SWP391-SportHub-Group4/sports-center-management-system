"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { parseMemberCode } from "@/lib/member-code";
import type { UserAdminDto } from "@/lib/types";
import { Card } from "@/components/ui";
import { CameraQrScanner } from "@/components/CameraQrScanner";

/**
 * Khung quét mã hội viên hiện ngay trên màn hình lễ tân. Quét xong chuyển sang màn Gym
 * check-in với hội viên đã chọn sẵn.
 */
export function ScanMemberPanel() {
  const { language } = useLanguage();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const en = language === "en";

  const onScan = useCallback(
    async (text: string) => {
      const id = parseMemberCode(text);
      if (!id) {
        setError(
          en ? "This QR is not a member code." : "Mã QR này không phải mã hội viên.",
        );
        return;
      }
      try {
        const found = await api.get<UserAdminDto>(`/api/users/${id}`);
        if (found.role !== "MEMBER") {
          setError(
            en ? "This code does not belong to a member." : "Mã này không thuộc hội viên.",
          );
          return;
        }
        setError(null);
        router.push(`/receptionist/gym-checkin?member=${found.userId}`);
      } catch {
        setError(
          en
            ? "Member not found or lookup failed."
            : "Không tìm thấy hội viên hoặc tra cứu thất bại.",
        );
      }
    },
    [en, router],
  );

  return (
    <Card title={en ? "Scan member code" : "Quét mã hội viên"}>
      <p className="small muted">
        {en
          ? "Point the camera at the QR on the member's dashboard."
          : "Đưa camera vào mã QR trên dashboard của hội viên."}
      </p>
      <CameraQrScanner onScan={(text) => void onScan(text)} />
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
