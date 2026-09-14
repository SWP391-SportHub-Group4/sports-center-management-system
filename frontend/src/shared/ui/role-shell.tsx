"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./index";

export interface NavigationItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon?: IconName;
}
export interface RoleShellProps {
  children: ReactNode;
  navigation: NavigationItem[];
  name: string;
  profileHref: string;
  notificationsHref: string;
  unread: number;
  roleLabel: string;
  statusLabel?: string;
  avatarSrc?: string;
}
export function RoleShell({
  children,
  navigation,
  name,
  profileHref,
  notificationsHref,
  unread,
  roleLabel,
  statusLabel,
  avatarSrc,
}: RoleShellProps) {
  const pathname = usePathname();
  return (
    <div className="role-shell">
      <a href="#main-content" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <aside className="sidebar">
        <Link className="brand" href={navigation[0].href}>
          <Icon name="brand" />
          SportHub
        </Link>
        <nav aria-label={`Điều hướng ${roleLabel}`} className="desktop-nav">
          {navigation.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
            >
              {n.icon && <Icon name={n.icon} />}
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <header className="app-header">
        <Link className="brand mobile-brand" href={navigation[0].href}>
          <Icon name="brand" />
          SportHub
        </Link>
        {statusLabel && <span className="demo-label">{statusLabel}</span>}
        <div className="row header-actions">
          <Link
            className="notification-link"
            href={notificationsHref}
            aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`}
          >
            <Icon name="bell" />
            {unread > 0 && (
              <span className="notification-dot" aria-hidden="true" />
            )}
          </Link>
          <Link
            className="profile-link"
            href={profileHref}
            aria-label={`Trang cá nhân của ${name}`}
          >
            <span className="avatar" aria-hidden="true">
              {avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  className="avatar"
                />
              ) : (
                name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(-2)
                  .join("")
              )}
            </span>
            <span className="profile-label">
              {name}
              <small>{roleLabel}</small>
            </span>
          </Link>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Điều hướng trên thiết bị nhỏ">
        {[...navigation, { href: profileHref, label: "Cá nhân" }].map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={
              pathname === n.href ||
              (n.href === profileHref && pathname.startsWith(profileHref))
                ? "page"
                : undefined
            }
          >
            {"shortLabel" in n && n.shortLabel ? n.shortLabel : n.label}
          </Link>
        ))}
      </nav>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
