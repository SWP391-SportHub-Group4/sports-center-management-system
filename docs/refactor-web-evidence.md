# Frontend P2.12–P2.16 — implementation evidence

Ngày: 03/10/2026. Phạm vi triển khai theo `docs/refactor-code-plan-2-frontend.md` P2.12–P2.16.

## P2.12 — Refund, ví, báo cáo, Admin

- Manager refund dùng item-scoped refund API; legacy adjustment chỉ đọc; không có form payout tiền mặt/chuyển khoản.
- Manager wallet chọn owner Member/ExternalCoach, đọc số dư + ledger và adjustment có reason + idempotency. Debit bị giới hạn theo available points ở UI, backend vẫn là authority.
- Reports tách cash VND, points redeemed VND và points count; filter date/sport/source/external coach; export dùng cùng snapshot filter.
- Manager dashboard đổi sang summary server của tháng hiện tại: cash, redeemed VND, issued/outstanding points, new/active members và số course trong kỳ. Không dùng nhãn "profit".
- Audit metadata có allowlist; không render raw JSON secret/email body. Admin audit bị backend scope UserAccount.
- System Administrator tạo staff đúng role; Coach bắt buộc ít nhất một specialty khi create/change-role.

## P2.13 — API coverage

Xem `docs/refactor-p2-12-16-api-coverage.md`. Contract direction của point adjustment đã đồng bộ `CREDIT`/`DEBIT` theo serializer thật. Thêm `frontend/tests/api-coverage.spec.ts` để smoke route canonical khi có `P2_LIVE_API`.

## P2.14 — UX/i18n/accessibility/config

- `Field` dùng localized required suffix cho screen reader.
- `Pager` không còn noun hard-code tiếng Anh; dùng locale mặc định.
- Dialog hiện có focus trap, Escape, return focus; Table có scroll region/tab focus; Feedback dùng `role=alert/status`.
- Manager reports validate range ≤ 366 ngày và giữ date-only theo ngày Việt Nam.
- Playwright dùng bundled Chromium thay channel `msedge`, portable cho CI/Linux.
- Test responsive mới dùng 390px và 1440px cho cụm Manager P2.12.
- Loại bỏ label enum runtime Yoga/GroupX/PersonalTraining, CSS discipline badge legacy và các locale marketing cũ không còn consumer. Public Community Events không còn tự sinh guest/gate QR pass ở client; CTA chỉ dẫn tới lịch thật.
- `frontend/.env.example` chỉ chứa biến public; không đưa secret VNPay/SMTP/Gemini vào `NEXT_PUBLIC_*`.

## P2.15 — E2E / CI

Thêm:

- `tests/manager-multisport.spec.ts`
- `tests/external-coach.spec.ts`
- `tests/coach-training.spec.ts`
- `tests/payment-lifecycle.spec.ts`
- `tests/rbac.spec.ts`
- `tests/api-coverage.spec.ts`
- `tests/helpers/api.ts`, `auth.ts`, `seed.ts`, `mailbox.ts`

`tests/receptionist.spec.ts` được viết lại theo model FrontDesk hiện hành: chọn Member, Gym server check-in, attendance theo `(sessionId,enrollmentId)`, không còn HUD turnstile/manual-paid fixture cũ.

CI thêm job `Frontend E2E + API`: dựng PostgreSQL 16 + backend Development riêng, chờ `/api/health`, build frontend, cài Chromium, chạy Playwright với `--workers=1`, upload report/trace và luôn `docker compose down -v` cuối job. Payment gateway dùng mock Development; không log secret.

## P2.16 — cleanup / handover

Static scan sau thay đổi:

- Không còn `CoachCategory`, `PartiallyPaid`, manual Paid, cash refund/payout trong runtime frontend P2.12.
- Demo gate/guest pass tự sinh đã bị gỡ khỏi Community Events; không còn UI tự tạo QR/nonce rồi trình bày như quyền vào cửa. Camera QR nếu còn consumer chỉ là input hỗ trợ định danh, không tự cấp quyền.
- Navigation P2.12 trỏ route thật; Manager/Admin scope tách đúng.
- README/PRODUCT/DESIGN/RUNBOOK/progress được rà và chỉnh các claim runtime liên quan; Requirements/SRS và migration history không sửa.

## Verification status trong môi trường tạo patch

Môi trường tạo patch không có .NET SDK/Docker và chỉ có Node 22/npm 10 trong khi frontend khóa Node 24/npm 11. `npm ci` không hoàn tất ổn định trong sandbox nên không tuyên bố local gate pass. `node scripts/check-i18n.mjs` pass; workflow YAML parse thành công với jobs backend/frontend/e2e. CI đã được cấu hình Node 24 + .NET 10 + Docker runner để thực hiện gate thật.

Gate cần quan sát trên branch/PR:

```text
Backend Build/Test         PASS
Frontend typecheck         PASS
Frontend lint              PASS
Frontend check:i18n        PASS
Frontend build             PASS
Playwright E2E + API       PASS
```

Nếu một gate đỏ, giữ nguyên evidence/traces; không skip test để đánh dấu hoàn thành.

## Xác minh local 04/10/2026 (Node 24.21 / npm 11.19, Windows)

| Lệnh (từ `frontend`) | Kết quả |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS: 0 error, 5 warning cũ ở `coach/ai-suggestions` (ngoài phạm vi) |
| `npm run check:i18n` | PASS |
| `npm run build` | PASS |
| `npx playwright test` (HTTP fixtures, Chromium) | 94 pass, 0 fail, 11 skipped (cần `P2_LIVE_API`) |

Chưa chạy: E2E live với backend + PostgreSQL, backend tests, CI trên runner, VNPay sandbox/SMTP/Google thật. Sửa phát hiện khi chạy: menu PT hiện cho Coach chỉ dạy nhóm, AppShell thiếu skip-link/`#main-content`, icon gate-pass/Yoga/GroupX còn export; các spec lỗi thời đã cập nhật theo UI hiện hành (xem `refactor-progress.md`).
