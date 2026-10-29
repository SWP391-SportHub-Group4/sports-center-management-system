import { NextResponse, type NextRequest } from "next/server";

/**
 * Cổng chặn sớm ở server cho các khu vực cần đăng nhập: chưa có dấu hiệu phiên thì không trả
 * giao diện, đưa thẳng về /login. Cookie này chỉ là dấu hiệu (JWT thật nằm ở localStorage và do
 * backend xác thực mọi request) nên KHÔNG thay thế phân quyền ở API.
 */
export const SESSION_HINT_COOKIE = "sporthub.session";

export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_HINT_COOKIE)?.value === "1")
    return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set(
    "next",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/manager/:path*",
    "/coach/:path*",
    "/receptionist/:path*",
    "/member/:path*",
    "/account/:path*",
    "/notifications/:path*",
    "/change-initial-password",
  ],
};
