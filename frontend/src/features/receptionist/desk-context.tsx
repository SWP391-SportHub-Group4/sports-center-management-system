"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import type { UserAdminDto } from "@/lib/types";

const KEY = "sporthub.desk.member";

interface DeskContextValue {
  member: UserAdminDto | null;
  setMember: (member: UserAdminDto | null) => void;
}

export const DeskContext = createContext<DeskContextValue | null>(null);

/**
 * Hội viên đang phục vụ tại quầy, giữ nguyên khi lễ tân chuyển giữa Quầy, Bán dịch vụ, Hồ sơ… (HA-01).
 * Lưu theo tab (sessionStorage) để F5 không mất; đăng xuất thì xóa. Đổi người thì mọi form theo người cũ
 * (giỏ, điểm, OTP) bị bỏ vì các màn hình gắn `key` theo userId.
 */
export function DeskProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [member, setState] = useState<UserAdminDto | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw) as UserAdminDto);
    } catch {
      /* storage bị chặn: chạy không lưu */
    }
  }, []);

  const setMember = useCallback((next: UserAdminDto | null) => {
    setState(next);
    try {
      if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) setMember(null);
  }, [loading, user, setMember]);

  return (
    <DeskContext.Provider value={{ member, setMember }}>
      {children}
    </DeskContext.Provider>
  );
}

/** Hội viên đang chọn; ngoài khung quầy (không có provider) trả về null và setMember là no-op. */
export function useDeskMember(): DeskContextValue {
  return useContext(DeskContext) ?? { member: null, setMember: () => {} };
}
