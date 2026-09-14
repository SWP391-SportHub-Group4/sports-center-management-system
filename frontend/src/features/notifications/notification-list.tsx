"use client";
import Link from "next/link";
import { Card, Button, EmptyState } from "@/shared/ui";
import type { MemberNotification } from "./model";
export function NotificationList({
  items,
  busy,
  onRead,
}: {
  items: MemberNotification[];
  busy: boolean;
  onRead: (id: string) => void;
}) {
  return (
    <div className="stack">
      <h1>Thông báo</h1>
      {items.map((n) => (
        <Card key={n.id}>
          <div className="row between wrap">
            <h2>{n.title}</h2>
            <span className="badge">{n.read ? "Đã đọc" : "● Chưa đọc"}</span>
          </div>
          <p>{n.body}</p>
          <div className="row wrap">
            <Link href={n.href} className="text-link">
              Xem chi tiết →
            </Link>
            {!n.read && (
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => onRead(n.id)}
              >
                Đánh dấu đã đọc
              </Button>
            )}
          </div>
        </Card>
      ))}
      {!items.length && (
        <EmptyState title="Chưa có thông báo">
          Bạn sẽ nhận cập nhật lịch học và gói tập tại đây.
        </EmptyState>
      )}
    </div>
  );
}
