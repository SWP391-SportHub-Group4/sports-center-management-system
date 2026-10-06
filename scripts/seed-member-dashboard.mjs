// Local demo only. Uses normal checkout/fulfillment APIs; never resets user data.
const base = process.env.SPORT_HUB_API ?? "http://127.0.0.1:5000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  throw new Error("This demo seed only supports a local API.");
const password = process.env.SPORT_HUB_DEMO_PASSWORD ?? "Sporthub@123";
async function request(path, token, body, key, method) {
  const response = await fetch(base + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const login = (email) => request("/api/auth/login", null, { email, password });
const manager = (await login("manager@sporthub.vn")).accessToken;
const member = (await login("an.member@sporthub.vn")).accessToken;
const me = await request("/api/users/me", member);
if (me.email !== "an.member@sporthub.vn")
  throw new Error("Unexpected demo member");
await request(`/api/wallets/${me.userId}/adjustments`, manager, {
  idempotencyKey: "db26e462-1688-467a-9314-98c813262d02",
  points: 20000,
  direction: "CREDIT",
  reason: "AN-02 local demo: dashboard data for Ho Le Thien An",
});
async function checkout(kind, body, key) {
  let result = await request(
    `/api/checkouts/${kind}`,
    member,
    body,
    `an02-demo-${key}`,
  );
  if (result.invoiceStatus === "PAID") return result;
  await request(`/api/wallet/me/checkouts/${result.invoiceId}/points`, member, {
    points: result.totalAmount / 1000,
  });
  result = await request(
    `/api/checkouts/${result.invoiceId}/confirm-points`,
    member,
    {},
  );
  console.log(
    `${kind}: ${result.invoiceStatus} / ${result.fulfillmentOutcome}`,
  );
  return result;
}
let packages = await request("/api/members/me/packages", member);
if (!packages.some((p) => p.status === "ACTIVE"))
  await checkout("membership", { packageId: 1 }, "gym");
packages = await request("/api/members/me/packages", member);
console.log("Member packages:", JSON.stringify(packages));
const coaches = (await request("/api/manager/coaches", manager)).items;
const coach = coaches.find((c) => c.email === "coach.pt@sporthub.vn");
if (![2, 3].every((id) => coach.sportIds.includes(id)))
  await request(
    `/api/manager/coaches/${coach.userId}`,
    manager,
    {
      fullName: coach.fullName,
      phone: coach.phone,
      bio: coach.bio,
      sportIds: [...new Set([...coach.sportIds, 2, 3])],
    },
    undefined,
    "PUT",
  );
const pricing = await request("/api/pt-pricing", member);
let entitlements = await request("/api/members/me/pt-entitlements", member);
const demoName = "AN-02 Gym & PT · 1 tháng";
if (
  !entitlements.length &&
  !packages.some((p) => p.packageName === demoName && p.status === "ACTIVE")
) {
  const catalog = await request("/api/membership-packages", manager);
  let demo = catalog.find((p) => p.name === demoName);
  if (!demo) {
    const today = new Date(
      new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
    );
    const next = new Date(today);
    next.setUTCMonth(next.getUTCMonth() + 1);
    demo = await request("/api/membership-packages", manager, {
      name: demoName,
      price: 600000,
      durationDays: Math.round((next - today) / 86400000),
      sessionLimit: null,
      description:
        "Local AN-02 demo membership with calendar-month PT eligibility.",
    });
  }
  await checkout("membership", { packageId: demo.packageId }, "gym-pt");
  packages = await request("/api/members/me/packages", member);
}
if (!entitlements.length)
  await checkout(
    "pt",
    {
      memberPackageId: packages.find(
        (p) => p.packageName === demoName && p.status === "ACTIVE",
      ).memberPackageId,
      coachId: coach.userId,
      frequencyPerWeek: 2,
      priceVersion: pricing.priceVersion,
    },
    "pt",
  );
entitlements = await request("/api/members/me/pt-entitlements", member);
console.log("PT entitlements:", JSON.stringify(entitlements));
const sessions = await request("/api/members/me/pt-sessions", member);
const roomTypes = await request("/api/room-types", manager);
let roomType = roomTypes.find((r) => r.name === "AN-02 Demo Studio");
if (!roomType)
  roomType = await request("/api/manager/room-types", manager, {
    name: "AN-02 Demo Studio",
  });
await request(
  `/api/manager/room-types/${roomType.roomTypeId}/sports`,
  manager,
  { sportIds: [2, 3] },
  undefined,
  "PUT",
);
const rooms = await request("/api/rooms", manager);
let room = rooms.find((r) => r.name === "AN-02 Demo Studio");
if (!room)
  room = await request("/api/rooms", manager, {
    name: "AN-02 Demo Studio",
    capacity: 12,
    roomTypeId: roomType.roomTypeId,
  });
await request(
  `/api/manager/rooms/${room.roomId}/opening-hours`,
  manager,
  {
    hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      openTimeLocal: "06:00",
      closeTimeLocal: "22:00",
    })),
  },
  undefined,
  "PUT",
);
if (!sessions.length) {
  for (const days of [1, 3]) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + days);
    start.setUTCHours(10, 0, 0, 0);
    await request("/api/manager/pt-sessions", manager, {
      entitlementId: entitlements[0].entitlementId,
      startAtUtc: start.toISOString(),
      roomId: room.roomId,
    });
  }
}
let courses = (await request("/api/manager/classes?keyword=AN02-DEMO", manager))
  .items;
let course = courses.find((c) => c.code === "AN02-DEMO");
if (!course) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 8);
  course = await request("/api/manager/classes", manager, {
    code: "AN02-DEMO",
    name: "Cầu lông nền tảng · AN-02 Demo",
    sportId: 3,
    coachId: coach.userId,
    defaultRoomId: room.roomId,
    startDate: date.toISOString().slice(0, 10),
    numSessions: 8,
    capacity: 12,
    price: 800000,
    costAmount: 0,
    scheduleRules: [{ dayOfWeek: date.getUTCDay(), startTimeLocal: "18:00" }],
  });
}
if (course.status === "DRAFT") {
  if (!course.coachId) {
    const detail = await request(
      `/api/manager/classes/${course.classId}`,
      manager,
    );
    await request(
      `/api/manager/classes/${course.classId}`,
      manager,
      { ...detail, coachId: coach.userId },
      undefined,
      "PUT",
    );
  }
  await request(`/api/manager/classes/${course.classId}/publish`, manager, {});
}
const enrollments = await request("/api/members/me/enrollments", member);
if (!enrollments.items.some((e) => e.classId === course.classId))
  await checkout("class", { classId: course.classId }, "course");
for (const path of [
  "packages",
  "pt-entitlements",
  "pt-sessions",
  "enrollments",
])
  console.log(
    path,
    JSON.stringify(await request(`/api/members/me/${path}`, member)),
  );
console.log("wallet", JSON.stringify(await request("/api/wallet/me", member)));
