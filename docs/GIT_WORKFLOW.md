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
feature/coach-management
feature/booking
feature/payment
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
fix/booking-error
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
   feature/auth       feature/booking     feature/member
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