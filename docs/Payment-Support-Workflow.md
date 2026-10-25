# Thanh toán, đối soát và hỗ trợ hoàn tiền qua Support Request

Quyết định ngày 24/10/2026, xác nhận sau buổi họp nhóm. Văn bản này là nguồn duy nhất cho các quy tắc dưới đây; khi mâu thuẫn với mô tả cũ trong [Nguồn thống nhất](00-Source-of-Truth.md), [Thiết kế hệ thống](Center-Management-System-Design-v3.md), [API contract](api-contract.md) hay [Functional spec](Functional-and-Nonfunctional-Spec.md), văn bản này thắng.

**Hướng giữ nguyên:** ví điểm (1 điểm = 1.000 VND, không hết hạn), hoàn điểm theo invoice item, dùng điểm khi checkout. **Bổ sung:** giờ bán và hiệu lực của day pass, xử lý thanh toán đến muộn, SLA 2 ngày cho Support Request và luồng Manager hoàn tiền chuyển khoản theo Support Request.

**Không thuộc quyết định này:** voucher, Compensation Campaign, bỏ ví điểm. Các hướng đó đã bị loại.

## 1. Vé Gym 1 ngày (day pass)

| Quy tắc | Giá trị |
|---|---|
| Giờ bán | Từ **06:00 đến trước 22:00** giờ `Asia/Ho_Chi_Minh`. Ngoài khung này backend từ chối tạo checkout: 409 `day_pass_outside_hours`. |
| Hiệu lực | Từ lúc thanh toán thành công đến **22:00 cùng ngày**. Không cộng thêm 24 giờ. `member_packages.expires_at_utc` = 22:00 ngày mua. |
| Ghi chú cho Member | Trong **60 phút cuối trước giờ đóng cửa trung tâm (22:00)**, tức từ 21:00 mỗi ngày, hệ thống báo Member **ngay lúc đặt** (màn checkout, thẻ gói và màn bán của lễ tân): "The gym closes at 22:00. This pass is valid only until then." Không cần ô tick xác nhận, giá không đổi. Thời điểm báo tính từ giờ đóng cửa trừ 60 phút, không đặt cứng 21:00. Thông báo và email sau thanh toán ghi đúng giờ hết hạn 22:00. |
| Giờ mở và đóng cửa | Mở 06:00, đóng 22:00 là hằng số nghiệp vụ của day pass; khoảng báo trước là 60 phút. Backend trả cờ `closingSoon` và `closesAtUtc` trong checkout để UI không tự tính theo đồng hồ trình duyệt. |
| Thanh toán thành công sau 22:00 | Checkout tạo trước 22:00 nhưng tiền về sau 22:00 (ví dụ checkout 21:58, thanh toán xong 22:03): vé không còn giá trị nên **không tự cấp quyền lợi**. Invoice đi theo nhánh "đã thu tiền, chưa cấp quyền lợi" ở mục 2. Kiểm tra giờ phải nằm ở bước cấp quyền lợi, không chỉ ở bước tạo checkout. |
| Giữ nguyên | Giá 50.000đ, một vé hiệu lực mỗi ngày (`day_pass_already_active`), không bán khi Gym đóng vì sự cố (`gym_closed_today`), không nhắc hết hạn, không hoàn tự động, check-in tại quầy bằng QR hội viên do server cấp. |

## 2. Thanh toán đến muộn sau khi checkout hết hạn

**Giảm tần suất:**
- `vnp_ExpireDate` gửi sang VNPay bằng đúng thời hạn checkout (đã có trong `VnPayGateway`). VNPay từ chối thanh toán sau thời điểm này nên chỉ giao dịch bấm trong những giây cuối còn khả năng đến muộn.
- Khi checkout vừa hết hạn, job đối soát gọi QueryDR trước khi nhả chỗ để biết sớm tiền đã trừ chưa. Không nhả chỗ khi còn gateway event chưa xử lý.

**Khi tiền về muộn (BR-88):**

| Tình huống | Kết quả |
|---|---|
| Chỗ hoặc khung giờ còn hợp lệ | Hệ thống **tự cấp quyền lợi** (tạo ghi danh, lượt thuê hoặc gói) và đánh dấu invoice `PAID_AFTER_RECONCILIATION` với `fulfillmentOutcome = FULFILLED`. **Không có bước nhân viên xác nhận.** Lễ tân chỉ xem. |
| Không còn cấp được (chỗ đã bị người khác lấy, lớp đóng hoặc hủy, khung giờ bị đặt, day pass quá 22:00) | `fulfillmentOutcome = RECONCILIATION_REQUIRED`. Hiện ở mục **Paid, not activated** của Lễ tân và ở thông báo trên Overview của Member. |

Với nhánh không cấp được, Member vào chi tiết hóa đơn và chọn **một** trong hai:
1. **Nhận điểm ngay** (`POST /api/invoices/{invoiceId}/convert-to-points`): số điểm = phần tiền đã thu / 1.000, cộng vào ví để mua gói tương đương. Invoice chuyển `COMPENSATED`.
2. **Gửi Support Request** danh mục PAYMENT gắn invoice này (mục 5), chờ xử lý trong 2 ngày.

Khóa trạng thái: một khoản chỉ được xử lý một lần. Sau khi Member chọn điểm thì không gửi request cho cùng invoice, và ngược lại (409 `reconciliation_already_resolved`). Thao tác idempotent theo `Idempotency-Key`.

Đây là trường hợp ngoại lệ hiếm. Nhóm không cần tối ưu thêm ngoài các bước giảm tần suất ở trên.

**Quy đổi điểm:** điểm là số nguyên, 1 điểm = 1.000 VND. Mọi giá bán trong catalog bắt buộc là **bội số của 1.000đ** (BR-113, backend đã kiểm tra khi lưu giá), nên số tiền thu từ VNPay luôn chia hết cho 1.000 và không phát sinh tiền lẻ khi quy ra điểm. Không có làm tròn.

## 3. Nguyên tắc hoàn tiền

- **Đã mua thì không hoàn, kể cả khi Member tự hủy gói.** Hủy ghi danh, hủy thuê sân hoặc hủy gói của Member không tạo hoàn tiền tự động. Chính sách hoàn điểm hiện hành theo invoice item (Membership, hủy sân theo ngưỡng miễn phí) giữ nguyên.
- Hoàn phát sinh khi:
  - **Member gửi Support Request** (danh mục PAYMENT) và Manager hỗ trợ (mục 5).
  - **Sự cố hoặc quyết định phía trung tâm**: lớp bị hủy, lớp dưới ngưỡng, hủy sân do trung tâm. Manager hoàn điểm theo luồng hiện có, server tính cap.
- Manager hoàn điểm cho lớp học khi **lớp do phía trung tâm hủy**: lớp bị hủy và lớp dưới ngưỡng. Member tự hủy ghi danh thì không hoàn.
- Hệ thống **không gọi** ngân hàng hoặc VNPay Refund API. Chuyển khoản là thao tác ngoài hệ thống của Manager, hệ thống chỉ ghi nhận chứng từ.
- Sửa BR-134/135: "hoàn chỉ bằng điểm, không chuyển khoản" thành "hoàn điểm cho sự cố phía trung tâm; hoàn chuyển khoản chỉ qua Support Request do Manager ghi nhận".

## 4. Support Request: SLA, nhắc và hạng mục

| Thuộc tính | Quy tắc |
|---|---|
| Danh mục | `GENERAL, MEMBERSHIP, PAYMENT, FACILITY, COURT, COACH, ACCOUNT, OTHER` (chốt danh mục cuối với nhóm; PAYMENT có luồng riêng ở mục 5) |
| Hạn phản hồi | `slaDueAtUtc = createdAt + 48 giờ`. Quá hạn mà chưa xong thì quá hạn (`overdue`). |
| Member gửi lại ("Remind us") | Chỉ khi request quá 48 giờ chưa xong. Mỗi lần gửi lại cách nhau tối thiểu 48 giờ (`canRemindAtUtc`). Nút bị khóa kèm "You can remind us in about N minutes". |
| Nhắc nhân viên | Khi request quá 48 giờ chưa xử lý: người **được gán** nhận thông báo. Request **chưa gán**: thông báo cho **tất cả Manager và Lễ tân**. Riêng request **PAYMENT** (mục 5): người nhận nhắc chỉ là **Manager** (người được gán, hoặc tất cả Manager nếu chưa gán), không gửi cho Lễ tân; Lễ tân vẫn xem được request và có thể bấm Remind giúp Member. Chống trùng: mỗi người nhận tối đa một thông báo nhắc mỗi 48 giờ cho một request. Dừng khi request xong hoặc bị từ chối. |
| Hiển thị quá hạn | Hàng đợi Support có bộ lọc và dấu **Overdue**. Trang chủ Lễ tân và Manager có thẻ cảnh báo số request quá hạn. |
| Gán | Chuyển lên vai trò cao hơn phải có ghi chú (giữ nguyên `support_transfer_note_required`). |

Trạng thái giữ `OPEN, ASSIGNED, IN_PROGRESS, CLOSED` (kết quả `DONE` hoặc `REJECTED` khi đóng) như contract hiện hành. Thêm sự kiện lịch sử `REMINDED_BY_MEMBER`, `SLA_REMINDER_SENT`, `PAYOUT_RECORDED`, `MEMBER_CONFIRMED_RECEIVED`, `MEMBER_REPORTED_NOT_RECEIVED`.

## 5. Support Request hoàn tiền chuyển khoản (danh mục PAYMENT)

**Nguyên tắc (quyết định 25/10/2026):** hệ thống **không thu thập số tài khoản**. Khi cần thông tin chuyển khoản, **Manager gọi điện trực tiếp cho Member**, thống nhất cách hoàn rồi **ghi chú lại** trong request. Request PAYMENT **không đi qua Lễ tân để xử lý**: chỉ Manager xử lý và ghi payout. Lễ tân **vẫn thấy** request, **chọn loại PAYMENT và tạo request hộ Member** tại quầy, và có thể **bấm Remind giúp Member** để nhắc Manager; mọi bước xử lý sau đó là của Manager.

### 5.1 Member gửi request

- Danh mục request giữ nguyên bộ hiện có. Chỉ khi Member chọn **danh mục PAYMENT** thì form hiện và **bắt buộc**:
  - **chọn một hóa đơn đã thanh toán bằng VNPay** của chính mình (`invoiceId`);
  - mô tả sự cố;
  - **1 đến 3 ảnh minh chứng** (JPG/PNG/WebP, tối đa 5 MB/ảnh), ví dụ biên lai ngân hàng.
- Form **không có** ô ngân hàng, số tài khoản hay chủ tài khoản. Form ghi rõ "Our manager will call you to arrange the refund", nên số điện thoại trong hồ sơ Member phải còn hiệu lực.
- Các danh mục khác không yêu cầu hóa đơn hay ảnh.
- Một hóa đơn chỉ có một request PAYMENT đang mở (409 `payment_request_already_open`). Thiếu hóa đơn hoặc ảnh trả 400 (`payment_request_invoice_required`, `payment_request_proof_required`).
- Request vào hàng đợi `OPEN`, `slaDueAtUtc = createdAt + 48 giờ`, kênh `ONLINE`.

### 5.2 Định tuyến: Lễ tân chỉ xem và nhắc

- Request PAYMENT **hiện** trong hàng đợi, thống kê và chi tiết của Lễ tân ở chế độ **chỉ xem**, có nhãn "Handled by Manager". Lễ tân đọc được mô tả, trạng thái, hạn phản hồi, ảnh Member gửi và thông tin payout (số tiền, thời điểm). Lễ tân **không** xem được ảnh chứng từ payout.
- Lễ tân **không** nhận, gán, chuyển, cập nhật tiến độ, đóng, từ chối hay ghi payout request PAYMENT (403 `payment_request_manager_only`).
- Lễ tân **bấm Remind giúp Member** được: nút "Remind manager" trên chi tiết request PAYMENT. Cùng quy tắc với Remind của Member (chỉ khi quá 48 giờ chưa xong, cách nhau tối thiểu 48 giờ, dùng chung bộ đếm `canRemindAtUtc` với Member, 409 `support_remind_too_early`). Hệ thống ghi sự kiện `REMINDED_BY_STAFF` (người bấm, thời điểm), audit, và thông báo **chỉ cho Manager** (người được gán, hoặc tất cả Manager nếu chưa gán), không thông báo cho Lễ tân khác. Request danh mục khác Lễ tân tự xử lý nên không có nút này.
- Lễ tân **tạo được** request PAYMENT hộ Member ở quầy (kênh `COUNTER`, `PHONE` hoặc `FANPAGE`). Bắt buộc chọn **hóa đơn đã thanh toán bằng VNPay của đúng Member đó** (`invoiceId`, cùng quy tắc: một request mở mỗi hóa đơn, 409 `payment_request_already_open`; hóa đơn đã xử lý xong 409 `reconciliation_already_resolved`; sai chủ hoặc chưa trả VNPay 400 `payment_request_invoice_required`). Ảnh minh chứng **không bắt buộc** khi tạo ở quầy (Lễ tân ghi chú vào mô tả). Request luôn vào trạng thái `OPEN` cho Manager: Lễ tân **không** được giải quyết ngay tại quầy (`resolveNote` bị từ chối: 403 `payment_request_manager_only`) và chỉ được bàn giao cho một **Manager** (gán cho vai trò khác: 409 `payment_request_manager_only`).

### 5.3 Manager xử lý

- Manager gọi điện cho Member (số điện thoại lấy từ hồ sơ), trao đổi cách hoàn, chuyển khoản ngoài hệ thống, rồi trong request chọn **Record payout** và nhập:
  - `amount` (VND): số tiền đã chuyển;
  - **1 đến 3 ảnh chứng từ chuyển khoản**;
  - `note` **bắt buộc**: tóm tắt cuộc gọi và cách đã hoàn (thời điểm gọi, đã thống nhất gì). **Không ghi số tài khoản đầy đủ** vào ghi chú.
- Ràng buộc: `amount` > 0 và không vượt (số tiền VNPay đã thu của invoice − tổng payout đã ghi cho invoice này). Vi phạm trả 409 `payout_amount_exceeds_paid`.
- Mỗi request chỉ ghi payout **một lần** (409 `payout_already_recorded`). Thiếu ảnh trả 400 `payout_proof_required`, thiếu ghi chú trả 400 `payout_note_required`.
- Sau khi ghi, request chuyển `CLOSED` kết quả `DONE`. Manager cũng có thể **Reject** kèm lý do, và có thể ghi chú tiến độ (ví dụ "Called member, no answer") bằng chức năng cập nhật tiến độ hiện có.

### 5.4 Hệ thống sau khi ghi payout

- Ghi audit `SUPPORT_PAYOUT_RECORDED` với mã request, hóa đơn, số tiền, người ghi. Không có dữ liệu ngân hàng nào trong audit hay log ứng dụng.
- Gửi **thông báo trong ứng dụng và email** cho Member. Email chứa liên kết vào chi tiết request (cần đăng nhập), không đính kèm ảnh.
- Số tiền vào **báo cáo doanh thu** và **dashboard tổng quan** của Manager như dòng riêng `bankRefundPaid` (kèm `bankRefundCount`). Không trừ vào doanh thu VNPay thực thu theo cách làm đảo số, không cộng với hoàn điểm, và không trừ hai lần cho cùng một invoice.

### 5.5 Phía Member

- Chi tiết request hiện: trạng thái, số tiền, thời điểm chuyển, **ảnh chứng từ do Manager đính kèm** (chỉ chủ request xem được).
- Member bấm **I received it** để xác nhận, hoặc **Not received** để mở lại cho Manager (request về `OPEN`, ghi sự kiện, thông báo Manager).
- Bước xác nhận được giữ. Nếu Member không bấm gì sau **3 ngày** kể từ khi nhận thông báo thì hệ thống tự coi là đã nhận (`MEMBER_CONFIRMED_RECEIVED`, `by = SYSTEM`).

### 5.6 Dữ liệu

- Hệ thống **không lưu** ngân hàng, số tài khoản hay tên chủ tài khoản của request PAYMENT. Không có mã hóa số tài khoản, không có job xóa dữ liệu ngân hàng.
- Ảnh (ảnh Member gửi và ảnh chứng từ) được giữ theo chính sách lưu hiện hành. Vì ảnh có thể chứa thông tin ngân hàng nên kiểm loại và dung lượng ở backend, ảnh Member gửi: chủ request, Lễ tân và Manager xem được; ảnh chứng từ payout: chỉ chủ request và Manager.

## 6. Hợp đồng API đề xuất (chưa triển khai)

Các endpoint dưới đây chưa có trong backend; không dùng như endpoint hiện hữu cho đến khi được triển khai và chuyển vào [API contract](api-contract.md). Quy ước lỗi, phân trang, `Idempotency-Key` theo contract hiện hành.

| Verb | Route | Role | Hợp đồng |
|---|---|---|---|
| POST | `/api/support/requests` (multipart, mở rộng) | Member | Thêm cho `category=PAYMENT`: `invoiceId`, `files[]` bắt buộc 1–3 (không có trường ngân hàng). Response thêm `slaDueAtUtc`. |
| GET | `/api/support/requests/mine` (mở rộng) | Member | Mỗi dòng thêm `slaDueAtUtc, canRemindAtUtc, remindCount, invoiceId, payout {amount, recordedAtUtc, proofAttachmentIds, memberConfirmedAtUtc, memberConfirmedBy}`. |
| POST | `/api/support/requests/{id}/remind` | Member | Chỉ chủ request; 409 `support_remind_too_early` kèm `retryAfter` khi chưa quá 48 giờ hoặc còn trong cooldown. |
| POST | `/api/support/requests/{id}/confirm-received` | Member | Chỉ khi có payout. Idempotent. |
| POST | `/api/support/requests/{id}/report-not-received` | Member | Chỉ khi có payout và chưa xác nhận; mở lại request. |
| POST | `/api/member-support-requests/{id}/payout` (multipart) | CenterManager | `amount, note` (bắt buộc), `files[1..3]`. Lỗi: 400 `payout_proof_required`, 400 `payout_note_required`, 409 `payout_amount_exceeds_paid`, 409 `payout_already_recorded`, 403 cho Receptionist. |
| GET | `/api/support/attachments/{id}` (mở rộng) | Chủ request, FrontDesk, Manager | Ảnh Member gửi: chủ request, Lễ tân, Manager. Ảnh chứng từ payout: chỉ chủ request và CenterManager, Lễ tân nhận 404. |
| GET | `/api/members/me/unactivated-payments` | Member | Danh sách invoice `RECONCILIATION_REQUIRED` của mình. |
| POST | `/api/invoices/{invoiceId}/convert-to-points` | Member | Quy phần tiền đã thu ra điểm ngay (mục 2); 409 `reconciliation_already_resolved`. |
| GET | `/api/front-desk/payment-reconciliation` (mở rộng) | FrontDesk | Thêm bộ lọc `outcome=RECONCILIATION_REQUIRED` (mục Paid, not activated). |
| GET | `/api/member-support-requests`, `/stats`, `/queue` (mở rộng) | FrontDesk, Manager | Cả hai vai trò thấy request PAYMENT; với Lễ tân response không có ảnh chứng từ payout. `POST /api/member-support-requests` (ghi hộ tại quầy) nhận `category=PAYMENT` kèm `invoiceId` bắt buộc (không có `resolveNote`, chỉ bàn giao cho Manager). Lễ tân gọi assign, progress, done, reject trên request PAYMENT nhận 403 `payment_request_manager_only`. |
| POST | `/api/member-support-requests/{id}/remind` | FrontDesk | Chỉ cho request PAYMENT; nhắc Manager giúp Member. 409 `support_remind_too_early` kèm `retryAfter`, 403 `support_remind_payment_only` nếu không phải PAYMENT. Ghi sự kiện `REMINDED_BY_STAFF`. |
| POST | `/api/support/requests/{id}/sla-reminders` | Job nội bộ | Không mở ra ngoài; job nền gửi thông báo nhắc quá hạn (mục 4). |

Báo cáo: `GET /api/reports/revenue` và dashboard Manager thêm `bankRefundPaid`, `bankRefundCount`; `GET /api/reports/revenue-dimensions` không đổi nghĩa `collectedAmount`.

System setting mới (tùy chọn): `support.sla_hours` (mặc định 48), `support.remind_cooldown_hours` (mặc định 48), `support.payout_confirm_days` (mặc định 3).

## 7. Mô hình dữ liệu đề xuất

| Bảng/cột | Nội dung |
|---|---|
| `member_support_requests` thêm | `sla_due_at_utc`, `invoice_id` (nullable, FK), `remind_count`, `last_member_remind_at_utc`, `last_staff_remind_at_utc` |
| `member_support_payouts` (mới) | `payout_id`, `request_id` (unique), `invoice_id`, `amount`, `note` (bắt buộc), `recorded_by_user_id`, `recorded_at_utc`, `member_confirmed_at_utc`, `member_confirmed_by` (`MEMBER`/`SYSTEM`) |
| `member_support_attachments` thêm | `kind` (`MEMBER_PROOF`/`PAYOUT_PROOF`), `payout_id` (nullable) |
| `invoices.fulfillment_outcome` | Không đổi; thêm giá trị kết quả `COMPENSATED` khi member chọn nhận điểm |
| Check | `amount > 0`; unique `(request_id)` trên payout; không cho hai request PAYMENT mở cùng một `invoice_id` (unique index lọc) |

Không có bảng hay cột lưu thông tin ngân hàng. Migration mới thêm bảng/cột, không sửa migration đã áp dụng; bảng `member_support_payout_details` của bản thiết kế trước (nếu đã tạo) bị bỏ bằng một migration tiếp theo.

## 8. Thông báo và job

| Sự kiện | Người nhận | Kênh |
|---|---|---|
| Quá 48 giờ chưa xử lý (SLA reminder) | Người được gán, hoặc tất cả Manager và Lễ tân nếu chưa gán. Request PAYMENT: chỉ Manager | In-app |
| Member bấm Remind us | Như trên: request PAYMENT chỉ tới Manager | In-app |
| Lễ tân bấm Remind giúp Member (request PAYMENT) | Manager được gán, hoặc tất cả Manager | In-app |
| Payout được ghi | Member | In-app và email |
| Member báo chưa nhận | Manager đã ghi payout | In-app |
| Paid, not activated | Member (Overview) và Lễ tân (mục Paid, not activated) | In-app |

Job `SupportSlaReminderJob` chạy mỗi 15 phút (dedupe theo `request_id + recipient + window 48h`). Job `SupportPayoutAutoConfirmJob` chạy mỗi giờ.

## 9. Tiêu chí nghiệm thu

1. Day pass: tạo checkout lúc 05:59 và 22:00 bị 409; 06:00 và 21:59 thành công; vé mua 14:00 hết hạn đúng 22:00; thanh toán thành công lúc 22:03 cho checkout tạo 21:58 không cấp vé và hiện ở Paid, not activated.
2. IPN muộn còn chỗ: invoice thành `PAID_AFTER_RECONCILIATION` + `FULFILLED`, không cần thao tác nhân viên, một ghi danh duy nhất khi IPN lặp.
3. IPN muộn hết chỗ: member nhận điểm ngay hoặc gửi request; chọn rồi thì lựa chọn kia bị 409.
4. Member không thể Remind us trước 48 giờ hoặc trong cooldown; nhắc nhân viên đúng đối tượng (đã gán vs chưa gán) và không trùng trong 48 giờ.
5. Request PAYMENT thiếu hóa đơn hoặc có 0 hoặc 4 ảnh bị 400; hóa đơn có request mở thứ hai bị 409; form và API không nhận trường ngân hàng.
6. Receptionist thấy request PAYMENT ở chế độ chỉ xem nhưng không gán, đóng, từ chối hay ghi payout được (403), không đọc được ảnh chứng từ payout (404), tạo được request PAYMENT hộ Member nhưng không giải quyết ngay tại quầy; Manager ghi được một lần, kèm ghi chú và ảnh, số tiền không vượt số đã thu.
7. Sau payout: audit, thông báo, email, dòng `bankRefundPaid` trên báo cáo và dashboard; Member xem được ảnh chứng từ của Manager và người khác không xem được.
8. Hệ thống không lưu và không hiển thị số tài khoản ở bất kỳ đâu (DB, log, audit, response).
9. Nhắc quá hạn và Remind us (của Member hoặc do Lễ tân bấm giúp) của request PAYMENT chỉ tới Manager, không tới Lễ tân; Lễ tân bấm Remind giúp tuân theo cùng quy tắc 48 giờ và cooldown với Member.

## 10. Quyết định đã chốt sau họp (24/10/2026)

1. Ghi chú day pass hiện trong 60 phút cuối trước giờ đóng cửa 22:00 (từ 21:00), báo ngay lúc đặt; không đặt cứng giờ 21:00 trong logic.
2. Giữ bước Member xác nhận "I received it / Not received"; không bấm gì sau 3 ngày thì tự xác nhận.
3. ~~Xóa dữ liệu ngân hàng sau 90 ngày~~ Thay bằng quyết định 7: hệ thống không thu thập thông tin ngân hàng.
4. Giá catalog luôn là bội số của 1.000đ, không phát sinh tiền lẻ khi quy ra điểm.
5. Manager hoàn điểm cho lớp phía trung tâm hủy (lớp bị hủy, lớp dưới ngưỡng); Member tự hủy thì không hoàn.
6. Giữ nguyên danh mục Support Request; chọn PAYMENT thì bắt buộc chọn hóa đơn và đính kèm 1–3 ảnh.
7. (25/10/2026) Bỏ nhập số tài khoản ở request PAYMENT. Khi cần thông tin chuyển khoản, Manager gọi điện trực tiếp cho Member, trao đổi rồi ghi chú lại trong payout (ghi chú bắt buộc). Hệ thống không lưu dữ liệu ngân hàng, không mã hóa hay xóa định kỳ.
8. (25/10/2026) Request PAYMENT không đi qua Lễ tân để xử lý: chỉ Manager xử lý và ghi payout. Lễ tân vẫn thấy request (chỉ xem), có thể bấm Remind giúp Member (nhắc Manager, cùng quy tắc 48 giờ và cooldown), tạo request PAYMENT hộ Member, nhưng không gán cho người khác ngoài Manager, không đóng hay ghi payout, và không nhận thông báo nhắc.

9. (25/10/2026) Điểm: Receptionist **được nạp điểm hộ Member** (Add points) bằng đúng luồng Member tự nạp (VNPay, `targetMemberId`, có audit); Receptionist vẫn không tự tặng, trừ hay điều chỉnh điểm. **Manager** được tặng điểm cho Member (người hoặc nhóm chọn bằng bộ lọc, kèm lý do và điều kiện như phát voucher, có audit); màn hình giống Add points của Member nhưng thêm lý do và bộ lọc.

Không còn câu hỏi mở.
