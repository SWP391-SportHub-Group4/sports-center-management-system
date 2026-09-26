# Chạy SportHub trên máy local

Hướng dẫn chạy toàn bộ hệ thống (PostgreSQL → API → giao diện) và thử từng vai trò.

> **26/09/2026:** Runbook này đã đồng bộ Business Rules v1.8. Payment dùng VNPay Sandbox/VNPay-QR, thanh toán đủ một lần, xác nhận qua IPN/QueryDR và hoàn tiền theo BR-90–BR-95. Code hiện tại có thể chưa khớp; khi nghiệm thu phải lấy Business Rules v1.8 làm chuẩn.

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
| Quản lý trung tâm | `manager@sporthub.vn` | Phòng, lớp, lịch, Membership, xem revenue, approve/reject Refund và xử lý ngoại lệ |
| Lễ tân | `letan@sporthub.vn` | Gym check-in, checkout hộ Member, yêu cầu đối soát/fulfillment lại, tạo Refund hộ có lý do; không tự đánh dấu Paid/Refund Completed |
| HLV Yoga | `coach.yoga@sporthub.vn` | Lịch dạy, điểm danh, kế hoạch tập, gợi ý AI |
| HLV Group X | `coach.groupx@sporthub.vn` | như trên |
| HLV Personal Training | `coach.pt@sporthub.vn` | như trên |
| Hội viên | `an.member@sporthub.vn` | Tự checkout Membership/PT, thanh toán VNPay-QR, xem Invoice và tạo Refund Request cho giao dịch của mình |
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
3. `letan@sporthub.vn` → chọn Member và checkout Membership. Invoice được tạo ngay tại checkout; Membership chỉ được tạo/kích hoạt sau khi backend xác minh Payment thành công. Lần mua mới lấy `StartDate` theo ngày Việt Nam của `vnp_PayDate`; early renewal bắt đầu sau `EndDate` hiện tại.

### Flow 2 — Lớp học & đặt lịch

1. `manager@sporthub.vn` → **Lớp học**: tạo Yoga/Group X 60 phút, chọn Morning/Afternoon slot, Capacity tối đa 20, rồi chuyển `DRAFT → PUBLISHED` để mở booking.
2. `an.member@sporthub.vn` → **Lịch lớp & đặt chỗ**: chỉ class `PUBLISHED` mới đặt được; tối đa 1 Yoga và 1 Group X trong cùng ngày. Hủy tại hoặc trước 30 phút trước giờ bắt đầu thì booking bị hủy và slot được giải phóng.
3. `manager@sporthub.vn` → **Lịch học**: hủy hoặc dời class chưa bắt đầu. Booking cũ bị hủy, slot được giải phóng; Member tự booking lại, không tự chuyển chỗ.

### Flow 3 — Thanh toán & báo cáo

1. Member tự checkout hoặc Receptionist checkout hộ Member; hệ thống tạo Invoice và snapshot InvoiceItem.
2. Backend tạo PaymentAttempt với `vnp_TxnRef` duy nhất và QR đúng `TotalAmount`. Không cho cọc, trả góp, thiếu hoặc thừa tiền.
3. ReturnUrl chỉ hiển thị trạng thái chờ. Chỉ IPN hợp lệ hoặc QueryDR do backend gọi mới xác nhận giao dịch.
4. Trong cùng database transaction: tạo Payment thành công, chuyển Invoice sang `Paid`/`PaidAfterReconciliation` và tạo/kích hoạt Membership hoặc PT. Nếu fulfillment lỗi sau khi gateway đã nhận tiền, ghi `ReconciliationRequired`; Receptionist yêu cầu backend thử lại, không thao tác Paid thủ công.
5. PaymentAttempt dùng `vnp_ExpireDate` mà Sandbox hiện hỗ trợ; không kiểm thử bằng giả định cố định 24 giờ. Attempt hết hạn có thể tạo lại nếu Invoice chưa Paid hoặc Cancelled nghiệp vụ.
6. Center Manager xem `GrossCollected`, `Refunded` và `NetCollected`; doanh thu ghi ngày thu tiền, khoản hoàn ghi ngày Refund hoàn tất. System Administrator không mặc nhiên được xem revenue.
7. Refund: Member tạo cho giao dịch của mình; Receptionist tạo hộ và nhập lý do; Center Manager approve/reject trong mức hệ thống tính; backend gọi VNPay Refund API. Receptionist không được đánh dấu `Completed`.
8. Membership được hoàn 50% InvoiceItem khi `RemainingDays * 3 >= TotalDays * 2`, kể cả chưa đến StartDate; dưới ngưỡng hoặc Expired không hoàn trừ lỗi trung tâm. PT chỉ hoàn chuẩn 50% khi chưa consume session nào.

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

## 8. Payment và VNPay Sandbox

- Cấu hình Sandbox phải cung cấp `TmnCode`, hash secret, Pay URL, Return URL và IPN URL ở secret/config ngoài source control.
- Mỗi PaymentAttempt dùng `vnp_TxnRef` duy nhất; amount gửi VNPay phải đối chiếu chính xác với Invoice.
- IPN phải kiểm tra checksum, TmnCode, TxnRef, Amount, `ResponseCode = 00`, `TransactionStatus = 00` và tính idempotent trước khi fulfillment.
- Khi không nhận IPN hoặc nhận muộn, backend dùng QueryDR. Invoice/attempt đã Expired được phép chuyển `PaidAfterReconciliation` nếu gateway xác nhận và chưa có Payment thành công khác.
- Refund chỉ được gọi từ backend sau khi Center Manager duyệt. `vnp_RequestId` phải unique/idempotent; trạng thái đi qua `Requested → Approved/Rejected`, sau đó `Processing → Completed/Failed/ReconciliationRequired`.
- Email Invoice/Paid/Refund gửi qua outbox/background job; lỗi email không rollback Payment hoặc quyền lợi đã commit.
