// Additive local demo seed. No database resets, real gateway calls, or email sends.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.env.SPORT_HUB_API ?? "http://127.0.0.1:5000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  throw new Error("The admin demo seed only supports a local API.");
const password = process.env.SPORT_HUB_DEMO_PASSWORD ?? "Sporthub@123";
const prefix = "DEMO-MGR";
const manifestPath = fileURLToPath(new URL("../output/admin-demo-manifest.json", import.meta.url));
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
if (previous && previous.api !== base) throw new Error("Manifest belongs to another API.");
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const manifest = previous ?? { version: 1, api: base, baseDate: today, scenarios: {}, accounts: [] };
function save() {
  mkdirSync(fileURLToPath(new URL("../output", import.meta.url)), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
function id(key) {
  const hex = createHash("sha256").update(`sporthub-admin-demo-v1:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(statement) {
  const result = spawnSync("docker", ["exec", "-i", "sporthub-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "sporthub", "-d", "sporthub", "-At"], { input: statement, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Demo SQL failed: ${result.stderr}`);
  return result.stdout.trim();
}
async function request(path, token, body, key, method) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 429 && attempt < 4) {
      const seconds = Math.min(60, Math.max(5, Number(response.headers.get("retry-after")) || 15));
      console.log(`Rate limit: retrying ${path} in ${seconds}s`);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      continue;
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }
}
const login = async email => (await request("/api/auth/login", null, { email, password })).accessToken;
const items = response => Array.isArray(response) ? response : response.items ?? [];
const manager = await login("manager@sporthub.vn");
const admin = await login("admin@sporthub.vn");
const reception = await login("letan@sporthub.vn");
const managerMe = await request("/api/users/me", manager);
const sports = await request("/api/manager/sports", manager);
const roomTypes = await request("/api/room-types", manager);
if (sql(`SELECT count(*) FROM user_accounts WHERE user_id=${quote(managerMe.userId)}::uuid AND email='manager@sporthub.vn';`) !== "1")
  throw new Error("The local API and Docker database do not match.");
if (process.argv.includes("--inspect")) {
  console.log(JSON.stringify({
    today,
    sports,
    roomTypes,
    rooms: await request("/api/rooms", manager),
    packages: await request("/api/membership-packages", manager),
    classes: await request("/api/manager/classes?pageSize=100", manager),
    ptPricing: await request("/api/pt-pricing", manager),
    rates: await request("/api/manager/court-rates", manager),
  }, null, 2));
} else if (process.argv.includes("--verify")) {
  await verify();
} else if (process.argv.includes("--schedule-oct07")) {
  await seedHistoricalSchedule();
} else {
  await seed();
}

function date(days) {
  return new Date(new Date(manifest.baseDate).getTime() + days * 86400000).toISOString().slice(0, 10);
}
function at(days, time) {
  return new Date(`${date(days)}T${time}:00+07:00`).toISOString();
}
async function once(key, create) {
  if (!manifest.scenarios[key]) {
    manifest.scenarios[key] = await create();
    save();
    console.log(`Created ${key}`);
  }
  return manifest.scenarios[key];
}
async function seedHistoricalSchedule() {
  if (!previous?.scenarios["coach-mai"]) throw new Error("Run the main admin seed first.");
  const coach = await request(`/api/manager/coaches/${manifest.scenarios["coach-mai"].userId}`, manager);
  if (!coach.sportIds.includes(4)) await request(`/api/manager/coaches/${coach.userId}`, manager,
    { fullName: coach.fullName, phone: coach.phone, bio: coach.bio, sportIds: [...coach.sportIds, 4] }, undefined, "PUT");
  const basketballRoom = await once("schedule-basketball-room", async () => {
    const name = "DEMO-SCHEDULE · Sân bóng rổ";
    const room = items(await request("/api/rooms", manager)).find(r => r.name === name)
      ?? await request("/api/rooms", manager, { name, roomTypeId: 4, capacity: 20 });
    await request(`/api/manager/rooms/${room.roomId}/opening-hours`, manager, { hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, openTimeLocal: "06:00", closeTimeLocal: "22:00" })) }, undefined, "PUT");
    return room;
  });
  // APIs reject historical scheduling. Create validated, dedicated draft courses first,
  // then backdate only these demo fixtures atomically. They have no enrollments or payments.
  for (const [key, sportId, roomId, coachId, time, title] of [
    ["badminton", 3, manifest.scenarios["room-Cầu lông A"].roomId, manifest.scenarios["coach-khanh"].userId, "08:00", "Cầu lông · Kỹ thuật cơ bản"],
    ["basketball", 4, basketballRoom.roomId, coach.userId, "10:00", "Bóng rổ · Ném rổ và phối hợp"],
  ]) {
    if (manifest.scenarios[`schedule-oct07-${key}`] && sql(`SELECT count(*) FROM class_sessions WHERE class_id=${Number(manifest.scenarios[`schedule-oct07-${key}`].classId)};`) === "0") {
      delete manifest.scenarios[`schedule-oct07-${key}`];
      save();
    }
    await once(`schedule-oct07-${key}`, async () => {
      const code = `DEMO-SCHEDULE-1007-${key.toUpperCase()}`;
      const future = new Date(`${today}T00:00:00Z`);
      future.setUTCDate(future.getUTCDate() + ((3 - future.getUTCDay() + 7) % 7 || 7) + 28);
      const course = items(await request(`/api/manager/classes?keyword=${code}`, manager)).find(c => c.code === code)
        ?? await request("/api/manager/classes", manager, { code, name: title, sportId, coachId, defaultRoomId: roomId, startDate: future.toISOString().slice(0, 10), numSessions: 1, capacity: 12, price: 300000, costAmount: 0, scheduleRules: [{ dayOfWeek: 3, startTimeLocal: time }] });
      if (sql(`SELECT count(*) FROM class_sessions WHERE class_id=${course.classId};`) === "0") {
        sql(`UPDATE classes SET status=0,start_date=${quote(future.toISOString().slice(0, 10))} WHERE class_id=${course.classId} AND code=${quote(code)} AND confirmed_count=0 AND reserved_count=0;`);
        await request(`/api/manager/classes/${course.classId}/publish`, manager, {});
      }
      sql(`BEGIN;
        SELECT pg_advisory_xact_lock(728191);
        UPDATE class_sessions SET start_at_utc = ('2026-10-07'::date + (start_at_utc AT TIME ZONE 'Asia/Ho_Chi_Minh')::time) AT TIME ZONE 'Asia/Ho_Chi_Minh',
          end_at_utc = ('2026-10-07'::date + (end_at_utc AT TIME ZONE 'Asia/Ho_Chi_Minh')::time) AT TIME ZONE 'Asia/Ho_Chi_Minh', status=1
          WHERE class_id=${course.classId} AND EXISTS(SELECT 1 FROM classes c WHERE c.class_id=${course.classId} AND c.code=${quote(code)} AND c.confirmed_count=0);
        UPDATE classes SET start_date='2026-10-07',status=3 WHERE class_id=${course.classId} AND code=${quote(code)} AND confirmed_count=0;
        UPDATE room_occupancies o SET is_active=false,start_at_utc=s.start_at_utc,end_at_utc=s.end_at_utc FROM class_sessions s JOIN classes c USING(class_id) WHERE o.source_id=s.session_id AND c.class_id=${course.classId} AND c.code=${quote(code)};
        UPDATE coach_occupancies o SET is_active=false,start_at_utc=s.start_at_utc,end_at_utc=s.end_at_utc FROM class_sessions s JOIN classes c USING(class_id) WHERE o.source_id=s.session_id AND c.class_id=${course.classId} AND c.code=${quote(code)};
        COMMIT;`);
      return { classId: course.classId, code, sportId, roomId, date: "2026-10-07" };
    });
  }
  const result = await request("/api/manager/court-schedule?fromDate=2026-10-07&toDate=2026-10-07", manager);
  if (!result.some(r => r.classId === manifest.scenarios["schedule-oct07-badminton"].classId) || !result.some(r => r.classId === manifest.scenarios["schedule-oct07-basketball"].classId)) throw new Error("Historical sessions are missing from the schedule.");
  console.log(JSON.stringify({ date: "2026-10-07", fixtures: Object.entries(manifest.scenarios).filter(([key]) => key.startsWith("schedule-oct07")), schedule: result }, null, 2));
}
async function seed() {
  // Registration requires an email OTP. Bootstrap ONLY new deterministic demo members
  // with the existing local demo credential; all business transactions use the APIs.
  const members = [
    ["linh", "Nguyễn Thùy Linh", "0908000101"],
    ["minh", "Trần Hoàng Minh", "0908000102"],
    ["ha", "Lê Thu Hà", "0908000103"],
    ["nam", "Phạm Đức Nam", "0908000104"],
  ];
  for (const [key, fullName, phone] of members) {
    const email = `demo.member.${key}@sporthub.test`;
    sql(`BEGIN;
      SELECT pg_advisory_xact_lock(728190);
      INSERT INTO user_accounts (user_id,email,role_id,status,created_at,security_stamp)
      SELECT ${quote(id(key))}::uuid,${quote(email)},role_id,0,now(),${quote(id(`stamp-${key}`))}::uuid
      FROM user_accounts WHERE email='an.member@sporthub.vn' ON CONFLICT DO NOTHING;
      INSERT INTO user_credentials (user_id,password_hash)
      SELECT ${quote(id(key))}::uuid,c.password_hash FROM user_credentials c JOIN user_accounts u USING(user_id)
      WHERE u.email='an.member@sporthub.vn' AND EXISTS(SELECT 1 FROM user_accounts WHERE user_id=${quote(id(key))}::uuid AND email=${quote(email)})
      ON CONFLICT DO NOTHING;
      INSERT INTO user_profiles (user_id,full_name,phone)
      SELECT ${quote(id(key))}::uuid,${quote(fullName)},${quote(phone)}
      WHERE EXISTS(SELECT 1 FROM user_accounts WHERE user_id=${quote(id(key))}::uuid AND email=${quote(email)}) ON CONFLICT DO NOTHING;
      COMMIT;`);
    if (!manifest.accounts.some(a => a.email === email)) manifest.accounts.push({ key, email, fullName, role: "MEMBER", userId: id(key) });
  }
  save();
  const coaches = [];
  for (const [key, fullName, phone] of [["khanh", "Nguyễn Quốc Khánh", "0908000201"], ["mai", "Trần Ngọc Mai", "0908000202"]]) {
    const email = `demo.coach.${key}@sporthub.test`;
    const coach = await once(`coach-${key}`, async () => {
      const existing = items(await request(`/api/manager/coaches?keyword=${encodeURIComponent(email)}`, manager)).find(c => c.email === email);
      const created = existing ?? await request("/api/manager/coaches", manager, { email, password, fullName, phone, bio: `${prefix} · Huấn luyện viên Gym/PT và cầu lông. Hồ sơ mẫu để kiểm tra chuyên môn, lịch dạy và quan hệ hội viên.`, sportIds: [1, 3] });
      await request(`/api/manager/coaches/${created.userId}/service-qualifications`, manager, { offeringIds: [2] }, undefined, "PUT");
      return created;
    });
    coaches.push(coach);
    if (!manifest.accounts.some(a => a.email === email)) manifest.accounts.push({ key, email, fullName, role: "COACH", userId: coach.userId });
  }
  for (const [key, fullName, status] of [["locked", "Đỗ Thanh Bình", "lock"], ["inactive", "Võ Minh Phương", "deactivate"]]) {
    await once(`staff-${key}`, async () => {
      const email = `demo.staff.${key}@sporthub.test`;
      const existing = items(await request(`/api/users/admin?keyword=${encodeURIComponent(email)}`, admin)).find(u => u.email === email);
      const user = existing ?? await request("/api/users", admin, { email, password, fullName, phone: key === "locked" ? "0908000301" : "0908000302", role: "RECEPTIONIST" });
      await request(`/api/users/${user.userId}/${status}`, admin, { reason: `${prefix}: trạng thái tài khoản mẫu để kiểm tra quản trị` });
      manifest.accounts.push({ key, email, fullName, role: "RECEPTIONIST", status, userId: user.userId });
      return user;
    });
  }
  const rooms = [];
  for (const [key, roomTypeId, capacity] of [["Cầu lông A", 3, 12], ["PT Studio", 2, 6]]) {
    rooms.push(await once(`room-${key}`, async () => {
      const name = `${prefix} · ${key}`;
      const room = items(await request("/api/rooms", manager)).find(r => r.name === name)
        ?? await request("/api/rooms", manager, { name, roomTypeId, capacity });
      await request(`/api/manager/rooms/${room.roomId}/opening-hours`, manager, { hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, openTimeLocal: "06:00", closeTimeLocal: "22:00" })) }, undefined, "PUT");
      return room;
    }));
  }
  await once("court-rate", async () => {
    const existing = items(await request("/api/manager/court-rates", manager)).find(r => r.roomTypeId === 3 && r.isActive && r.startTimeLocal.startsWith("06:00") && r.endTimeLocal.startsWith("22:00"));
    return existing ?? await request("/api/manager/court-rates", manager, { roomTypeId: 3, sportId: 3, daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], startTimeLocal: "06:00", endTimeLocal: "22:00", pricePerHour: 120000, isActive: true });
  });
  const pkg = await once("package", async () => {
    const name = `${prefix} · Gym & PT một tháng`;
    const start = new Date(manifest.baseDate), end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return items(await request("/api/membership-packages", manager)).find(p => p.name === name)
      ?? await request("/api/membership-packages", manager, { name, price: 600000, durationDays: Math.round((end - start) / 86400000), sessionLimit: null, description: `${prefix}: gói hội viên đủ điều kiện mua PT, dữ liệu demo cục bộ.` });
  });
  const courses = {};
  for (const [key, name, days, time, cost, publish] of [
    ["draft", "Cầu lông cơ bản — bản nháp", 10, "08:00", 1200000, false],
    ["ready", "Cầu lông buổi tối — đang nhận học viên", 8, "18:00", 600000, true],
    ["risk", "Cầu lông cuối tuần — cần xử lý sĩ số", 2, "10:00", 1800000, true],
  ]) {
    courses[key] = await once(`class-${key}`, async () => {
      const code = `${prefix}-${key.toUpperCase()}`;
      let course = items(await request(`/api/manager/classes?keyword=${code}`, manager)).find(c => c.code === code);
      if (!course) course = await request("/api/manager/classes", manager, { code, name: `${prefix} · ${name}`, sportId: 3, coachId: coaches[0].userId, defaultRoomId: rooms[0].roomId, startDate: date(days), numSessions: 4, capacity: 12, price: 600000, costAmount: cost, scheduleRules: [{ dayOfWeek: new Date(date(days)).getUTCDay(), startTimeLocal: time }] });
      if (publish && course.status === "DRAFT") await request(`/api/manager/classes/${course.classId}/publish`, manager, {});
      return { ...course, startDate: date(days) };
    });
  }
  const memberTokens = {};
  for (const [key] of members) {
    memberTokens[key] = await login(`demo.member.${key}@sporthub.test`);
    await once(`credit-${key}`, () => request(`/api/wallets/${id(key)}/adjustments`, manager, { idempotencyKey: id(`credit-${key}`), points: 5000, direction: "CREDIT", reason: `${prefix}: cấp điểm mẫu để test điều chỉnh, thanh toán và lịch sử ví` }));
  }
  async function paid(key, memberKey, kind, body, points = 0) {
    return once(key, async () => {
      const token = memberTokens[memberKey];
      let checkout = await request(`/api/checkouts/${kind}`, token, body, `${prefix}-${key}`);
      if (checkout.invoiceStatus !== "PAID") {
        if (points && checkout.pointsApplied !== points) await request(`/api/wallet/me/checkouts/${checkout.invoiceId}/points`, token, { points });
        const attempt = await request(`/api/checkouts/${checkout.invoiceId}/attempts`, token, {});
        if (attempt.gatewayMode !== "MOCK") throw new Error(`Refusing payment gateway ${attempt.gatewayMode}; local mock required`);
        await request(`/api/dev/payments/${encodeURIComponent(attempt.transactionReference)}/simulate?success=true`, reception, {});
        checkout = await request(`/api/checkouts/${checkout.invoiceId}`, token);
      }
      if (checkout.invoiceStatus !== "PAID") throw new Error(`Checkout ${key} did not fulfill`);
      return checkout;
    });
  }
  for (const key of ["linh", "minh", "ha"]) await paid(`membership-${key}`, key, "membership", { packageId: pkg.packageId }, key === "linh" ? 100 : 0);
  for (const key of ["linh", "minh", "ha"]) await paid(`enrollment-${key}`, key, "class", { classId: courses.ready.classId }, key === "minh" ? 200 : 0);
  const pricing = await request("/api/pt-pricing", manager);
  for (const [memberKey, coach] of [["linh", coaches[0]], ["minh", coaches[1]]]) {
    const packages = items(await request("/api/members/me/packages", memberTokens[memberKey]));
    await paid(`pt-${memberKey}`, memberKey, "pt", { memberPackageId: packages.find(p => p.packageName === pkg.name).memberPackageId, coachId: coach.userId, frequencyPerWeek: 2, priceVersion: pricing.priceVersion });
    const entitlement = items(await request("/api/members/me/pt-entitlements", memberTokens[memberKey]))[0];
    if (memberKey === "linh") await once("session-today", () => request("/api/manager/pt-sessions", manager, { entitlementId: entitlement.entitlementId, startAtUtc: at(0, "15:00"), roomId: rooms[1].roomId }));
    for (const [slot, days, time] of [["a", 3, memberKey === "linh" ? "08:00" : "10:00"], ["b", 5, memberKey === "linh" ? "08:00" : "10:00"]]) {
      const session = await once(`session-${memberKey}-${slot}`, async () => {
        const startAtUtc = at(days, time);
        const existing = items(await request(`/api/manager/pt-sessions?memberId=${id(memberKey)}&pageSize=100`, manager)).find(s => s.startAtUtc === startAtUtc);
        return existing ?? request("/api/manager/pt-sessions", manager, { entitlementId: entitlement.entitlementId, startAtUtc, roomId: rooms[1].roomId });
      });
      if (slot === "a") await once(`request-${memberKey}`, () => request(`/api/members/me/pt-sessions/${session.sessionId}/change-requests`, memberTokens[memberKey], { requestType: memberKey === "linh" ? "RESCHEDULE" : "CANCEL", ...(memberKey === "linh" ? { requestedStartAtUtc: at(4, "08:00") } : {}), reason: `${prefix}: ${memberKey === "linh" ? "bận công việc, xin chuyển sang ngày tiếp theo" : "xin hủy buổi tập vì lịch cá nhân"}`, requestsException: false }));
    }
    if (memberKey === "minh") await once("request-coach", () => request(`/api/members/me/pt-entitlements/${entitlement.entitlementId}/coach-change-requests`, memberTokens[memberKey], { requestedCoachId: coaches[0].userId, reason: `${prefix}: muốn chuyển sang huấn luyện viên phù hợp lịch tập buổi sáng` }));
  }
  for (const [key, memberKey, days, time] of [["rental-a", "linh", 1, "14:00"], ["rental-b", "nam", 4, "16:00"]]) await paid(key, memberKey, "court-rental", { sportId: 3, roomId: rooms[0].roomId, startUtc: at(days, time), endUtc: at(days, `${Number(time.slice(0, 2)) + 1}:00`) });
  await once("refund-request", async () => {
    const invoice = await request(`/api/invoices/${manifest.scenarios["enrollment-ha"].invoiceId}`, memberTokens.ha);
    const invoiceItemId = invoice.items[0].itemId;
    const existing = items(await request(`/api/refunds?invoiceId=${manifest.scenarios["enrollment-ha"].invoiceId}`, manager));
    return existing[0] ?? request("/api/refunds", memberTokens.ha, { invoiceItemId, reason: `${prefix}: hội viên xin hoàn điểm do không thể tham gia khóa học` });
  });
  await once("room-block", () => request("/api/manager/room-blocks", manager, { roomId: rooms[0].roomId, startAtUtc: at(6, "14:00"), endAtUtc: at(6, "16:00"), reason: `${prefix}: bảo trì đèn chiếu sáng, dùng để kiểm tra lịch và xử lý sự cố` }));
  const incidentRental = await paid("rental-incident", "nam", "court-rental", { sportId: 3, roomId: rooms[0].roomId, startUtc: at(7, "16:00"), endUtc: at(7, "17:00") });
  await once("incident-cancellation", async () => {
    const invoice = await request(`/api/invoices/${incidentRental.invoiceId}`, memberTokens.nam);
    const rentalId = invoice.items[0].courtRentalId;
    // Normal center cancellation computes the real refund and releases occupancy.
    await request(`/api/manager/court-rentals/${rentalId}/cancel`, manager, { reason: `${prefix}: hỏng đèn, hoàn 100% bằng điểm` });
    return { rentalId };
  });
  const incidentBlock = await once("incident-block", () => request("/api/manager/room-blocks", manager, { roomId: rooms[0].roomId, startAtUtc: at(7, "16:00"), endAtUtc: at(7, "17:00"), reason: `${prefix}: sự cố mẫu đã xử lý, thay đèn sân` }));
  await once("incident", async () => {
    const incidentId = id("incident"), rentalId = manifest.scenarios["incident-cancellation"].rentalId;
    // Historical delivery fixtures are terminal rows: no external email is queued.
    // Link only this seed's cancelled/refunded rental and dedicated room block.
    sql(`BEGIN;
      INSERT INTO incident_notices (incident_id,scope,room_id,start_at_utc,end_at_utc,reason,resolution_summary,created_by_user_id,created_at_utc)
      VALUES (${quote(incidentId)}::uuid,0,${rooms[0].roomId},${quote(at(7, "16:00"))},${quote(at(7, "17:00"))},${quote(`${prefix}: hỏng đèn sân, dữ liệu sự cố mẫu`)},${quote("DEMO: Đã hủy lượt thuê, hoàn 120 điểm và khóa sân để sửa đèn. Trạng thái gửi thông báo là dữ liệu mô phỏng.")},${quote(managerMe.userId)}::uuid,now()) ON CONFLICT DO NOTHING;
      UPDATE court_rentals SET cancellation_incident_id=${quote(incidentId)}::uuid WHERE court_rental_id=${quote(rentalId)}::uuid AND member_id=${quote(id("nam"))}::uuid AND status=2;
      UPDATE room_blocks SET incident_id=${quote(incidentId)}::uuid WHERE block_id=${quote(incidentBlock.blockId)}::uuid AND reason LIKE 'DEMO-MGR:%';
      INSERT INTO notifications (notification_id,user_id,channel,source_event_type,source_entity_id,message,status,retry_count,sent_at)
      VALUES (${quote(id("incident-inapp"))}::uuid,${quote(id("nam"))}::uuid,0,13,${quote(rentalId)}::uuid,${quote(`${prefix}: lượt thuê sân đã hủy do hỏng đèn; đã hoàn 120 điểm. Thông báo mô phỏng để kiểm tra trạng thái đã đọc.`)},3,0,now()),
      (${quote(id("incident-email"))}::uuid,${quote(id("nam"))}::uuid,1,13,${quote(rentalId)}::uuid,${quote(`${prefix}: bản ghi mô phỏng trạng thái email đã gửi; không gửi email thật.`)},1,0,now()) ON CONFLICT DO NOTHING;
      COMMIT;`);
    return { incidentId, rentalId, roomId: rooms[0].roomId, startAtUtc: at(7, "16:00"), endAtUtc: at(7, "17:00"), syntheticDelivery: true };
  });
  await once("report-export", () => request("/api/reports/exports", manager, { reportType: "REVENUE_DIMENSIONS", fromDate: `${manifest.baseDate.slice(0, 7)}-01`, toDate: manifest.baseDate, columns: ["source", "sportName", "collectedAmount", "pointsRedeemed"], format: "Csv" }));
  save();
  console.log(JSON.stringify({ accounts: manifest.accounts.length, scenarios: Object.keys(manifest.scenarios).length, manifest: manifestPath }, null, 2));
  await verify();
}

async function verify() {
  if (!previous && !Object.keys(manifest.scenarios).length) throw new Error("Run the seed before verification.");
  const classes = items(await request(`/api/manager/classes?keyword=${prefix}&pageSize=100`, manager));
  const sessions = items(await request("/api/manager/pt-sessions?pageSize=100", manager)).filter(s => manifest.accounts.some(a => a.role === "MEMBER" && a.userId === s.memberId));
  const sessionRequests = items(await request("/api/manager/pt-session-change-requests?pageSize=100", manager)).filter(r => r.reason?.startsWith(prefix));
  const coachRequests = items(await request("/api/manager/pt-coach-change-requests?pageSize=100", manager)).filter(r => r.reason?.startsWith(prefix));
  const refunds = items(await request("/api/refunds?pageSize=100", manager)).filter(r => r.reason?.startsWith(prefix));
  const period = `fromDate=${manifest.baseDate.slice(0, 7)}-01&toDate=${today}`;
  const revenue = await request(`/api/reports/revenue?${period}`, manager);
  const membership = await request(`/api/reports/membership-period?${period}`, manager);
  const delivery = manifest.scenarios.incident ? await request(`/api/manager/incidents/${manifest.scenarios.incident.incidentId}/notifications`, manager) : null;
  const accounts = items(await request("/api/users/admin?keyword=demo.&pageSize=100", admin));
  const broken = sql(`SELECT count(*) FROM point_wallets w JOIN user_accounts u ON u.user_id=w.owner_user_id WHERE u.email LIKE 'demo.%' AND (w.available_points<0 OR w.held_points<0);`);
  if (classes.length !== 3 || sessions.length < 4 || sessionRequests.length < 2 || coachRequests.length < 1 || refunds.length < 1 || accounts.length !== 8 || delivery?.total !== 2 || broken !== "0")
    throw new Error(`Unexpected demo coverage: ${JSON.stringify({ classes: classes.length, sessions: sessions.length, sessionRequests: sessionRequests.length, coachRequests: coachRequests.length, refunds: refunds.length, accounts: accounts.length, delivery, broken })}`);
  const result = { verifiedAt: new Date().toISOString(), classes: classes.map(c => ({ code: c.code, status: c.status, confirmedCount: c.confirmedCount, thresholdStatus: c.thresholdStatus })), ptSessions: sessions.length, ptSessionRequests: sessionRequests.length, ptCoachRequests: coachRequests.length, refunds: refunds.length, accounts: accounts.length, revenue, membership, incidentDelivery: delivery };
  writeFileSync(fileURLToPath(new URL("../output/admin-demo-verification.json", import.meta.url)), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ ...result, revenue: { totalCollected: revenue.totalCollected, invoiceCount: revenue.invoiceCount, pointsRedeemed: revenue.pointsRedeemed, pointsIssued: revenue.pointsIssued, bySource: revenue.bySource } }, null, 2));
}
