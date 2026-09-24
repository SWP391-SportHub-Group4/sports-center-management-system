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
      <h1>Coach</h1>
      <label className="field search-field">
        Find coach
        <input
          type="search"
          placeholder="Name or Department"
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
              View Classs of {c.name} →
            </Link>
          </Card>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState title="No coach found">
          Try another name or set.
        </EmptyState>
      )}
    </div>
  );
}
