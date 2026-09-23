"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./apiClient";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  /** Tải lại — dùng sau khi một thao tác ghi thành công. */
  reload: () => void;
}

/**
 * Nạp dữ liệu cho một màn hình, kèm loading/error và huỷ request khi deps đổi.
 *
 * Huỷ là bắt buộc chứ không phải tối ưu: khi người dùng đổi bộ lọc nhanh, phản hồi của
 * request cũ có thể về SAU request mới và ghi đè kết quả đúng bằng kết quả cũ.
 */
export function useApi<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);

  // loader là arrow function mới ở mỗi lần render; giữ trong ref để nó không tự kích hoạt lại
  // việc tải — deps do caller khai báo mới là thứ quyết định khi nào tải lại.
  //
  // Cập nhật ref TRONG effect (không phải khi render) vì render phải thuần tuý. Effect này
  // khai báo TRƯỚC effect tải dữ liệu nên luôn chạy trước, ref không bao giờ lỡ nhịp.
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    // Đánh dấu "đang tải" ngay khi phát request là ý đồ của hook này: thiếu nó thì màn hình
    // hiển thị dữ liệu của bộ lọc CŨ như thể đã xong. Đây là hook đồng bộ với một hệ thống
    // ngoài (HTTP API) — ca dùng chính đáng của effect; mọi setState còn lại đều nằm trong
    // callback của promise nên không tạo render dây chuyền.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;

        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(0, "unknown_error", "Đã xảy ra lỗi không xác định."),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, reload };
}

/**
 * Bọc một thao tác GHI: giữ trạng thái đang chạy, thông báo thành công và lỗi.
 * Có trạng thái `busy` thì nút bấm disable được, tránh gửi trùng request — nhưng đó chỉ là
 * hỗ trợ UX, ràng buộc thật vẫn do API thực thi.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(operation: () => Promise<T>, successMessage?: string): Promise<T | null> => {
      setBusy(true);
      setError(null);
      setSuccess(null);

      try {
        const result = await operation();
        if (successMessage) setSuccess(successMessage);

        return result;
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Đã xảy ra lỗi không xác định, vui lòng thử lại.",
        );

        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return { busy, error, success, run, reset, setError };
}

/**
 * Mốc "bây giờ", tự làm mới mỗi phút.
 *
 * Cần một hook riêng vì gọi thẳng Date.now() khi render là hàm không thuần tuý: kết quả đổi
 * theo từng lần render mà React không biết. Ở đây giá trị nằm trong state và chỉ đổi trong
 * callback của timer, nên các nhãn kiểu "đã quá hạn hủy" cũng tự cập nhật theo thời gian thật.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
