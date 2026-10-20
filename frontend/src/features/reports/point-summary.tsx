"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { todayIso } from "@/lib/format";
import { AsyncSection, Field } from "@/components/ui";
import { reportsApi } from "./api";
import { PointsReport } from "./points-report";

export function PointSummary() {
  const [from, setFrom] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso);
  const valid = !!from && !!to && from <= to;
  const state = useApi(
    (signal) =>
      reportsApi.summary(
        { fromDate: from, toDate: to, sportId: "", source: "", memberId: "" },
        signal,
      ),
    [from, to],
  );
  return (
    <section className="stack" aria-label="Points activity">
      <div className="form-grid">
        <Field label="From">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              if (e.target.value) setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              if (e.target.value) setTo(e.target.value);
            }}
          />
        </Field>
      </div>
      {!valid ? (
        <p role="alert">Choose a valid date range.</p>
      ) : (
        <AsyncSection state={state}>
          {(report) => <PointsReport report={report} />}
        </AsyncSection>
      )}
    </section>
  );
}
