"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { QrCode, Search, UserPlus } from "lucide-react";

import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import { isMemberCode } from "@/lib/member-code";
import type { Paged, UserAdminDto } from "@/lib/types";
import { Dialog, StatusChip } from "@/components/ui";
import { AvatarImage } from "@/components/AvatarImage";
import { CameraQrScanner } from "@/components/CameraQrScanner";
import { resolveMemberCode } from "@/components/MemberPicker";

import { useDeskMember } from "./desk-context";
import { RegisterMemberDialog } from "./register-member";
import styles from "./desk-bar.module.css";

const MIN_KEYWORD_LENGTH = 2;

/**
 * Thanh tìm hội viên ghim đầu trang quầy: gõ tên/SĐT/email, quét QR hoặc barcode,
 * Ctrl + K hoặc F2 nhảy vào ô từ bất kỳ đâu. Chọn người khác là đổi hội viên đang phục vụ.
 */
export function DeskSearchBar({ showScan = true }: { showScan?: boolean }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const { member, setMember } = useDeskMember();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  // Ctrl + K / F2: chuyển sang ô tìm hội viên mà không cần chuột.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const quick =
        event.key === "F2" ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k");
      if (!quick) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ready =
    debounced.length >= MIN_KEYWORD_LENGTH && !isMemberCode(debounced);
  const search = useApi(
    (signal) =>
      ready
        ? api.get<Paged<UserAdminDto>>("/api/users", {
            signal,
            query: { keyword: debounced, role: "Member", pageSize: 6 },
          })
        : Promise.resolve(null),
    [debounced, ready],
  );
  const results = ready ? pagedItems(search.data) : [];

  function choose(next: UserAdminDto) {
    setMember(next);
    setKeyword("");
    setDebounced("");
    setOpen(false);
    setError(null);
    setActive(0);
  }

  async function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Escape") {
      setOpen(false);
      setKeyword("");
    } else if (event.key === "Enter") {
      event.preventDefault();
      const text = keyword.trim();
      // Máy quét barcode gõ mã rồi gửi Enter.
      if (isMemberCode(text)) {
        const result = await resolveMemberCode(text, language);
        if (result.member) choose(result.member);
        else setError(result.error ?? null);
        return;
      }
      if (results[active]) choose(results[active]);
    }
  }

  const showList = open && ready;

  return (
    <div className={styles.bar} role="search">
      <div className={styles.field}>
        <Search className={styles.icon} size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={vi ? "Tìm hội viên" : "Find a member"}
          autoComplete="off"
          value={keyword}
          placeholder={
            member
              ? vi
                ? "Đổi hội viên: tên, SĐT, email hoặc quét mã"
                : "Switch member: name, phone, email or scan a code"
              : vi
                ? "Tên, SĐT, email hoặc quét mã QR / barcode"
                : "Name, phone, email, or scan a QR / barcode"
          }
          onChange={(event) => {
            setKeyword(event.target.value);
            setOpen(true);
            setActive(0);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <kbd className={styles.kbd} aria-hidden="true">
          Ctrl K
        </kbd>

        {showList && (
          <ul className={styles.results} id={listId} role="listbox">
            {search.loading && (
              <li className={styles.note}>{vi ? "Đang tìm…" : "Searching…"}</li>
            )}
            {!search.loading && !results.length && (
              <li className={styles.note}>
                {vi ? "Không có hội viên phù hợp." : "No matching members."}
              </li>
            )}
            {results.map((row, index) => (
              <li
                key={row.userId}
                role="option"
                aria-selected={index === active}
                className={styles.result}
                data-active={index === active || undefined}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(row);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <AvatarImage
                  userId={row.userId}
                  name={row.fullName || row.email}
                  avatarUrl={row.avatarUrl}
                  size={32}
                />
                <span className={styles.who}>
                  <strong>{row.fullName || row.email}</strong>
                  <span>
                    {row.email}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </span>
                </span>
                {row.status !== "ACTIVE" && <StatusChip value={row.status} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showScan && (
        <button
          type="button"
          className={`btn btn--secondary ${styles.action}`}
          onClick={() => setScanning(true)}
        >
          <QrCode size={18} aria-hidden="true" />
          {vi ? "Quét QR" : "Scan QR"}
        </button>
      )}
      <button
        type="button"
        className={`btn btn--secondary ${styles.action}`}
        onClick={() => setRegistering(true)}
      >
        <UserPlus size={18} aria-hidden="true" />
        {vi ? "Đăng ký hội viên" : "Register member"}
      </button>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {scanning && (
        <Dialog
          title={
            vi ? "Quét mã check-in của hội viên" : "Scan the member's code"
          }
          description={
            vi
              ? "Đưa mã QR 6 số hoặc mã trong SportHub của hội viên vào khung hình."
              : "Hold the member's QR code from SportHub in front of the camera."
          }
          size="md"
          onClose={() => setScanning(false)}
        >
          <ScanBody
            onResolved={(found) => {
              choose(found);
              setScanning(false);
            }}
          />
        </Dialog>
      )}

      {registering && (
        <RegisterMemberDialog
          onClose={() => setRegistering(false)}
          onCreated={(created) => {
            setRegistering(false);
            choose(created);
          }}
        />
      )}
    </div>
  );
}

function ScanBody({
  onResolved,
}: {
  onResolved: (member: UserAdminDto) => void;
}) {
  const { language } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.scan}>
      <CameraQrScanner
        onScan={async (text) => {
          const result = await resolveMemberCode(text, language);
          if (result.member) onResolved(result.member);
          else setError(result.error ?? null);
        }}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
