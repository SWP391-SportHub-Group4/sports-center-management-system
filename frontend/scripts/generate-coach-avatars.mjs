// Vẽ chân dung minh họa (SVG, tỉ lệ 4:5) cho đội huấn luyện viên demo.
// Chạy: node frontend/scripts/generate-coach-avatars.mjs  -> ghi vào frontend/public/sporthub/coaches/
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "sporthub",
  "coaches",
);
mkdirSync(out, { recursive: true });

const INK = "#090e0f";
const sports = {
  badminton: { bg: "#eef9c2", shirt: "#02717a", trim: "#c8f03a" },
  basketball: { bg: "#feeade", shirt: "#c96203", trim: "#090e0f" },
};

const coaches = [
  {
    slug: "dang-quoc-bao",
    sport: "badminton",
    skin: "#e6b08a",
    hair: "#15100d",
    style: "sidepart",
  },
  {
    slug: "bui-khanh-linh",
    sport: "badminton",
    skin: "#f2c9a8",
    hair: "#1a1210",
    style: "long",
    female: true,
  },
  {
    slug: "truong-gia-huy",
    sport: "basketball",
    skin: "#d8a37c",
    hair: "#0e0a08",
    style: "crop",
    extra: ["headband"],
  },
  {
    slug: "dinh-hai-nam",
    sport: "basketball",
    skin: "#e4ad87",
    hair: "#17110e",
    style: "buzz",
    extra: ["stubble"],
  },
];

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amount));
  const r = c(n >> 16),
    g = c((n >> 8) & 255),
    b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const hairBack = {
  ponytail: (h) =>
    `<path d="M520 300 C640 300 650 520 600 640 C585 560 560 470 520 400 Z" fill="${h}"/>`,
  long: (h) =>
    `<path d="M255 330 C230 520 235 700 290 780 L510 780 C565 700 570 520 545 330 Z" fill="${h}"/>`,
  bun: () => "",
};

const hairFront = {
  crop: (h) =>
    `<path d="M262 440 C250 285 330 228 400 228 C478 228 552 290 538 440 C520 372 478 338 400 338 C322 338 282 372 262 440 Z" fill="${h}"/>`,
  buzz: (h) =>
    `<path d="M266 420 C262 300 330 252 400 252 C472 252 540 300 534 420 C514 366 470 346 400 346 C330 346 288 366 266 420 Z" fill="${h}" opacity="0.92"/>`,
  sidepart: (h) =>
    `<path d="M262 440 C246 290 330 222 410 226 C500 232 556 300 538 440 C530 392 500 352 440 336 C400 372 330 362 262 440 Z" fill="${h}"/>`,
  ponytail: (h) =>
    `<path d="M262 440 C250 288 330 236 400 236 C474 236 550 290 538 440 C516 368 470 336 400 336 C330 336 284 368 262 440 Z" fill="${h}"/><circle cx="522" cy="318" r="22" fill="${shade(h, 40)}"/>`,
  bun: (h) =>
    `<circle cx="400" cy="214" r="62" fill="${h}"/><path d="M262 440 C250 290 330 240 400 240 C474 240 550 290 538 440 C516 372 470 340 400 340 C330 340 284 372 262 440 Z" fill="${h}"/>`,
  long: (h) =>
    `<path d="M262 450 C246 286 330 228 400 228 C478 228 556 290 538 450 C522 372 480 336 400 336 C320 336 280 372 262 450 Z" fill="${h}"/>`,
};

function badge(sport) {
  const stroke = `stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const glyph =
    sport === "badminton"
        ? `<circle cx="-14" cy="22" r="13" fill="${INK}"/><path d="M-6 12 L26 -26 M-24 8 L-10 -30 M2 22 L36 -2" ${stroke}/>`
        : `<circle r="34" ${stroke}/><path d="M-34 0H34 M0 -34V34 M-24 -24C-10 -10 -10 10 -24 24 M24 -24C10 -10 10 10 24 24" ${stroke} stroke-width="5"/>`;
  return `<g transform="translate(650 150)"><circle r="82" fill="#ffffff" opacity="0.9"/><g transform="scale(0.9)">${glyph}</g></g>`;
}

function portrait(c) {
  const s = sports[c.sport];
  const skin = c.skin;
  const skinDark = shade(skin, -26);
  const extra = c.extra ?? [];
  const eye = (x) =>
    `<ellipse cx="${x}" cy="462" rx="11" ry="${c.female ? 15 : 13}" fill="${INK}"/><circle cx="${x + 4}" cy="457" r="3.5" fill="#fff"/>`;
  const brow = (x1, x2, dir) =>
    `<path d="M${x1} ${430 + dir * 2} Q${(x1 + x2) / 2} ${418} ${x2} ${430 - dir * 2}" stroke="${c.hair}" stroke-width="${c.female ? 8 : 11}" stroke-linecap="round" fill="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="Chân dung minh họa huấn luyện viên">
<rect width="800" height="1000" fill="${s.bg}"/>
${badge(c.sport)}
${hairBack[c.style]?.(c.hair) ?? ""}
<path d="M110 1000 C110 810 240 748 400 748 C560 748 690 810 690 1000 Z" fill="${s.shirt}"/>
<path d="M330 748 L400 842 L470 748 Z" fill="${skinDark}"/>
<path d="M322 748 L400 860 L478 748" stroke="${s.trim}" stroke-width="12" fill="none" stroke-linejoin="round"/>
<rect x="352" y="590" width="96" height="190" rx="40" fill="${skinDark}"/>
<ellipse cx="266" cy="468" rx="24" ry="40" fill="${skin}"/>
<ellipse cx="534" cy="468" rx="24" ry="40" fill="${skin}"/>
<ellipse cx="400" cy="452" rx="138" ry="168" fill="${skin}"/>
${hairFront[c.style](c.hair)}
${extra.includes("headband") ? `<rect x="262" y="372" width="276" height="26" rx="13" fill="${INK}"/>` : ""}
${brow(312, 376, 1)}${brow(424, 488, -1)}
${eye(344)}${eye(456)}
${extra.includes("glasses") ? `<g stroke="${INK}" stroke-width="7" fill="none"><rect x="298" y="432" width="92" height="64" rx="22"/><rect x="410" y="432" width="92" height="64" rx="22"/><path d="M390 458H410"/></g>` : ""}
<path d="M400 478 Q388 520 404 528" stroke="${skinDark}" stroke-width="7" stroke-linecap="round" fill="none"/>
<path d="M352 566 Q400 606 448 566" stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"/>
${c.female ? `<circle cx="318" cy="530" r="20" fill="#e98a7a" opacity="0.28"/><circle cx="482" cy="530" r="20" fill="#e98a7a" opacity="0.28"/>` : ""}
${extra.includes("stubble") ? `<path d="M290 540 Q400 660 510 540 Q470 618 400 620 Q330 618 290 540 Z" fill="${INK}" opacity="0.16"/>` : ""}
<path d="M338 760 Q400 900 462 760" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/>
<rect x="378" y="868" width="44" height="30" rx="12" fill="${s.trim}" stroke="${INK}" stroke-width="5"/>
</svg>
`;
}

for (const c of coaches) writeFileSync(join(out, `${c.slug}.svg`), portrait(c));
console.log(`Đã tạo ${coaches.length} ảnh tại ${out}`);
