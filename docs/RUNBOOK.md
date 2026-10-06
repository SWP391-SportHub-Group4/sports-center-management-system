# Chạy SportHub trên máy local

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Hướng dẫn khởi động hệ thống khi chưa deploy: PostgreSQL → backend → frontend.

## 1. Yêu cầu

- Docker Desktop (cho PostgreSQL)
- .NET SDK 10
- Node.js 24, npm 11

## 2. Cấu hình

Tạo `.env` ở thư mục gốc từ file mẫu rồi điền giá trị (file này không được commit):

```bash
cp .env.example .env
```

Link trong email đặt lại mật khẩu dựng từ `Frontend__BaseUrl` (mặc định `http://localhost:3000`; **phải đổi khi deploy**, nếu không người nhận nhận link localhost). `Frontend__SupportUrl` là website hỗ trợ ghi cuối email; để trống thì email chỉ ghi "liên hệ trung tâm". Thiếu SMTP ở Development thì nội dung email (kèm link) được ghi vào log backend (`Email__DemoLoggingEnabled`).

Frontend đọc `frontend/.env.local` (tùy chọn). Mặc định gọi API tại `http://localhost:5000`; chỉ cần tạo file khi backend chạy ở địa chỉ khác (xem `frontend/.env.example`).

## 3. Khởi động

### 3.1 Database

```bash
docker compose up -d postgres
```

PostgreSQL chạy ở `localhost:5435`, thông số lấy từ `.env`.

### 3.2 Backend

```bash
cd backend/SportHub.API
dotnet run
```

Ở môi trường `Development`, backend tự áp migration và seed dữ liệu demo khi database chưa có tài khoản nào. API chạy tại [http://localhost:5000](http://localhost:5000), Swagger tại [http://localhost:5000/swagger](http://localhost:5000/swagger)

### 3.2.1 Dữ liệu dev: seed lớp BR-141 và reset

Seed lịch lớp cố định (Bóng rổ và Cầu lông 01 T2/4/6 07:00-09:00, 02 T3/5/7 14:00-16:00) và bảng giá thuê sân (Cầu lông 100.000, Bóng rổ 200.000 đồng/giờ) là lệnh riêng, idempotent, không chạy lúc khởi động:

```bash
cd backend/SportHub.API
ASPNETCORE_ENVIRONMENT=Development dotnet run -- --seed-br141=true
```

Lệnh in `database '...' trên '...'` trước khi ghi. Viết `--seed-br141=true` (có giá trị): nếu viết `--seed-br141` đứng một mình rồi tới `--ConnectionStrings:Default=...`, .NET dùng tham số kế tiếp làm giá trị của cờ và chuỗi kết nối bị bỏ qua. Biến môi trường `ConnectionStrings__Default` cũng không dùng được để đổi DB vì `.env` ở gốc repo được nạp và ghi đè; với `dotnet ef` dùng `--connection`.

Reset dữ liệu dev (giữ tài khoản và cấu hình, xóa mọi dữ liệu phát sinh): sao lưu rồi chạy [reset-dev-data.sql](../backend/scripts/reset-dev-data.sql); đầu file có lệnh `pg_dump`/`psql` mẫu. Script chỉ chạy trên database tên `sporthub` và tạm tắt trigger chặn TRUNCATE của sổ điểm.

### 3.3 Frontend

```bash
cd frontend
npm ci
npm run dev
```

Giao diện chạy tại [http://localhost:3000](http://localhost:3000)
