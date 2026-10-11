"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import type { UserAdminDto } from "@/lib/types";

const KEY = "sporthub.desk.member";
const CHANGE_EVENT = "sporthub.desk.member.change";

function getStoredValue() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

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
  const storedValue = useSyncExternalStore(
    subscribe,
    getStoredValue,
    () => null,
  );
  const storedMember = useMemo(() => {
    if (!storedValue) return null;
    try {
      return JSON.parse(storedValue) as UserAdminDto;
    } catch {
      return null;
    }
  }, [storedValue]);
  const member = !loading && !user ? null : storedMember;

  const setMember = useCallback((next: UserAdminDto | null) => {
    try {
      if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  useEffect(() => {
    if (loading || user) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* storage bị chặn: chạy không lưu */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [loading, user]);

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
