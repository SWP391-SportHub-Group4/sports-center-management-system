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
  | "SystemAdministrator"
  | "CenterManager"
  | "Coach"
  | "Member"
  | "Receptionist"
  | "ExternalCoach";


export interface SessionUser {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  /** Authoritative specialties from the API. */
  sportIds: number[];
  approvalStatus?:
    "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUSPENDED" | null;
}

export interface AuthResponse {
  accessToken: string;
  user: WireSessionUser;
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
  updateToken: (token: string) => void;
  acceptSession: (response: AuthResponse) => SessionUser;
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

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let token: string | null = null;
    try {
      token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      /* No persisted session. */
    }
    if (token) {
      api
        .get<WireSessionUser>("/api/users/me", { signal: controller.signal })
        .then((me) => {
          if (active) setUser(adaptSessionUser(me));
        })
        .catch(() => {
          if (active) clearSession();
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [clearSession]);

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
    const next = adaptSessionUser(response.user);
    setUser(next);

    return next;
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
    async (idToken: string) => {
      const response = await api.post<AuthResponse | GoogleOnboardingPending>(
        "/api/auth/google",
        { idToken },
        { anonymous: true },
      );
      if ("requiresOnboarding" in response)
        throw new GoogleOnboardingRequired(response);
      return persist(response);
    },
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
    const me = await api.get<WireSessionUser>("/api/users/me");
    setUser(adaptSessionUser(me));
  }, []);

  const updateToken = useCallback((token: string) => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
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
      updateToken,
      acceptSession: persist,
    }),
    [
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      logout,
      refreshUser,
      updateToken,
      persist,
    ],
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
  ExternalCoach: "/external-coach",
  Member: "/member",
  Receptionist: "/receptionist",
  Coach: "/coach",
  CenterManager: "/manager",
  SystemAdministrator: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  ExternalCoach: "External Coach",
  Member: "Member",
  Receptionist: "Receptionist",
  Coach: "Coach",
  CenterManager: "Center Manager",
  SystemAdministrator: "System Administrator",
};

export interface WireSessionUser {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  sportIds?: number[];
  approvalStatus?: SessionUser["approvalStatus"];
}
const WIRE_ROLES: Record<string, Role> = {
  SYSTEM_ADMINISTRATOR: "SystemAdministrator",
  CENTER_MANAGER: "CenterManager",
  COACH: "Coach",
  MEMBER: "Member",
  RECEPTIONIST: "Receptionist",
  EXTERNAL_COACH: "ExternalCoach",
};
export function adaptSessionUser(me: WireSessionUser): SessionUser {
  const role =
    WIRE_ROLES[me.role] ??
    (Object.values(WIRE_ROLES).includes(me.role as Role)
      ? (me.role as Role)
      : null);
  if (!role) throw new Error("Unknown account role");
  return {
    userId: me.userId,
    email: me.email,
    fullName: me.fullName,
    role,
    sportIds: me.sportIds ?? [],
    approvalStatus: me.approvalStatus ?? null,
  };
}
export interface GoogleOnboardingPending {
  requiresOnboarding: true;
  onboardingToken: string;
  email: string;
  fullName: string;
  expiresAt: string;
}
export class GoogleOnboardingRequired extends Error {
  constructor(public readonly pending: GoogleOnboardingPending) {
    super("Google onboarding required");
  }
}
export function safeReturnTo(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      /[\\\s]/.test(decoded)
    )
      return fallback;
    return new URL(value, "https://sporthub.local").origin ===
      "https://sporthub.local"
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}
