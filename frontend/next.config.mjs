/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      ["/dang-ky", "/register"],
      ["/dang-nhap", "/login"],
      ["/quen-mat-khau", "/forgot-password"],
      ["/tai-khoan", "/account"],
      ["/hoi-vien", "/member"],
      ["/hoi-vien/dang-ky-cua-toi", "/member/my-registrations"],
      ["/hoi-vien/goi-cua-toi", "/member/my-plans"],
      ["/hoi-vien/ho-so", "/member/profile"],
      ["/hoi-vien/hoa-don", "/member/invoices"],
      ["/hoi-vien/lich-lop", "/member/class-schedule"],
      ["/hoi-vien/tap-luyen", "/member/training"],
      ["/member-dashboard", "/member"],
      ["/member-dashboard/:path*", "/member/:path*"],
      ["/le-tan", "/receptionist"],
      ["/le-tan/ban-goi", "/receptionist/sell-plans"],
      ["/le-tan/dang-ky", "/receptionist/registrations"],
      ["/le-tan/diem-danh", "/receptionist/attendance"],
      ["/le-tan/gym-checkin", "/receptionist/gym-checkin"],
      ["/le-tan/hoa-don", "/receptionist/invoices"],
      ["/hlv", "/coach"],
      ["/hlv/diem-danh", "/coach/attendance"],
      ["/hlv/goi-y-ai", "/coach/ai-suggestions"],
      ["/hlv/hoi-vien", "/coach/members"],
      ["/hlv/ke-hoach", "/coach/training-plans"],
      ["/hlv/lich-day", "/coach/schedule"],
      ["/quan-ly", "/manager"],
      ["/quan-ly/bao-cao", "/manager/reports"],
      ["/quan-ly/cau-hinh", "/manager/settings"],
      ["/quan-ly/dieu-chinh", "/manager/payment-adjustments"],
      ["/quan-ly/goi-tap", "/manager/membership-plans"],
      ["/quan-ly/lich-hoc", "/manager/class-schedule"],
      ["/quan-ly/lop-hoc", "/manager/classes"],
      ["/quan-ly/nhat-ky", "/manager/audit-log"],
      ["/quan-ly/phong-tap", "/manager/training-rooms"],
      ["/quan-ly/quan-he-hlv", "/manager/coaching-relationships"],
      ["/quan-tri", "/admin"],
      ["/quan-tri/nguoi-dung", "/admin/users"],
      ["/quan-tri/nhat-ky", "/admin/audit-log"],
    ].map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
  // Next.js 16's `next dev`/`next build` auto-generate frontend/AGENTS.md and
  // frontend/CLAUDE.md on every run, which dirties the working tree for no
  // reason on this project. Disabled — see https://nextjs.org/docs/app/api-reference/config/next-config-js
  agentRules: false,
};

export default nextConfig;
