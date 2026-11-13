"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui";

export function useOperatingHoursPopup() {
  const [message, setMessage] = useState("");
  const picker = useRef<HTMLInputElement | null>(null);
  const restorePicker = () => {
    if (picker.current) {
      picker.current.disabled = false;
      picker.current = null;
    }
  };
  useEffect(() => restorePicker, []);
  const dismiss = () => {
    restorePicker();
    setMessage("");
  };
  const checkTime = (event: FormEvent<HTMLElement>, explanation: string) => {
    const input = event.target;
    if (
      input instanceof HTMLInputElement &&
      input.type === "time" &&
      input.value &&
      (input.validity.rangeUnderflow || input.validity.rangeOverflow)
    ) {
      if (event.type === "invalid") event.preventDefault();
      // Native time pickers render above dialogs. Close the picker before
      // opening the notice and prevent it reopening until the notice closes.
      restorePicker();
      input.blur();
      input.disabled = true;
      picker.current = input;
      setMessage(explanation);
    }
  };
  const popup = message
    ? createPortal(
        <Dialog
          title="Outside center opening hours"
          onClose={dismiss}
          showCloseButton={false}
          footer={
            <button type="button" className="btn" onClick={dismiss}>
              Choose another time
            </button>
          }
        >
          <p role="alert">{message}</p>
        </Dialog>,
        document.body,
      )
    : null;
  return { checkTime, popup };
}
