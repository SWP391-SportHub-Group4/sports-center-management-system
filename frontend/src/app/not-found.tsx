import Link from "next/link";
export default function NotFound() {
  return (
    <main className="loading">
      <h1>Không tìm thấy trang</h1>
      <Link className="button" href="/member">
        Về trang chủ hội viên
      </Link>
    </main>
  );
}
