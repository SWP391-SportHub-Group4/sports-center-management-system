# 00 — Source of Truth (SSOT)

> Mục đích: 1 nơi duy nhất để AI / FE / BE tra cứu khi có mâu thuẫn giữa các tài liệu.
> Nếu file này và một doc khác nói khác nhau → **file này thắng**, trừ khi có ghi chú "xem chi tiết tại...".
> Cập nhật lần cuối: 08/09/2026 — người cập nhật: Hồ Lê Thiên An

---

## 0. Thứ tự ưu tiên tài liệu

Khi có mâu thuẫn, đọc theo thứ tự sau (trên > dưới):

1. `docs/00-Source-of-Truth.md` (file này) — quyết định đã chốt, không tranh cãi lại trong sprint hiện tại
2. `docs/SportManagement_BusinessRules_v1.2.docx` — business rules chi tiết
3. `docs/Center-Management-System-Design-v2.md` — thiết kế kỹ thuật/kiến trúc
4. `docs/Requirements.md` — yêu cầu gốc từ đề bài
5. Mọi thứ khác (Slack/Zalo/note họp miệng) — **không tính là nguồn chính thức** trừ khi được chép lại vào 1 trong 4 file trên

**Quy tắc cứng:** Nếu 2 doc mâu thuẫn và chưa kịp cập nhật file này → dừng lại, hỏi trong nhóm, **không tự thêm/đổi entity, field, hay flow để "cho chạy được"**. Ghi lại câu hỏi vào mục 6 (Open Questions) thay vì tự quyết.

---

## 1. MVP Scope

### 1.1 In-scope (bắt buộc — theo đề bài)

- [ ] Flow 1 — User & Membership management
- [ ] Flow 2 — Class booking & schedule management
- [ ] Flow 3 — Payment & report management

### 1.2 In-scope (optional nhưng nhóm chọn làm)

- [ ] Flow 4 — Training & attendance management
- [ ] Flow 5 — AI workout recommendation
- [ ] Flow 6 — AI assistant

### 1.3 Out-of-scope (ghi rõ để khỏi cãi nhau giữa kỳ)

- [ ] <ví dụ: multi-center / multi-tenant>
- [ ] <ví dụ: thanh toán online qua cổng thật (VNPay/Momo) — MVP chỉ ghi nhận thủ công>
- [ ] <ví dụ: mobile app riêng>
- [ ] <ví dụ: notification qua SMS/email thật — MVP chỉ lưu trong DB / log>
- [ ] <thêm...>

---

## 2. Entity đã chốt (Domain Model)

> Điền vào sau họp. Mỗi entity: tên, field chính, quan hệ, module sở hữu.
> Entity nào **chưa** nằm trong bảng này thì **chưa được coi là đã chốt** — ai cần thêm entity mới phải update bảng này trước khi code.

| Entity | Module sở hữu | Field chính (nháp) | Quan hệ chính | Ghi chú |
|---|---|---|---|---|
| User | Identity | Id, Email, PasswordHash, Role | 1—1 với Member/Coach/Staff profile? | Role: xem Enum §3 |
| Member | Membership | Id, UserId, ... | N—1 User, N—1 MembershipPackage | |
| MembershipPackage | Membership | Id, Name, Price, DurationDays | 1—N Member | |
| Class | Scheduling | Id, SubjectId, RoomId, CoachId | N—1 Room, N—1 Coach | |
| ClassSchedule / Session | Scheduling | Id, ClassId, StartTime, EndTime | N—1 Class | |
| Enrollment | Scheduling | Id, MemberId, ClassId, Status | N—1 Member, N—1 Class | |
| Payment | Payment | Id, MemberId, Amount, Method, Status | N—1 Member | |
| Invoice | Payment | Id, PaymentId, ... | 1—1 Payment? | |
| Attendance | Training | Id, EnrollmentId/SessionId, Status | N—1 Session | optional flow |
| TrainingPlan | Training | Id, MemberId, CoachId, Content | N—1 Member, N—1 Coach | optional flow |
| WorkoutSuggestion | AI | (xem `IAiRecommendationService`) | — | optional flow, không phải bảng DB bắt buộc |

*(Bảng trên là khung nháp dựa theo README/design doc hiện có — cần đối chiếu lại với Business Rules doc và chốt lại trong buổi họp.)*

---

## 3. Enum đã chốt

> Mỗi enum: tên, giá trị, ý nghĩa. Đây là nơi DUY NHẤT định nghĩa enum — không định nghĩa lại rải rác trong code/docs khác.

| Enum | Giá trị | Ghi chú |
|---|---|---|
| `UserRole` | CenterManager, Coach, Member, Receptionist | Khớp 4 vai trò trong đề bài |
| `MembershipStatus` | ? | Active / Expired / Cancelled... — chốt trong họp |
| `EnrollmentStatus` | ? | Pending / Confirmed / Cancelled... |
| `PaymentStatus` | ? | Pending / Paid / Failed / Refunded... |
| `PaymentMethod` | ? | Cash / BankTransfer / Card... (MVP thủ công, xem §1.3) |
| `AttendanceStatus` | ? | Present / Absent / Late... |

---

## 4. State Machine đã chốt

> Với mỗi entity có "trạng thái" (status), vẽ rõ luồng chuyển trạng thái hợp lệ — tránh mỗi người code một kiểu.

- **Enrollment**: `? → ? → ?` (ví dụ: Pending → Confirmed → (Completed | Cancelled))
- **Payment**: `? → ? → ?`
- **Membership**: `? → ? → ?` (ví dụ: Active → Expiring → Expired, hoặc Cancelled)

*(Điền sơ đồ/bullet trong buổi họp — có thể vẽ Mermaid ở đây sau.)*

---

## 5. Quy ước chung (Conventions)

### 5.1 ID
- Kiểu ID: `Guid` (uuid) cho mọi entity — **không** dùng auto-increment `int` để tránh lộ số lượng record / trùng khi merge dữ liệu demo.
- Sinh ở tầng nào: <DB default `gen_random_uuid()` hay generate ở app layer trước khi insert?> — chốt trong họp.

### 5.2 Tiền tệ (Money)
- Đơn vị: VND, lưu dạng số nguyên (không có phần thập phân) — **không dùng `float`/`double`**, dùng `decimal`.
- Không lưu ký hiệu tiền tệ trong DB (mặc định VND toàn hệ thống, MVP chưa multi-currency).
- Format hiển thị (dấu chấm/phẩy ngăn cách hàng nghìn) là việc của FE, không phải BE.

### 5.3 Thời gian (Timezone)
- Lưu DB: UTC (`timestamptz` trong Postgres).
- Hiển thị: convert sang `Asia/Ho_Chi_Minh` (UTC+7) ở tầng FE (hoặc BE trả kèm cả UTC, FE tự convert) — chốt 1 cách duy nhất trong họp, tránh chỗ convert chỗ không.
- Định dạng truyền qua API: ISO 8601 (`yyyy-MM-ddTHH:mm:ssZ`).

### 5.4 Naming
- Entity/Class: PascalCase (C# convention).
- API route: `kebab-case` hoặc `camelCase`? — chốt 1 kiểu, ví dụ `/api/membership-packages`.
- DTO suffix: `...Request` / `...Response` (không dùng Entity trực tiếp làm response).

### 5.5 Soft delete vs hard delete
- Mặc định: soft delete (`IsDeleted` / `DeletedAt`) cho entity có liên quan lịch sử (Payment, Attendance, Enrollment...).
- Entity thuần cấu hình (Room, Subject...) có thể hard delete nếu chưa được tham chiếu.
- Chốt danh sách entity nào soft-delete trong họp.

---

## 6. Quy tắc xử lý khi docs mâu thuẫn / thiếu

1. **Không tự thêm entity/field/enum mới** để "cho code chạy" — nếu thiếu, thêm vào mục **Open Questions** bên dưới và hỏi người phụ trách domain đó (BA/team lead) trước khi code.
2. Nếu 2 tài liệu mâu thuẫn nhau, ưu tiên theo thứ tự ở mục 0 — nhưng vẫn phải báo lại trong nhóm để cập nhật doc gốc bị sai, không âm thầm code theo rồi thôi.
3. Mọi thay đổi entity/enum/state đã chốt (mục 2/3/4) phải được cập nhật vào file này **trong cùng buổi** — không để trôi qua PR review mới biết.
4. AI (nếu dùng Claude/Copilot để code) **phải đọc file này trước khi sinh code liên quan đến entity/DTO/enum** — nếu file này chưa đủ thông tin, dừng và hỏi thay vì đoán.

---

## 7. Open Questions (chưa chốt — cần họp quyết định)

- [ ] <câu hỏi 1>
- [ ] <câu hỏi 2>
- [ ] <câu hỏi 3>

---

## 8. Changelog

| Ngày | Thay đổi | Người sửa |
|---|---|---|
| 08/09/2026 | Tạo sườn ban đầu | Hồ Lê Thiên An |
| 08/09/2026 | Thêm `Extensions/CorsExtensions.cs` (policy `Default`, đọc `Cors:AllowedOrigins`), `Extensions/SwaggerExtensions.cs`, `Extensions/JwtExtensions.cs` (stub) + `Middleware/` skeleton; bật CORS cho FE `http://localhost:3000` trong `Program.cs` | Hồ Lê Thiên An |
| 08/09/2026 | Nâng target framework 3 project backend từ `net8.0` lên `net10.0` (LTS) — .NET 8/9 EOL 10/11/2026; update NuGet: EFCore/JwtBearer 10.0.11, Npgsql.EFCore.PostgreSQL 10.0.3, Swashbuckle 10.2.3; Dockerfile SDK/runtime image → 10.0 | Hồ Lê Thiên An |
| 08/09/2026 | Sửa reference ở mục 0 từ `SportManagement_BusinessRules_v1.1.docx` (stale, file đã lên v1.2) → `SportManagement_BusinessRules_v1.2.docx`, khớp với `Center-Management-System-Design-v2.md` | Hồ Lê Thiên An |
