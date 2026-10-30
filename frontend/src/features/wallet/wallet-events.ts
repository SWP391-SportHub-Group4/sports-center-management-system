"use client";

import { useEffect } from "react";

const WALLET_CHANGED = "sporthub:wallet-changed";

export function notifyWalletChanged() {
  window.dispatchEvent(new Event(WALLET_CHANGED));
}

export function useWalletRefresh(refresh: () => void) {
  useEffect(() => {
    window.addEventListener(WALLET_CHANGED, refresh);
    return () => window.removeEventListener(WALLET_CHANGED, refresh);
  }, [refresh]);
}
