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

### 3.3 Frontend

```bash
cd frontend
npm ci
npm run dev
```

Giao diện chạy tại [http://localhost:3000](http://localhost:3000)
