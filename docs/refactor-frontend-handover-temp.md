# Handover frontend P2.00–P2.05 — 02/10/2026

Checkpoint tạm cũ được thay bằng bàn giao phạm vi đã triển khai. Nhánh `feature/refactor-v2.1`, base `0d3e1ef`; chưa commit/push. Xem [progress](refactor-progress.md) và [contract](refactor-api-contract.md) cho kết quả cuối và endpoint. Không thực hiện lại foundation hoặc khôi phục demo UI.

## Quyết định cần giữ

- `src/lib/types.ts`: DTO canonical int/UUID, wire enum UPPER_SNAKE_CASE; các type legacy còn consumer staff ngoài P2.05 được giữ để chuyển ở chặng kế tiếp.
- `auth.tsx`: refresh profile khi F5, `adaptSessionUser` map role đúng một nơi, specialty và approval lấy server. `safeReturnTo` chỉ local. Storage không lưu giao dịch/số dư/quyền lợi.
- Public `/courses`, `/courses/[id]` và alias `/classes`: lịch public không roster. Own timeline dùng route có kiểm enrollment owner.
- `features/payments`: shared checkout/points/OTP/QR/hold/refund/invoice/return. Create UUID key theo intent; network/5xx GET by-key trước POST khác. F5 dùng URL invoice; VNPay query chỉ để tra reference, không làm Paid.
- Counter OTP server revision và audited beneficiary; pending/locked/expired không phát QR. Chuyển beneficiary remount toàn flow, không dùng OTP/points cũ. Manager cash-only, không bypass OTP để áp điểm.
- Cash=0 gọi confirm-points, không tạo payment attempt. Cash>0 hiển thị provider link/mock mode thật. Fulfilled/Compensated/Reconciliation là các kết quả riêng.
- Hết hold: thao tác retry rõ ràng, PT lấy quote/version mới; backend reacquire và tính giá. Class-transfer-difference retry dùng lựa chọn threshold đã chốt, không generic retry đổi đích.
- Refund: item lock và chỉ một pending request, backend quote/calculation. FE không gửi proposed/approved point amount.
- Member mua course không cần Gym Membership. PT cần Active Membership; quote price-per-session × totalQuota từ backend, frequency1/2/3, specialty Coach từ catalog. PT sessions/results/homework/change requests gộp ở `/member/training`.
- Gym là quyền truy cập theo ngày, không quota group sessions. Wallet có filtered ledger, không nạp/rút/chuyển.
- Giữ assets/brand Navy/Ice/Roboto, không thêm UI/state framework. Requirements/SRS và .env không sửa.

## Chạy lại kiểm tra

Trong frontend: typecheck, lint, check:i18n, build, sau đó `npx playwright test tests/member.spec.ts tests/refactor-foundation.spec.ts tests/refactor-payments.spec.ts`.

Backend: Release build và từng test project trên database PostgreSQL **mới riêng cho mỗi suite**. Factories hỗ trợ `SPORTHUB_TEST_POSTGRES`; không tái sử dụng DB đã seed/test vì fixture tên cố định và nghiệp vụ thay đổi. Có thể dùng Testcontainers khi Docker hoạt động.

API browser: `P2_LIVE_API=http://localhost:5000 npx playwright test tests/refactor-live.spec.ts`, API Development, VNPay mock, SMTP cả Smtp:Host và Email:Smtp:Host rỗng, DemoLoggingEnabled=false, CORS frontend3100. Phải dùng DB demo mới để tránh trùng lịch test. API đọc root .env, nên dùng command-line config để override connection string/SMTP/mock; không sửa .env. Không in JWT/OTP ra console.

Cluster test của phiên này: `%TEMP%/sporthub-p2-postgres-20261001`, port55439, user sporthub trust trên127.0.0.1. DB cuối: payment_verified, training_verified, security_verified với prefix `sporthub_p2_`; Scheduling `sporthub_p2_scheduling_final`; browser `sporthub_p2_browser_final`. TRX và screenshots nằm trong TestResults/test-results ignored. Windows Application Control đã từng chặn loadDLL nhưng build cuối + tất cả test đã chạy thành công; không disable/bypass security policy. API/cluster được dừng sau nghiệm thu; muốn dùng lại cluster phải pg_ctl start đúng đường dẫn tạm, hoặc tạo cluster/container mới.

## Bước tiếp theo

Bắt đầu P2.06 Receptionist, sau đó P2.07–P2.12 theo plan2; tái dùng shared payment/courses/membership components. Các trang Manager/Receptionist/Coach legacy chưa hoàn tất v3, không đánh dấu cả frontend hoàn thành. VNPay sandbox/SMTP delivery/Google thật cần môi trường cấu hình hợp lệ và nghiệm thu tích hợp riêng.
