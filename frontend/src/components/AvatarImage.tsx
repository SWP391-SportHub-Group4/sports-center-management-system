import styles from "./avatar.module.css";

export function AvatarImage({
  name,
  avatarUrl,
  size = 40,
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size }}
      aria-label={name}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : initial}
    </span>
  );
}
