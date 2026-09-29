# SportHub — Hệ thống quản lý nhà văn hóa thể thao đa môn (SWP391)

Monorepo cho hệ thống quản lý **nhà văn hóa thể thao đa môn**: nhiều bộ môn (seed: Gym, Personal Training, Cầu lông, Bóng rổ — Manager tự thêm/sửa môn), nhiều sân/phòng, **khóa học cố định theo lớp** (ví dụ Cầu lông 01, 02), huấn luyện viên của trung tâm và huấn luyện viên tự do (ExternalCoach) thuê sân theo giờ. Thanh toán bằng tiền (VNPay-QR) kết hợp **ví điểm** (1 điểm = 1.000 VND). Thiết kế đầy đủ: [`docs/Center-Management-System-Design-v3.md`](docs/Center-Management-System-Design-v3.md).

> **Đổi phạm vi 30/09/2026:** hệ thống không còn là một phòng gym (bộ môn cũ Yoga/Group X đã bỏ). Nguồn nghiệp vụ hiện hành là **Business Rules v2.0** ([`docs/SportManagement_BusinessRules_v2.0_updated.docx`](docs/SportManagement_BusinessRules_v2.0_updated.docx), BR-1 → BR-139); thiết kế hiện hành là **Design v3**. Nếu hai tài liệu mâu thuẫn, Business Rules thắng.

> **Trước khi code:** đọc [`docs/00-Source-of-Truth.md`](docs/00-Source-of-Truth.md) (scope MVP, entity/enum/state, quy ước ID/money/timezone) và Design v3 §0, §2, §16. Nếu SSOT chưa kịp đồng bộ với Design v3 thì Design v3 + BR v2.0 thắng (SSOT sẽ được cập nhật theo Design v3 §19.1).

## Sản phẩm

### 6 vai trò

| Vai trò | Làm gì |
|---|---|
| System Administrator | Tạo tài khoản nhân sự (Admin/Manager/Receptionist), đổi vai trò, khóa/mở khóa |
| Center Manager | CRUD môn, phòng/sân, giá thuê sân, Membership; tạo lớp + xếp lịch (có chatbot gợi ý), phân công Coach theo chuyên môn, duyệt ExternalCoach, duyệt hoàn điểm, sự cố/thông báo, báo cáo, Audit Log |
| Coach (của trung tâm) | Chuyên môn theo môn (`CoachSpecialty`); xem lịch dạy và roster lớp mình; Coach có chuyên môn PT: PT session, kế hoạch tập, kết quả, homework, gợi ý AI |
| ExternalCoach | Coach tự do: tự đăng ký, chờ Manager duyệt, xem sân trống + giá, thuê sân theo giờ, thanh toán, ví điểm. Không quản lý/điểm danh học viên riêng |
| Member | Đăng ký Membership Gym, PT; xem lớp/khóa học, ghi danh có giữ chỗ, ví điểm, lịch hôm nay/tuần, thông báo, chatbot |
| Receptionist | Tìm/đăng ký Member tại quầy, Gym check-in/out, điểm danh lớp nhóm, checkout thay Member (dùng điểm cần OTP email của Member), Court Schedule, hỗ trợ đối soát |

### Các Flow

| Flow | Loại | Nội dung |
|---|---|---|
| 1 — User & Membership | Bắt buộc | 6 vai trò, Coach + chuyên môn, ExternalCoach đăng ký/duyệt, Membership Gym, Gym check-in, mật khẩu mạnh, quên mật khẩu (không hỏi mật khẩu cũ) |
| 2 — Class booking & schedule | Bắt buộc | Môn/Phòng/Sân, lớp theo khóa, ghi danh + giữ chỗ chống bán vượt sĩ số, ngưỡng hoàn vốn, Court Schedule, thuê sân, điểm danh lớp nhóm |
| 3 — Payment & report | Bắt buộc | Invoice nhiều loại item, VNPay-QR, ví điểm + split payment, hoàn trả **chỉ bằng điểm**, báo cáo theo môn/nguồn |
| 4 — Training & attendance | Optional (nhóm vẫn làm) | PT: kế hoạch, kết quả, homework, điểm danh |
| 5 — AI workout recommendation | Optional (nhóm vẫn làm) | Gợi ý bài tập cho Coach có chuyên môn PT |
| 6 — AI assistant | Nhóm làm | Chatbot function calling: Member xem lịch hôm nay; Manager gợi ý xếp lịch |

### Quy tắc chính cần nhớ

- **Điểm:** 1 điểm = 1.000 VND, không hết hạn, không rút tiền mặt. **Mọi hoàn trả chỉ bằng điểm — không có hoàn tiền mặt/chuyển khoản, không gọi VNPay Refund API.**
- **Split payment:** một Invoice trả bằng điểm + VNPay-QR (ví dụ 300.000đ = 200 điểm + 100.000đ). Receptionist thanh toán thay Member **bắt buộc** có OTP 6 số gửi email Member (hiệu lực 5 phút, sai tối đa 5 lần).
- **Giữ chỗ:** checkout lớp giữ chỗ 15 phút; không bán vượt sĩ số (ràng buộc ở DB).
- **Ngưỡng hoàn vốn:** lớp chốt trước khai giảng N ngày; dưới ngưỡng thì học viên chọn chuyển lớp hoặc hoàn điểm.
- **Chống trùng lịch:** sân/Coach dùng exclusion constraint PostgreSQL (`btree_gist`).

## Cấu trúc

```
sports-center-management-system/
├── backend/     # ASP.NET Core Web API (feature-based modular monolith, 11 project) — mở bằng Rider
├── frontend/    # Next.js — mở bằng VS Code
├── ai/          # Reserved — AI hiện đang là module bên trong backend, xem ai/README.md
├── docs/        # Business Rules v2.0, Design v3 (ERD, API, RBAC...), SSOT, RUNBOOK, Git workflow
└── docker-compose.yml
```

**Không thêm project backend mới** (quyết định 30/09/2026): ví điểm nằm trong `SportHub.Payment/Wallet`, catalog môn/phòng/giá sân nằm trong `SportHub.Scheduling/Catalog`, `ExternalCoachProfile` nằm trong `SportHub.Identity`; các module chỉ gọi nhau qua interface ở `BuildingBlocks`.

## Tài liệu

| Tài liệu | Vai trò |
|---|---|
| [`docs/SportManagement_BusinessRules_v2.0_updated.docx`](docs/SportManagement_BusinessRules_v2.0_updated.docx) | Business Rules v2.0 — nguồn nghiệp vụ hiện hành (thắng khi mâu thuẫn) |
| [`docs/Center-Management-System-Design-v3.md`](docs/Center-Management-System-Design-v3.md) | Thiết kế hiện hành: ERD v3, state machine, API, RBAC, chatbot, UI map, thứ tự triển khai G0–G12, phụ lục Xóa/Giữ/Sửa/Thêm |
| [`docs/00-Source-of-Truth.md`](docs/00-Source-of-Truth.md) | Scope MVP, entity/enum/state, quy ước (đang được đồng bộ theo Design v3) |
| [`docs/Requirements.md`](docs/Requirements.md), [`docs/SWP391_Report_SRS.docx`](docs/SWP391_Report_SRS.docx) | Yêu cầu và báo cáo SRS |
| [`docs/entity-field-purpose.md`](docs/entity-field-purpose.md) | Ý nghĩa từng trường của entity |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Chạy local, tài khoản demo, kịch bản demo theo Flow |
| [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) | Quy trình Git, phân module theo giai đoạn G0–G12 |
| [`docs/Center-Management-System-Design-v2.md`](docs/Center-Management-System-Design-v2.md) | **Đã bị thay thế bởi Design v3** — chỉ để đối chiếu lịch sử (có bảng ánh xạ v2 → v3 ở đầu file) |
| [`PRODUCT.md`](PRODUCT.md), [`DESIGN.md`](DESIGN.md) | Định vị sản phẩm và hệ thống thiết kế giao diện |

## Chạy thử nhanh

Xem [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — có tài khoản demo cho cả 6 vai trò và kịch bản demo cho Flow 1–6.

> Đây là đặc tả đích; code hiện tại chưa khớp Design v3 hoàn toàn (ví dụ VNPay chưa có trong mã — Design v3 §2.1). Lộ trình chuyển đổi: Design v3 §16 (G0–G12). Không dùng kết quả test cũ để kết luận rule mới đã đạt.

## Backend — Feature-based Modular Monolith (11 project)

```
backend/
├── SportHub.API/                  # Composition root — Program.cs, DbContext, Migrations, controller
│   ├── Controllers/
│   │   └── HealthController.cs
│   ├── Persistence/
│   │   └── SportHubDbContext.cs
│   ├── Migrations/
│   ├── Extensions/
│   │   ├── CorsExtensions.cs
│   │   ├── SwaggerExtensions.cs
│   │   └── AuthorizationPolicyExtensions.cs
│   └── Program.cs / appsettings*.json
├── SportHub.BuildingBlocks/       # Hạ tầng dùng chung — KHÔNG phụ thuộc bất kỳ module nghiệp vụ nào
│   ├── Abstractions/Persistence/ISportHubDbContext.cs
│   └── Infrastructure/Authentication/{JwtOptions,JwtService,JwtBearerExtensions}.cs
├── SportHub.Identity/             # Role (6 vai trò), UserAccount, UserCredential, UserProfile, UserExternalLogin, ExternalCoachProfile, UserSportSpecialty, EmailOtp
├── SportHub.Membership/           # MembershipPackage, MemberPackage, MemberTrainingProfile
├── SportHub.Scheduling/           # Catalog/ (Sport, RoomType, Room, CourtRate), Class, ClassSession, Enrollment, SeatHold, CourtRental, Occupancy, Attendance
├── SportHub.Training/             # CoachMemberRelationship, WorkoutPlan, WorkoutPlanItem, WorkoutResult
├── SportHub.Payment/              # Invoice, InvoiceItem, Payment, PaymentAdjustment (hoàn = điểm), Wallet/ (ví điểm), VnPay/ (IPaymentGateway: VnPay + Mock)
├── SportHub.Notification/         # Notification
├── SportHub.AI/                   # AiLog, gợi ý tập luyện (BR-26/27), chatbot function calling (ChatToolRegistry)
├── SportHub.Audit/                # AuditLog — module riêng vì có FK thật sang UserAccount (Identity)
└── SportHub.Administration/       # SystemSetting, ReportExport + thao tác quản trị tài khoản
                                   #   Tách riêng vì khoá/mở khoá (BR-6) bắt buộc ghi Audit trong
                                   #   cùng transaction (BR-7): Audit đã phụ thuộc Identity, nên để
                                   #   Identity gọi ngược Audit sẽ thành vòng phụ thuộc.
```

Mỗi module (trừ `API`/`BuildingBlocks`) dùng chung 1 cấu trúc nội bộ:

```
SportHub.<Module>/
├── <Module>ModuleMarker.cs
├── Domain/
│   ├── Entities/        # Entity thật, di chuyển nguyên trạng từ SportHub.Repository cũ
│   └── Enums/           # Enum thật
├── Domain/Rules/         # Bất biến nghiệp vụ dùng chung giữa các use case (vd MemberPackageRules)
├── Application/          # use case của module — Interface/Service tách riêng, DTO/Command tách theo request-response
│   ├── Interfaces/       # IFooService — hợp đồng, Controller inject qua đây (BẮT BUỘC, không khai báo trong Services/)
│   ├── Services/         # FooService — cài đặt interface, chứa logic thật
│   ├── DTOs/             # Response — kết quả trả ra, gom theo tính năng (vd DTOs/Packages/)
│   ├── Commands/         # Request — dữ liệu nhận vào, gom theo tính năng (vd Commands/Packages/)
│   └── Queries/          # Reserved — tham số đọc hiện truyền thẳng qua method argument, chưa dùng
├── Api/                  # Controller của module (nạp vào MVC qua AddApplicationPart ở SportHub.API)
└── Infrastructure/Persistence/Configurations/   # IEntityTypeConfiguration<T>, 1 file / entity
```

Dependency giữa các module (không có vòng lặp — sơ đồ đầy đủ + lý do từng mũi tên xem trong plan):

```
SportHub.API   → BuildingBlocks + tất cả module
Administration → Identity, Audit, Membership, Payment, BuildingBlocks
AI             → Identity, Membership, Scheduling, Training, BuildingBlocks
Training       → Identity, Scheduling, BuildingBlocks
Scheduling     → Identity, Membership, BuildingBlocks
Payment        → Identity, Membership, BuildingBlocks
Membership / Notification / Audit → Identity, BuildingBlocks
Identity       → BuildingBlocks
BuildingBlocks → (không phụ thuộc module nào)
```

Khi hai module cần gọi nhau theo chiều sẽ tạo vòng, seam được khai báo ở `BuildingBlocks` và cài
đặt ở module sở hữu dữ liệu — mỗi interface đều ghi rõ vòng phụ thuộc nào đang được cắt:

| Seam (ở `BuildingBlocks/Abstractions`) | Cài đặt ở | Ai gọi |
|---|---|---|
| `IAuditWriter` (BR-7) | `Audit` | Membership, Scheduling, Payment, Training, Administration |
| `INotificationWriter` (BR-33/34) | `Notification` | Scheduling, Payment |
| `ISystemSettingProvider` (BR-39/50) | `Administration` | Scheduling |
| `ICoachRelationshipRegistrar` | `Training` | Scheduling |
| `IPointWalletService` (mới) | `Payment` | Scheduling |
| `IOccupancyService`, `ISportCatalogReader` (mới) | `Scheduling` | Payment, AI, Training |
| `IClassEnrollmentFulfillment` (mới) | `Scheduling` | Payment (khi Invoice Paid) |

Các seam mới (dòng đánh dấu "mới") là dự kiến theo Design v3 §2.1, chưa có trong mã.

Target framework: **net10.0** (cả 11 project). Entity/enum/state cho từng module: xem
`docs/00-Source-of-Truth.md` §2–4 trước khi code.

## Cấu hình tùy chọn (thiếu thì chạy chế độ mock/log)

Backend đọc cấu hình qua biến môi trường (`__` = cấp lồng nhau, ví dụ `VnPay__TmnCode` → `VnPay:TmnCode`). Mẫu ở `.env.example`. **Thiếu khóa không làm backend hỏng — hệ thống tự chuyển sang chế độ demo:**

| Biến | Bắt buộc | Thiếu thì |
|---|---|---|
| `POSTGRES_*`, `ConnectionStrings__Default` | Có | Không chạy được |
| `JwtOptions__SecretKey` (≥ 32 ký tự) | Có | API không khởi động |
| `Google__ClientId` | Không | `/api/auth/google` trả `503 google_login_not_configured` |
| `VnPay__TmnCode`, `VnPay__HashSecret` (+ Pay URL, Return URL, IPN URL) | Không | Dùng `MockPaymentGateway`: QR giả, demo IPN bằng `POST /api/dev/payments/{attemptId}/succeed` (Design v3 §3) |
| `Email__Smtp__Host/Username/Password` (Gmail App Password) | Không | Dùng `LoggingEmailSender`: nội dung email (kể cả **OTP**) ghi vào log backend |
| `Gemini__ApiKey` (+ `Gemini__Model`, `Gemini__BaseUrl`, `Gemini__TimeoutSeconds`) | Không | Dùng provider mô phỏng/rule-based trả lời sẵn 2 kịch bản chatbot; gợi ý bài tập dùng bộ luật cục bộ |
| `Reports__StorageRoot` | Không | `<thư mục chạy>/App_Data/reports` |

> `docker-compose.yml` hiện chỉ chuyển `ConnectionStrings__Default`, `JwtOptions__SecretKey`, `Google__ClientId` và `Gemini__*` vào container backend. Khi viết cổng VNPay (G5a) và SMTP, phải thêm `VnPay__*` và `Email__*` vào `environment` của service `backend` (theo mẫu `${VAR:-}`); cho tới lúc đó container luôn chạy chế độ mock/log cho VNPay và email.

## Ghi chú kỹ thuật

- **Stack:** ASP.NET Core (net10.0, modular monolith) + PostgreSQL 16 (bật `btree_gist`) + Next.js; không Redis/RabbitMQ.
- **Chống trùng lịch/bán vượt:** `room_occupancies`, `coach_occupancies` với exclusion constraint; `classes.reserved_count` cập nhật có điều kiện trong transaction.
- **Job nền** chạy trong tiến trình API: giữ chỗ, thuê sân, ngưỡng hoàn vốn, trạng thái lớp, điểm danh PT, hạn Membership, gửi outbox.
- **Chatbot:** function calling với danh sách hàm cố định lọc theo vai trò; `userId` luôn lấy từ JWT, mô hình không chạm DB.
- **Múi giờ:** `Asia/Ho_Chi_Minh` cho mọi hiển thị lịch.

## Chạy local

Ở môi trường `Development`, backend tự áp migration và seed dữ liệu demo khi khởi động —
nhưng **chỉ khi database chưa có tài khoản nào**, nên không bao giờ ghi đè dữ liệu đang có.
Tài khoản demo và kịch bản thao tác: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

### Cách 1: Docker Compose (cả 3 service)

```bash
cp .env.example .env          # lần đầu — xem giá trị mẫu trong .env.example
docker compose up -d
```

Chạy xong sẽ có 3 container: `sporthub-postgres`, `sporthub-backend`, `sporthub-frontend`. Kiểm tra bằng `docker ps` hoặc Docker Desktop.

| Thành phần | Link |
|---|---|
| Backend — Swagger UI | http://localhost:5000/swagger |
| Frontend | http://localhost:3000 |

### Cách 2: Chạy riêng từng phần (debug trong Rider/VS Code)

Tắt container tương ứng trong docker-compose trước khi chạy thủ công để tránh trùng port:

```bash
cd backend/SportHub.API && dotnet run
cd frontend && npm install && npm run dev
```

| Thành phần | Link |
|---|---|
| Backend — Swagger UI (http) | http://localhost:5000/swagger |
| Backend — Swagger UI (https) | https://localhost:7100/swagger |
| Frontend | http://localhost:3000 |

Xem chi tiết thiết kế: [`docs/Center-Management-System-Design-v3.md`](docs/Center-Management-System-Design-v3.md)

---

## Refactor delta (README.md — 30/09/2026)

### XÓA

| Nội dung | Lý do |
|---|---|
| "Gym, Personal Training, Yoga, Group X" trong mô tả | Yoga/Group X bỏ; phạm vi đổi sang đa môn (Design v3 §0 #1) |
| Dẫn `docs/implementation-decisions.md`, `docs/claude-continuation-plan-2026-09-23.md`, `docs/SportManagement_BusinessRules.docx` (v1.4), `docs/business-rules-v1.4.md` | File không còn trong `docs/`; BR hiện hành là v2.0 |
| Đoạn "Plan ưu tiên sửa đối soát thu/hoàn và tách approve/complete… hoàn tiền" | Gắn với mô hình hoàn tiền/VNPay Refund cũ (đã bỏ, BR-135) |
| Đường dẫn "5 vai trò" trong mục chạy thử | Nay là 6 vai trò |

### GIỮ

| Nội dung | Lý do |
|---|---|
| Cấu trúc thư mục repo, cây `backend/` 11 project, cấu trúc nội bộ module | Design v3 §2.1: không thêm project mới |
| Sơ đồ phụ thuộc module và bảng seam ở `BuildingBlocks` | Vẫn đúng; chỉ bổ sung seam mới (bảng bên dưới) |
| Hướng dẫn Docker Compose / chạy riêng, các URL, Swagger | Khớp `docker-compose.yml` (3 service, cổng 5000/3000) |
| Cảnh báo tự migrate/seed ở Development | Không đổi |

### SỬA

| Nội dung | Trước → Sau |
|---|---|
| Tiêu đề và mô tả dòng đầu | trung tâm thể thao/gym → nhà văn hóa thể thao đa môn, khóa học cố định, ví điểm |
| Nguồn chuẩn | Design v2 / BR v1.4 → Design v3 / BR v2.0 (BR thắng khi mâu thuẫn) |
| Mô tả module `Scheduling`, `Payment`, `Identity`, `AI` trong cây backend | Thêm Catalog, Wallet/VnPay, ExternalCoachProfile, chatbot function calling |
| Ghi chú `docs/` trong cây | "Business Rules, Design v2" → "Business Rules v2.0, Design v3, SSOT, RUNBOOK, Git workflow" |
| Link "Xem chi tiết" cuối file | Design v2 → Design v3 |

### THÊM

| Nội dung | Lý do |
|---|---|
| Mục "Sản phẩm": 6 vai trò, Flow 1–6, quy tắc chính (điểm, split payment, OTP, giữ chỗ, ngưỡng, chống trùng lịch) | Mô tả sản phẩm mới |
| Mục "Tài liệu" (chỉ mục) gồm BR v2.0 updated docx, Design v3, v2 đã thay thế | Yêu cầu doc index |
| Mục "Cấu hình tùy chọn" `VnPay__*`, `Email__*`, `Gemini__*` + hành vi thiếu khóa (mock/log) | Design v3 §3, §19.2 #7–8 |
| Cảnh báo compose chưa truyền `VnPay__*`/`Email__*` | Khớp `docker-compose.yml` hiện tại |
| Mục "Ghi chú kỹ thuật" | Tóm tắt kiến trúc mới |
| Seam mới `IPointWalletService`, `IOccupancyService`, `ISportCatalogReader`, `IClassEnrollmentFulfillment` | Design v3 §2.1 (BuildingBlocks) |
