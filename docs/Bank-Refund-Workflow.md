# Hoàn tiền về tài khoản ngân hàng qua Support Request

Quyết định 23/10/2026. Thay thế các câu "ngoài phạm vi: hoàn tiền mặt/ngân hàng" trong `00-Source-of-Truth.md`, `Center-Management-System-Design-v3.md` và `api-contract.md`. **Luồng hoàn điểm hiện có giữ nguyên** (`/api/refunds`, hủy lớp/Membership/thuê sân bằng điểm). Hệ thống **không gọi ngân hàng/VNPay Refund API**: Manager chuyển khoản ngoài hệ thống rồi ghi nhận chứng từ.

## 1. Tóm tắt nghiệp vụ

1. Member (hoặc Receptionist/Manager tạo hộ) gửi Support Request loại `PAYMENT`: bắt buộc giao dịch (`InvoiceItem`), ngân hàng, số tài khoản (6–20 chữ số), tên chủ tài khoản và ≥ 1 ảnh chứng cứ (tối đa 3 ảnh JPG/PNG/WebP, ≤ 5 MB/ảnh, kiểm tra theo nội dung tệp). Các loại khác: ảnh tùy chọn, cùng giới hạn, cho cả Member, Receptionist và Manager.
2. Gửi yêu cầu **không** cộng điểm, không hủy quyền lợi, không ghi "đã chuyển tiền".
3. Chỉ `CenterManager` duyệt/từ chối/đóng. Receptionist chỉ tạo hộ, xem tiến độ và kết quả (số tài khoản bị che). Coach/Admin không có quyền. Không gán `PAYMENT` cho Receptionist/Coach/Admin; không dùng `ResolveNote` đóng ngay.
4. Duyệt = điểm khóa: Manager nhập số VND quyết định (≤ giá trị thực còn có thể hoàn) và lý do; quyền lợi **bị hủy ngay** (Membership/lớp/thuê sân) để Member không dùng tiếp trong lúc chờ chuyển khoản; số tiền được **giữ chỗ** trong trần lũy kế của item.
5. Manager chuyển khoản ngoài hệ thống, rồi ghi nhận: số tiền thực chuyển (= số đã duyệt), thời điểm, mã giao dịch ngân hàng (tùy chọn), ghi chú lý do hoàn (≥ 10 ký tự), 1–3 ảnh chứng từ. Chỉ khi đó ticket sang `DONE`.
6. `DONE` tạo thông báo trong hệ thống + email cho Member (loại dịch vụ, số tiền, lý do, mã yêu cầu, tài khoản che còn 4 số cuối, đường dẫn `/member/help?ticket=<id>` xem chứng từ **sau khi đăng nhập**). Không gửi số tài khoản đầy đủ hay ảnh qua email/thông báo.

## 2. Trạng thái

Ticket (`member_support_requests.status`): `OPEN → ASSIGNED → IN_PROGRESS → APPROVED_AWAITING_PAYOUT → DONE`, hoặc `→ REJECTED`.
Hoàn tiền (`bank_refund_requests.status`): `PENDING → APPROVED_AWAITING_PAYOUT → PAID`, hoặc `PENDING → REJECTED`.

| Từ → Đến | Ai | Điều kiện |
|---|---|---|
| `PENDING` → `APPROVED_AWAITING_PAYOUT` | CenterManager | số tiền nguyên 1…còn hoàn được; lý do ≥ 3 ký tự, ≥ 10 nếu khác gợi ý hoặc "lỗi trung tâm"; hủy quyền lợi thành công |
| `APPROVED_AWAITING_PAYOUT` → chính nó | CenterManager | duyệt lại để chỉnh số tiền trước khi chuyển (không hủy quyền lợi lần nữa) |
| `PENDING` → `REJECTED` | CenterManager | lý do 3–500 ký tự; không cần chứng từ |
| `APPROVED_AWAITING_PAYOUT` → `PAID` | CenterManager | số chuyển = số duyệt, 1–3 ảnh, ghi chú ≥ 10 ký tự, `CompletionKey` |
| `APPROVED_AWAITING_PAYOUT` → từ chối | — | **không cho phép** (quyền lợi đã kết thúc); chỉ có thể ghi nhận chuyển khoản hoặc chỉnh số duyệt |

`PAID`/`REJECTED` là cuối; hoàn tất lần hai → 409 `bank_refund_already_paid`.

## 3. Số tiền gợi ý (không phải quyết định tự động)

Cùng **tỷ lệ chính sách hoàn điểm** nhưng áp lên **VND thực còn được hoàn**, không nhân ngược số điểm đã làm tròn (`floor(giá_trị_còn × tử/mẫu)`; ví dụ 50% của 1.999.999 ₫ = 999.999 ₫). Tính tại **thời điểm gửi yêu cầu** như luồng điểm.

| Loại | Chính sách |
|---|---|
| Lớp | trước buổi đầu còn ≥ 5 ngày: 100%; < 5 ngày: 50%; đã vào buổi đầu: 0% |
| Membership | còn ≥ 2/3 thời hạn: 50%; ít hơn: 0% |
| Thuê sân | trước giờ bắt đầu ≥ `rental.cancel_free_hours` (mặc định 24 giờ): 100%; lỗi trung tâm/sân bị hủy: 100% |
| Lỗi trung tâm | Membership theo ngày chưa dùng / tổng ngày; lớp: buổi chưa cung cấp / tổng buổi (hoặc 100% nếu chưa có buổi/trước buổi đầu); thuê sân 100% |
| Vé Gym 1 ngày | không hoàn (chặn từ lúc chọn giao dịch) |

Manager thấy tỷ lệ, số gợi ý, số gợi ý nếu lỗi trung tâm và căn cứ. Manager được quyết định khác gợi ý (ghi lý do) nhưng **không vượt giá trị thực còn có thể hoàn**; ngoại lệ vượt trần cần quy trình riêng có audit (chưa có).

Giá trị thực còn có thể hoàn do một hàm duy nhất tính (`RefundValue.RemainingAsync`) dùng chung cho hoàn điểm thủ công, hoàn điểm hệ thống và hoàn tiền: phần đã trả theo tỷ trọng item (tiền + điểm) + chênh lệch chuyển lớp đã thanh toán − điểm đã hoàn (thủ công, hệ thống, chuyển lớp) − payout legacy − **bank refund đã duyệt/đã chuyển**.

## 4. Chống chạy đua

- Khóa theo thứ tự: ticket → bank refund → invoice → invoice item (`FOR UPDATE`); luồng điểm khóa invoice → item cùng thứ tự.
- Unique index một yêu cầu đang xử lý (`PENDING`/`APPROVED_AWAITING_PAYOUT`) trên mỗi item; unique `support_request_id`.
- Item có bank refund đã duyệt/đã chuyển: hoàn điểm thủ công, hủy-hoàn điểm lớp/Membership bị 409 `bank_refund_committed`; hoàn điểm hệ thống bị giới hạn bởi trần lũy kế.
- Yêu cầu đang `PENDING` không chặn Member hủy bằng điểm; khi Manager duyệt, trần đã trừ phần điểm đã hoàn (giá trị còn 0 → 409 `bank_refund_nothing_left`).
- Retry: `CompletionKey` do client sinh mỗi lần mở form; gửi lại cùng khóa trả kết quả cũ (không ghi hai lần, không gửi hai thông báo); khóa khác → 409.
- Thông báo/email nằm cùng transaction (outbox); chỉ mục duy nhất `(event, user, kênh, bankRefundId)` chặn trùng.

## 5. Chuyển khoản xong nhưng ghi DB thất bại

Hệ thống không bao giờ chuyển tiền, nên retry không thể chuyển lại. Nếu đã chuyển mà không ghi nhận được (lỗi mạng/ảnh/DB): Manager bấm **Flag for reconciliation** (`POST …/flag-payout`, ghi chú ≥ 10 ký tự) → ticket giữ `APPROVED_AWAITING_PAYOUT` với cờ `needsReconciliation` (lọc `GET /api/bank-refunds?needsReconciliation=true`). Vận hành đối chiếu sao kê ngân hàng; **không chuyển lại**. Khi ghi nhận hoàn tất, cờ tự xóa.

## 6. Báo cáo và đối soát

Khoản `PAID` vào `totalRefunded`/`refundCount`/`netRevenue` **đúng một lần**, theo ngày thực chuyển (`payout_at`, giờ Việt Nam, BR-43), và hiện riêng ở `bankRefundAmount`/`bankRefundCount`; tách khỏi `pointsRefunded`. Duyệt chưa chuyển không vào báo cáo. `ReportReconciliationService` thêm kiểm tra "Bank refunds" so báo cáo với tổng `payout_amount` trong kỳ. Không dùng các field legacy `RefundMethod/RefundReferenceCode` của `PaymentAdjustment`.

## 7. Dữ liệu và migration

`20261023143941_AddBankRefundRequests`: `bank_refund_requests` (ràng buộc CHECK trạng thái, số tiền > 0, trường bắt buộc khi đã duyệt/đã chuyển/từ chối; index unique active-item; index báo cáo `payout_at`), `member_support_attachments.kind` (`EVIDENCE` | `PAYOUT_PROOF`) + `uploaded_by_user_id`, `member_support_requests.requires_payout` và `status` mở rộng 30 ký tự. Ticket PAYMENT cũ (`requires_payout = false`) đóng bằng done/reject thường nhưng chỉ Manager.

Số tài khoản lưu dạng văn bản trong DB (cùng mức bảo vệ dữ liệu cá nhân khác); API trả đầy đủ cho Manager và chính Member, che (`••••1234`) cho Receptionist, không bao giờ vào email/thông báo.

## 8. API

Xem `api-contract.md` mục "Hoàn tiền ngân hàng". Mã lỗi chính: `support_payment_*` (400 thiếu/sai dữ liệu), `bank_refund_item_not_owned` (403), `bank_refund_not_eligible`/`bank_refund_nothing_left`/`bank_refund_already_*`/`bank_refund_committed`/`refund_exceeds_item_paid` (409), `support_payment_manager_only` (403), `support_payment_use_refund_workflow` (409).

## 9. Vận hành chuyển khoản ngoài hệ thống

1. Vào **Manager → Requests → Member support**, lọc loại Payment (nổi bật màu xanh, thẻ "Awaiting transfer" cho khoản đã duyệt).
2. Mở ticket, đối chiếu snapshot (đã trả, đã dùng/chưa dùng, hoàn trước đó, gợi ý chính sách). Duyệt với số tiền và lý do hoặc từ chối với lý do.
3. Sau khi duyệt, tự chuyển khoản qua ngân hàng đúng số tiền tới tài khoản hiển thị (đối chiếu tên chủ tài khoản).
4. Quay lại ticket: nhập số tiền thực chuyển, giờ chuyển, mã giao dịch, lý do hoàn, tải ảnh biên lai, tích xác nhận, **Mark as refunded**.
5. Mất kết nối giữa chừng: tải lại trang trước khi thử lại; nếu ticket vẫn "awaiting transfer" mà tiền đã đi, dùng **Flag for reconciliation** và đối chiếu sao kê. Không chuyển lại.
6. Sai số tiền sau khi duyệt nhưng chưa chuyển: dùng **Update approval** để chỉnh số duyệt.

## 10. Giới hạn đã biết

- Không có quy trình hoàn ngược/thu hồi khi đã duyệt nhưng Manager nhầm: quyền lợi đã hủy. Cần xử lý thủ công (mở lại quyền lợi bằng thao tác dữ liệu có audit).
- Không có ngoại lệ vượt trần; không hoàn một phần lặp lại sau khi item đã hủy trừ khi còn giá trị trong trần.
- Chỉ hỗ trợ item Membership, lớp, thuê sân. Nạp ví, chênh lệch chuyển lớp, vé 1 ngày: không.
- Ảnh lưu trong DB (như ảnh support hiện có); chưa mã hóa ở mức cột.
