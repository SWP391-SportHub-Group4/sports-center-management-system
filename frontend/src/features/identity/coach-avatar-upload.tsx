"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { api, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import type { MyAccountDto } from "@/lib/types";
import styles from "./coach-avatar-upload.module.css";

export function CoachAvatarUpload({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const { refreshUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // This effect owns the lifetime of the preview URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const clear = () => {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  };
  const choose = (selected: File | undefined) => {
    if (!selected || busy) return;
    setSuccess("");
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
      selected.size === 0 ||
      selected.size > 5 * 1024 * 1024
    ) {
      setError(
        vi
          ? "Chọn ảnh JPG, PNG hoặc WebP không quá 5 MB."
          : "Choose a JPG, PNG or WebP image up to 5 MB.",
      );
      if (input.current) input.current.value = "";
      return;
    }
    setPreview(null);
    setFile(selected);
  };
  const save = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    let uploaded = false;
    try {
      const body = new FormData();
      body.append("file", file);
      const updated = await api.post<MyAccountDto>(
        "/api/users/me/avatar",
        body,
      );
      uploaded = true;
      setUploadedUrl(updated.avatarUrl ?? null);
      clear();
      await refreshUser();
      setSuccess(vi ? "Đã cập nhật ảnh đại diện." : "Profile photo updated.");
    } catch (cause) {
      setError(
        uploaded
          ? vi
            ? "Ảnh đã được lưu. Tải lại trang để cập nhật ảnh trên thanh điều hướng."
            : "Photo saved. Reload this page to update the navigation photo."
          : cause instanceof ApiError
            ? cause.message
            : vi
              ? "Không tải được ảnh. Vui lòng thử lại."
              : "Unable to upload this photo. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={styles.section}
      aria-labelledby="coach-avatar-title"
      aria-busy={busy}
    >
      <div className={styles.row}>
        <UserAvatar
          name={name}
          src={preview || uploadedUrl || avatarUrl}
          className={styles.photo}
        />
        <div className={styles.content}>
          <h3 id="coach-avatar-title">
            {vi ? "Ảnh đại diện" : "Profile photo"}
          </h3>
          <p>
            {vi
              ? "Ảnh chân dung rõ mặt giúp học viên nhận ra bạn."
              : "A clear portrait helps students recognize you."}
          </p>
          <small>JPG, PNG, WebP · {vi ? "Tối đa 5 MB" : "Up to 5 MB"}</small>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            hidden
            aria-label={vi ? "Chọn ảnh đại diện" : "Choose profile photo"}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Camera size={16} aria-hidden="true" />{" "}
              {vi ? "Chọn ảnh" : "Choose photo"}
            </button>
            {file && (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={save}
                >
                  <Upload size={16} aria-hidden="true" />{" "}
                  {busy
                    ? vi
                      ? "Đang tải…"
                      : "Uploading…"
                    : vi
                      ? "Lưu ảnh"
                      : "Save photo"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={clear}
                >
                  {vi ? "Hủy" : "Cancel"}
                </button>
              </>
            )}
          </div>
          {file && <small className={styles.fileName}>{file.name}</small>}
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.success} role="status">
          {success}
        </p>
      )}
    </section>
  );
}
