"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  MemberCommand,
  MemberRepository,
  MemberSnapshot,
} from "./contracts";

interface MemberContextValue {
  data: MemberSnapshot;
  busy: boolean;
  execute: (command: MemberCommand, message: string) => Promise<boolean>;
}
const Context = createContext<MemberContextValue | null>(null);
export function MemberProvider({
  repository,
  children,
}: {
  repository: MemberRepository;
  children: ReactNode;
}) {
  const [data, setData] = useState<MemberSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const load = useCallback(() => {
    setError("");
    void repository
      .load()
      .then(setData)
      .catch(() => setError("Không tải được dữ liệu. Vui lòng thử lại."));
  }, [repository]);
  useEffect(() => {
    const unsubscribe = repository.subscribe(load);
    queueMicrotask(load);
    return unsubscribe;
  }, [load, repository]);
  async function execute(command: MemberCommand, success: string) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setData(await repository.execute(command));
      setMessage(success);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Thao tác chưa hoàn tất. Vui lòng thử lại.",
      );
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="loading" aria-busy={!error}>
        <h1>SportHub</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Đang tải không gian hội viên…"}
        </p>
        {error && (
          <button className="button" onClick={load}>
            Thử lại
          </button>
        )}
      </main>
    );
  return (
    <Context.Provider value={{ data, busy, execute }}>
      {children}
      <div className="toast-area">
        <p role="status" className={message ? "toast" : "sr-only"}>
          {message}
        </p>
        <p role="alert" className={error ? "toast" : "sr-only"}>
          {error}
        </p>
        {(message || error) && (
          <button
            className="toast-dismiss"
            onClick={() => {
              setMessage("");
              setError("");
            }}
            aria-label="Ẩn thông báo trạng thái"
          >
            Đóng
          </button>
        )}
      </div>
    </Context.Provider>
  );
}
export function useMember() {
  const value = useContext(Context);
  if (!value) throw new Error("MemberProvider is required");
  return value;
}
