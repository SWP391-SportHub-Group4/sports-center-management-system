# Hướng dẫn kiểm thử luồng Coach: yêu cầu đổi buổi, thông báo và quyền học viên

Ngày đối chiếu: **17/10/2026**. Nhánh **`feat/member-coach-workflows`**, gồm thay đổi Absence chưa commit sau `851ee5c8`.

Tài liệu hướng dẫn cách kiểm thử thủ công, **không phải báo cáo các ca đã chạy hoặc đã Pass**. Tên trang, nút và trường nhập được giữ bằng tiếng Anh theo giao diện.

## 1. Phạm vi

- Sửa yêu cầu đổi buổi đang chờ duyệt ngay tại trang `Requests`.
- Tự đóng yêu cầu Pending khi Manager thay đổi lịch trực tiếp.
- Thông báo dời buổi, hủy kèm bù, đổi HLV và thay đổi do sự cố.
- Chỉ cho Coach xem học viên thuộc lớp đang được phân công.
- Thu hồi quyền khi học viên thôi học, lớp kết thúc hoặc Coach hết phân công.
- Giới hạn HLV dạy thay trong buổi được giao.

Các nhận xét cũ như “chưa có/chưa đạt” không phải kết quả kiểm thử của phiên bản này. Nếu kiểm thử bản deploy, ghi lại commit frontend/backend thực tế; không dùng kết quả local để kết luận bản deploy đã đạt.

## 2. Chuẩn bị

### 2.1. Môi trường

1. Dùng một môi trường duy nhất cho mỗi lần test: local hoặc deploy.
2. Frontend/backend phải cùng phiên bản tương thích; PostgreSQL đã áp dụng các migration cần thiết.
3. Áp dụng cả `20261016130000_ReconcileMemberCoachWorkflowChoices` và `20261017090000_AddCoachAbsenceRequests` trước khi dùng giao diện mới. Việc sửa tài liệu không áp dụng migration vào DB.
4. Mở từng vai trò bằng **browser profile riêng**. Hai tab cùng profile thường dùng chung phiên đăng nhập.
5. Dùng lớp kiểm thử có tên `TEST-COACH-<mã lần test>`. Các ca hủy/hoàn dùng dữ liệu riêng, không thực hiện trên lớp đang vận hành.
6. Với email, cần SMTP hoạt động và địa chỉ nhận thư có thể truy cập. Có bản ghi outbox chỉ chứng minh đã queue, chưa chứng minh thư đến inbox.

### 2.2. Tài khoản

| Ký hiệu | Vai trò | Điều kiện |
|---|---|---|
| Manager | Center Manager | Có quyền quản lý lớp, lịch và sự cố |
| A | Coach chủ nhiệm | Phụ trách lớp C1 và các buổi S1, S2, S3 ban đầu |
| B | Coach dạy thay | Đang hoạt động, có cùng chuyên môn với C1; chưa có lớp chủ nhiệm khác chứa M1 |
| M1 | Member trong lớp | Thanh toán thành công, enrollment C1 là `Confirmed` |
| M2 | Member ngoài phạm vi | Không học bất kỳ lớp hiện hành nào do A/B chủ nhiệm |

**Chú ý chuyên môn:** không lấy Coach chỉ có Basketball để dạy thay lớp Badminton. Nếu dùng tài khoản seed, phải đối chiếu chuyên môn và phân công thực tế trước khi test.

### 2.3. Lớp và buổi

| Ký hiệu | Dữ liệu chuẩn bị |
|---|---|
| C1 | Lớp `Published` hoặc `In progress`, có ít nhất ba buổi S1–S3 trong tương lai, cách hiện tại hơn 24 giờ |
| S1 | Dùng cho sửa Pending; sau đó có thể dùng để thử dạy thay |
| S2 | Dùng cho Manager dời lịch trực tiếp và tự đóng Pending |
| S3 | Dùng cho kiểm tra hủy kèm bù hoặc các ca đối chứng |
| Slot trống | Đúng giờ mở cửa, sân và Coach cùng môn, không trùng lịch học viên |
| Slot xung đột | Đã có hoạt động chiếm sân hoặc Coach; dùng để kiểm tra thao tác thất bại |
| C-END | Lớp riêng có buổi cuối đã/sắp kết thúc, dùng cho trạng thái `Completed` |
| C-CANCEL | Lớp riêng có thể hủy, dùng cho trạng thái `Cancelled` |
| C2 | Lớp khác do A chủ nhiệm, dùng để kiểm quyền còn hiệu lực qua một lớp khác |

- C1 cần đủ ngưỡng mở lớp hoặc đã được Manager miễn ngưỡng hợp lệ để không tự hủy trong lúc test.
- Nếu cần kiểm nội dung hồ sơ, M1 mở account menu → `Fitness profile`, điền dữ liệu hợp lệ và `Save profile` trước.
- Ghi lại `classId`, `sessionId`, `requestId`, `memberId`, `enrollmentId` thực tế. Không chỉ dựa vào tên lớp.
- Giờ nhập trên giao diện là giờ Việt Nam. Dùng ISO UTC có `Z` nếu gọi API bằng thời gian UTC.
- Tạo bản sao dữ liệu riêng cho mỗi ca hủy/hoàn. Không hủy C1 rồi tiếp tục dùng C1 cho các ca cần lớp còn hoạt động.

### 2.4. Đường dẫn

Thay `<FE>` bằng URL frontend thực tế, ví dụ `http://localhost:3000`.

| Vai trò | Trang | URL |
|---|---|---|
| Coach | `Schedule` | `<FE>/coach/schedule` |
| Coach | Menu thông tin cá nhân (avatar/tên) → `Requests` | `<FE>/coach/change-requests` |
| Coach | `Students` | `<FE>/coach/members` |
| Manager | `Classes` | `<FE>/manager/classes` |
| Manager | `Activity calendar` / `Class change requests` | `<FE>/manager/schedule` |
| Manager | `Incidents` | `<FE>/manager/incidents` |
| Member | `My schedule` | `<FE>/member/schedule` |

## 3. Danh sách ca kiểm thử

| Mã | Nội dung | Kết quả thực tế |
|---|---|---|
| TC-C01 | Sửa Pending tại Requests và Teaching schedule | Not run |
| TC-C02 | Chặn sửa yêu cầu đã đóng, buổi quá khứ và hủy sát giờ | Not run |
| TC-C03 | Manager dời lịch trực tiếp tự đóng Pending | Not run |
| TC-C04 | Manager đổi lịch khi Coach đang mở form sửa | Not run |
| TC-C05 | Thay đổi xung đột không đổi lịch/đóng request | Not run |
| TC-C06 | Thông báo dời buổi, đổi HLV, hủy kèm bù, hủy khóa | Not run |
| TC-C07 | Thông báo và tự đóng Pending khi xử lý sự cố | Not run |
| TC-C08 | Duyệt request bình thường vẫn là Approved | Not run |
| TC-C09 | Coach chỉ thấy học viên thuộc phạm vi hiện tại | Not run |
| TC-C10 | Thu hồi quyền khi học viên thôi học | Not run |
| TC-C11 | Thu hồi quyền khi lớp Completed/Cancelled hoặc hết phân công | Not run |
| TC-C12 | Còn quyền qua lớp khác nhưng không mở lại lớp đã kết thúc | Not run |
| TC-C13 | HLV dạy thay chỉ truy cập buổi được giao | Not run |

## 4. Các bước kiểm thử

### TC-C01 — Sửa yêu cầu Pending

**Vai trò:** Coach A; Manager đối chiếu. **Chuẩn bị:** S1 chưa có Pending.

1. Coach A mở `Schedule` → chọn ngày → S1 → `Request`.
2. Nhấn `Request absence`.
3. Kiểm tra chỉ có `Reason`, không có chọn dạy thay/dời lịch/học bù hoặc giờ đề xuất.
4. Nhập `Reason = TEST — Unable to teach this session`.
5. Nhấn `Send request`; ghi lại `requestId` và thời điểm tạo.
6. Mở menu avatar/tên → `Requests` → chọn yêu cầu → `Edit pending request`.
7. Kiểm tra form đã nạp đúng `Reason`, loại yêu cầu là Absence.
8. Đổi lý do thành `TEST — Updated availability` → `Save changes`.
9. Refresh Requests; Manager mở cùng yêu cầu để đối chiếu.
10. Lặp thao tác sửa từ `Schedule` → S1 → `Request` → `Edit pending request` → `Save changes`.

**Đạt khi:**

- Vẫn chỉ có một request, cùng ID/người gửi/thời điểm tạo.
- Nội dung mới giữ nguyên sau refresh; request vẫn `Pending`.
- Lịch S1 chưa thay đổi vì Manager chưa quyết định.
- Manager nhận thông báo cập nhật, không có lỗi duplicate-value.
- Nếu chưa sửa gì, `Save changes` chưa hoạt động; sửa nội dung hợp lệ thì có thể lưu.

### TC-C02 — Khóa sửa khi không đủ điều kiện

1. Dùng các request riêng, để Manager duyệt hoặc từ chối; tạo thêm một request được Coach rút.
2. Coach mở từng request `Approved`, `Rejected`, `Cancel`.
3. Kiểm tra không có `Edit pending request`.
4. Với buổi đã bắt đầu, kiểm tra không còn thao tác sửa Pending.
5. Với buổi tương lai dưới 6 giờ, kiểm tra không gửi/sửa Absence được và có hướng dẫn liên hệ Manager trực tiếp; vẫn có thể rút Pending.

**Đạt khi:**

- Không sửa được request đã kết thúc; gọi lại API update với phiên hợp lệ nhận lỗi nghiệp vụ, thường `409 class_change_not_pending`.
- Buổi đã bắt đầu bị chặn; Absence dưới 6 giờ bị chặn (`class_absence_deadline`). Đúng mốc 6 giờ được phép theo giờ server.
- Manager vẫn có thể chọn dạy thay/dời lịch/học bù cho yêu cầu đã gửi đúng hạn khi buổi chưa bắt đầu.
- Không coi nút `Request absence` cho một yêu cầu mới hợp lệ là lỗi khóa sửa request cũ.

### TC-C03 — Manager dời lịch trực tiếp tự đóng Pending

1. Coach A tạo một request `Pending` cho S2.
2. Manager mở `Classes` → C1 → `Sessions` → `Edit` tại S2.
3. Chọn `Reschedule`, nhập `Start` mới ở slot trống và `Reason = TEST — Manager direct reschedule`.
4. Nhấn `Review change`, đối chiếu lịch cũ/mới rồi `Confirm`.
5. Coach A refresh `Requests`, mở lại request S2; kiểm tra lịch và chuông.

**Đạt khi:**

- Lịch S2 thay đổi đúng.
- Request chuyển `Pending` → `Cancel`, không phải `Approved`.
- Hiện `Closed automatically — schedule updated by Manager.`; không còn nút sửa.
- Coach nhận kết quả tự đóng và thông tin lịch mới.

Response request cần có các trường tương ứng:

```json
{
  "status": "WITHDRAWN",
  "resolutionType": "SCHEDULE_UPDATED",
  "reviewNote": "Closed automatically — schedule updated by Manager."
}
```

Manager/thời điểm xử lý và buổi kết quả phải được lưu đúng. `Cancel` là trạng thái của **request**, không có nghĩa S2 bị hủy.

### TC-C04 — Manager xử lý khi Coach còn mở form

1. Coach tạo Pending mới, mở `Edit pending request` và giữ hộp sửa.
2. Manager đổi lịch trực tiếp cho đúng buổi đó, hoàn tất `Confirm`.
3. Coach sửa Reason trong hộp đang mở → `Save changes`.

**Đạt khi:** backend từ chối sửa request đã đóng; hộp sửa đóng và trang tải trạng thái mới. Không hiện thông báo lưu thành công, không tạo request khác và không ghi đè lịch Manager.

### TC-C05 — Xung đột lịch phải giữ nguyên Pending

1. Tạo Pending mới trên một buổi tương lai.
2. Manager mở form sửa buổi, chọn slot đã bị trùng sân/Coach hoặc lịch Member.
3. Nhấn `Review change`; nếu preview cho phép đi tiếp thì thử `Confirm` để kiểm tra server.
4. Refresh lịch và request; đối chiếu giờ/Coach/phòng trước thao tác.

**Đạt khi:** preview hoặc backend chặn thay đổi; lịch gốc và Pending giữ nguyên; không có thông báo đổi lịch thành công. Nếu chỉ chặn ở preview, chưa chứng minh được rollback transaction phía server; ghi rõ mức đã kiểm tra.

### TC-C06 — Thông báo cho HLV hiện tại và HLV bị thay

Chạy từng dòng trên dữ liệu riêng:

| Ca | Thao tác Manager | Kết quả mong đợi |
|---|---|---|
| Dời giờ | `Classes` → lớp → `Sessions` → `Edit` → `Reschedule`; đổi Start | A nhận lịch mới; Pending liên quan tự đóng |
| Đổi HLV | Cùng form, giữ giờ/sân, đổi Coach A → B | A và B đều nhận thông báo; B thấy đúng buổi được giao |
| Hủy kèm bù | `Edit` → `Cancel and create makeup`; chọn giờ bù sau buổi cuối còn hiệu lực | Buổi gốc Cancelled, có buổi bù; HLV chủ nhiệm/cũ/mới liên quan đều được báo |
| Hủy cả khóa | Dùng thao tác hủy khóa trong trang chi tiết một lớp riêng | Pending của các buổi bị ảnh hưởng tự đóng; HLV liên quan được báo |

Với mỗi dòng:

1. Ghi lịch và thông báo hiện tại của A/B trước thao tác.
2. Thực hiện thay đổi qua `Review change` → `Confirm` hoặc thao tác xác nhận hủy khóa tương ứng.
3. Mở chuông A và B khi có đổi người dạy; đọc lớp, buổi, thời gian và lý do.
4. Mở liên kết thông báo, đối chiếu `Teaching schedule`.
5. Kiểm inbox nếu SMTP và email người nhận đã sẵn sàng.
6. Refresh lại để kiểm thông báo/lịch đã lưu, không chỉ là cập nhật trong bộ nhớ trình duyệt.

**Đạt khi:** đúng người, đúng thay đổi, không gửi lặp cùng một sự kiện cho cùng người/kênh.

**Phân biệt:** Coach gửi Pending có thể nhận hai thông báo khác nhau: (1) request tự đóng; (2) lịch thay đổi. Đây không phải gửi trùng một thông báo. Một người đồng thời là HLV chủ nhiệm và HLV cũ không được nhận hai bản sao thông báo lịch của cùng sự kiện.

### TC-C07 — Thay đổi do sự cố

1. Coach tạo Pending trên buổi dùng làm ca sự cố.
2. Manager vào `Incidents`, tạo sự cố ảnh hưởng đúng sân và thời gian buổi đó.
3. Xem danh sách `Affected activities`; tại dòng `Class session`, mở thao tác xử lý buổi.
4. Chọn dời buổi sang sân/giờ không bị ảnh hưởng hoặc hủy kèm bù; `Review change` → `Confirm`.
5. Coach kiểm lịch, Pending tự đóng, chuông và email như TC-C03/06.
6. Manager tiếp tục recheck và hoàn tất chặn phòng/giải quyết sự cố theo màn hình.

**Đạt khi:** thao tác lịch thành công qua luồng Incident có cùng hiệu lực đóng request và báo HLV. Chỉ tạo Incident chưa có nghĩa buổi tự được dời/hủy hoặc thông báo lịch đã được gửi.

### TC-C08 — Duyệt request bình thường vẫn là Approved

1. Coach tạo Pending mới.
2. Manager vào `/manager/schedule` → `Class change requests` → mở request để vào `Review schedule change`.
3. Chọn Decision, nhập giờ/Coach/phòng phù hợp và `Decision reason / feedback to Coach`.
4. Nhấn `Confirm decision`.
5. Coach refresh Requests và lịch.

**Đạt khi:** request là `Approved` (wire `RESOLVED`), lịch đổi đúng và có thông báo. Cơ chế tự đóng không được ghi đè thành `Cancel`.

### TC-C09 — Coach xem đúng học viên hiện tại

1. Coach A vào `Students`, tìm M1 rồi mở hồ sơ.
2. Kiểm tra `Health profile` xuất hiện trước; đối chiếu thông tin M1 đã khai.
3. Mở `Plans`, `Assessments`, chọn đúng lớp/môn.
4. Tìm M2; thử mở URL hồ sơ M2 trực tiếp bằng phiên A.

**Đạt khi:** M1 thuộc phạm vi hợp lệ nên xem được; M2 không xuất hiện, API/URL hồ sơ bị chặn. Không gộp plan/assessment từ sai học viên, sai môn hoặc sai lớp đang chọn.

### TC-C10 — Học viên thôi học thì Coach mất quyền

1. Dùng M1 chỉ có một lớp hiện hành với A; giữ hồ sơ M1 đang mở ở tab Coach.
2. Member M1 vào `My schedule` → lớp → `Cancel enrollment` → đọc điều kiện → `Confirm cancellation`.
3. Nếu lớp đã bắt đầu và UI chỉ hiện `Request refund`, hoàn tất bước Manager duyệt để enrollment thật sự kết thúc. Chỉ gửi yêu cầu hoàn chưa đủ cho tiền điều kiện thu hồi quyền.
4. Đối chiếu enrollment không còn Confirmed; quay lại tab A hoặc refresh.
5. Tìm lại M1 và gọi lại API hồ sơ bằng phiên A.

**Đạt khi:** request API mới bị chặn sau khi quyền kết thúc; trang đang mở bỏ nội dung khi lấy lại focus hoặc trong khoảng 30 giây khi đang hiển thị; M1 biến mất nếu không còn lớp hợp lệ khác với A.

Không xóa lịch sử Coach–Member để ép kết quả. Quan hệ cũ còn lưu trong DB cũng không được phục hồi quyền.

### TC-C11 — Lớp kết thúc hoặc hết phân công

**Completed:**

1. Dùng C-END có buổi cuối thực sự đã kết thúc.
2. Giữ backend chạy, chờ trạng thái lớp chuyển `Completed` rồi refresh trang Manager để xác nhận.
3. Coach mở lại danh sách, hồ sơ Member và nội dung lớp bằng URL cũ.

`ClassStatusJob` hiện chạy mỗi **5 phút**. Chỉ nhìn ngày kết thúc chưa chứng minh lớp đã Completed. Nếu chưa có dữ liệu thời gian phù hợp, ghi Blocked cho ca Completed; không dùng Cancelled thay thế rồi coi ca này Pass.

**Cancelled:**

1. Dùng C-CANCEL riêng, Member không có lớp khác hợp lệ với A.
2. Manager hủy khóa bằng thao tác nghiệp vụ và kiểm trạng thái `Cancelled`.
3. Coach thử đọc lại hồ sơ, nội dung lớp và URL/API cũ.

**Hết phân công chủ nhiệm:**

1. Dùng lớp riêng; Manager thực hiện thay HLV chủ nhiệm qua luồng phân công lớp được hỗ trợ, không chỉ thay HLV của một buổi.
2. Xác nhận A không còn là Coach chủ nhiệm và không còn lớp hợp lệ khác chứa Member đó.
3. A thử directory/health/history và nội dung lớp cũ. Nếu A còn được giao một buổi dạy thay, chỉ còn quyền theo buổi như TC-C13.

**Đạt khi:** lớp Completed/Cancelled không còn cấp quyền; hết phân công chủ nhiệm không giữ quyền hồ sơ đầy đủ từ quan hệ lịch sử. API phải kiểm quyền thật, không chỉ ẩn nút.

### TC-C12 — Có lớp khác hợp lệ

1. M1 học cả C1 và C2; A chủ nhiệm cả hai, C2 vẫn hoạt động.
2. Kết thúc ghi danh M1 ở C1 bằng luồng hợp lệ.
3. Coach A mở lại Students và chọn M1/C2.
4. Thử đọc nội dung C1 bằng URL/API cũ.

**Đạt khi:** M1 vẫn xuất hiện và xem được theo C2; nội dung C1 đã mất quyền vẫn bị chặn. M1 còn trong directory trong trường hợp này là đúng, không phải lỗi thu hồi quyền.

### TC-C13 — HLV dạy thay chỉ truy cập buổi được giao

1. Chuẩn bị lớp đang hoạt động: A chủ nhiệm; Manager giao S1 cho B, S2 vẫn do A dạy.
2. Xác nhận B không có lớp chủ nhiệm khác chứa M1.
3. B mở `Teaching schedule` → S1 → `Attendance`, xem roster và bản ghi buổi.
4. Thử mở S2 bằng URL/API lấy từ phiên A nhưng thực hiện với **phiên của B**.
5. Thử hồ sơ sức khỏe, Learning history, AI hồ sơ và plan cả khóa của M1.

**Đạt khi:**

- B xem được buổi S1 và dữ liệu công việc hợp lệ gắn với S1.
- Không mở được roster S2; danh sách lịch lớp chỉ chứa buổi được giao B, không Cancelled.
- Roster không chứa mục tiêu, kinh nghiệm hoặc ghi chú sức khỏe đầy đủ của Member.
- Chỉ dạy thay không cấp quyền vào directory/hồ sơ đầy đủ, Learning history, AI hồ sơ hoặc plan cả khóa.
- Nếu kiểm thao tác điểm danh, phải dùng đúng cửa sổ từ giờ bắt đầu trừ 5 phút đến giờ kết thúc cộng 24 giờ. Buổi tương lai xa chưa cho điểm danh không phải lỗi quyền dạy thay.

## 5. Kiểm tra API để chứng minh phân quyền

Dùng F12 → Network để lấy URL/request; dùng API client với phiên của đúng vai trò nếu cần. Không chia sẻ Authorization, JWT, mật khẩu hoặc dữ liệu sức khỏe nhận dạng trong ảnh/báo cáo.

Trong các URL dưới đây, `{C1}` là classId thực tế, `{S1}`/`{S2}` là sessionId và `{M1}` là memberId.

| Request bằng phiên B chỉ dạy thay S1 | Kết quả mong đợi |
|---|---|
| `GET /api/classes/{C1}/sessions` | 200; chỉ các buổi không Cancelled được giao B |
| `GET /api/class-sessions/{S1}/roster` | 200; roster đúng buổi |
| `GET /api/class-sessions/{S2}/roster` | Bị từ chối, không trả roster |
| `GET /api/coaches/me/teaching/classes/{C1}/members?sessionId={S1}` | 200; dữ liệu phù hợp buổi, không có nội dung sức khỏe đầy đủ |
| Cùng members API nhưng thiếu `sessionId` hoặc dùng S2 | 403 `session_scope_required` |
| `GET /api/coaches/me/teaching/students/{M1}` | Bị từ chối nếu B chỉ có quyền dạy thay |
| `GET /api/coaches/me/teaching/students/{M1}/health-profile` | Bị từ chối nếu không có quan hệ chủ nhiệm hiện hành hợp lệ |
| `GET /api/coaches/me/students/{M1}/health-profile` | Không được vượt quyền qua endpoint health cũ |
| `GET /api/coaches/me/teaching/classes/{C1}/records` | Nếu 200, chỉ bản ghi trong buổi B được giao; không có plan cả khóa hoặc nội dung buổi khác |
| `GET /api/coaches/me/teaching/students/{M1}/history?classId={C1}` | Bị từ chối khi chỉ dạy thay |

Các API ngoài quyền có thể trả 403 hoặc 404 để không lộ đối tượng. **401** thường là phiên chưa đăng nhập/token hết hạn; chưa đủ để kết luận kiểm quyền theo phân công đã đạt. Danh mục lớp/Coach công khai vẫn có thể xem được; cần phân biệt với hồ sơ riêng và nội dung đào tạo.

Với quyền thu hồi của A, gọi lại endpoint student/health/history/records bằng phiên A sau khi kết thúc enrollment hoặc lớp. Không dùng chỉ một request directory rỗng để kết luận mọi API đều đã an toàn.

## 6. Cách ghi nhận kết quả

| Kết quả | Khi dùng |
|---|---|
| Pass | Thao tác hợp lệ, kết quả UI/API và dữ liệu sau refresh đều đúng |
| Fail | Đủ tiền điều kiện nhưng hành vi sai, lộ dữ liệu hoặc ghi sai trạng thái |
| Blocked | Thiếu tài khoản, dữ liệu, quyền, SMTP hoặc môi trường đúng phiên bản |
| Not run | Chưa thực hiện |

Mẫu cho từng ca:

```text
Test ID: TC-Cxx
Environment / frontend commit / backend commit:
Tester / thời gian Việt Nam:
Account / role:
ClassId / SessionId / RequestId / MemberId:
Precondition:
Steps actually performed:
Expected:
Actual:
Result: Pass / Fail / Blocked / Not run
Evidence: screenshot; request URL/status/response đã che dữ liệu riêng tư
Issue / first failed step:
```

Gợi ý thứ tự: TC-C01–09 và TC-C13 trước; sau đó TC-C10–12 cùng các ca hủy khóa. Email chưa gửi được phải ghi riêng là Blocked/Fail theo nguyên nhân, không coi queue thành công là inbox delivery.

## 7. Tài liệu liên quan

- [Coach-Access-and-Schedule-Manual-Test.md](Coach-Access-and-Schedule-Manual-Test.md): bản tiếng Anh của nhóm luồng chính.
- [Class-Session-Change-Requests.md](Class-Session-Change-Requests.md): API, trạng thái và transaction của yêu cầu đổi buổi.
- [Flow-2-Manual-Test-Guide.md](Flow-2-Manual-Test-Guide.md): UC lịch, request, ghi danh và sự cố.
- [Flow-4-Use-Cases-and-Manual-Test.md](Flow-4-Use-Cases-and-Manual-Test.md): hồ sơ, kế hoạch, đánh giá và quyền học viên.
- [Local-Validation-Data.md](Local-Validation-Data.md): chuẩn bị dữ liệu local tối thiểu khi thiếu tài khoản/lớp.
