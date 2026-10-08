from pathlib import Path
import subprocess


def git(*args, data=None):
    return subprocess.check_output(["git", *args], input=data)


def base(path):
    return git("show", f"HEAD:{path}").decode().replace("\r\n", "\n")


def current(path):
    return Path(path).read_text(encoding="utf-8").replace("\r\n", "\n")


def replace_one(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new, 1)


def stage(path, content):
    oid = git("hash-object", "-w", "--stdin", data=content.encode()).decode().strip()
    subprocess.check_call(["git", "update-index", "--cacheinfo", f"100644,{oid},{path}"])
    print(path)


path = "frontend/src/features/member/schedule.tsx"
s = current(path)
s = replace_one(s, 'import { useApi, useNow } from "@/lib/useApi";', 'import { useApi } from "@/lib/useApi";')
s = replace_one(s, 'import type { CourtRentalDto, SportDto } from "@/lib/types";', 'import type { SportDto } from "@/lib/types";')
s = replace_one(s, 'import { downloadIcs } from "./ics";\n', "")
s = replace_one(s, 'import { RentalCancelConfirm } from "./rental-cancel";\n', "")
s = replace_one(s, '  rental?: CourtRentalDto;\n', "")
s = replace_one(
    s,
    'for (const r of rentals.filter((x) => x.status !== "PENDING_PAYMENT")) {',
    'for (const r of rentals.filter(\n    (x) => x.status === "CONFIRMED" || x.status === "COMPLETED",\n  )) {',
)
s = replace_one(s, '      rental: r,\n', "")
s = replace_one(
    s,
    '  const [cancelling, setCancelling] = useState<CourtRentalDto | null>(null);\n  const now = useNow();\n',
    "",
)
original = base(path)
start = original.index('            <Link\n              className="btn"')
end = original.index('\n          </div>\n        </Drawer>', start)
original_link = original[start:end]
start = s.index('            <div className={styles.actions}>')
end = s.index('\n          </div>\n        </Drawer>', start)
s = s[:start] + original_link + s[end:]
start = s.index('      {cancelling && (')
end = s.index('\n    </>', start)
s = s[:start] + s[end:]
for forbidden in ('downloadIcs', 'RentalCancelConfirm', 'useNow', 'setCancelling', 'rental?:'):
    assert forbidden not in s, forbidden
stage(path, s)

path = "frontend/src/features/member/schedule.module.css"
s = current(path)
s = s[:s.index("\n.actions {")] + "\n"
stage(path, s)

for path, old, new in [
    (
        "frontend/src/locales/en.ts",
        '    description:\n      "Your group classes, personal training sessions and court rentals, in Vietnam time. Select an item for details.",\n',
        '    chooseWeek: "Choose week",\n    prevWeek: "Previous week",\n    currentWeek: "Current week",\n    nextWeek: "Next week",\n    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],\n    weekSchedule: "Weekly schedule",\n    present: "Present",\n    completed: "Completed",\n',
    ),
    (
        "frontend/src/locales/vi.ts",
        '    description:\n      "Lớp nhóm, buổi PT và lượt thuê sân của bạn, theo giờ Việt Nam. Chọn một mục để xem chi tiết.",\n',
        '    chooseWeek: "Chọn tuần",\n    prevWeek: "Tuần trước",\n    currentWeek: "Tuần hiện tại",\n    nextWeek: "Tuần sau",\n    weekdays: ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"],\n    weekSchedule: "Thời khóa biểu tuần",\n    present: "Có mặt",\n    completed: "Hoàn thành",\n',
    ),
]:
    stage(path, replace_one(base(path), old, new))

path = "frontend/src/lib/types.ts"
s = base(path)
start = s.index("export interface CourseMemberSessionDto {")
end = s.index("\n}", start)
block = replace_one(s[start:end], "  roomName: string;\n", "  roomName: string;\n  coachName?: string | null;\n")
s = s[:start] + block + s[end:]
stage(path, s)

for path in (
    "backend/SportHub.Scheduling/Application/DTOs/Session/MemberSessionResponse.cs",
    "backend/SportHub.Scheduling/Application/Services/ClassSessionService.cs",
    "frontend/src/app/member/schedule/page.tsx",
    "frontend/tests/an05-member-completion.spec.ts",
    "frontend/tests/member-main.spec.ts",
):
    stage(path, current(path))
