import React from "react";

export interface StickerProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

const baseStickerStyle: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "middle",
  flexShrink: 0,
};

/**
 * 1. Empty Calendar / Schedule Sticker
 * Google Material style sneaker with athletic calendar tile and floating sparkle dots.
 */
export function StickerCalendarEmpty({
  size = 72,
  className,
  style,
  ...props
}: StickerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ ...baseStickerStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="calBgGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e9f7fc" />
          <stop offset="1" stopColor="#c0e4f3" />
        </linearGradient>
        <linearGradient id="shoeGrad" x1="20" y1="50" x2="80" y2="85" gradientUnits="userSpaceOnUse">
          <stop stopColor="#236e95" />
          <stop offset="1" stopColor="#1a2b4c" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="40" y1="30" x2="80" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff6b4a" />
          <stop offset="1" stopColor="#ff9a7b" />
        </linearGradient>
      </defs>

      {/* Soft rounded squircle backdrop */}
      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#calBgGrad)" />

      {/* Calendar Card in Background */}
      <rect x="22" y="18" width="56" height="48" rx="10" fill="#ffffff" stroke="#c0e4f3" strokeWidth="2" />
      <rect x="22" y="18" width="56" height="15" rx="10" fill="#236e95" />
      <circle cx="34" cy="25" r="2" fill="#ffffff" />
      <circle cx="50" cy="25" r="2" fill="#ffffff" />
      <circle cx="66" cy="25" r="2" fill="#ffffff" />

      {/* Calendar grid dots */}
      <circle cx="32" cy="42" r="2.5" fill="#dfe5ec" />
      <circle cx="44" cy="42" r="2.5" fill="#dfe5ec" />
      <circle cx="56" cy="42" r="2.5" fill="#dfe5ec" />
      <circle cx="68" cy="42" r="2.5" fill="#dfe5ec" />
      <circle cx="32" cy="52" r="2.5" fill="#dfe5ec" />
      <circle cx="44" cy="52" r="2.5" fill="#00c48c" />
      <circle cx="56" cy="52" r="2.5" fill="#dfe5ec" />

      {/* Athletic Running Sneaker */}
      <path
        d="M20 72c2-8 12-14 26-14 8 0 16 3 24 9l10 2c3 1 4 4 2 7-2 2-6 3-10 3H26c-4 0-7-3-6-7z"
        fill="url(#shoeGrad)"
      />
      {/* Sole & Foam */}
      <path d="M22 75h56c3 0 5 2 4 4-1 2-3 3-6 3H24c-3 0-5-1-4-3 0-2 1-4 2-4z" fill="#ffffff" />
      <path d="M24 81h52c2 0 4 1 3 2s-2 1-4 1H26c-2 0-4-1-3-2s1-1 1-1z" fill="#ff6b4a" />
      {/* Sneaker swoosh stripe */}
      <path d="M38 64c8 0 16 4 22 9" stroke="#c0e4f3" strokeWidth="3" strokeLinecap="round" />

      {/* Floating Sparkles */}
      <circle cx="78" cy="22" r="3" fill="#ff6b4a" />
      <path d="M78 16v12M72 22h12" stroke="#ff6b4a" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="45" r="2" fill="#236e95" />
    </svg>
  );
}

/**
 * 2. Empty Membership Plans Sticker
 * Premium access pass card with athletic medal ribbon.
 */
export function StickerPlansEmpty({
  size = 72,
  className,
  style,
  ...props
}: StickerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ ...baseStickerStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="plansBgGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef6e9" />
          <stop offset="1" stopColor="#fed7aa" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="15" y1="25" x2="75" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a2b4c" />
          <stop offset="1" stopColor="#236e95" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="50" y1="45" x2="80" y2="85" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd166" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* Squircle background */}
      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#plansBgGrad)" />

      {/* Angled Membership Card */}
      <g transform="rotate(-6 45 45)">
        <rect x="18" y="24" width="60" height="38" rx="8" fill="url(#cardGrad)" />
        <rect x="24" y="32" width="10" height="7" rx="1.5" fill="#ffd166" />
        <line x1="24" y1="46" x2="52" y2="46" stroke="#c0e4f3" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="24" y1="52" x2="40" y2="52" stroke="#6ec1e4" strokeWidth="2" strokeLinecap="round" />
        <circle cx="68" cy="35" r="4" fill="#ffffff" fillOpacity="0.25" />
        <circle cx="62" cy="35" r="4" fill="#ffffff" fillOpacity="0.25" />
      </g>

      {/* Golden Medal in foreground */}
      <g>
        {/* Ribbon */}
        <path d="M54 50l6 24-8-4-8 4 4-24" fill="#ff6b4a" />
        <circle cx="52" cy="58" r="14" fill="url(#goldGrad)" stroke="#ffffff" strokeWidth="2.5" />
        <polygon points="52,49 55,55 61,56 57,60 58,66 52,63 46,66 47,60 43,56 49,55" fill="#ffffff" />
      </g>

      {/* Sparkles */}
      <circle cx="78" cy="24" r="2.5" fill="#f59e0b" />
      <circle cx="20" cy="74" r="2" fill="#ff6b4a" />
    </svg>
  );
}

/**
 * 3. Empty Registrations / Attended Classes Sticker
 * Sprinter crossing the finish line tape with energetic motion lines.
 */
export function StickerRegistrationsEmpty({
  size = 72,
  className,
  style,
  ...props
}: StickerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ ...baseStickerStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="regBgGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#eafcf3" />
          <stop offset="1" stopColor="#bbf7d0" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#regBgGrad)" />

      {/* Track Lines */}
      <path d="M16 66c20-6 48-6 68 0" stroke="#86efac" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 76c22-7 52-7 72 0" stroke="#86efac" strokeWidth="4" strokeLinecap="round" />

      {/* Runner Body */}
      <circle cx="56" cy="26" r="6" fill="#1a2b4c" />
      <path d="M38 72l10-18 8 4 6-12" stroke="#1a2b4c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M54 46l-4-10 10-6 7 6" stroke="#236e95" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 50l8-4 6 6" stroke="#236e95" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Victory Ribbon */}
      <path d="M30 44c15 4 30-4 46 2" stroke="#ff6b4a" strokeWidth="3.5" strokeLinecap="round" />

      {/* Athletic Energy Speed Lines */}
      <line x1="22" y1="36" x2="34" y2="36" stroke="#00c48c" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="18" y1="42" x2="28" y2="42" stroke="#00c48c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="76" cy="30" r="3" fill="#ff6b4a" />
    </svg>
  );
}

/**
 * 4. Empty Training Regimen / Coach Feedback Sticker
 * Athletic clipboard with checkmarks and whistle.
 */
export function StickerTrainingEmpty({
  size = 72,
  className,
  style,
  ...props
}: StickerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ ...baseStickerStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="trainBgGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#eef2ff" />
          <stop offset="1" stopColor="#c7d2fe" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#trainBgGrad)" />

      {/* Clipboard */}
      <rect x="25" y="20" width="50" height="62" rx="8" fill="#ffffff" stroke="#c0e4f3" strokeWidth="2" />
      {/* Top Clip */}
      <rect x="37" y="15" width="26" height="10" rx="3" fill="#1a2b4c" />
      <circle cx="50" cy="20" r="2" fill="#ffffff" />

      {/* Regimen lines with sport checkmarks */}
      <path d="M33 36l3 3 6-6" stroke="#00c48c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="48" y1="36" x2="66" y2="36" stroke="#1a2b4c" strokeWidth="2.5" strokeLinecap="round" />

      <path d="M33 48l3 3 6-6" stroke="#00c48c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="48" y1="48" x2="63" y2="48" stroke="#1a2b4c" strokeWidth="2.5" strokeLinecap="round" />

      <circle cx="37" cy="60" r="3" fill="#cbd5e1" />
      <line x1="48" y1="60" x2="65" y2="60" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />

      {/* Floating Kettlebell Badge */}
      <g transform="translate(56, 56)">
        <path d="M12 6c3 0 6 3 6 6v2H6v-2c0-3 3-6 6-6z" fill="#ff6b4a" />
        <circle cx="12" cy="18" r="10" fill="#ff6b4a" />
        <circle cx="12" cy="18" r="4" fill="#ffffff" />
      </g>
    </svg>
  );
}

/**
 * 5. Booking Success Trophy Sticker
 * Triumphant championship cup with confetti & stars.
 */
export function StickerSuccessTrophy({
  size = 72,
  className,
  style,
  ...props
}: StickerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ ...baseStickerStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="succBgGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef3c7" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id="cupGrad" x1="30" y1="25" x2="70" y2="65" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#succBgGrad)" />

      {/* Trophy Handles */}
      <path d="M26 34c-6 0-9 6-9 12s5 10 11 10" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M74 34c6 0 9 6 9 12s-5 10-11 10" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />

      {/* Trophy Main Cup */}
      <path d="M28 26h44v18c0 12-10 22-22 22s-22-10-22-22V26z" fill="url(#cupGrad)" />
      <polygon points="50,33 52,38 57,39 53,42 54,47 50,44 46,47 47,42 43,39 48,38" fill="#ffffff" />

      {/* Stem & Base */}
      <path d="M50 66v10M40 76h20" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
      <rect x="36" y="76" width="28" height="6" rx="2" fill="#1a2b4c" />

      {/* Confetti */}
      <rect x="20" y="18" width="3" height="7" rx="1.5" transform="rotate(25 20 18)" fill="#ff6b4a" />
      <rect x="76" y="16" width="3" height="7" rx="1.5" transform="rotate(-30 76 16)" fill="#00c48c" />
      <circle cx="30" cy="14" r="2.5" fill="#236e95" />
      <circle cx="70" cy="22" r="2.5" fill="#ff6b4a" />
    </svg>
  );
}

/**
 * 6. Quick Gate Pass QR Sticker
 * Contactless turnstile entrance badge.
 */
export function StickerGatePass({
  size = 72,
  className,
  style,
  ...props
}: StickerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ ...baseStickerStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="qrBgGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a2b4c" />
          <stop offset="1" stopColor="#0d1b33" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#qrBgGrad)" />

      {/* Phone Screen Frame */}
      <rect x="26" y="16" width="48" height="68" rx="8" fill="#ffffff" />
      <rect x="42" y="20" width="16" height="3" rx="1.5" fill="#cbd5e1" />

      {/* QR Code Graphic */}
      <rect x="34" y="28" width="12" height="12" rx="2" fill="#1a2b4c" />
      <rect x="36" y="30" width="8" height="8" rx="1" fill="#ffffff" />
      <rect x="38" y="32" width="4" height="4" fill="#1a2b4c" />

      <rect x="54" y="28" width="12" height="12" rx="2" fill="#1a2b4c" />
      <rect x="56" y="30" width="8" height="8" rx="1" fill="#ffffff" />
      <rect x="58" y="32" width="4" height="4" fill="#1a2b4c" />

      <rect x="34" y="48" width="12" height="12" rx="2" fill="#1a2b4c" />
      <rect x="36" y="50" width="8" height="8" rx="1" fill="#ffffff" />
      <rect x="38" y="52" width="4" height="4" fill="#1a2b4c" />

      {/* Turnstile Access Success Pill */}
      <rect x="32" y="66" width="36" height="12" rx="6" fill="#00c48c" />
      <path d="M46 72l3 3 5-5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Radiating Waves */}
      <path d="M78 40a18 18 0 0 1 0 20" stroke="#6ec1e4" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M84 34a26 26 0 0 1 0 32" stroke="#6ec1e4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 7. Fitness Goal Target & Metric Sticker
 */
export function StickerGoalTarget({
  size = 72,
  className,
  style,
  ...props
}: StickerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ ...baseStickerStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="goalBgGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fee2e2" />
          <stop offset="1" stopColor="#fecaca" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#goalBgGrad)" />

      {/* Bullseye Rings */}
      <circle cx="50" cy="50" r="30" fill="#ffffff" stroke="#ef4444" strokeWidth="4" />
      <circle cx="50" cy="50" r="20" fill="#ef4444" stroke="#ffffff" strokeWidth="3" />
      <circle cx="50" cy="50" r="10" fill="#ffffff" />
      <circle cx="50" cy="50" r="4" fill="#ef4444" />

      {/* Athletic Arrow */}
      <path d="M74 26L52 48" stroke="#1a2b4c" strokeWidth="4" strokeLinecap="round" />
      <path d="M74 26l-8 2 6 6" fill="#1a2b4c" />
      <polygon points="50,50 56,46 54,54" fill="#ef4444" />

      {/* Energy Sparks */}
      <circle cx="22" cy="30" r="3" fill="#ff6b4a" />
      <circle cx="78" cy="70" r="2.5" fill="#f59e0b" />
    </svg>
  );
}
