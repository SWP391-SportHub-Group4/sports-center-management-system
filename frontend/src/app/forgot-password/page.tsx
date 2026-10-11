import { redirect } from "next/navigation";

/** Quên mật khẩu giờ là popup trên trang đăng nhập; giữ route cũ để link email/bookmark còn dùng được. */
export default function ForgotPasswordPage() {
  redirect("/login?forgot=1");
}
