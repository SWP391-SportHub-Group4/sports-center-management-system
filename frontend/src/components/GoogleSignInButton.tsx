"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (value: { credential: string }) => void;
          }): void;
          renderButton(
            element: HTMLElement,
            options: Record<string, unknown>,
          ): void;
        };
      };
    };
  }
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  onCredential,
  onError,
  text = "continue_with",
  disabled = false,
}: {
  onCredential: (idToken: string) => void;
  onError?: (cause: unknown) => void;
  text?: "continue_with" | "signin_with" | "signup_with";
  disabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const disabledRef = useRef(disabled);
  const [gsiReady, setGsiReady] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    let script: HTMLScriptElement | null = null;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

    const render = () => {
      if (!host.current || !window.google) return;
      host.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          if (!disabledRef.current) onCredentialRef.current(credential);
        },
      });
      window.google.accounts.id.renderButton(host.current, {
        theme: "outline",
        size: "large",
        width: host.current.clientWidth,
        text,
      });
      setGsiReady(true);
    };

    const fail = () => {
      setGsiReady(false);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", render);
      existing.addEventListener("error", fail);
      render();
      return () => {
        existing.removeEventListener("load", render);
        existing.removeEventListener("error", fail);
      };
    }

    const loadScript = () => {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = render;
      script.onerror = fail;
      document.head.appendChild(script);
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(loadScript, { timeout: 1200 });
    } else {
      timeoutId = globalThis.setTimeout(loadScript, 0);
    }

    return () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
    };
  }, [clientId, text]);

  const buttonLabel = {
    continue_with: "Continue with Google",
    signin_with: "Sign in with Google",
    signup_with: "Sign up with Google",
  }[text];

  const handleFallbackClick = () => {
    if (disabled) return;
    if (!clientId) {
      const err = new ApiError(
        400,
        "google_login_not_configured",
        "Google Sign-In is not configured yet.",
      );
      if (onErrorRef.current) {
        onErrorRef.current(err);
      } else {
        setInternalError(
          "Google Sign-In is not configured yet. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local to enable.",
        );
      }
    }
  };

  return (
    <div className="google-sign-in-wrap">
      {/* Official Google GSI container when script initializes */}
      <div
        ref={host}
        className={`google-sign-in ${disabled ? "google-sign-in--disabled" : ""}`}
        style={{ display: gsiReady ? "block" : "none" }}
      />

      {/* Branded native button shown when GSI is loading or clientId is pending */}
      {!gsiReady && (
        <button
          type="button"
          className="btn btn--google"
          disabled={disabled}
          onClick={handleFallbackClick}
          aria-label={buttonLabel}
        >
          <GoogleLogo />
          <span>{buttonLabel}</span>
        </button>
      )}

      {internalError && (
        <p className="alert alert--warn google-sign-in__status" role="status">
          {internalError}
        </p>
      )}
    </div>
  );
}
