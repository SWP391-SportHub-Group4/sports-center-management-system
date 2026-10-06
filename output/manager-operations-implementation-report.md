# Manager operations — KO-04 / KO-05, 07/10/2026

## Phạm vi frontend đã chốt

Theo xác nhận của người giao task: phần việc này phụ trách frontend; AI do người khác phụ trách; team đã chốt bỏ HLV ngoài. Các luồng frontend dùng API hiện có đã triển khai và qua kiểm tra tự động. G06/G07 còn thiếu API mở rộng là dependency của backend, không phải yêu cầu viết backend trong task frontend này. G13/G02 theo docs cũng được theo dõi riêng để tích hợp khi có contract. Nghiệm thu chạy tay của người giao task còn chờ thực hiện theo checklist.

## Phần đã triển khai

- Overview ưu tiên lớp AtRisk, refund/request chờ và lịch hôm nay; dùng nguồn API hiện có, không tạo KPI aggregate giả.
- Calendar chung Hào với day/week/list, filter date/room/Coach/class/source giữ trên URL, Drawer chi tiết. Giữ route cũ; gom navigation Facilities/Schedule. Sửa token màu nút view đang chọn và thêm nhãn loại hoạt động cho Manager.
- List lớp dùng Table/FilterBar chung; quick views và pagination giữ URL. ClassEditor page bốn bước có khôi phục draft theo user/class/version; review tất cả buổi bằng availability. Save Draft và Publish tách riêng.
- ClassDetail có overview/sessions/students/holds/threshold/history; deep-link/reload, dataset tải theo tab; hold khác confirmed. Publish có availability/expectedVersion; dời/bù/hủy dùng API hiện có và bước review; cancellation giữ refund quote/token từ server. Pricing/waive theo lifecycle/deadline, reason và capacity.
- Coach list/form/detail dùng nguồn Manager, specialization và PT qualifications; offering ID do server cấp, không suy diễn/migration. Gán lịch đọc theo Coach.
- Facilities có tabs rooms/types, Dialog create/edit, opening-hours/blocks/deep-link. Type create giữ checkpoint nếu cập nhật compatible sports lỗi. Remove block có xác nhận; block conflict dẫn sang Incident với context.
- Incident preview → action riêng → checkpoint → recheck → confirm resolve. Class/PT/block chỉ ghi checkpoint khi API action thành công; PT/block có review; không coi các bước là một transaction. Timeout/500 resolve giữ cảnh báo qua reload, chặn retry mù và hướng đối soát. Receipt delivery không coi email failed là nghiệp vụ rollback.
- Notice composer chọn Coach/Member theo lớp hoặc rental window; review bị invalidate khi input đổi, gửi bằng Idempotency-Key, lookup by-key khi kết quả chưa rõ. Receipt detail và delivery đọc thật.

## Thay đổi backend giới hạn

`GET /api/audit-logs` thêm optional targetId, lọc trước count/pagination; scope Admin chỉ account giữ nguyên. Manager sport services trả actual offeringId cho qualification; public catalog bỏ field này. Không thêm migration, role hay API tài chính mới. Factory integration test cô lập SMTP máy dev và thay sender để không gửi email thật; DB dùng PostgreSQL Testcontainers riêng.

## Dependency và phần ngoài phạm vi frontend hiện tại

| Gap | Đã làm trong UI | Chưa có trong contract hiện tại |
|---|---|---|
| G03 | Entry/Drawer và giữ context, giải thích review → draft → publish | AI do người khác phụ trách; không tính suggestions thật là phần chưa hoàn thành của người nhận task này |
| G06 | Preview/action/checkpoint/recheck/resolve và receipt delivery | Incident list/detail enrichment, reservation fence, preview version/idempotency/resume; checkpoint hiện tại không thay server history |
| G07 | Composer/review/idempotency/recovery/receipt | History list và recipient preview chính thức từ server |
| G13 | Nhãn dependency trong ClassDetail | Manual close-enrollment riêng, policy hold/payment; không dùng cancel hoặc capacity làm lối tắt |
| G02 | Status/entry dependency tại threshold | Interest/chờ khóa sau do An sở hữu; không tự viết lại checkout/finance |

Team đã xác nhận bỏ HLV ngoài, phù hợp backend/SSOT hiện hành. Duyệt ExternalCoach được loại khỏi phạm vi nghiệm thu task này.

## Kiểm tra

- Frontend production build, TypeScript, ESLint và check:i18n: PASS. Docker build frontend Node 24/backend .NET 10: PASS.
- `manager-operations.spec.ts`: 26 ca đã PASS, bao gồm create/publish, conflict giữ draft, tab/query reload, qualification mapping, incident recheck/timeout/review, notice gửi một lần, RBAC, 390/960/1440 và keyboard/VI.
- Hồi quy browser chạy trên Docker frontend với HTTP fixtures: **96 PASS, 2 live cases SKIP**; gồm Manager mới và Admin/catalog/multi-sport/Member/quầy/Coach. Chạy riêng 2 ca keyboard/Axe Manager detail và Axe catalog Dialog: **2/2 PASS**, trong đó ca keyboard trùng với lượt hồi quy. Tổng **97 ca browser duy nhất PASS**, 2 live cases cũ SKIP vì chưa bật môi trường live trong suite fixture.
- Security: 12/12 PASS (`ManagerAuditScopeTests`, `AuditTargetAccountTests`, `CourtRateAuditTests`).
- Scheduling: 33/33 PASS (`SportCatalogTests`, `CoursePublishTests`, `CourtScheduleAndIncidentTests`, schedule rules theo filter).
- Live smoke Manager: 1/1 PASS trên Docker 3000/5000, chỉ login/read; không tạo class/notice/payment/incident trong DB đang dùng. Web/API health trả HTTP 200.
- Ảnh đã xem: [mobile](manager-operations-390.png), [desktop](manager-operations-1440.png), [API thật](manager-operations-live.png). Trang không tràn ngang; bảng rộng có scroll riêng.
- Axe WCAG2A/AA: Manager detail không có lỗi serious/critical; catalog Dialog không có violation trong 2 ca chạy riêng. Không thay kiểm tra accessibility toàn sản phẩm bằng kết quả của những màn này; U03 vẫn cần nghiệm thu tay. Runner khởi động Next riêng trên Windows đã hoàn thành từng ca nhưng treo khi dọn server; chuyển `PLAYWRIGHT_BASE_URL` sang Docker web có sẵn để toàn bộ lượt kiểm thoát thành công.
- Build local cảnh báo nhiều lockfile; dotnet no-restore cảnh báo NU1900 khi lấy vulnerability metadata từ NuGet. Docker backend build đã thành công 0 warnings/0 errors. Không đổi dependency để giấu warning.

## Chạy lại

Trong `frontend`:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
$env:PLAYWRIGHT_VIDEO='off'
$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'
npx.cmd playwright test tests/manager-operations.spec.ts --reporter=list
npx.cmd playwright test tests/refactor-operations.spec.ts tests/manager-multisport.spec.ts tests/manager-catalog.spec.ts tests/admin-account-flows.spec.ts --reporter=list
```

Live smoke đọc dữ liệu thật:

```powershell
$env:P2_LIVE_API='http://localhost:5000'
$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'
npx.cmd playwright test tests/manager-operations-live.spec.ts --reporter=list
```

[Bộ 70 test case nghiệm thu](../docs/frontend-redesign/MANAGER-OPERATIONS-TEST-CASES.md) có tiền điều kiện, thao tác, expected result và gap; các ca chạy tay chưa được tự đánh dấu PASS. Không commit/stage thay đổi trong lượt này; giữ công việc Admin/catalog đang có của workspace.
