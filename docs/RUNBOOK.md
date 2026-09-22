# Chạy SportHub trên máy local

Hướng dẫn chạy toàn bộ hệ thống (PostgreSQL → API → giao diện) và thử từng vai trò.

> **22/09/2026:** các đường đi dưới đây mô tả bản demo trước v1.4, chưa được kiểm chứng lại. Đặc biệt Refund phải tách approve/complete; PDF và AI thật còn cần hoàn thiện theo [plan 23/09](claude-continuation-plan-2026-09-23.md).

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
| Quản lý trung tâm | `manager@sporthub.vn` | Phòng, lớp, lịch, gói, duyệt điều chỉnh, báo cáo, cấu hình |
| Lễ tân | `letan@sporthub.vn` | Gym check-in, bán gói, thu tiền, đăng ký hộ, điểm danh |
| HLV Yoga | `coach.yoga@sporthub.vn` | Lịch dạy, điểm danh, kế hoạch tập, gợi ý AI |
| HLV Group X | `coach.groupx@sporthub.vn` | như trên |
| HLV Personal Training | `coach.pt@sporthub.vn` | như trên |
| Hội viên | `an.member@sporthub.vn` | Đặt lịch, gói, hóa đơn, kế hoạch tập, hồ sơ |
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
3. `letan@sporthub.vn` → **Bán gói & hóa đơn**: chọn hội viên và gói → hóa đơn phát hành ngay
   (BR-30) → thu tiền → gói chuyển sang Hoạt động khi thu đủ.

### Flow 2 — Lớp học & đặt lịch

1. `manager@sporthub.vn` → **Phòng tập** → **Lớp học** (thêm mẫu lịch lặp → **Sinh lịch**).
2. `an.member@sporthub.vn` → **Lịch lớp & đặt chỗ**: đăng ký, hủy. Cột "Chỗ trống" giảm ngay.
3. `manager@sporthub.vn` → **Lịch học**: hủy hoặc dời một buổi. Dời lịch tạo **buổi thay thế**
   liên kết với buổi cũ; hội viên nhận thông báo nêu rõ đã hoàn lượt và cần đăng ký lại (BR-54).

### Flow 3 — Thanh toán & báo cáo

Hoàn tiền đi qua **ba bước, hai người** (BR-42 v1.4). Duyệt **không phải** là trả tiền:

1. `letan@sporthub.vn` → **Tra cứu hóa đơn**: thu tiền, tạo yêu cầu điều chỉnh.
   Bảng hóa đơn có cột **Cần hoàn** tách khỏi **Thực thu**.
2. `manager@sporthub.vn` → **Duyệt điều chỉnh**: duyệt hoặc từ chối. Yêu cầu do chính mình tạo
   không có nút duyệt và backend chặn bằng 403 (BR-42).
   - `Discount`/`Correction`: duyệt xong là `Completed` ngay — chỉ giảm nghĩa vụ, không có
     tiền chuyển đi.
   - `Refund`: duyệt xong dừng ở **`Approved`**. Số thực thu, số đã hoàn và báo cáo doanh thu
     **không đổi** ở bước này. Dòng đó hiện nhãn "Chờ lễ tân trả tiền".
3. `letan@sporthub.vn` → mở lại hóa đơn → bảng **Điều chỉnh** → nút **Xác nhận đã trả**.
   Chỉ bấm SAU KHI tiền đã thực sự ra khỏi quầy. Nhập phương thức trả và mã tham chiếu
   (bắt buộc với Card/Transfer/EWallet, không bắt buộc với tiền mặt). Đây là thời điểm duy
   nhất `RefundedAmount` tăng và là ngày mà báo cáo dùng để quy kỳ (BR-43).
   API: `POST /api/payment-adjustments/{adjustmentId}/complete`.
4. `manager@sporthub.vn` → **Báo cáo doanh thu**: **Thu ròng = Đã thu − Đã hoàn**.
   **Giảm nghĩa vụ** (Discount/Correction) là cột riêng và **không** trừ vào thu ròng — trừ
   cả hai sẽ tính hai lần cho cùng một khoản (BR-43).
   Chọn cột rồi xuất CSV. V1.4 chỉ cho xóa sau retention; **CSV chưa đáp ứng phần PDF bắt
   buộc của BR-48** — xem blocker B3 trong [implementation-status.md](implementation-status.md).

> Bản ghi hoàn tiền tạo TRƯỚC 22/09/2026 không có bằng chứng thực trả và được cách ly riêng.
> Cách đối soát: [legacy-refund-reconciliation.md](legacy-refund-reconciliation.md).

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
với `DockerUnavailableException` (đây chính là blocker B1 hiện tại, xem
[implementation-status.md](implementation-status.md)).

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

## 8. Đối chiếu sau khi Claude cập nhật v1.4

Chạy theo [plan 23/09/2026](claude-continuation-plan-2026-09-23.md). Các kết quả dưới đây là tiêu chí cần đạt, chưa phải kết quả đã chạy:

- Thu đủ ngay lần đầu không tạo mốc cọc; cọc đầu hợp lệ mới gia hạn hóa đơn; sau hạn chặn thu thông thường.
- Hóa đơn thu đủ 3 triệu, Discount 500 nghìn: cần hoàn 500 nghìn nhưng đã hoàn vẫn 0. Manager approve Refund chưa đổi số thực thu. Receptionist complete mới ghi đã hoàn 500 nghìn; báo cáo trừ tiền ở ngày thực trả.
- Hủy đúng hạn sau khi dùng lượt cuối: lượt được hoàn, gói còn ngày và không vướng BR-10 được hồi phục; gói quá ngày/Cancelled không tự hồi phục.
- Manager xuất PDF với cột đã chọn; file chỉ tải qua kiểm quyền và không xóa trước CompletedAt +6 tháng.
- Không reset database/volume để làm sạch các lần thử. Dùng DB demo riêng; kiểm cấu hình DB trước mọi script có ghi dữ liệu.
