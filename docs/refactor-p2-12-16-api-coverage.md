# P2.13 API coverage — P2.12–P2.16

Ngày cập nhật: 03/10/2026. Phạm vi: frontend từ P2.12 đến P2.16, đối chiếu trực tiếp controller hiện có và `docs/refactor-api-contract.md`. Không sửa Requirements/SRS.

## Kết luận

Các route tối thiểu mà P2.12 cần đã tồn tại trong backend hiện tại; không cần dựng API giả ở frontend. Frontend dùng đúng authority của backend cho refund, ví, báo cáo, audit và quản trị tài khoản.

| UI | Route backend dùng | Quyền |
|---|---|---|
| Refund Manager | `GET /api/refunds`, `POST /api/refunds/{id}/approve`, `POST /api/refunds/{id}/reject` | CenterManager; reviewer khác requester |
| Legacy adjustment | `GET /api/payment-adjustments` | chỉ đọc |
| Ví Manager | `GET /api/manager/wallets/{ownerId}`, `GET /api/members/{memberId}/points/ledger`, `POST /api/wallets/{ownerId}/adjustments` | CenterManager |
| Báo cáo tổng | `GET /api/reports/revenue` | CenterManager |
| Báo cáo dimension | `GET /api/reports/revenue-dimensions` | CenterManager |
| Báo cáo lớp | `GET /api/reports/class-enrollment` | CenterManager |
| Báo cáo hội viên | `GET /api/reports/membership-period` | CenterManager |
| Export | `GET/POST /api/reports/exports`, download/retry | policy report backend |
| Audit | `GET /api/audit-logs` | CenterManager; SystemAdministrator tự bị scope account-only |
| Admin user | `GET /api/users/admin`, `POST /api/users`, `PUT /api/users/{id}/role`, lock/unlock/deactivate | SystemAdministrator |

## Contract integration đã chốt

- Enum JSON toàn API dùng `JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper)`. Vì vậy `WalletAdjustmentDirection` trên wire là `CREDIT` / `DEBIT`; frontend P2.12 gửi đúng dạng này. Contract được sửa lại để khớp runtime.
- Refund mới không cho Manager nhập `approvedPoints`; backend tính cap và approved points khi approve. Frontend chỉ gửi `centerFault` và `reason`.
- Report points giữ đơn vị tách biệt: `pointsRedeemedVnd` là VND, `pointsIssued`/`outstandingPoints`/`managerPointAdjustment` là điểm.
- SystemAdministrator đọc `GET /api/audit-logs` nhưng backend tự ép `accountsOnly=true`; frontend không cấp menu nghiệp vụ Manager.
- `frontend/tests/api-coverage.spec.ts` là smoke live có điều kiện `P2_LIVE_API`, kiểm các route GET canonical không rơi vào 404/405 trên DB test đã seed.

## Chỗ không tự suy đoán

- VNPay sandbox thật, SMTP/Google thật cần credential môi trường; CI chỉ dùng mock payment Development và không chứng nhận dịch vụ ngoài.
- Không thêm endpoint test OTP/mail ở Production. Helper mailbox chỉ hoạt động khi test harness ngoài cung cấp `P2_TEST_MAILBOX_URL`.
- Không thêm route chatbot/AI trong phạm vi P2.12–P2.16.
