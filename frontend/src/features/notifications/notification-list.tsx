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
      <h1>Notifications</h1>
      {items.map((n) => (
        <Card key={n.id}>
          <div className="row between wrap">
            <h2>{n.title}</h2>
            <span className="badge">{n.read ? "Read" : "● Unread"}</span>
          </div>
          <p>{n.body}</p>
          <div className="row wrap">
            <Link href={n.href} className="text-link">
              View details →
            </Link>
            {!n.read && (
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => onRead(n.id)}
              >
                Mark as read
              </Button>
            )}
          </div>
        </Card>
      ))}
      {!items.length && (
        <EmptyState title="No notifications yet">
          Schedule and membership plan updates will appear here.
        </EmptyState>
      )}
    </div>
  );
}
