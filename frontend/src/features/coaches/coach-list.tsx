"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, EmptyState } from "@/shared/ui";
import type { Coach } from "./model";
export function CoachList({ coaches }: { coaches: Coach[] }) {
  const [query, setQuery] = useState("");
  const filtered = coaches.filter((c) =>
    `${c.name} ${c.specialty}`
      .toLocaleLowerCase("vi")
      .includes(query.toLocaleLowerCase("vi")),
  );
  return (
    <div className="stack">
      <h1>Huấn luyện viên</h1>
      <label className="field search-field">
        Tìm huấn luyện viên
        <input
          type="search"
          placeholder="Tên hoặc bộ môn"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="cards-grid">
        {filtered.map((c) => (
          <Card key={c.id}>
            <div className="row">
              <span className="avatar large" aria-hidden="true">
                {c.initials}
              </span>
              <div>
                <h2>{c.name}</h2>
                <p className="muted">{c.specialty}</p>
              </div>
            </div>
            <p>{c.bio}</p>
            <Link className="text-link" href={`/member/calendar?coach=${c.id}`}>
              Xem các lớp của {c.name} →
            </Link>
          </Card>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState title="Không tìm thấy huấn luyện viên">
          Thử tên hoặc bộ môn khác.
        </EmptyState>
      )}
    </div>
  );
}
