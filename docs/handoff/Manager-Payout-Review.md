# Manager: kết thúc review payout sau báo chưa nhận

Trạng thái ngày 25/10/2026: đã triển khai và kiểm thử task **Request sau khi Member báo chưa nhận** trong [phân công Manager](Team-Task-Assignment.md#khoa-manager).

## Hành vi đã chốt

- Payout chỉ ghi một lần. Khi Member báo chưa nhận và request mở lại, Manager chọn **Done** hoặc **Reject**, bắt buộc nhập ghi chú. Request chưa có người phụ trách được tự gán cho Manager thực hiện; có lịch sử owner, sự kiện và audit.
- Số tiền, thời điểm, ghi chú payout gốc và ảnh chứng từ được giữ nguyên. Kết luận review không tạo payout bổ sung và không xác nhận thay Member rằng tiền đã đến.
- Member thấy kết quả review và lý do riêng với trạng thái nhận tiền. Khi review còn mở, Member có thể xác nhận khoản tiền đến muộn; báo chưa nhận lặp lại không xóa người phụ trách.
- Với review đã kết thúc nhưng payout chưa được xác nhận, endpoint báo chưa nhận/xác nhận nhận tiền từ chối thay đổi kết luận. Job tự xác nhận bỏ qua payout từng bị báo chưa nhận, kể cả request legacy đã về `CLOSED`; payout chưa từng bị báo vẫn tự xác nhận sau thời gian cấu hình.
- Endpoint `bank-details` đã gỡ không được khôi phục; frontend bỏ lời gọi cũ. Ghi payout bắt buộc có `note` khớp API (`payout_note_required`).

## Kiểm thử và evidence

| Kiểm tra | Kết quả |
|---|---|
| PostgreSQL `SupportPayoutFlowTests` | **7/7 pass**, gồm Done/Reject, quyền/proof/trần payout, Receptionist, delayed receipt và báo lặp giữ assignment, chống auto-confirm disputed payout legacy, auto-confirm payout chưa bị báo. Artifact: [support-payout-review.trx](../../.tmp/test-results/support-payout-review.trx). |
| Playwright `member-help-requests.spec.ts` | **5 pass** |
| Playwright `support-f4-f5.spec.ts` | **2 pass** |
| Playwright `payout-review.spec.ts` | **5 pass**: Done/Reject ở 390px và 1440px, cùng delayed receipt khi review còn mở. |
| Frontend ESLint các tệp thay đổi, typecheck, production build | **Pass** |

Tổng cộng **12 Playwright test riêng biệt**; kết quả frontend theo phiên validation bàn giao. Ảnh review Manager/Member nằm trong `.tmp/payout-review/`. Integration artifact ghi `total=7`, `passed=7`, `failed=0`.

Lệnh chạy lại từ root (PostgreSQL test cần connection string test theo cấu hình dự án; không ghi secret vào docs):

```powershell
dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj --filter FullyQualifiedName~SupportPayoutFlowTests --logger "trx;LogFileName=support-payout-review.trx" --results-directory .tmp/test-results
Push-Location frontend
npx.cmd eslint src/features/receptionist/support-detail.tsx src/features/receptionist/support-payout.tsx src/features/receptionist/support-request-actions.tsx src/features/member/support-api.ts src/features/member/help-my-requests.tsx tests/payout-review.spec.ts tests/support-f4-f5.spec.ts
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e -- tests/member-help-requests.spec.ts tests/support-f4-f5.spec.ts tests/payout-review.spec.ts
Pop-Location
```

## Phạm vi bàn giao

Hoàn thành task review payout này không đóng các task Manager khác: migration trên DB của từng người, điều hướng thông báo Manager, `ReportReconciliationTests`, `ReportExportParityTests` và test export `bankRefundPaid` vẫn theo phân công riêng. Không thay đổi nguồn token [DESIGN-TOKENS.md](../../DESIGN-TOKENS.md) hay tạo `DESIGN.md`; giao diện tiếp tục theo nền tảng hiện có và [PRODUCT.md](../../PRODUCT.md).
