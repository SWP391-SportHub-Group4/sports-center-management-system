# Avatar Member và Coach qua Cloudinary

## Quyết định nghiệp vụ (11/10/2026)

- Chỉ Member và Coach đang đăng nhập được tự tải lên, thay hoặc xóa avatar của chính mình. Manager, Receptionist và System Administrator không được đổi ảnh hộ. Manager chỉ được gỡ ảnh khi xử lý báo cáo vi phạm.
- Avatar Member hiển thị tại các màn hình có danh tính Member. `GET /api/avatars/{userId}` cho phép tài khoản đã đăng nhập đọc avatar Member theo ID; Guest không đọc được. Avatar Coach được công khai cùng tên Coach; `GET /api/coaches` chỉ trả Coach đang hoạt động và không trả email/số điện thoại.
- Chỉ nhận JPG, PNG hoặc WebP, tối đa 5 MiB. Người dùng kéo và phóng ảnh để tự chọn phần cắt vuông. Browser xuất ảnh vuông 512×512; backend kiểm MIME/chữ ký file/dung lượng và Cloudinary áp dụng incoming crop 512×512 để chặn client bỏ qua giao diện.
- Upload đi qua backend; Cloudinary API secret không xuất hiện trong bundle frontend. Ảnh được lưu thành asset mới, URL và public ID lưu trên `UserProfile`. Khi thay hoặc xóa, hệ thống thử xóa asset cũ ngay và lưu yêu cầu xóa để job thử lại nếu Cloudinary tạm lỗi. Không ghi đè cùng public ID để tránh ảnh cũ trên CDN.
- Người đã đăng nhập có thể báo cáo avatar Member/Coach khác, nhập lý do 10–500 ký tự. Một người chỉ có một báo cáo `PENDING` cho cùng phiên bản ảnh. Manager xem tối đa 100 báo cáo mới nhất đang chờ, bỏ qua hoặc gỡ ảnh. Nếu người dùng đã thay ảnh, báo cáo cũ chuyển `STALE`; Manager không thể gỡ ảnh mới bằng báo cáo ảnh cũ. Gỡ ảnh đóng các báo cáo đang chờ của ảnh đó và ghi audit.
- Google ID token đã xác minh có thể cung cấp `picture`. Chỉ khi **tạo tài khoản Member mới bằng Google**, hệ thống thử nhập ảnh đó vào Cloudinary. Đăng nhập sau, liên kết Google với tài khoản cũ, hoặc đổi ảnh trên Google không đồng bộ. Người dùng xóa avatar thì Google không tự đưa ảnh trở lại. Nếu Cloudinary lỗi lúc tạo tài khoản, đăng nhập vẫn thành công với avatar mặc định và không tự thử nhập lại.
- Không duyệt ảnh trước khi hiển thị. Kênh báo cáo và Manager gỡ ảnh là cách xử lý sau đăng tải.

## Luồng API

| Endpoint | Quyền | Kết quả |
|---|---|---|
| `GET /api/avatars/{userId}` | Guest chỉ cho Coach; tài khoản đăng nhập đọc Member/Coach theo ID | `{userId, avatarUrl}` hoặc 404/403 |
| `POST /api/avatars/me` | Member/Coach | Multipart `file`, 200 `{userId, avatarUrl}` |
| `DELETE /api/avatars/me` | Member/Coach | 200 `{userId, avatarUrl:null}` |
| `POST /api/avatars/reports` | Người đăng nhập | `{targetUserId, reason}`, 201 `{reportId}` |
| `GET /api/manager/avatar-reports?status=PENDING` | Manager | Danh sách báo cáo; trạng thái hợp lệ `PENDING`, `REMOVED`, `DISMISSED`, `STALE` |
| `POST /api/manager/avatar-reports/{id}/dismiss` | Manager | 204, đóng riêng báo cáo |
| `POST /api/manager/avatar-reports/{id}/remove` | Manager | 204, gỡ avatar đúng phiên bản đã bị báo cáo |

`GET /api/users/me`, response đăng nhập, danh sách user cho nhân viên và danh sách Coach thêm `avatarUrl` nullable. Form `PUT /api/users/me/profile` không nhận `avatarUrl` hoặc `publicId`; không có API gán URL tùy ý. Mỗi thao tác thay/xóa tăng `avatarVersion` để hai thao tác đồng thời không ghi đè im lặng.

Mã lỗi chính: `avatar_size_invalid`, `avatar_type_invalid`, `avatar_role_forbidden`, `avatar_changed`, `avatar_storage_not_configured`, `avatar_storage_unavailable`, `avatar_report_reason_invalid`, `avatar_already_reported`, `avatar_report_stale`, `avatar_report_processed`.

## Cấu hình và vận hành

Backend đọc `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>` từ `.env` cục bộ hoặc môi trường deploy. Docker Compose chuyển biến này vào API. Không đặt key/secret trong `.env.example`, `frontend/.env.local`, `NEXT_PUBLIC_*`, mã nguồn hoặc tài liệu. API key/secret đã gửi qua chat ngày 11/10/2026 cần được xoay trước khi điền vào `.env`.

Migration `AddAvatars` thêm `avatar_url`, `avatar_public_id`, `avatar_version` vào `user_profiles`, cùng `avatar_reports` và `avatar_deletions`. Cần chạy migration trước khi khởi động API với code mới. `avatar_deletions` chỉ chứa public ID đã bỏ tham chiếu; job thử lại mỗi 10 phút. Đã yêu cầu Cloudinary invalidate CDN khi xóa, nhưng cache CDN có thể cần một thời gian để hết hiệu lực.

Không kiểm thử được thao tác Cloudinary thật nếu chưa có key mới trong `.env` và môi trường mạng. Có thể kiểm tra chức năng bằng tài khoản Member/Coach: tải ảnh, kéo crop, xem ở account/danh sách, thay, xóa, báo cáo từ tài khoản khác, Manager gỡ và xác nhận báo cáo ảnh cũ không gỡ ảnh mới.

Migration cũ `AddCoachAvatars` vẫn nằm trong lịch sử để database đã áp dụng có thể nâng cấp; các thao tác thêm cột được thiết kế chạy an toàn cùng `AddAvatars` trên database mới.
