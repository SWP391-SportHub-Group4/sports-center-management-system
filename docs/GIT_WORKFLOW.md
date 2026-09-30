# Git Workflow - SportHub

## 1. Cấu trúc Branch

Project sử dụng cấu trúc branch:

```text
main
  ↑
develop
  ↑
feature/*
```

### Ý nghĩa các branch

| Branch | Mục đích |
|---|---|
| `main` | Phiên bản ổn định của project |
| `develop` | Branch tích hợp code của cả team |
| `feature/*` | Branch để phát triển từng chức năng riêng |

### Quy tắc

- Không commit trực tiếp vào `main`.
- Không commit trực tiếp vào `develop`.
- Mỗi chức năng phải được phát triển trên một branch `feature/*` riêng.
- Sau khi hoàn thành chức năng, tạo Pull Request từ `feature/*` vào `develop`.
- Chỉ merge `develop` vào `main` khi project đã ổn định.

---

# 2. Clone Repository

Nếu máy chưa có project:

```bash
git clone <repository-url>
cd <repository-folder>
```

Kiểm tra các branch:

```bash
git branch -a
```

---

# 3. Bắt đầu làm một chức năng mới

Trước khi tạo branch mới, luôn cập nhật `develop`:

```bash
git checkout develop
git pull origin develop
```

Sau đó tạo branch cho chức năng:

```bash
git checkout -b feature/<ten-chuc-nang>
```

Ví dụ:

```bash
git checkout -b feature/member-management
```

---

# 4. Quy tắc đặt tên Branch

### Chức năng mới

Sử dụng:

```text
feature/<ten-chuc-nang>
```

Ví dụ:

```text
feature/member-management
feature/class-enrollment
feature/wallet-points
feature/external-coach-rental
feature/auth-login
feature/notification
```

### Sửa lỗi

Sử dụng:

```text
fix/<ten-loi>
```

Ví dụ:

```text
fix/login-validation
fix/seat-hold-expiry
```

### Documentation

Sử dụng:

```text
docs/<mo-ta>
```

Ví dụ:

```text
docs/update-readme
docs/update-api-documentation
```

---

# 5. Kiểm tra code trước khi commit

Kiểm tra các file đã thay đổi:

```bash
git status
```

Xem nội dung thay đổi:

```bash
git diff
```

Nên kiểm tra project có build/test thành công trước khi push.

---

# 6. Commit code

Thêm các file thay đổi:

```bash
git add .
```

Commit:

```bash
git commit -m "feat: add member management"
```

## Quy tắc đặt tên Commit

| Prefix | Ý nghĩa | Khi sử dụng |
|---|---|---|
| `feat:` | Chức năng mới | Thêm feature |
| `fix:` | Sửa lỗi | Fix bug |
| `refactor:` | Tái cấu trúc | Thay đổi code nhưng không thêm feature |
| `test:` | Test | Thêm/sửa test |
| `docs:` | Tài liệu | README, documentation |
| `chore:` | Công việc phụ | Config, dependency, maintenance |

### Ví dụ

```bash
git commit -m "feat: add member registration"
```

```bash
git commit -m "fix: validate member email"
```

```bash
git commit -m "test: add member service tests"
```

```bash
git commit -m "refactor: simplify member repository"
```

```bash
git commit -m "docs: update API documentation"
```

### Lưu ý

Commit message nên:

- Ngắn gọn.
- Mô tả đúng thay đổi.
- Không viết quá dài.
- Không dùng các message chung chung như:

```text
update
fix
code
done
test
abc
```

---

# 7. Push branch lên GitHub

Lần đầu push branch:

```bash
git push -u origin feature/<ten-chuc-nang>
```

Ví dụ:

```bash
git push -u origin feature/member-management
```

Sau lần push đầu tiên, những lần sau chỉ cần:

```bash
git push
```

---

# 8. Tạo Pull Request

Sau khi push code lên GitHub:

1. Vào repository trên GitHub.
2. Chọn **Pull requests**.
3. Chọn **New pull request**.
4. Chọn branch:

```text
base: develop
compare: feature/<ten-chuc-nang>
```

Ví dụ:

```text
feature/member-management → develop
```

### Quan trọng

**Không tạo Pull Request trực tiếp vào `main`.**

Đúng:

```text
feature/member-management
          ↓
       develop
```

Không nên:

```text
feature/member-management
          ↓
         main
```

---

# 9. Nội dung Pull Request

Nên mô tả những gì đã làm.

Ví dụ:

```markdown
## Chức năng đã thực hiện

- Tạo Member Entity
- Tạo Member Repository
- Tạo Member Service
- Tạo Member API

## Kiểm thử

- Test GET /api/members
- Test POST /api/members

## Ghi chú

- Không có vấn đề đã biết
```

Người phụ trách/reviewer kiểm tra code trước khi merge.

---

# 10. Sau khi Pull Request được Merge

Sau khi PR đã được merge vào `develop`, cập nhật branch local:

```bash
git checkout develop
git pull origin develop
```

Lúc này `develop` trên máy đã có code mới nhất của team.

Nếu branch feature không còn sử dụng nữa, có thể xóa branch local:

```bash
git branch -d feature/member-management
```

Xóa branch trên GitHub:

```bash
git push origin --delete feature/member-management
```

---

# 11. Khi `develop` có code mới trong lúc mình đang làm

Ví dụ bạn đang làm:

```text
feature/member-management
```

Trong lúc đó một thành viên khác đã merge code vào:

```text
develop
```

Bạn cần cập nhật code mới nhất trước khi tiếp tục.

### Bước 1: Cập nhật develop

```bash
git checkout develop
git pull origin develop
```

### Bước 2: Quay lại branch của mình

```bash
git checkout feature/member-management
```

### Bước 3: Merge develop vào branch của mình

```bash
git merge develop
```

Nếu xảy ra conflict, Git sẽ thông báo các file bị conflict.

Sau khi sửa conflict:

```bash
git add .
git commit -m "merge: resolve develop conflicts"
git push
```

---

# 12. `git fetch` và `git pull`

Đây là hai lệnh thành viên cần phân biệt.

## `git fetch`

```bash
git fetch origin
```

Dùng để lấy thông tin mới nhất từ GitHub về máy.

**Không tự động thay đổi code đang làm.**

Ví dụ:

```text
GitHub
   │
   │ git fetch
   ↓
Local repository
```

Có thể hiểu đơn giản:

> "GitHub có gì mới không? Lấy thông tin về cho tôi xem."

---

## `git pull`

```bash
git pull origin develop
```

Dùng để lấy code mới từ GitHub và cập nhật vào branch hiện tại.

Có thể hiểu đơn giản:

> "Lấy code mới nhất từ GitHub và cập nhật vào branch của tôi."

Về cơ bản:

```text
git pull
≈
git fetch + git merge
```

---

# 13. Quy trình làm việc hằng ngày

## Khi bắt đầu một task

```bash
git checkout develop
git pull origin develop

git checkout -b feature/<ten-chuc-nang>
```

Ví dụ:

```bash
git checkout develop
git pull origin develop

git checkout -b feature/booking
```

---

## Trong lúc code

Sau khi hoàn thành một phần:

```bash
git status
git add .
git commit -m "feat: add booking service"
```

Có thể commit nhiều lần trong quá trình làm.

Ví dụ:

```text
feat: add booking entity
feat: add booking repository
feat: add booking service
feat: add booking API
test: add booking service tests
```

---

## Push code

```bash
git push
```

Nếu đây là lần đầu push branch:

```bash
git push -u origin feature/booking
```

---

## Hoàn thành chức năng

Tạo Pull Request:

```text
feature/booking
      ↓
   develop
```

Sau khi reviewer approve → merge.

---

## Sau khi merge

```bash
git checkout develop
git pull origin develop
```

Sau đó bắt đầu task tiếp theo.

---

# 14. Các quy tắc quan trọng của team

## NÊN

- Mỗi chức năng sử dụng một branch riêng.
- Luôn `pull develop` trước khi bắt đầu task mới.
- Commit thường xuyên.
- Commit message rõ ràng.
- Push code lên branch của mình.
- Tạo Pull Request để merge vào `develop`.
- Review code của thành viên khác.
- Test code trước khi tạo Pull Request.
- Cập nhật `develop` thường xuyên để tránh conflict lớn.

## KHÔNG NÊN

- Không commit trực tiếp vào `main`.
- Không commit trực tiếp vào `develop`.
- Không dùng `git push --force` nếu chưa được team đồng ý.
- Không commit password, API key, connection string chứa thông tin nhạy cảm.
- Không commit các thư mục build như `bin/`, `obj/`, `node_modules/`.
- Không merge code của người khác mà chưa review.
- Không tạo branch với tên quá chung chung như:

```text
test
code
new
update
an
branch1
```

---

# 15. Sơ đồ workflow

```text
                         ┌──────────┐
                         │   main   │
                         └────▲─────┘
                              │
                         Release
                              │
                         ┌────┴─────┐
                         │ develop  │
                         └────▲─────┘
                              │
                        Pull Request
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
   feature/auth       feature/enrollment  feature/member
          │                   │                   │
          │                   │                   │
        Code                Code                Code
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                             Push
                              │
                              ▼
                        GitHub Pull Request
                              │
                              ▼
                           develop
```

---

# 16. Tóm tắt nhanh

### Tạo chức năng mới

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<ten-chuc-nang>
```

### Code và commit

```bash
git status
git add .
git commit -m "feat: ..."
```

### Push

```bash
git push -u origin feature/<ten-chuc-nang>
```

### Tạo Pull Request

```text
feature/<ten-chuc-nang>
          ↓
       develop
```

### Sau khi merge

```bash
git checkout develop
git pull origin develop
```

### Cập nhật develop vào feature đang làm

```bash
git checkout develop
git pull origin develop

git checkout feature/<ten-chuc-nang>
git merge develop
```

---

# 17. Quy tắc quan trọng nhất

Team chỉ cần nhớ:

```text
1. Pull develop
       ↓
2. Tạo feature branch
       ↓
3. Code
       ↓
4. Commit
       ↓
5. Push
       ↓
6. Pull Request → develop
       ↓
7. Review
       ↓
8. Merge
       ↓
9. Pull develop
```

**Không code trực tiếp trên `main` hoặc `develop`.**

---

# 18. Phân việc theo module và giai đoạn G0–G12 (Design v3 §16)

Phạm vi đã đổi sang nhà văn hóa thể thao đa môn (Design v3, chốt 30/09/2026). Để giảm xung đột merge, **mỗi module do một người/nhóm nhỏ phụ trách**; các module chỉ gọi nhau qua interface ở `SportHub.BuildingBlocks`.

**Quyết định "không thêm project mới":** không tạo project backend mới. Ví điểm nằm trong `SportHub.Payment/Wallet`; catalog môn/phòng/giá sân nằm trong `SportHub.Scheduling/Catalog`; `ExternalCoachProfile` nằm trong `SportHub.Identity`. Nếu PR có thêm `.csproj` mới thì phải được cả nhóm đồng ý trước.

## 18.1 Module sở hữu và giai đoạn

| Module / khu vực | Giai đoạn | Nội dung chính | Ghi chú xung đột |
|---|---|---|---|
| Tài liệu + migration nền | G0, G1 | Đồng bộ tài liệu; migration `RefactorToMultiSport` + seed; xóa `CoachCategory`, mã Yoga/Group X; sửa test để build xanh | **Làm trước và một người làm**; các nhánh khác chờ merge G1 rồi mới rẽ nhánh |
| `SportHub.Identity` | G2 | Role `ExternalCoach`, password policy, quên/đổi mật khẩu, `security_stamp`, Manager tạo Coach + chuyên môn | Sở hữu `ExternalCoachProfile`, `UserSportSpecialty` |
| `SportHub.Scheduling` (gồm `Catalog/`) | G3, G4, G8 | Sport/Room/giờ hoạt động/giá thuê sân; occupancy + exclusion constraint; tạo/publish lớp, Court Schedule; điểm danh lớp nhóm (Receptionist), Gym check-out | Module thay đổi nhiều nhất — tách PR nhỏ theo G3 / G4 / G8 |
| `SportHub.Payment` (gồm `Wallet/`, `VnPay/`) | G5a, G5b, G6, G10 | `IPaymentGateway` (VNPay + Mock); ví điểm, split payment, OTP xác nhận, hoàn điểm; ghi danh có giữ chỗ (phần thanh toán); báo cáo mới | Người làm G5a/G5b nên cũng làm G6 để tránh lệch hợp đồng `IClassEnrollmentFulfillment` |
| Ngưỡng + Rental + Notification | G7, G9 | Ngưỡng hoàn vốn (T5–T8), email, trang phản hồi; ExternalCoach đăng ký/duyệt, thuê sân, sự cố, thông báo thủ công | Phụ thuộc G4, G5b, G6 |
| `SportHub.AI` | G11 | Chatbot function calling (`ChatToolRegistry`) + fallback khi thiếu `Gemini__ApiKey` | Sau G4 |
| `SportHub.Training` | G8 (nhỏ) | Đổi kiểm tra `CoachCategory=PersonalTrainer` sang `CoachSpecialty` chứa môn PT | Chạm cùng G8 |
| `frontend` | G12 (song song từ G3) | Landing đa môn, lớp/khóa học, Court Schedule, thuê sân, ví điểm, dashboard theo vai trò (Design v3 §12) | Chia theo vai trò/khu vực trang, không chia theo file dùng chung |
| `SportHub.BuildingBlocks` | mọi giai đoạn | Chỉ thêm interface dùng chung (`IPointWalletService`, `IOccupancyService`, `ISportCatalogReader`, `IClassEnrollmentFulfillment`) | Sửa file này phải báo cả nhóm; PR riêng, nhỏ, merge nhanh |

Thứ tự phụ thuộc: G0 → G1 → {G2, G3, G5a} → G4 → G5b → G6 → G7; G4 → G8; {G4, G5b} → G9; {G6, G9} → G10; G4 → G11; G12 song song.

## 18.2 Quy ước branch cho refactor

- Đặt tên theo giai đoạn + module: `feature/g2-identity-external-coach`, `feature/g3-catalog-sport-room`, `feature/g5a-vnpay-gateway`, `feature/g6-enrollment-seat-hold`, `feature/g11-chatbot-tools`.
- Vẫn tạo từ `develop`, PR vào `develop`, cần review — **không đổi quy tắc ở các mục 1–17**.
- Migration: mỗi PR chỉ thêm migration của giai đoạn mình; **không sửa migration cũ** (Design v3 §2.3); trước khi merge phải `git merge develop` để tránh hai migration cùng snapshot.
- Không commit khóa `VnPay__*`, `Email__*`, `Gemini__*` (chỉ đặt trong `.env`, không commit).
- Nếu thiếu thời gian, cắt theo thứ tự: chatbot (G11) → báo cáo mới ngoài doanh thu (G10) → sự cố/thông báo thủ công (một phần G9) → chuyển lớp có chênh giá. **Không cắt:** giữ chỗ + chống bán vượt sĩ số, ngưỡng hoàn vốn cơ bản, ví điểm, chống trùng lịch.

---

## Refactor delta (GIT_WORKFLOW.md — 30/09/2026)

### XÓA

| Nội dung | Lý do |
|---|---|
| Ví dụ tên branch `feature/booking`, `fix/booking-error`, `feature/payment`, `feature/coach-management` (thay bằng ví dụ theo giai đoạn) | Mô hình "booking theo buổi" bị bỏ; tên cũ gây hiểu lầm |

### GIỮ

| Nội dung | Lý do |
|---|---|
| Mục 1–3, 5–17: cấu trúc `main`/`develop`/`feature/*`, clone, commit, PR, merge, fetch/pull, quy tắc NÊN/KHÔNG NÊN, sơ đồ | Quy tắc workflow không đổi theo yêu cầu |
| Quy ước đặt tên `feature/`, `fix/`, `docs/` | Vẫn áp dụng; mục 18.2 chỉ bổ sung tiền tố giai đoạn |

### SỬA

| Nội dung | Trước → Sau |
|---|---|
| Ví dụ tên branch ở mục 4 | `feature/booking`… → `feature/class-enrollment`, `feature/wallet-points`, `feature/external-coach-rental`… |

### THÊM

| Nội dung | Lý do |
|---|---|
| Mục 18.1 bảng module sở hữu ↔ giai đoạn G0–G12 | Design v3 §16 (gợi ý chia việc theo module) |
| Ghi chú "không thêm project mới" và vị trí Wallet/Catalog/ExternalCoachProfile | Design v3 §2.1, §19.2 #5 |
| Mục 18.2 quy ước branch theo giai đoạn, quy tắc migration, không commit khóa, thứ tự cắt giảm | Giảm xung đột migration/merge trong refactor |
