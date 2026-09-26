"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { api, setUnauthorizedHandler, TOKEN_STORAGE_KEY } from "./apiClient";

/** Khớp tên member enum UserRole of backend (PascalCase — SSOT §5.6). */
export type Role =
  "SystemAdministrator" | "CenterManager" | "Coach" | "Member" | "Receptionist";

export interface SessionUser {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
}

interface AuthResponse {
  accessToken: string;
  user: SessionUser;
}

interface AuthContextValue {
  user: SessionUser | null;
  /** true for tới when read xong phiên save — tránh chớp màn hình đăng nhập when F5. */
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  loginWithGoogle: (idToken: string) => Promise<SessionUser>;
  register: (input: RegisterInput) => Promise<SessionUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export interface RegisterInput {
  email: string;
  otpCode: string;
  password: string;
  fullName: string;
  phone?: string;
}

const USER_STORAGE_KEY = "sporthub.user";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // Unable to read/ghi storage thì still must xoá phiên in bộ nhớ.
    }
    setUser(null);
  }, []);

  // Khôi phục phiên from localStorage. Token là JWT so hết deadline kiểm ở phía backend —
  // frontend not tự giải mã and tự quyết token còn hiệu lực hay không.
  useEffect(() => {
    // Đọc localStorage must nằm in effect chứ not must initializer of useState:
    // trang render sẵn on máy chủ, nơi by not have window, and khởi create khác nhau giữa hai
    // phía will gây lệch hydration. Đây đúng là "read status from a system ngoài when mount".
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      const raw = window.localStorage.getItem(USER_STORAGE_KEY);

      if (token && raw) {
        setUser(JSON.parse(raw) as SessionUser);
      }
    } catch {
      // Dữ liệu hỏng thì bỏ qua and coi như not yet đăng nhập.
    } finally {
      setLoading(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Bất kỳ 401 nào from API (token hết deadline, or account vừa bị khoá according to BR-6) đều dẫn về
  // trang đăng nhập — register ở a nơi thay because bắt lỗi ở each màn hình.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      router.replace("/login?reason=session-expired");
    });

    return () => setUnauthorizedHandler(null);
  }, [clearSession, router]);

  const persist = useCallback((response: AuthResponse) => {
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      window.localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify(response.user),
      );
    } catch {
      // Phiên still used in tab current, only là not sống qua times load again.
    }
    setUser(response.user);

    return response.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      persist(
        await api.post<AuthResponse>(
          "/api/auth/login",
          { email, password },
          { anonymous: true },
        ),
      ),
    [persist],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) =>
      persist(
        await api.post<AuthResponse>(
          "/api/auth/google",
          { idToken },
          { anonymous: true },
        ),
      ),
    [persist],
  );

  const register = useCallback(
    async (input: RegisterInput) =>
      persist(
        await api.post<AuthResponse>("/api/auth/register", input, {
          anonymous: true,
        }),
      ),
    [persist],
  );

  const logout = useCallback(() => {
    clearSession();
    router.replace("/login");
  }, [clearSession, router]);

  /** Đọc again profile after user tự edit tên/số điện thoại. */
  const refreshUser = useCallback(async () => {
    const me = await api.get<{
      userId: string;
      email: string;
      fullName: string;
      role: Role;
    }>("/api/users/me");

    setUser((current) => {
      const next = {
        userId: me.userId,
        email: me.email,
        fullName: me.fullName,
        role: me.role,
      };

      try {
        window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Bỏ qua — view ghi chú ở persist().
      }

      return current ? next : current;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, loginWithGoogle, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be in <AuthProvider>.");
  }

  return context;
}

/** Home default of each role after đăng nhập. */
export const HOME_BY_ROLE: Record<Role, string> = {
  Member: "/member",
  Receptionist: "/receptionist",
  Coach: "/coach",
  CenterManager: "/manager",
  SystemAdministrator: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  Member: "Member",
  Receptionist: "Receptionist",
  Coach: "Coach",
  CenterManager: "Center Manager",
  SystemAdministrator: "System Administrator",
};
