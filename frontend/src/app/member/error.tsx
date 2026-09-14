"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="stack">
      <h1>Không thể hiển thị trang</h1>
      <p>Vui lòng thử tải lại nội dung.</p>
      <button className="button" onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
