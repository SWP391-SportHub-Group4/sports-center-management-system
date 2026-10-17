# Kế hoạch chuẩn hóa business rule (tài liệu ↔ code)

Ngày rà soát: 17/10/2026. Phạm vi: 5 role. Tiêu chí: đối chiếu tài liệu với code BE/FE.

**Giới hạn của lần rà soát:** không đọc được `SportManagement_BusinessRules_v2.0_updated.docx` (Word) nên chưa đối chiếu từng mã BR. Đã đọc `00-Source-of-Truth.md`, `Requirements.md`, `PRODUCT.md`, các đoạn liên quan của `Center-Management-System-Design-v3.md`, và kiểm các hằng số nghiệp vụ trong code. Chưa chạy test.

## 1. Kết luận

Quy tắc lõi **khớp** giữa tài liệu và code. Vấn đề chính là **tài liệu cũ hoặc mâu thuẫn nhau**, và một số quy tắc đã đổi nhưng chưa có người chốt.

### Đã khớp (đã kiểm)

| Rule | Tài liệu | Code |
|---|---|---|
| 1 điểm = 1.000 VND | SoT §2 | `RefundCalculator.VndPerPoint = 1_000` |
| Hoàn Membership: còn ≥ 2/3 thời hạn thì tối đa 50% | SoT §4 | `MembershipPoints`: `remainingDays*3 >= totalDays*2` → 50% |
| Lỗi trung tâm hoàn theo phần chưa dùng, không hoàn 100% | Design v3 dòng 179 | `MembershipPoints` với `centerFault` |
| Vé ngày 50.000đ, không hoàn | SoT §4 | `DayPass.PackageId = 50000`, `EnsureNotDayPassAsync` |
| Hủy lớp: ≥ 5 ngày hoàn 100%, dưới 5 ngày 50% | Design v3 dòng 157 | `ClassFullRefundWindow = 5 ngày`, `ClassLateRefundPercent = 50` |
| Thuê sân: hủy trước 24 giờ hoàn 100%, tối đa 4 giờ | PRODUCT.md | `RentalCancelFreeHours`, `RentalMaxHours (1–4)` |
| OTP dùng điểm tại quầy: 5 phút, tối đa 5 lần sai | Design v3 dòng 461, 923 | `PointConfirmationService` (`FailedAttempts >= 5`) |
| Link kích hoạt staff 24 giờ, Member chưa kích hoạt 7 ngày | SoT §1, §4 | `ActivationLinkService` 24 giờ, `MemberInvitationExpiryService` 7 ngày |
| "Chờ đợt sau" hoàn 100% điểm và không giữ chỗ | SoT §4 | `ThresholdResponseService` (`WaitNextCourse`) |
| Chặn xem nội dung lớp khi ghi danh kết thúc hoặc lớp bị hủy; vẫn xem được khi lớp Completed | Completion doc | `ClassTeachingService`, `ClassesController.MemberSessions` |

## 2. Điểm lệch cần chỉnh

### P1 — Mâu thuẫn chính sách ngôn ngữ

- `00-Source-of-Truth.md` §5 ghi rõ: **chỉ tiếng Anh, không có language switch**.
- `PRODUCT.md` (Users, Capabilities "Hỗ trợ đa ngôn ngữ", Product Principle 4), `Requirements.md` §5 ("hỗ trợ UI EN/VI") và Design v3 dòng 137 vẫn nói song ngữ.
- FE: `language.tsx` luôn trả `en`, nhưng 66 file `.tsx` vẫn còn nhánh `vi`/`tx(...)` không bao giờ chạy.

**Việc cần làm**
1. Chốt chính sách duy nhất là English-only (đã xác nhận trong phiên này).
2. Sửa `PRODUCT.md`: bỏ "EN/VI", sửa Principle 4 thành "mọi thông điệp bằng tiếng Anh, nội dung người dùng nhập giữ nguyên".
3. Sửa `Requirements.md` §5 và Design v3 dòng 137 cho khớp.
4. Dọn FE: rút các nhánh `vi` về một chuỗi tiếng Anh, sau đó bỏ union `Language = "en" | "vi"` trong `language.tsx`. Làm theo từng thư mục để dễ review.

### P1 — Tài liệu ghi "chưa làm" nhưng code đã có

| Vị trí | Nội dung cũ | Thực tế |
|---|---|---|
| `Requirements.md` dòng 21 | Receptionist tiếp nhận yêu cầu hỗ trợ "(yêu cầu, chưa triển khai)" | Đã có phân công, cập nhật tiến độ, đóng; có audit |
| `Requirements.md` dòng 68 | "chờ đợt sau" … "chưa có implementation" | Đã có `CourseInterest`, job thông báo, UI |
| `00-Source-of-Truth.md` dòng 101 (§6) | Liệt kê "chờ đợt sau" là phần còn thiếu | Đã có mã, còn nghiệm thu staging |
| `00-Source-of-Truth.md` §4 (BR-96) | "Giới hạn đúng một môn khi tạo Coach là khoảng trống triển khai" | `UserAdminService` đã bỏ giới hạn một môn (thay đổi chưa commit); nên cập nhật thành "đã khớp" sau khi merge |
| `Requirements.md` dòng 21 | "(in/xuất hóa đơn chưa thấy trong giao diện)" | Đã có nút Download PDF cho Member và staff |

### P2 — Quy tắc chưa được chốt rõ

1. **Hội viên khi lớp chuyển Completed (đã chốt 18/10/2026):** Member vẫn xem lại kết quả, nhận xét, giáo án và lịch buổi sau khi lớp Completed; lớp Cancelled/Draft hoặc ghi danh đã kết thúc vẫn bị chặn. Đã sửa BE, FE, test và `Member-Receptionist-Completion.md`; còn lại ghi vào Requirements §4.
2. **Support request:** mọi FrontDesk đều cập nhật, đóng được yêu cầu của người khác (đã xác nhận là chủ đích). Cần ghi vào Requirements/Design v3 để khỏi bị coi là lỗi phân quyền.
3. **`HoldMinutes`:** PRODUCT.md nói giữ chỗ 15 phút, code cho cấu hình 1–1440 phút. Cần ghi "mặc định 15, Manager chỉnh được trong khoảng nào" hoặc siết lại.
4. **Thông báo nhắc lịch:** tài liệu chưa nêu quy tắc (nhắc 1 lần trong 24 giờ trước buổi, chỉ ghi danh còn hiệu lực). Thêm vào Requirements §4.
5. **Thông báo lớp mới cho người "chờ đợt sau":** gửi khi lớp cùng môn được Published sau lúc đăng ký quan tâm, bỏ qua người đã ghi danh lớp đó. Thêm vào Requirements §4.

### P3 — Chưa kiểm được

- Mã BR cụ thể trong file `.docx`. Cần xuất Word sang text hoặc đưa một bản Markdown để đối chiếu từng BR.
- `Center-Management-System-Design-v3.md` (141 KB): mới đọc các đoạn liên quan hoàn tiền, OTP, ngôn ngữ.
- Phía FE: chưa kiểm hiển thị đúng rule ở từng màn (ví dụ cảnh báo vé ngày trước khi trả tiền, hạn giữ chỗ).

## 3. Thứ tự thực hiện đề xuất

1. **Chốt quyết định** cho mục P2 (3). P2 (1) đã chốt; các mục còn lại chỉ cần ghi lại.
2. **Sửa tài liệu** (nhanh, không rủi ro): các hàng P1 "tài liệu cũ", thêm quy tắc P2 (2), (4), (5). File: `Requirements.md`, `00-Source-of-Truth.md`, `PRODUCT.md`, `Center-Management-System-Design-v3.md`.
3. **Sửa chính sách ngôn ngữ** trong tài liệu (bước P1 ngôn ngữ 1–3).
4. **Dọn FE nhánh `vi`** theo thư mục, mỗi PR một nhóm màn hình, chạy Playwright sau mỗi nhóm.
5. ~~P2 (1)~~ đã làm xong (BE, FE, test, doc).
6. **Đối chiếu mã BR** khi có bản text của file `.docx`; bổ sung bảng "BR → code → test" cho các BR còn lại.

## 4. Tiêu chí hoàn thành

- Không còn câu nào trong tài liệu nói tính năng "chưa triển khai" khi code đã có.
- Chỉ còn một chính sách ngôn ngữ trong mọi tài liệu và FE không còn nhánh `vi` chết.
- Mỗi quy tắc P2 có một nơi ghi duy nhất (SoT hoặc Requirements) và có test hoặc evidence kèm theo.
