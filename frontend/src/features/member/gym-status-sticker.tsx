"use client";

import { useLanguage } from "@/lib/language";
import styles from "./gym-status-sticker.module.css";

export function GymStatusSticker({
  state,
}: {
  state: "active" | "purchased" | "pending" | "available";
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const labels = {
    active: ["Gym đang sử dụng", "Your Gym is active"],
    purchased: ["Membership đã đăng ký", "Membership purchased"],
    pending: ["Membership chờ thanh toán", "Membership awaiting payment"],
    available: ["Bắt đầu tập Gym", "Start your Gym journey"],
  };
  const descriptions = {
    active: [
      "Membership còn hiệu lực. Sẵn sàng cho buổi tập tiếp theo!",
      "Your membership is active. Ready for your next workout!",
    ],
    purchased: [
      "Gói đã đăng ký. Xem thời hạn sử dụng bên dưới.",
      "Your package is purchased. Check its validity below.",
    ],
    pending: [
      "Hoàn tất thanh toán để kích hoạt quyền truy cập Gym.",
      "Complete payment to activate your Gym access.",
    ],
    available: [
      "Bạn chưa có gói hiện tại. Chọn Membership phù hợp bên dưới.",
      "You have no current package. Choose a membership below.",
    ],
  };
  return (
    <div className={styles.banner} data-state={state}>
      <svg
        className={styles.sticker}
        viewBox="0 0 120 110"
        aria-hidden="true"
        focusable="false"
      >
        <ellipse
          cx="60"
          cy="98"
          rx="32"
          ry="5"
          fill="currentColor"
          opacity=".1"
        />
        <g className={styles.character}>
          <path
            d="M39 81 34 95M80 81l6 14"
            stroke="#183c39"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M32 54C24 82 39 91 60 90c25 0 35-16 26-38-6-15-17-23-30-21-12 1-20 9-24 23"
            fill="var(--gym-character)"
          />
          <path
            d="M48 57v5m21-5v5"
            stroke="#183c39"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M54 70q7 8 14 0"
            fill="none"
            stroke="#183c39"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g className={styles.weights}>
            <path
              d="M32 58 25 32m62 26 8-26"
              stroke="#183c39"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M15 24h89"
              stroke="#183c39"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <rect x="13" y="12" width="10" height="25" rx="4" fill="#183c39" />
            <rect x="26" y="16" width="7" height="17" rx="3" fill="#183c39" />
            <rect x="87" y="16" width="7" height="17" rx="3" fill="#183c39" />
            <rect x="97" y="12" width="10" height="25" rx="4" fill="#183c39" />
          </g>
        </g>
        <g className={styles.spark} fill="var(--gym-accent)">
          <path d="m13 60 3-7 3 7 7 3-7 3-3 7-3-7-7-3Z" />
          <circle cx="104" cy="77" r="4" />
        </g>
      </svg>
      <div>
        <span className={styles.eyebrow}>
          {vi ? "MEMBERSHIP GYM" : "GYM MEMBERSHIP"}
        </span>
        <h3>{labels[state][vi ? 0 : 1]}</h3>
        <p>{descriptions[state][vi ? 0 : 1]}</p>
      </div>
    </div>
  );
}
