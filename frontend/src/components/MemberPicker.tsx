"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type { Paged, UserAdminDto } from "@/lib/types";

const MIN_KEYWORD_LENGTH = 2;

/**
 * Ô tìm và chọn hội viên cho các thao tác tại quầy (bán gói, đăng ký hộ, Gym check-in).
 *
 * Lọc role=Member ngay ở API thay vì lọc sau khi tải: quầy không bao giờ cần chọn tài khoản
 * nhân sự ở những màn hình này, và tải cả rồi lọc sẽ trả về dữ liệu không cần thiết.
 */
export function MemberPicker({
  value,
  onChange,
  label: fieldLabel = "Members",
}: {
  value: UserAdminDto | null;
  onChange: (member: UserAdminDto | null) => void;
  label?: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");

  // Trễ 300ms trước khi tìm: gõ tên đầy đủ sẽ bắn một request cho mỗi ký tự nếu tìm ngay.
  // setState nằm trong callback của timer nên không gây render dây chuyền.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 300);

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

  // Không xoá state kết quả khi từ khoá ngắn lại — chỉ ngừng hiển thị. Xoá state ngay trong
  // effect là đúng thứ quy tắc render dây chuyền của React ngăn.
  const results = ready ? (search.data?.items ?? []) : [];

  if (value) {
    return (
      <div className="field">
        <span>{fieldLabel}</span>
        <div
          className="row spread"
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px" }}
        >
          <div>
            <strong>{value.fullName || value.email}</strong>
            <div className="small muted">
              {value.email}
              {value.phone ? ` · ${value.phone}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              onChange(null);
              setKeyword("");
            }}
          >
            Exch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span>{fieldLabel}</span>
      <input
        value={keyword}
        placeholder="Enter a name, email or phone number (at least 2 characters)"
        onChange={(event) => setKeyword(event.target.value)}
      />

      {ready && search.loading && <span className="field__hint">Looking...</span>}

      {ready && !search.loading && results.length === 0 && (
        <span className="field__hint">No matching membership was found.</span>
      )}

      {results.length > 0 && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {results.map((member) => (
            <button
              key={member.userId}
              type="button"
              onClick={() => onChange(member)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--line)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <strong>{member.fullName || member.email}</strong>
              <div className="small muted">
                {member.email}
                {member.phone ? ` · ${member.phone}` : ""}
                {member.status !== "Active" ? "· The account is locked" : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
