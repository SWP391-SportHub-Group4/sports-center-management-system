from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
changes = {
 'frontend/src/features/receptionist/dashboard.tsx': [
  ('query: { page: 1, pageSize: 1 },','query: { page: 1, pageSize: 1, caseType: "captured" },'),
  ('href="/receptionist/payment-reconciliation"', 'href="/receptionist/payment-reconciliation?caseType=captured"'),
  ('href="/receptionist/invoices"', 'href="/receptionist/invoices?status=ISSUED"'),
 ],
 'frontend/src/features/receptionist/invoice-desk.tsx': [
  ('import { MemberDesk } from "./front-desk";', 'import { MemberDesk } from "./front-desk";\nimport { InvoiceList } from "@/features/payments/invoice-list";'),
  ('if (id === null) return <MemberDesk mode="invoices" />;', 'if (id === null)\n    return <InvoiceList staff initialStatus={query.get("status") === "ISSUED" ? "ISSUED" : ""} />;'),
 ],
 'frontend/src/features/payments/invoice-list.tsx': [
  ('  rental = false,\n}: {\n  staff?: boolean;\n  memberId?: string;\n  rental?: boolean;', '  rental = false,\n  initialStatus = "",\n}: {\n  staff?: boolean;\n  memberId?: string;\n  rental?: boolean;\n  initialStatus?: string;'),
  ('const [status, setStatus] = useState("");', 'const [status, setStatus] = useState(initialStatus);'),
 ],
 'frontend/src/features/receptionist/payment-reconciliation.tsx': [
  ('import { useState } from "react";', 'import { useState } from "react";\nimport { useSearchParams } from "next/navigation";'),
  ('export function FrontDeskPaymentReconciliation() {\n  const [page, setPage] = useState(1);', 'export function FrontDeskPaymentReconciliation() {\n  const query = useSearchParams();\n  const caseType = query.get("caseType") === "captured" ? "captured" : undefined;\n  const [page, setPage] = useState(1);'),
  ('query: { page, pageSize: 20 },','query: { page, pageSize: 20, ...(caseType ? { caseType } : {}) },'),
  ('    [page],\n  );', '    [page, caseType],\n  );'),
 ],
 'backend/SportHub.Payment/Api/FrontDeskPaymentReconciliationController.cs': [
  ('public async Task<IActionResult> Queue([FromQuery] Guid? memberId,\n        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)', 'public async Task<IActionResult> Queue([FromQuery] Guid? memberId,\n        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,\n        [FromQuery] string? caseType = null, CancellationToken ct = default)'),
  ('        page = Math.Clamp(page, 1, 1000);', '        if (caseType is not null && caseType != "captured" && caseType != "unverified")\n            return BadRequest(new { error = "Invalid caseType. Use captured or unverified." });\n        page = Math.Clamp(page, 1, 1000);'),
  ('var total = await capturedQuery.CountAsync(ct) + await unverifiedQuery.CountAsync(ct);\n        var captured = await capturedQuery.Take(scanLimit).ToListAsync(ct);\n        var unverified = await unverifiedQuery.Take(scanLimit).ToListAsync(ct);', 'var includeCaptured = caseType != "unverified";\n        var includeUnverified = caseType != "captured";\n        var total = (includeCaptured ? await capturedQuery.CountAsync(ct) : 0)\n                  + (includeUnverified ? await unverifiedQuery.CountAsync(ct) : 0);\n        var captured = includeCaptured\n            ? await capturedQuery.Take(scanLimit).ToListAsync(ct)\n            : new List<FrontDeskReconciliationRow>();\n        var unverified = includeUnverified\n            ? await unverifiedQuery.Take(scanLimit).ToListAsync(ct)\n            : new List<FrontDeskReconciliationRow>();'),
 ],
}

pending=[]
errors=[]
for name,repls in changes.items():
    p=root/name
    if not p.is_file():
        errors.append(f'Missing file: {p}')
        continue
    original=p.read_text(encoding='utf-8-sig')
    updated=original
    for old,new in repls:
        n=updated.count(old)
        if n!=1:
            errors.append(f'{name}: expected 1 match, found {n}: {old[:72]!r}')
        else:
            updated=updated.replace(old,new,1)
    pending.append((p,original,updated))
if errors:
    print('No files changed. The current source does not match the checked branch:')
    print('\n'.join(errors))
    sys.exit(1)
for p,original,updated in pending:
    backup=p.with_name(p.name+'.before-desk-buttons-fix.bak')
    if not backup.exists(): backup.write_text(original,encoding='utf-8')
    p.write_text(updated,encoding='utf-8')
    print('Updated:',p.relative_to(root))
print('Completed. Check changes with git diff, then build backend and frontend.')
