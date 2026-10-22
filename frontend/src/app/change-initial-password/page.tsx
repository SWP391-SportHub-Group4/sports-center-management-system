"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/primitives";
import { PasswordRequirements, passwordChecks } from "@/features/identity/password-requirements";
import { api, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import styles from "./page.module.css";

export default function ChangeInitialPasswordPage() {
  const router = useRouter();
  const { user, loading, logout, refreshUser, updateToken } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!user.mustChangePassword) router.replace("/admin");
  }, [loading, user, router]);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !user) return;
    if (!passwordChecks(newPassword, user.email).every(Boolean)) {
      setError("Choose a new password that meets every requirement below.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await api.post<{ accessToken: string }>("/api/users/me/password", {
        currentPassword,
        newPassword,
        confirmNewPassword: confirmation,
      });
      updateToken(response.accessToken);
      await refreshUser();
      router.replace("/admin");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not change the password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || !user.mustChangePassword) return null;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Change your initial password</h1>
        <p>Before using SportHub, replace the password provided during setup for {user.email}.</p>
        <form onSubmit={changePassword}>
          <label htmlFor="initial-current">Current password</label>
          <PasswordInput id="initial-current" autoComplete="current-password" value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)} required disabled={busy} />
          <label htmlFor="initial-new">New password</label>
          <PasswordInput id="initial-new" autoComplete="new-password" value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)} required disabled={busy} />
          <PasswordRequirements password={newPassword} email={user.email} />
          <label htmlFor="initial-confirm">Confirm new password</label>
          <PasswordInput id="initial-confirm" autoComplete="new-password" value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)} required disabled={busy} />
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        </form>
        <button type="button" className={styles.signOut} onClick={logout}>Sign out</button>
      </section>
    </main>
  );
}
