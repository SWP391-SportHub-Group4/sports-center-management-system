"use client";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { SportDto, RoomDto } from "@/lib/types";
import { SportEditor } from "./sport-editor";
import { CreateRoomForm } from "./create-room-form";
import styles from "./inline-create.module.css";

export function InlineCreate({
  children,
  kind,
  onCreated,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
} & (
  | { kind: "sport"; sportId?: never; onCreated: (sport: SportDto) => void }
  | { kind: "court"; sportId?: number; onCreated: (court: RoomDto) => void }
)) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const title =
    kind === "sport"
      ? t.managerCatalog.createSport
      : t.managerCatalog.createRoom;
  if (!enabled) return children;
  return (
    <div className={styles.row}>
      <div className={styles.field}>{children}</div>
      <button
        type="button"
        className={`btn btn--secondary ${styles.add}`}
        aria-label={title}
        title={title}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Plus size={20} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            onSubmit={(event) => event.stopPropagation()}
            onChange={(event) => event.stopPropagation()}
          >
            {kind === "sport" ? (
              <SportEditor
                onClose={() => setOpen(false)}
                onSaved={(sport) => {
                  onCreated(sport);
                  setOpen(false);
                }}
              />
            ) : (
              <Dialog
                title={title}
                size="lg"
                closeIconOnly
                onClose={() => {
                  if (!busy) setOpen(false);
                }}
              >
                <CreateRoomForm
                  onBusyChange={setBusy}
                  onCancel={() => setOpen(false)}
                  onCreated={(court) => {
                    onCreated(court);
                    setOpen(false);
                  }}
                />
              </Dialog>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
