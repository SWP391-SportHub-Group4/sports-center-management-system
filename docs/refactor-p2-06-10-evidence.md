# Bàn giao P2.06–P2.10 — 02/10/2026

## Bổ sung: định dạng ngày Court schedule

Code chỉ sửa `frontend/src/features/court-schedule/court-calendar.tsx`: tiêu đề ngày từ chuỗi ISO trực tiếp chuyển sang hàm `formatDate` có sẵn (`2026-10-02` → `02/10/2026`), thêm `<time dateTime={day}>` giữ giá trị date-only chuẩn. Không đổi helper dùng chung, nhãn dịch, ngày lọc/gửi API hoặc cách nhóm buổi theo giờ Việt Nam.

ESLint component, Prettier/diff check và production Docker build (TypeScript, 62 routes) pass. Playwright/Edge trên Docker localhost:3000 với API thật: 8 tổ hợp tiếng Anh/Việt, browser timezone America/Los_Angeles/Asia/Tokyo, tuần bắt đầu 02/10/2026 và 29/12/2026 đều hiển thị 7 ngày đúng; tuần cuối năm qua 01/01/2027 không lệch ngày. Request lọc vẫn dùng ISO và nhận 200, không có ghi nghiệp vụ. Kiểm thêm 1440px/390px không tràn trang, ảnh `frontend/test-results/court-date-en-1440.png` đã xem. Lượt script đầu chờ request dù input đã có cùng ngày nên timeout; điều chỉnh script chỉ chờ API khi ngày thay đổi, lượt cuối 8/8 pass. Không thêm test lâu dài cho sửa format hiển thị nhỏ, không chạy lại suite nghiệp vụ. Rebuild riêng frontend Docker, giữ backend/database/env/Dockerfile/Compose/migration/manifests/lockfile; không commit/push.

## Bổ sung: căn giữa chữ trong nhãn Court schedule

Chỉ sửa code `frontend/src/features/court-schedule/court-calendar.tsx` và `court-calendar.module.css`: gắn class `legendChip` riêng, `display: inline-flex`, `align-items: center`, `justify-content: center`, `text-align: center`. Nhãn trước đây bị flex row kéo cao ngang nút Refresh nhưng text nằm ở đầu; chữ nay nằm giữa nhãn. Giữ global `.chip`, bản dịch và hành vi lịch/Refresh.

ESLint component/Prettier và diff check pass; production build trong Docker qua TypeScript và 62 routes. Kiểm trực tiếp bằng Playwright/Edge trên Docker localhost:3000 với API thật, tài khoản lễ tân: Anh/Việt ở 1440px và 390px đều giữ bốn nhãn, text center lệch ngang 0px/dọc khoảng 0,30px, không tràn trang; bấm Refresh nhận API 200 và không có request ghi nghiệp vụ. Ảnh `frontend/test-results/court-legend-en-1440.png` và `court-legend-vi-390.png` đã kiểm bằng mắt. Không thêm test tự động lâu dài cho sửa CSS nhỏ; không chạy lại 42 case nghiệp vụ vì không đổi logic. Rebuild riêng frontend Docker, giữ backend/database và env/Dockerfile/Compose/migration/manifests/lockfile nguyên trạng; không commit/push.

## Bổ sung: thông báo trùng gói đúng ngôn ngữ ở Sell plans

Sửa `frontend/src/features/payments/checkout-panel.tsx` cùng `frontend/src/locales/en.ts` và `vi.ts`: giữ đối tượng lỗi để nhận diện mã `duplicate_active_package`, dịch ở lúc render. Anh: “This member already has a package of the same type that is active or awaiting payment.”; Việt: “Hội viên đã có gói cùng loại đang hoạt động hoặc chờ thanh toán.” Đổi Anh/Việt sau khi nhận lỗi cập nhật thông báo mà không reset lựa chọn hoặc gửi lại POST; lỗi chưa được ánh xạ vẫn giữ message server. Giữ flow idempotency/recovery/quyền backend; thông báo uncertain tra ngôn ngữ khi render.

Hai case mới trong `frontend/tests/refactor-operations.spec.ts` mô phỏng backend trả 409 với mã trên và message tiếng Việt: kiểm tra ngôn ngữ khởi đầu Anh/Việt, chuyển qua lại khi lỗi đã hiển thị, giữ Member/gói, không thêm POST do đổi ngôn ngữ, và retry với mã chưa ánh xạ vẫn hiển thị chi tiết server. `npx.cmd playwright test tests/refactor-operations.spec.ts tests/refactor-payments.spec.ts --workers=1 --reporter=list --output=test-results/sell-plans-i18n`: **42/42 pass**, 0 fail/skip (32 operations + 10 payment). Đây là HTTP fixtures, không phải nghiệm thu payment thật. Ảnh `frontend/test-results/sell-plans-error-en.png` và `sell-plans-error-vi.png` đã kiểm tra bằng mắt.

Typecheck/build (62 routes), check:i18n, Prettier các file sửa và diff check pass; lint 0 error/7 warning có sẵn. Rebuild riêng frontend của project Docker đang chạy, giữ nguyên backend/database; `http://localhost:3000/receptionist/sell-plans` trả HTTP 200. Server test tạm 3100 đã dừng. Không sửa backend/API contract, env/Dockerfile/Compose, migration, manifests/lockfile hoặc seed; không commit/push.

Phạm vi: các chức năng P2.06–P2.10 trong `refactor-code-plan-2-frontend.md`, gồm frontend và API còn thiếu trực tiếp phục vụ các chức năng này. Tái sử dụng auth, API client, checkout, OTP điểm quầy, invoice và wallet của P2.00–P2.05. Không sửa env/env mẫu, Docker/Compose, deployment, migration/schema, dependency/lockfile hoặc Requirements/SRS. Giữ nguyên thay đổi có sẵn của người dùng ở Business Rules DOCX và `frontend/src/app/coach/forms.module.css`. Chưa commit/push. P2.11–P2.12 ngoài phạm vi.

## Thay đổi theo chặng

| Chặng | Nội dung triển khai |
|---|---|
| P2.06 | Dashboard Lễ tân: lớp hôm nay, hóa đơn chờ và Gym đang có người bên trong từ API phân trang. Chọn Member trước checkout Gym/PT/nguyên khóa, xem wallet/ledger/invoice/history; đổi Member remount flow để xóa OTP/points/checkout cũ. Check-in/out qua server, bỏ HUD cửa quay giả. Attendance chọn ngày → khóa → buổi → roster Confirmed; Present/Absent do Lễ tân, lỗi theo hàng, lưu hàng loạt cần xác nhận. Lịch sân chỉ đọc, rental không có attendance. |
| P2.07 | Manager quản lý Sport, RoomType và tương thích, Room/capacity/active, giờ mở cửa/blocks, court rates, Gym catalog/PT pricing và settings. Tạo Coach với password checklist, ít nhất một specialty; sửa tên/số điện thoại/bio/specialties, cảnh báo phân công cũ. Duyệt/từ chối/suspend/reactivate ExternalCoach, lý do theo API; không sửa role/email/UserStatus. Không hard DELETE danh mục đã tham chiếu. |
| P2.08 | Khóa có sport/lifecycle/threshold/search/pagination. Draft dùng weekly rules, duration từ Sport và thời gian Việt Nam. Preview các buổi và room/coach với tối đa 4 request đồng thời; publish vẫn kiểm lại expectedVersion. Detail có holds/enrollments/threshold choices phân trang, link hóa đơn được phép, deadline/pricing/waive và session reschedule/cancel+makeup. Hủy khóa có lý do và preview điểm hoàn server; stale preview 409 phải xem lại. Paid enrollments được hoàn phần chưa cung cấp, pending checkouts/held points được release, session/occupancy/threshold responses được xử lý cùng transaction. Hủy lặp không cộng thêm điểm. |
| P2.09 | Calendar ngày/tuần/phòng, chữ mô tả Class/PT/Rental/Block, list mobile và range giới hạn; API cấp scope theo vai trò. Incident room/center có preview, xử lý từng class/PT/block, kiểm lại trước resolve; không báo success nếu canResolve=false. Preview chậm không ghi đè form đã đổi. Manual notices chọn rõ danh sách tối đa 200 người, preview nội dung/kênh, UUID idempotency và receipt phục hồi sau timeout/F5; trạng thái delivery thật cho notice/incident. Lỗi validation giữ form có thể sửa. |
| P2.10 | ExternalCoach dashboard/profile/approval note, booking, own rental list/detail, self paged rental invoices và wallet/ledger. Chỉ Approved đặt mới; specialty/phòng trống/ExpectedAttendees, giá từng block và giới hạn từ server. Checkout dùng chung points/VNPay; quote cũ bị bỏ khi đổi form, 403 refresh approval/auth. Detail tải trực tiếp theo ID chủ thuê, snapshot giá/lý do hủy/điểm hoàn ledger/invoice kể cả pending. Hủy lấy refund quote server, không tạo Member refund request. |

Giao diện dùng CSS Modules, AppShell, Navy/Ice/Roboto hiện có; không thêm framework/dependency. Menu và labels mới có VI/EN. Field liên kết label với control, Dialog giữ/trả focus. Feature chỉ mount sau role guard; SystemAdministrator không được catalog. Invoice deep link tại quầy phải khớp Member đang chọn. Date-only không lệch ngày, datetime form chuyển UTC từ UTC+7. Không lưu số dư/giao dịch/quyền lợi giả ở localStorage.

## API bổ sung và authority

Contract đầy đủ ở [refactor-api-contract.md](refactor-api-contract.md), phần P2.06–P2.10:

- FrontDesk `GET /api/gym-checkins/inside` phân trang; checkout tiếp tục endpoint server/idempotent hiện có.
- Manager sửa Coach thêm fullName/phone, giữ validation/unique phone và cố định role/email/UserStatus.
- Manager class list thêm thresholdStatus; `/{id}/holds`, `/enrollments`, `/threshold-responses` phân trang, không trả token/hash. Invoice lấy theo item bằng API hiện có.
- `GET /api/manager/classes/{id}/cancellation-preview`; POST cancel có previewToken. Khóa invoice/item/wallet/entitlement/class, kiểm lại dưới transaction, cùng authority refund/fulfillment. Số điểm `floor(remainingPaidValueVnd × sessionsNotProvided / totalSessions / 1000)`, không làm tròn phần trăm trung gian. Buổi gốc hoặc buổi bù Completed được coi đã cung cấp theo Scheduling; không dựa đồng hồ browser. Legacy enrollment thiếu paid item bị chặn để tránh hoàn sai. Gateway cash đến muộn sau hủy theo pipeline compensation hiện có.
- Notice POST nhận Idempotency-Key UUID; cùng Manager/key/payload chỉ tạo một receipt/outbox, đổi payload 409. GET noticeId/by-key chỉ Manager đã gửi; Manager khác 404. GET by-key chờ transaction gửi cùng key trước khi kết luận. UI không auto-retry POST với key mới khi chưa rõ kết quả.
- Incident `GET /api/manager/incidents/{id}/notifications` tổng hợp delivery theo rental source IDs; pending rental cũng lưu incident link khi resolve.
- ExternalCoach `GET /api/court-rentals/policy`, `/{rentalId}` theo owner, `GET /api/external-coaches/me/invoices` chỉ invoice rental của chính họ. Detail sai owner 404, không fetch toàn hệ thống rồi lọc ở UI.

API Program.cs chỉ thêm ba DI registrations cho các service/reader mới. Không đổi startup/env/Docker hay cơ chế triển khai.

Delivery gồm Pending/Sending/Sent/Failed/Read và tổng số. Đây là trạng thái outbox/in-app; SMTP vẫn at-least-once, Sent không chứng minh người nhận đã đọc. Không tuyên bố exactly-once SMTP.

## Kiểm chứng bản cuối

| Kiểm tra | Kết quả |
|---|---|
| Solution Release build `dotnet build backend/SportHub.sln -c Release --no-restore -v quiet` | Pass, 0 error. Lượt cuối 11 NU1900 warnings vì NuGet vulnerability feed không truy cập được; không thay dependency. |
| Payment unit/integration trên PostgreSQL riêng | **143/143 pass**, 0 fail/skip; TRX `backend/SportHub.Payment.Tests/TestResults/p2-payment-verified.trx`. |
| Scheduling unit/integration trên PostgreSQL riêng | **108/108 pass**, 0 fail/skip; TRX `backend/SportHub.Scheduling.Tests/TestResults/p2-scheduling-verified.trx`. |
| `npm.cmd run typecheck` | Pass. |
| `npm.cmd run lint` | 0 error, 7 warning có sẵn ở Coach AI/training-plans và AuditLogView ngoài scope. |
| `npm.cmd run check:i18n` | Pass; kiểm BR/SSOT text theo scope sẵn có, không phải kiểm mọi bản dịch. Script dùng fileURLToPath để chạy được trên Windows có đường dẫn chứa dấu cách. |
| `npm.cmd run build` | Pass, 62 routes. |
| Browser HTTP fixtures | `refactor-operations.spec.ts`, `refactor-foundation.spec.ts`, `refactor-payments.spec.ts`: **31/31 pass**, 0 skip; 19 operations + 12 shared. |
| Browser gọi API thật | `P2_LIVE_API=http://127.0.0.1:5000 npx.cmd playwright test tests/refactor-operations-live.spec.ts --workers=1 --reporter=list`: **2/2 pass**, không dùng HTTP fixtures. |
| Whitespace / protected paths | `git diff --check` pass; env/Docker/Compose/migration/package manifests/lockfile không có diff. |

Các case mới kiểm notice concurrent POST/retry/owner privacy/conflicting payload; cancel full/partial refund, double cancel, concurrent reservation, late cash compensation; paged course operations/threshold filter không lộ token; Gym inside RBAC; Coach profile/unique phone; own rental detail/pending invoices/refund snapshot và incident delivery. OTP expiry regression nay xác nhận invoice/wallet của case đã nhả điểm, không giả định global worker chỉ xử lý đúng một invoice trong DB dùng chung.

Browser fixtures kiểm F5 authority, lỗi attendance từng hàng, đổi Member bỏ state cũ, Draft/session conflict giữ form, incident/availability response chậm, Suspended/403 booking, rental cancel 204, privacy, invoice deep link khác Member, role guard, notice validation/timeout/F5 và calendar 390/1440px không overflow. Hai case live kiểm Manager UI hủy khóa đã trả 100 điểm → wallet phục hồi đúng → F5; gửi notice in-app → receipt/outbox đúng một dòng → F5 đọc delivery thật. Ảnh calendar ở `frontend/test-results/p2-court-schedule-390.png` và `...-1440.png` (ignored), đã kiểm bằng mắt.

## Môi trường test và giới hạn

PostgreSQL 18 chạy cluster tạm trong Windows TEMP, port 55439; các DB mới dành riêng cho Payment, Scheduling và live browser. Không chạy migration lên DB phát triển: migration hiện có chỉ được dùng để tạo schema trong các DB test mới. Test assemblies/API được chạy từ bản copy TEMP để root .env không ghi đè connection test. Không chỉnh .env để thực hiện cách ly này.

Lượt regression đầu có hai lỗi môi trường/fixture: DB locale C không case-fold đúng chữ tiếng Việt; OTP expiry test đếm global invoices nên kết quả phụ thuộc các case khác. Đã dùng DB Unicode en-US mới và assertion theo invoice/wallet thực tế, chạy lại toàn bộ 251 case đều pass. Lượt UI cuối có một selector trỏ sai main ID trong case mới; đổi sang accessible main, chạy lại toàn bộ 31 case. Không bỏ qua test thất bại.

Build dùng Node 26.7/npm 11 của máy, package vẫn khai báo Node 24; không sửa engine/lockfile. VNPay dùng gateway mock trong môi trường test, SMTP bên ngoài chưa nghiệm thu. Các bộ Administration/Security/Training toàn phần và mọi tổ hợp gate xuyên suốt chưa chạy lại trong lượt này; không gọi kết quả này là nghiệm thu toàn bộ plan 2. Các services tạm được dừng sau kiểm thử; không dừng server phát triển của người dùng.

## Bổ sung UX chọn gói và tạo hóa đơn tại quầy — 02/10/2026

Hai nút `Checkout` trước đây thực hiện hai bước khác nhau nhưng cùng nhãn, và bước trước tạo hóa đơn chưa có thông tin review. `front-desk.tsx` nay hiển thị `Chọn gói / Select plan`, trạng thái lựa chọn bằng aria-pressed, và truyền Member/email/gói/giá/thời hạn vào review của `CheckoutPanel`. Nút `Tạo hóa đơn / Create invoice` mới gọi API checkout hiện có. Review là một section riêng sau bảng; CSS Modules giữ tên gói dễ đọc bằng bảng cuộn ngang và bố trí review phù hợp desktop/mobile. Giá ở review lấy từ catalog backend; dữ liệu hóa đơn sau tạo tiếp tục lấy từ response backend. Không đổi rule, request/response hoặc cơ chế OTP/điểm/thanh toán.

Nhãn mới nằm trong cả `locales/en.ts` và `vi.ts`. `review` không tham gia key của checkout flow, nên đổi ngôn ngữ chỉ cập nhật nội dung, giữ gói/Member, trạng thái busy và idempotency key. Đổi Member vẫn remount theo userId và xóa lựa chọn cũ.

Kiểm chứng: typecheck, build (62 routes), check:i18n và Prettier các file đã sửa pass; lint toàn frontend 0 error/7 warning có sẵn ngoài scope, lint riêng source/test mới 0 warning. Lệnh `npx.cmd playwright test tests/refactor-operations.spec.ts tests/refactor-payments.spec.ts --workers=1 --reporter=list --output=test-results/membership-review`: **33/33 pass**, 0 fail/skip (23 operations + 10 payment HTTP fixtures). Hai case mới bắt đầu với Anh/Việt, bấm nút chuyển ngôn ngữ Anh ↔ Việt, đổi gói, đổi Alice sang Bob, kiểm payload đúng Member/gói, idempotency key, không POST khi chọn/chuyển ngôn ngữ và chỉ một POST khi tạo hóa đơn. Chuyển ngôn ngữ trong lúc POST đang chờ vẫn disable nút và không reset flow. Kiểm viewport 1440/390px không tràn ngang toàn trang; ảnh `frontend/test-results/membership-review-en.png` và `membership-review-vi.png` đã xem bằng mắt. Đây là test giao diện bằng HTTP fixtures, không phải giao dịch VNPay thật.

Lượt bổ sung này chỉ đổi frontend và ghi checkpoint/evidence; giữ nguyên backend, API contract, env/Docker/Compose, migrations, dependency manifests/lockfile và Business Rules DOCX đang có thay đổi của người dùng.

## Sửa mở hóa đơn từ dashboard — 02/10/2026

Dashboard đã truyền invoiceId nhưng trang invoices trước đây chỉ mount InvoiceList sau khi lễ tân tự chọn Member, nên liên kết tới hóa đơn vẫn hiện `Chọn hội viên trước`. Feature `receptionist/invoice-desk.tsx` nay đọc query bằng useSearchParams (page có Suspense), kiểm UUID, lấy detail theo `/api/invoices/{id}` hoặc `/api/invoices/by-item/{id}`, rồi lấy đúng người thụ hưởng theo `/api/users/{memberId}`. MemberDesk nhận initialMember, InvoiceList tiếp tục kiểm hóa đơn thuộc Member đã chọn và đặt detail trước bộ lọc/danh sách. Request có AbortSignal và component được key theo reference khi query đổi. Loading/error/retry dùng component hiện có; link sai có thông báo Anh/Việt.

Kiểm dữ liệu thật phát hiện hóa đơn seed `INV-2026-000008` ở trạng thái Issued nhưng chưa có CheckoutSession. Backend đã trả `checkoutExpiresAtUtc: null` (projection từ HoldExpiresAtUtc), trong khi checkout mới luôn có expiry. Bổ sung field tương ứng vào type frontend; InvoiceDetail vẫn hiện đủ dữ liệu hóa đơn, hiển thị thông báo song ngữ khi field null và không mount CheckoutPanel cho invoice Issued đó. Không tạo checkout tự động, không thay status/seed, không nới quyền hoặc sửa backend/DTO server. Invoice có expiry tiếp tục dùng flow thanh toán hiện có.

Kiểm chứng bản cuối: typecheck/build (62 routes), check:i18n và Prettier các file sửa pass; lint toàn frontend 0 error/7 warning có sẵn. `npx.cmd playwright test tests/refactor-operations.spec.ts tests/refactor-payments.spec.ts --workers=1 --reporter=list --output=test-results/invoice-deep-link`: **40/40 pass**, 0 fail/skip (30 operations + 10 payment). Bảy case mới kiểm link thật qua Next Link từ dashboard ở Anh/Việt, F5, đổi ngôn ngữ, link invoiceItemId, 403/404 + retry, link sai không gọi API và hóa đơn legacy không gọi checkout. Case đổi sang Member khác giữ kiểm tra mismatch trước khi mở quyền thanh toán. Các lần đọc/chuyển trang không POST nghiệp vụ. Lượt đầu có selector trùng dòng item trong detail và checkout; đã sửa selector và chạy lại toàn bộ suite, không skip case.

Browser dùng API thật tại localhost:3000/5000, tài khoản lễ tân demo: bấm link dashboard tới invoiceId `aa2a40d1-cb8a-4ddb-9816-4a9a93c9d742` (`INV-2026-000008`), tự hiện đúng Member và item, F5, đổi Anh/Việt và F5 giữ ngôn ngữ đều pass ở cả hai ngôn ngữ khởi đầu. Không mock API trong lượt live, không có request ghi payment/cancel/refund. Ảnh `frontend/test-results/invoice-link-live-en.png` và `invoice-link-live-vi.png` đã kiểm bằng mắt. Server test tạm 3100 đã dừng, frontend Docker đã cập nhật; dữ liệu và backend Docker giữ nguyên. Không sửa env/Docker/CORS/migration/manifests/lockfile, không commit/push.
