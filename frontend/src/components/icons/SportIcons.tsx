import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  className?: string;
}

const baseIconStyle: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "middle",
  flexShrink: 0,
};

// ==========================================
// 1. SPORT & FITNESS DISCIPLINE ICONS
// ==========================================

/**
 * Athletic Dumbbell (Gym, Strength, Personal Training)
 * Google Material precision with rounded hexagonal plates & knurled bar
 */
export function IconDumbbell({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M6.5 6.5h-2a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
      <path d="M6.5 4.5h1a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-1" />
      <path d="M8.5 12h7" />
      <path d="M17.5 4.5h-1a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h1" />
      <path d="M17.5 6.5h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

/**
 * Serene Yoga Lotus & Flow (Yoga, Mindfulness, Recovery)
 */
export function IconYoga({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="5" r="2" />
      <path d="M4 19c2.5-3 5-4.5 8-4.5s5.5 1.5 8 4.5" />
      <path d="M12 9v5.5" />
      <path d="M6.5 11.5l3.5 2 2-2 2 2 3.5-2" />
      <path d="M8 20.5h8" />
    </svg>
  );
}

/**
 * Dynamic Energy Flame (GroupX, Cardio, HIIT, Zumba)
 */
export function IconFlame({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2c.5 3 2 4.5 4 6.5 2 2 3 4.5 3 7.5a7 7 0 1 1-14 0c0-4 3.5-7 5-11 1.5 2 2.5 3.5 3 5 .8-2 0-5.5-1-8z" />
      <path d="M12 14c-1 1-1.5 2-1.5 3a2.5 2.5 0 0 0 5 0c0-1.5-1.5-2.5-3.5-3z" />
    </svg>
  );
}

/**
 * Sprinting Athlete (Running, Track, Cardio, Registrations)
 */
export function IconRunner({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="15.5" cy="4.5" r="2" />
      <path d="M7 21l3.5-6.5 3 1.5 3-4" />
      <path d="M13.5 16l-1.5-4 4-2.5 2.5 2" />
      <path d="M6 13l3.5-2 2.5 2" />
      <path d="M4 17l2.5-2" />
    </svg>
  );
}

/**
 * Aquatic Wave Swimmer (Swimming, Pool)
 */
export function IconSwim({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="6" cy="6" r="1.8" />
      <path d="M2 19c2.5 1 5 1 7.5 0s5-1 7.5 0 5 1 7 0" />
      <path d="M2 15c2.5 1 5 1 7.5 0s5-1 7.5 0 5 1 7 0" />
      <path d="M6.5 9.5l3.5 2 4.5-2.5 4 1.5" />
      <path d="M9 13.5l2-2.5" />
    </svg>
  );
}

/**
 * Aerodynamic Badminton Shuttlecock (Badminton, Court)
 */
export function IconBadminton({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 18a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
      <path d="M9.5 18L5 4h14l-4.5 14" />
      <path d="M7 10h10" />
      <path d="M8 14h8" />
      <path d="M12 4v14" />
    </svg>
  );
}

// ==========================================
// 2. CORE PLATFORM & NAVIGATION ICONS
// ==========================================

/**
 * SportHub Dashboard / Overview Grid
 */
export function IconDashboard({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </svg>
  );
}

/**
 * Athletic Calendar & Schedule (Class Schedule, Bookings)
 */
export function IconCalendar({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M16 2v4M8 2v4" />
      <path d="M3 10h18" />
      <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Precision Athletic Stopwatch & Time (Session duration, countdown)
 */
export function IconClock({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M12 2v3M10 2h4" />
      <path d="M18.5 5.5l1.5 1.5" />
    </svg>
  );
}

/**
 * Google Maps-style Athletic Facility Pin (Studio, Court, Gym Room)
 */
export function IconLocation({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2a7.5 7.5 0 0 0-7.5 7.5c0 5.25 7.5 12.5 7.5 12.5s7.5-7.25 7.5-12.5A7.5 7.5 0 0 0 12 2z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/**
 * Athletic Coach & Member User Avatar
 */
export function IconUser({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="8" r="4.5" />
      <path d="M5 20.5c0-3.5 3.5-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

/**
 * QR Turnstile Gate Pass (Contactless check-in)
 */
export function IconQrCode({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01" />
      <path d="M10.5 7h3M7 10.5v3M17 10.5v3M10.5 17h3" />
    </svg>
  );
}

/**
 * Google-style Notification Bell with Athletic Chime
 */
export function IconBell({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Membership Card & Pass (RFID, Packages, Subscriptions)
 */
export function IconCreditCard({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
      <rect x="5" y="14" width="4" height="2.5" rx="0.5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="15.25" r="1.5" />
    </svg>
  );
}

/**
 * Digital Invoice & Billing Receipt
 */
export function IconInvoice({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M4 2v20l3-1.5 3 1.5 3-1.5 3 1.5 3-1.5 3 1.5V2l-3 1.5L16 2l-3 1.5L10 2 7 3.5 4 2z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

/**
 * Athletic Training Log & Regimen Clipboard
 */
export function IconClipboard({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1.5" />
      <path d="M9 12l2 2 4-4" />
      <path d="M9 17h6" />
    </svg>
  );
}

/**
 * Athletic Fitness Goal & Target Bullseye
 */
export function IconTarget({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

/**
 * Coach Feedback & Chat Message
 */
export function IconChat({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Victory Checkmark / Success Status
 */
export function IconCheck({
  size = 20,
  color = "currentColor",
  strokeWidth = 2.2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Attention / Policy Alert Shield
 */
export function IconAlert({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Helpful Tip / Lightbulb Guide
 */
export function IconTip({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z" />
    </svg>
  );
}

/**
 * Dynamic Dual-Arrow Refresh / Sync
 */
export function IconRefresh({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M21.5 2v6h-6" />
      <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l.73.81" />
    </svg>
  );
}

/**
 * Fast Lightning Bolt (Power, Energy, Capacity)
 */
export function IconLightning({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

/**
 * Triumphant Championship Trophy (Milestone, Success)
 */
export function IconTrophy({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
      <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
      <path d="M6 3h12v7a6 6 0 0 1-12 0V3z" />
      <path d="M12 16v4M8 20h8" />
    </svg>
  );
}

/**
 * Cardio Heartbeat Pulse (Health, Fitness Profile, BMI)
 */
export function IconHeartbeat({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

/**
 * Clean Rounded Dismiss / Close X
 */
export function IconClose({
  size = 20,
  color = "currentColor",
  strokeWidth = 2.2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Streamlined Mobile Hamburger Menu
 */
export function IconMenu({
  size = 20,
  color = "currentColor",
  strokeWidth = 2.2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

/**
 * User Account Settings Gear
 */
export function IconSettings({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Logout Door & Egress Arrow
 */
export function IconLogout({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/**
 * Print & Thermal Hardware Receipt Printer
 */
export function IconPrinter({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

/**
 * Receipt Slip with jagged bottom
 */
export function IconReceipt({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="12" y2="15" />
    </svg>
  );
}

/**
 * Sparkles & Delightful Glow
 */
export function IconSparkles({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

/**
 * Optical Camera (QR Scanner, Hardware Feed, Access Reader)
 */
export function IconCamera({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

/**
 * Camera Off (Disabled Hardware / Standby)
 */
export function IconCameraOff({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 1.4-.6" />
      <path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v6" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

/**
 * Switch Camera (Cycle front/rear or external webcams)
 */
export function IconSwitchCamera({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M11 19H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2v3" />
      <path d="M19 14v4l3-3" />
      <path d="M15 18v-4l-3 3" />
    </svg>
  );
}

/**
 * Upload / Import File
 */
export function IconUpload({
  size = 20,
  color = "currentColor",
  strokeWidth = 2,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseIconStyle, ...style }}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
