# Chạy SportHub trên máy local

Hướng dẫn chạy toàn bộ hệ thống (PostgreSQL → API → giao diện) và thử từng vai trò.

> **23/09/2026:** Runbook này chỉ dùng cho thao tác đã khớp Business Rules v1.6. Toàn bộ Payment/Invoice/Adjustment/Refund và báo cáo doanh thu đang **PENDING — chưa chốt nghiệp vụ**; không chạy hoặc dùng các bước Payment cũ làm tiêu chí nghiệm thu.

## 1. Yêu cầu

- Docker Desktop (cho PostgreSQL)
- .NET SDK 10
- Node.js 24, npm 11

## 2. Khởi động

### 2.1 Database

```bash
docker compose up -d postgres
```

Postgres chạy ở `localhost:5435`. Thông số lấy từ `.env` (mẫu ở `.env.example`).

### 2.2 Backend

```bash
cd backend/SportHub.API && ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5000 dotnet run
```

Ở môi trường `Development`, API tự làm hai việc khi khởi động:

1. **Áp migration** (`Database.MigrateAsync`).
2. **Seed dữ liệu demo** — chỉ khi database **chưa có tài khoản nào**. Nếu đã có dữ liệu, seeder
   bỏ qua và không đụng vào gì.

Ở môi trường khác, migration chạy qua `dotnet ef database update` trong quy trình triển khai —
tự migrate lúc khởi động sẽ khiến nhiều instance cùng đổi schema một lúc.

Swagger: <http://localhost:5000/swagger>.

### 2.3 Frontend

```bash
cd frontend && npm install && npm run dev
```

Giao diện: <http://localhost:3000>. Địa chỉ API đọc từ `NEXT_PUBLIC_API_BASE_URL`
(mặc định `http://localhost:5000`).

## 3. Tài khoản demo

Mật khẩu chung: **`Sporthub@123`**

| Vai trò | Email | Vào được gì |
|---|---|---|
| Quản trị hệ thống | `admin@sporthub.vn` | Tài khoản & vai trò; không có quyền xem Audit Log nghiệp vụ khi chưa được chốt trong SSOT |
| Quản lý trung tâm | `manager@sporthub.vn` | Phòng, lớp, lịch, Membership, báo cáo vận hành không phụ thuộc Payment, cấu hình |
| Lễ tân | `letan@sporthub.vn` | Gym check-in, hỗ trợ Membership, đăng ký hộ, điểm danh; Payment đang để treo |
| HLV Yoga | `coach.yoga@sporthub.vn` | Lịch dạy, điểm danh, kế hoạch tập, gợi ý AI |
| HLV Group X | `coach.groupx@sporthub.vn` | như trên |
| HLV Personal Training | `coach.pt@sporthub.vn` | như trên |
| Hội viên | `an.member@sporthub.vn` | Đặt lịch, Membership, kế hoạch tập, hồ sơ; Payment đang để treo |
| Hội viên | `binh.member@sporthub.vn`, `chi.member@sporthub.vn`, `dung.member@sporthub.vn`, `giang.member@sporthub.vn` | như trên |
| Hội viên (ngừng hoạt động) | `hoa.member@sporthub.vn` | minh hoạ tài khoản bị khóa (BR-6) |

Nút "tài khoản demo" ở màn hình đăng nhập chỉ **điền sẵn form**; việc đăng nhập vẫn đi qua
`POST /api/auth/login` với mật khẩu băm BCrypt trong DB (BR-5). Không có cửa sau nào bỏ qua
xác thực.

## 4. Đường đi để xem từng luồng

### Flow 1 — Tài khoản & gói thành viên

1. `admin@sporthub.vn` → **Tài khoản & vai trò**: tạo tài khoản nhân sự, đổi vai trò, khóa/mở
   khóa (đều bắt buộc nhập lý do — BR-7). Thử tự khóa chính mình để thấy BR-6 chặn.
2. `manager@sporthub.vn` → **Gói thành viên**: tạo gói, sửa giá, ngừng bán.
3. `letan@sporthub.vn` → thao tác Membership theo chức năng hiện có. Membership dùng calendar date; `StartDate` và `EndDate` đều inclusive. Sự kiện xác lập `StartDate` cho lần mua mới phụ thuộc nghiệp vụ Payment đang để treo, nên không dùng luồng bán gói/hóa đơn cũ để nghiệm thu.

### Flow 2 — Lớp học & đặt lịch

1. `manager@sporthub.vn` → **Lớp học**: tạo Yoga/Group X 60 phút, chọn Morning/Afternoon slot, Capacity tối đa 20, rồi chuyển `DRAFT → PUBLISHED` để mở booking.
2. `an.member@sporthub.vn` → **Lịch lớp & đặt chỗ**: chỉ class `PUBLISHED` mới đặt được; tối đa 1 Yoga và 1 Group X trong cùng ngày. Hủy tại hoặc trước 30 phút trước giờ bắt đầu thì booking bị hủy và slot được giải phóng.
3. `manager@sporthub.vn` → **Lịch học**: hủy hoặc dời class chưa bắt đầu. Booking cũ bị hủy, slot được giải phóng; Member tự booking lại, không tự chuyển chỗ.

### Flow 3 — Thanh toán & báo cáo

**PENDING — chưa chốt nghiệp vụ.** Tạm dừng hướng dẫn thao tác Payment/Invoice/Adjustment/Refund và báo cáo doanh thu. Các bước approve/complete, công thức số dư, thời hạn thanh toán, cọc, hoàn tiền và quyền thao tác trong phiên bản cũ không còn là hướng dẫn vận hành hợp lệ cho đến khi Business Rules được phê duyệt lại.

### Flow 4 — Điểm danh & tập luyện

1. `coach.yoga@sporthub.vn` → **Điểm danh & kết quả**: chọn buổi, đánh Có mặt/Vắng, ghi kết quả.
2. `coach.pt@sporthub.vn` → **Kế hoạch tập**: soạn giáo án cho hội viên mình phụ trách.
3. `an.member@sporthub.vn` → **Kế hoạch & kết quả**: xem lại, không sửa được (BR-25).

### Flow 5 — Gợi ý AI

`coach.pt@sporthub.vn` → **Gợi ý AI** → chọn hội viên → **Tạo gợi ý**. Màn hình hiện đủ ba đầu
vào bắt buộc của BR-26 và thời gian phản hồi đã ghi vào `AI_Logs` (BR-27).

Bản cài đặt hiện tại chạy theo bộ luật cục bộ (`RuleBasedAiRecommendationService`) — không cần
API key, kết quả tất định; đây là demo/test, chưa nghiệm thu Flow 5. Provider thật cần cấu hình, xử lý lỗi và kiểm thử integration theo plan.

### Gym / Fitness

`letan@sporthub.vn` → **Gym check-in**. Gym ra vào tự do, **không** đặt lịch qua lớp; điều kiện
duy nhất là hội viên có ≥1 gói Hoạt động, và check-in **không trừ buổi** (BR-64).

## 5. Tác vụ nền

Chạy trong chính tiến trình API (`SportHub.API/Jobs`):

| Job | Chu kỳ | Việc |
|---|---|---|
| `NotificationDispatchJob` | 30 giây | Chuyển thông báo `Pending → Sent` (BR-34) |
| `AttendanceFinalizerJob` | 10 phút | Ghi `NoShow` cho đăng ký chưa điểm danh sau khi buổi kết thúc; đóng buổi đã qua (BR-20, BR-53) |
| `MemberPackageExpiryJob` | 15 phút | Chuyển gói quá hạn/hết buổi sang `Expired`; nhắc gói sắp hết hạn (BR-11, BR-33) |

## 6. Kiểm tra

```bash
cd backend && dotnet test SportHub.sln
```

**Các suite integration cần một PostgreSQL thật.** Mặc định chúng dựng container qua
Testcontainers, nên **Docker Desktop phải đang chạy** — nếu không, mọi test integration fail
với `DockerUnavailableException`.

Khi không dùng được Docker, suite `SportHub.Payment.Tests` chấp nhận một PostgreSQL có sẵn
qua biến môi trường. **Phải trỏ vào một DB trống, tách riêng** — suite chạy migration và ghi
dữ liệu thật:

```bash
SPORTHUB_TEST_POSTGRES="Host=localhost;Port=5432;Database=sporthub_payment_tests;Username=postgres;Password=..." dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj
```

Chỉ chạy unit test (không cần DB, không cần Docker):

```bash
cd backend && dotnet test SportHub.Payment.Tests/SportHub.Payment.Tests.csproj --filter "FullyQualifiedName~Unit"
```

```bash
cd frontend && npm run lint && npm run typecheck && npm run build
```

Kịch bản end-to-end qua HTTP thật (**ghi dữ liệu thật — chỉ chạy trên DB demo**):

```bash
bash scripts/e2e-business-rules.sh
```

## 7. Cấu hình tùy chọn

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `ConnectionStrings:Default` | `.env` | Chuỗi kết nối PostgreSQL |
| `JwtOptions:SecretKey` | `.env` | Khóa ký JWT — **bắt buộc đổi ở môi trường thật** |
| `Google:ClientId` | *(trống)* | Bật đăng nhập Google. Khi trống, `/api/auth/google` trả `503 google_login_not_configured` |
| `Reports:StorageRoot` | `App_Data/reports` | Thư mục lưu tệp xuất (BR-46) |

Cấu hình nghiệp vụ (hạn hủy đăng ký, ngưỡng nhắc hạn gói) **không** nằm ở file cấu hình mà ở
màn hình **Cấu hình hệ thống** của Quản lý Trung tâm (BR-39).

## 8. Payment — PENDING

Nghiệp vụ Payment/Invoice/Adjustment/Refund và báo cáo doanh thu chưa được chốt. Không dùng
các luồng cọc, hạn thanh toán, hoàn tiền, phê duyệt, ghi nhận doanh thu hoặc công thức của phiên
bản cũ làm căn cứ triển khai hay kiểm thử. Khi nghiệp vụ Payment được phê duyệt, cập nhật Business
Rules và SSOT trước, sau đó mới bổ sung hướng dẫn chạy/kiểm thử tương ứng vào RUNBOOK.
