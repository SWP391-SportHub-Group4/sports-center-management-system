# Đối soát các khoản hoàn tiền cũ (legacy)

> Lập 22/09/2026 cùng migration `AddRefundPayoutEvidence`.
> Nguồn: [SSOT §5.7](00-Source-of-Truth.md), BR-41/42/43 v1.4, plan 23/09 §3.7.

## 1. Vấn đề

Trước v1.4, `PaymentAdjustmentService.ApproveAsync` đặt thẳng trạng thái `Completed` ngay
trong bước Manager phê duyệt, cho cả ba loại điều chỉnh:

```csharp
// Approve và Completed trong cùng một bước — xem ghi chú ở đầu class.
adjustment.Status = PaymentAdjustmentStatus.Completed;
adjustment.ApprovedByUserId = actorUserId;
adjustment.ResolvedAt = clock.UtcNow;
```

Hệ quả: với một bản ghi `Type = Refund, Status = Completed` tạo trước 22/09/2026, hệ thống
**chỉ biết Manager đã duyệt**. Nó không biết:

- tiền có thực sự được trả cho hội viên hay không,
- ai là người chi,
- chi vào lúc nào,
- chi bằng phương thức gì.

Bốn dữ kiện này là thứ BR-42 v1.4 bắt buộc, và là thứ BR-43 v1.4 dùng để quy kỳ báo cáo.

## 2. Cách xử lý đã chọn

**Không backfill bằng suy đoán.** Gán `completed_at_utc = resolved_at` cho một Refund cũ sẽ
biến một khoản chưa ai đối soát thành một khoản trông như đã đủ chứng từ — đúng loại sai sót
mà v1.4 sinh ra để sửa.

Thay vào đó migration đánh dấu `legacy_payout_unverified = TRUE` cho mọi
`Refund` + `Completed` có sẵn, và để trống ba trường bằng chứng.

### 2.1 Migration làm gì

| Bước | Áp dụng cho | Hành động | Có phải suy đoán không |
|---|---|---|---|
| 1 | Mọi adjustment | `requested_amount = amount` | Không phải dữ kiện tiền tệ. Bản ghi cũ không tách số đề nghị với số duyệt; gán bằng nhau nghĩa là "không ghi nhận có ghi đè" |
| 2 | Bản ghi đã có `approved_by_user_id` | `approved_at_utc = resolved_at` | **Dữ kiện thật** — quy trình cũ đặt `resolved_at` chính trong `ApproveAsync`/`RejectAsync` |
| 3 | `Discount`/`Correction` đã `Completed` | `completed_at_utc = COALESCE(resolved_at, created_at)` | **Dữ kiện thật** — cả thiết kế cũ lẫn mới đều hoàn tất hai loại này ngay trong transaction duyệt; không có tiền chuyển đi để chờ xác nhận |
| 4 | `Refund` đã `Completed` | `legacy_payout_unverified = TRUE`, **không** gán ba trường bằng chứng | Cách ly, không khẳng định gì |

### 2.2 Hệ quả với từng con số

| Nơi dùng | Refund legacy có được tính không | Lý do |
|---|---|---|
| `InvoiceBalance.RefundedAmount` (số dư hóa đơn) | **CÓ** | Giả định thận trọng: coi như tiền đã ra khỏi quầy. Nếu không tính, `RefundDue` sẽ hiện lại khoản đó và ai đó có thể hoàn lần thứ hai — tức là trung tâm mất tiền thật |
| `RevenueReportService` (thu ròng theo kỳ, BR-43) | **KHÔNG** | Không có ngày thực trả đáng tin để quy kỳ. Dùng ngày duyệt chính là lỗi v1.4 sửa. Query lọc `CompletedAtUtc != null` nên bản ghi legacy tự rơi ra |
| CHECK constraint bằng chứng | Được miễn qua cờ | Constraint vẫn áp dụng đầy đủ cho mọi bản ghi mới |

Chênh lệch giữa hai chỗ này là **có chủ ý và cần được đối soát bằng tay**: tổng
`RefundedAmount` trên các hóa đơn sẽ lớn hơn tổng `TotalRefunded` trong báo cáo kỳ, đúng bằng
tổng các khoản legacy chưa xác minh.

### 2.3 Đường ghi mới không bao giờ đặt cờ này

`PaymentAdjustmentService.CompleteRefundAsync` không gán `LegacyPayoutUnverified`. Mọi Refund
`Completed` tạo từ 22/09/2026 trở đi bắt buộc có `CompletedAtUtc`, `CompletedByUserId` và
`RefundMethod`, được DB ép bằng `CK_payment_adjustments_refund_completed_evidence`.

## 3. Danh sách cần đối soát

Chạy sau khi apply migration để lấy danh sách phải xác minh với sổ quỹ:

```sql
SELECT
    pa.adjustment_id,
    i.invoice_number,
    up.full_name        AS member_name,
    pa.amount,
    pa.reason,
    pa.created_at       AS requested_at,
    pa.approved_at_utc,
    requester.email     AS requested_by,
    approver.email      AS approved_by
FROM payment_adjustments pa
JOIN invoices i            ON i.invoice_id = pa.invoice_id
JOIN user_accounts m       ON m.user_id = i.member_id
LEFT JOIN user_profiles up ON up.user_id = m.user_id
JOIN user_accounts requester ON requester.user_id = pa.requested_by_user_id
LEFT JOIN user_accounts approver ON approver.user_id = pa.approved_by_user_id
WHERE pa.legacy_payout_unverified = TRUE
ORDER BY pa.created_at;
```

Tổng số tiền đang treo ở trạng thái chưa xác minh:

```sql
SELECT COUNT(*) AS so_ban_ghi, COALESCE(SUM(amount), 0) AS tong_tien
FROM payment_adjustments
WHERE legacy_payout_unverified = TRUE;
```

## 4. Quy trình xử lý từng bản ghi

Việc này **thuộc về người vận hành, không phải hệ thống** — cần đối chiếu với sổ quỹ, sao kê
ngân hàng hoặc chứng từ giấy.

### 4.1 Nếu xác minh được là tiền ĐÃ trả

Điền bằng chứng thật rồi bỏ cờ. Chỉ chạy khi có chứng từ trong tay:

```sql
UPDATE payment_adjustments
SET completed_at_utc       = '<thời điểm thực trả theo chứng từ, UTC>',
    completed_by_user_id   = '<user_id của người đã chi>',
    refund_method          = <0=Cash, 1=Card, 2=Transfer, 3=EWallet>,
    refund_reference_code  = '<mã chứng từ, NULL nếu tiền mặt>',
    legacy_payout_unverified = FALSE
WHERE adjustment_id = '<id>' AND legacy_payout_unverified = TRUE;
```

Sau bước này khoản đó sẽ xuất hiện trong báo cáo thu ròng của **kỳ chứa ngày thực trả**.

### 4.2 Nếu xác minh được là tiền CHƯA trả

Đưa về `Approved` để đi lại đúng quy trình mới: Lễ tân sẽ xác nhận qua
`POST /api/payment-adjustments/{id}/complete` và có đầy đủ audit.

```sql
UPDATE payment_adjustments
SET status = 1,                        -- Approved
    completed_at_utc = NULL,
    legacy_payout_unverified = FALSE
WHERE adjustment_id = '<id>' AND legacy_payout_unverified = TRUE;
```

> Cảnh báo: chỉ làm bước này khi đã **chắc chắn** tiền chưa ra khỏi quầy. Đưa nhầm một khoản
> đã trả về `Approved` sẽ cho phép trả lần thứ hai.

### 4.3 Nếu không xác minh được

Giữ nguyên cờ. Bản ghi vẫn được tính vào `RefundedAmount` nên không ai hoàn lại lần nữa, và
vẫn nằm ngoài báo cáo kỳ. Đây là trạng thái an toàn và có thể giữ lâu dài.

## 5. Dữ liệu demo

Nếu DB chỉ chứa dữ liệu demo, có thể tạo lại từ đầu trên một DB demo riêng thay vì đối soát
từng bản ghi. **Không** dùng cách này cho DB có dữ liệu thật, và không chạy
`docker compose down -v` trên DB của người dùng.
