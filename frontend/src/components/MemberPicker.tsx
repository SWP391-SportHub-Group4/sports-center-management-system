"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { Paged, UserAdminDto } from "@/lib/types";

const MIN_KEYWORD_LENGTH = 2;

/**
 * Ô tìm và chọn hội viên cho các thao tác tại quầy (bán gói, đăng ký hộ, Gym check-in).
 * Hỗ trợ tự động focus, quét mã QR/Barcode nhanh và xác nhận bằng phím Enter.
 */
export function MemberPicker({
  value,
  onChange,
  label: fieldLabel,
  autoFocus = false,
  placeholder,
}: {
  value: UserAdminDto | null;
  onChange: (member: UserAdminDto | null) => void;
  label?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { language } = useLanguage();
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");

  const defaultLabel = language === "en" ? "Select Member" : "Chọn hội viên";
  const labelText = fieldLabel || defaultLabel;

  const defaultPlaceholder =
    language === "en"
      ? "Enter name, phone, or scan member barcode/QR..."
      : "Nhập tên, SĐT hoặc quét mã QR/Barcode hội viên...";
  const placeholderText = placeholder || defaultPlaceholder;

  // Trễ 200ms trước khi tìm để hỗ trợ gõ nhanh hoặc máy quét barcode
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const ready = debounced.length >= MIN_KEYWORD_LENGTH;

  const search = useApi(
    (signal) =>
      ready
        ? api.get<Paged<UserAdminDto>>("/api/users", {
            signal,
            query: { keyword: debounced, role: "Member", pageSize: 8 },
          })
        : Promise.resolve(null),
    [debounced, ready],
  );

  const results = ready ? (search.data?.items ?? []) : [];

  // Khi quét mã hoặc ấn Enter, nếu có đúng 1 kết quả hoặc kết quả đầu tiên khớp, tự chọn ngay
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      onChange(results[0]);
      setKeyword("");
    }
  };

  if (value) {
    return (
      <div className="field">
        <span>{labelText}</span>
        <div
          className="row spread"
          style={{
            border: "1.5px solid var(--brand-500, #1a76b8)",
            borderRadius: 8,
            padding: "9px 12px",
            background: "var(--brand-100, #f0f7fc)",
          }}
        >
          <div>
            <strong style={{ color: "var(--brand-900, #0b2d4d)" }}>
              {value.fullName || value.email}
            </strong>
            <div className="small muted">
              {value.email}
              {value.phone ? ` · ${value.phone}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              onChange(null);
              setKeyword("");
            }}
          >
            {language === "en" ? "Change" : "Thay đổi"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span>{labelText}</span>
      <input
        autoFocus={autoFocus}
        value={keyword}
        placeholder={placeholderText}
        onChange={(event) => setKeyword(event.target.value)}
        onKeyDown={handleKeyDown}
        style={{ height: 44, borderRadius: 8 }}
      />

      {ready && search.loading && (
        <span className="field__hint">
          {language === "en" ? "Searching members..." : "Đang tìm kiếm hội viên..."}
        </span>
      )}

      {ready && !search.loading && results.length === 0 && (
        <span className="field__hint" style={{ color: "var(--danger-700, #c026d3)" }}>
          {language === "en" ? "No matching members found." : "Không tìm thấy hội viên phù hợp."}
        </span>
      )}

      {results.length > 0 && (
        <div
          style={{
            border: "1px solid var(--line, #dfe5ec)",
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 4px 14px rgba(11, 45, 77, 0.08)",
            background: "#ffffff",
            marginTop: 4,
          }}
        >
          {results.map((member, idx) => (
            <button
              key={member.userId}
              type="button"
              onClick={() => {
                onChange(member);
                setKeyword("");
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                background: idx === 0 ? "var(--surface-alt, #f8fafc)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--line, #dfe5ec)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "var(--brand-900, #0b2d4d)" }}>
                  {member.fullName || member.email}
                </strong>
                {idx === 0 && (
                  <span className="small muted" style={{ fontSize: 11 }}>
                    {language === "en" ? "Press Enter ↵" : "Ấn Enter ↵"}
                  </span>
                )}
              </div>
              <div className="small muted">
                {member.email}
                {member.phone ? ` · ${member.phone}` : ""}
                {member.status !== "Active"
                  ? ` · ${language === "en" ? "Account Locked" : "Tài khoản bị khóa"}`
                  : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
