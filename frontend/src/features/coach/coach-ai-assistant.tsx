"use client";

import { useState } from "react";
import Image from "next/image";
import { AssistantDrawer } from "@/features/member";
import styles from "./coach-ai-assistant.module.css";

// The Coach and Member share the same chat interface, with role-specific context.
export function CoachAiAssistant() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={styles.launcher}>
        <button
          type="button"
          className={styles.launcherButton}
          aria-label="Ask Wolf"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Image src="/sporthub/mascot-wolf-full.png" alt="" width={112} height={168}
            className={styles.launcherMascot} aria-hidden="true" />
        </button>
      </div>
      {open && <AssistantDrawer audience="coach" onClose={() => setOpen(false)} />}
    </>
  );
}
