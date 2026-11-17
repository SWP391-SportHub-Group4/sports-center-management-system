# SportHub Coach AI Plan V1 — isolated context aggregation add-on

## 1. Phạm vi và baseline

Baseline: `sports-center-management-system-feat-hao-ai-flow5-flow6(2).zip` (SHA-256 trong `verification.json`). Controller / teaching editor / class teaching service / Python coach endpoint cũng khớp các file tương ứng trong bản ZIP `sports-center-management-system(20261116-172404).zip`. Không giả định checkout Windows hiện tại trùng baseline; installer kiểm tra từng hash trước khi ghi.

**Không đụng Member Workout Suggestions V37**, Flow5 runner, Member/Coach Chat, Manager AI, Python Gemini shared service, Model Router, schema database, migrations, `.env`, API key và luồng lưu Plan thủ công. Không mở thêm endpoint hay thay DTO response. Chỉ sửa 3 file hiện hữu, thêm 7 file CoachPlanning và 2 file kiểm thử. Không cần tạo thêm bảng hoặc cài package.

## 2. Flow và quy tắc

1. Xác thực JWT Coach (policy hiện hữu) và quyền coach chính của lớp đang Published/InProgress. Session gắn với draft phải thuộc lớp, do chính coach phụ trách, Scheduled, chưa bắt đầu và có thời gian hợp lệ. Scope session không nhận MemberId. Scope personal bắt buộc có MemberId đang Confirmed và EndedAt null; SessionId là tùy chọn, không bị mất nếu chọn buổi cụ thể. Course plan thủ công giữ nguyên; không mở AI course roadmap.
2. Context reader chỉ SELECT từ database. Không lấy UserAccount, tên, email, số điện thoại, định danh của học viên để đưa vào prompt. Nhóm lớp dùng thống kê; Personal truy xuất đúng một học viên ở query. History lấy các session Completed, kết thúc không muộn hơn thời điểm tạo request, không lấy cancelled/ongoing/future. RESULT chỉ lấy của coach hiện tại, học viên thuộc scope và có attendance Present. Đối với lịch sử khác lớp của Personal, chỉ lấy cùng học viên, cùng sport và cùng coach đã phụ trách (không lấy lịch sử của coach khác). Không coi nội dung PLAN cũ là bằng chứng đã thực hành.
3. Context builder tạo JSON camelCase, giữ `goal` hiệu lực + `originalGoal`, `level` coach chọn, `scope`, môn thể thao, `targetSession` nếu có, `totalSessions`. Không đoán class level từ tên lớp. Profile level là dữ liệu tham chiếu; coach level là độ khó mục tiêu. Nếu khác nhau, AI phải đưa biến thể phù hợp. Dữ liệu thiếu là unknown, không phải điểm 0 hoặc xác nhận đủ sức tập.
4. Goal Assessment bằng context nhỏ chỉ gồm sport, goal, level, language, scope (không gửi notes/history vào bước này). Local guard giữ nguyên. VAGUE có thể chuẩn hóa goal theo logic cũ, không bỏ qua goal trái ngược/không an toàn.
5. Generation sử dụng context giới hạn; review lần đầu nhận chính context này dưới dạng JSON object + draft. Nếu reject, repair tối đa một lần rồi second review với cùng context. Giữ pipeline 3–5 model calls/plan (chưa tính retry nội bộ provider), không tự động lưu. Mọi bài tập phải có sets × reps > 0, đúng format `Heading · Details` và coach kiểm tra trước khi Use/Save. Coach plan gắn session có thời lượng thực của session; không thay đổi việc bỏ time constraint của Member V37. Review kiểm tra thời lượng bằng model, không phải validator số học tổng thời lượng.
6. Trước khi trả draft, kiểm tra lại quyền lớp, enrolled member, roster của Session Plan và session chưa bắt đầu/không đổi thời gian. Không tạo DB write. Đây là snapshot read-only theo request, không phải giao dịch isolation snapshot kéo dài trong lúc gọi Gemini.

## 3. Context Session / Personal

| Data | Session | Personal |
|---|---|---|
| Training goal & selected Experience | Có | Có |
| Roster / ID học viên | Số lượng, không ID xuất ra | 1 học viên, không ID xuất ra |
| Profile | Experience, goal-type và goal-topic distribution, age groups, số missing | Goal, Experience, GoalType, tuổi nếu hợp lệ, activity, training days, self-reported notes |
| Body | Không gửi body metrics từng người | Chỉ adult Gym profile có height/weight hợp lệ; BMI tính bằng BodyMetrics hiện có, không phân loại BMI y khoa hoặc suy đoán diagnosis |
| Restrictions | Nhóm theo nội dung ghi chú trùng, kèm số lượng; không bỏ ghi chú dài | Toàn bộ ghi chú của người được chọn |
| Attendance | Số Present/Absent và tỉ lệ trên số bản ghi thật của các buổi hoàn thành | Tương tự, đúng học viên |
| Scores | Trung bình toàn lớp trên các score 1–5 có thật; số bản ghi và mean từng 3 buổi gần nhất | Progress hiện tại + progress các lớp trước (cùng sport/cùng coach); score gần nhất theo thời gian buổi; tối thiểu 4 score để phân loại xu hướng |
| Assessment texts | Tối đa 60 bản ghi của 3 buổi gần nhất được phân tích keyword local; chỉ gửi top 6 chủ đề xuất hiện và counts, không gửi raw individual assessment | Tối đa 5 nhận xét lớp này và 2 nhận xét lớp trước, mỗi nhận xét tối đa 700 ký tự + nhãn excerpt |
| Saved plans in completed sessions | 3 buổi gần nhất, tối đa 6 plan chung, tiêu đề + tối đa 5 heading/plan | Chung + plan đúng selected member, cùng giới hạn, không lấy plan của học viên khác |
| Time | Actual target session duration | Có nếu chọn future session, không có nếu throughout course |

Điểm số là assessment tổng thể 1–5, không tồn tại schema per-skill score. `reportedSkillMentions` và `savedGoalTopicMentions` là đếm từ khóa theo văn bản (không phải weakness, skill score hay diagnosis). Keyword vocabulary cố định ở `LessonHistoryAggregator.cs` (VN/EN Badminton/Basketball/Gym); văn bản có thể chứa từ đồng nghĩa ngoài danh sách. Trend personal: so sánh mean của hai nhóm score mới/cũ không chồng lấn, mỗi nhóm tối đa 3 điểm, chênh lệch >=0.5 là improving, <=-0.5 declining, còn lại stable; thiếu 4 điểm thì insufficient_data. Attendance không tự quy đổi session không có record thành absent. Profile note không phải medical clearance.

## 4. Budget/caching/logs

- `ContextBytes = 12000` giới hạn UTF-8 JSON context, `StageBytes = 32000` cho payload review/repair. Đây là giới hạn byte kỹ thuật, KHÔNG phải hard Gemini token limit. System prompt / question / phần wrapper Python vẫn bổ sung token. Các hằng số ở `PlanContextBudget.cs`.
- Giảm history tùy chọn nếu vượt budget, vẫn giữ ghi chú safety của profile. Nếu phần bắt buộc vượt giới hạn thì trả `ai_plan_context_too_large` HTTP 400, không tùy tiện cắt notes. Các nhận xét dài được ghi nhãn excerpt, coach bắt buộc xem lại giới hạn chưa rõ. Với số lượng notes riêng biệt rất lớn, giới hạn này có thể buộc coach chọn Personal Plan hoặc rà soát notes.
- Tái sử dụng cùng snapshot/context trong request, không gọi AI để tổng hợp dữ liệu. **Không triển khai persistent cache / explicit Gemini prompt caching ở V1** để tránh dùng profile/attendance lỗi thời, tránh cache thông tin sức khỏe; việc tái sử dụng object tiết kiệm truy vấn DB nhưng không làm Gemini miễn phí token khi gửi lại cùng JSON ở bước review. Không đổi shared Gemini service đã freeze.
- Backend log `CoachPlan scope=... stage=... call=... contextBytes=... systemBytes=... questionBytes=...` và `model`, `outputBytes`, `elapsedMs`. Không log nội dung profile/goal/draft/key/identity. Chưa ghi nhận actual Gemini token metadata (shared provider hiện chỉ trả text); đo thực tế token trên dashboard hoặc triển khai diagnostics Coach-only sau khi được duyệt. Không cam kết con số % tiết kiệm thực tế trước benchmark.
- Email và pattern số liên hệ trong saved free text được giảm/redact theo regex; không bảo đảm ẩn danh tuyệt đối vì free-text note/assessment có thể chứa tên, thông tin nhận dạng hoặc chi tiết sức khỏe viết tự do. Chỉ chia sẻ dữ liệu cần thiết và đúng quyền; kiểm tra chính sách tổ chức cho dữ liệu gửi nhà cung cấp AI. Dữ liệu nhạy cảm trong lịch sử có thể nằm ngoài sample/excerpt; AI không được xem việc thiếu data là clearance. Coach phải duyệt thủ công.

## 5. Cài trên Windows

Đứng tại root repo đang dùng. Đóng backend/frontend trước khi thay source. Giữ lại backup của các chỉnh sửa local bất kỳ; không chạy `git reset --hard`.

```powershell
cd 'D:\sports-center-management-system\sports-center-management-system'
Expand-Archive "$env:USERPROFILE\Downloads\SportHub_Coach_AI_Plan_V1.zip" -DestinationPath . -Force
python .\coach-plan-addon\install_coach_plan.py --root . --check --require-v37
```

Chỉ khi `CHECK_OK` và `Member generator V37: MATCH`:

```powershell
python .\coach-plan-addon\install_coach_plan.py --root . --require-v37
dotnet build .\backend\SportHub.API\SportHub.API.csproj -c Release
```

Installer chỉ cho phép 12 path trong manifest. Mọi preimage phải đúng bản ZIP hoặc đã đúng patch; khác nhau sẽ từ chối trước khi ghi. Không bỏ SHA guard. Nếu `CONFLICT` thì gửi đúng file conflict/diff (không gửi secrets). `--require-v37` kiểm tra chính xác generator có trong original V37 ZIP, không tự cài lại V37 nếu khác. Ghi lại `BACKUP_ID` để rollback nếu cần. `PROTECTED_UNCHANGED` kiểm tra các protected files có mặt trước/sau bằng bytes. Không đọc `.env`.

Frontend (dependencies đã cài):

```powershell
cd .\frontend
.\node_modules\.bin\tsc.cmd --noEmit
cd ..
```

Restart backend và frontend (Python AI Service/Router không thay source, không cần restart trừ khi đã dừng). Backend launch profile HTTP gốc là port 5000:

```powershell
dotnet run --project .\backend\SportHub.API\SportHub.API.csproj --launch-profile http
```

Terminal frontend riêng: `cd frontend` rồi `npm run dev` (hoặc lệnh dev mà repo đang dùng). Python AI Service cần tiếp tục chạy trên port 8001 theo cấu hình hiện hữu. API key sporthub-2 vẫn dùng như trước, không thay model/quota.

## 6. Test

### A. Unit test (không gọi Gemini)

```powershell
dotnet test .\backend\SportHub.Scheduling.Tests\SportHub.Scheduling.Tests.csproj --filter 'FullyQualifiedName~CoachPlanContextTests'
```

Kiểm tra aggregation, missing data, budget, full profile notes, personal scope, history, score trend, skill mentions, synthetic size comparison, và sets/reps không dương.

### B. PostgreSQL integration tests (không gọi Gemini thật)

Cần Docker để fixture dùng PostgreSQL test container. Không trỏ `SPORTHUB_TEST_POSTGRES` tới database dùng thật: chỉ dùng disposable test database. Integration test sử dụng fixture synthetic của project, kiểm tra DB query + context scope + controller/provider serialization với HTTP stub, kiểm tra invalid scopes qua API và no automatic save. Chạy cùng regression cũ:

```powershell
Remove-Item Env:SPORTHUB_TEST_POSTGRES -ErrorAction SilentlyContinue
dotnet test .\backend\SportHub.Scheduling.Tests\SportHub.Scheduling.Tests.csproj --filter 'FullyQualifiedName~CoachPlanContextIntegrationTests|FullyQualifiedName~Ai_suggestions_require_a_specific_upcoming_session'
```

### C. Live smoke tests (real Gemini qua .NET API / Python service)

Chỉ chạy localhost cùng synthetic class/member; không đưa dữ liệu thật của học viên vào test. Cần JWT của coach synthetic, **không phải Gemini API key**. Nhập JWT vào secure prompt hoặc đặt process env `SPORTHUB_COACH_TEST_TOKEN` bằng công cụ local. Không chia sẻ JWT hoặc API key qua chat. Chọn ClassId, future SessionId (Scheduled, chưa bắt đầu, coach được phân công), MemberId đang active từ DB test hoặc network response local UI; thay các biến `YOUR_...` bằng GUID thật của fixtures. Đối với Badminton dùng goal `Improve footwork`; môn khác điều chỉnh goal.

```powershell
$ClassId = 123 # replace with disposable synthetic class ID
$FutureSessionId = 'YOUR_SYNTHETIC_FUTURE_SESSION_GUID'
$MemberId = 'YOUR_SYNTHETIC_ENROLLED_MEMBER_GUID'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\coach-plan-addon\run-coach-plan-live.ps1 -ClassId $ClassId -FutureSessionId $FutureSessionId -MemberId $MemberId -SyntheticOnly -OnlyNegative
# Nếu tất cả guards PASS, bỏ -OnlyNegative để chạy 3 positive cases thật:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\coach-plan-addon\run-coach-plan-live.ps1 -ClassId $ClassId -FutureSessionId $FutureSessionId -MemberId $MemberId -SyntheticOnly -Goal 'Improve footwork' -Language en
```

Optional `-PastSessionId` và `-OutsiderMemberId` mở thêm các case 409/403. Guard cases mặc định 5, tối đa 8 nếu cung cấp các fixture optional. Happy cases 3: Session Plan, Personal Plan gắn session, Personal Plan throughout course. Real execution dự kiến 3–5 generation calls mỗi happy case, chưa tính retry của provider. JSON report tại `coach-plan-addon/reports/`; chỉ chứa dữ liệu synthetic và draft trả về, không ghi token/key/raw upstream response. Kiểm thử này xác nhận API response/format; không chứng minh an toàn thực tế hoặc chất lượng mọi bài tập. Coach phải kiểm tra draft và kiểm thử UI Use/Save riêng. Các 50 testcase V37 Member vẫn giữ nguyên, không dùng để đánh giá Coach Plan.

## 7. Rollback

Dừng backend/frontend. Dùng đúng ID installer thông báo:

```powershell
python .\coach-plan-addon\install_coach_plan.py --root . --rollback YOUR_BACKUP_ID --require-v37
```

Rollback chỉ khôi phục những file được thay ở lần install đó; từ chối nếu file sau install đã bị chỉnh. Backup nằm tại `coach-plan-addon/backups/`. Không commit backups/reports/token. Không đổi Member V37 hoặc config Gemini.

## 8. Kết quả xác minh thực tế của gói

Xem `verification.json`: kiểm tra hashes baseline và payload, install/rollback trên copy fixture có original V37 và router, idempotence, từ chối unknown revision và rollback drift, kiểm tra byte protected files, mapping frontend và shared review context tĩnh đều PASS; TypeScript transpileModule cho hai file sửa: 0 diagnostics. **Không có .NET SDK và PowerShell trong môi trường tạo gói: chưa build C#, chưa chạy xUnit/PostgreSQL integration, chưa chạy PowerShell live smoke, chưa chạy Gemini hoặc kiểm tra localhost thực tế.** Không coi các test được viết là đã PASS. Cần thực hiện Bước 5–6 tại checkout hiện tại trước PR/deploy. Trạng thái là candidate patch, chưa production-certified.
