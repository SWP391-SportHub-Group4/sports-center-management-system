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

/** Khớp tên member enum UserRole của backend (PascalCase — SSOT §5.6). */
export type Role =
  | "SystemAdministrator"
  | "CenterManager"
  | "Coach"
  | "Member"
  | "Receptionist";

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
  /** true cho tới khi đọc xong phiên đã lưu — tránh chớp màn hình đăng nhập khi F5. */
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  loginWithGoogle: (idToken: string) => Promise<SessionUser>;
  register: (input: RegisterInput) => Promise<SessionUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export interface RegisterInput {
  email: string;
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
      // Không đọc/ghi được storage thì vẫn phải xoá phiên trong bộ nhớ.
    }
    setUser(null);
  }, []);

  // Khôi phục phiên từ localStorage. Token là JWT nên hết hạn được kiểm ở phía backend —
  // frontend không tự giải mã và tự quyết token còn hiệu lực hay không.
  useEffect(() => {
    // Đọc localStorage phải nằm trong effect chứ không phải initializer của useState:
    // trang được render sẵn trên máy chủ, nơi không có window, và khởi tạo khác nhau giữa hai
    // phía sẽ gây lệch hydration. Đây đúng là "đọc trạng thái từ một hệ thống ngoài khi mount".
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      const raw = window.localStorage.getItem(USER_STORAGE_KEY);

      if (token && raw) {
        setUser(JSON.parse(raw) as SessionUser);
      }
    } catch {
      // Dữ liệu hỏng thì bỏ qua và coi như chưa đăng nhập.
    } finally {
      setLoading(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Bất kỳ 401 nào từ API (token hết hạn, hoặc tài khoản vừa bị khoá theo BR-6) đều dẫn về
  // trang đăng nhập — đăng ký ở một nơi thay vì bắt lỗi ở từng màn hình.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      router.replace("/dang-nhap?ly-do=het-phien");
    });

    return () => setUnauthorizedHandler(null);
  }, [clearSession, router]);

  const persist = useCallback((response: AuthResponse) => {
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    } catch {
      // Phiên vẫn dùng được trong tab hiện tại, chỉ là không sống qua lần tải lại.
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
    router.replace("/dang-nhap");
  }, [clearSession, router]);

  /** Đọc lại hồ sơ sau khi người dùng tự sửa tên/số điện thoại. */
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
        // Bỏ qua — xem ghi chú ở persist().
      }

      return current ? next : current;
    });
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, loginWithGoogle, register, logout, refreshUser }),
    [user, loading, login, loginWithGoogle, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth phải nằm trong <AuthProvider>.");
  }

  return context;
}

/** Trang chủ mặc định của từng vai trò sau khi đăng nhập. */
export const HOME_BY_ROLE: Record<Role, string> = {
  Member: "/hoi-vien",
  Receptionist: "/le-tan",
  Coach: "/hlv",
  CenterManager: "/quan-ly",
  SystemAdministrator: "/quan-tri",
};

export const ROLE_LABEL: Record<Role, string> = {
  Member: "Hội viên",
  Receptionist: "Lễ tân",
  Coach: "Huấn luyện viên",
  CenterManager: "Quản lý trung tâm",
  SystemAdministrator: "Quản trị hệ thống",
};
