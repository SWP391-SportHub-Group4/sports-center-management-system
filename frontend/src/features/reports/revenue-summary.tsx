"use client";
import { Card, Stat, Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import type { RevenueDimensionsDto, RevenueReportDto } from "@/lib/types";
import { MemberName } from "@/components/RecordName";
export function RevenueRows({
  rows,
  showSource = true,
}: {
  rows: RevenueReportDto["bySportAndSource"];
  showSource?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const hasLegacyCash = rows.some((row) => row.legacyCashCollected !== 0);
  const names: Record<string, string> = {
    MEMBERSHIP: l.sourceMembership,
    PT: l.sourcePt,
    CLASS_PACKAGE: l.sourceClass,
    RENTAL: l.sourceRental,
    RECONCILIATION: l.sourceReconciliation,
    LEGACY_UNCLASSIFIED: l.sourceLegacy,
  };
  return (
    <Table
      headers={[
        ...(showSource ? [l.source] : []),
        l.sport,
        t.ptOps.members,
        l.cash,
        ...(hasLegacyCash ? [l.legacyCash] : []),
        l.redeemed,
      ]}
    >
      {rows.map((r, i) => (
        <tr key={i}>
          {showSource && <td>{names[r.source] ?? r.source}</td>}
          <td>{r.sportName ?? "—"}</td>
          <td>
            {r.memberId ? (
              <MemberName
                id={r.memberId}
                name={
                  "memberName" in r
                    ? (r.memberName as string | null)
                    : undefined
                }
              />
            ) : (
              "—"
            )}
          </td>
          <td>{formatMoney(r.cashCollected)}</td>
          {hasLegacyCash && <td>{formatMoney(r.legacyCashCollected)}</td>}
          <td>{formatMoney(r.pointsRedeemed * 1000)}</td>
        </tr>
      ))}
    </Table>
  );
}
export function RevenueSummary({ report }: { report: RevenueDimensionsDto }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <Card title={l.dimensions}>
      <div className="stats-grid">
        <Stat label={l.cash} value={formatMoney(report.cashCollected)} />
        <Stat
          label={l.redeemed}
          value={formatMoney(report.pointsRedeemedVnd)}
        />
      </div>
      <RevenueRows rows={report.rows} />
      {!report.rows.length && <p>{t.common.noData}</p>}
    </Card>
  );
}
