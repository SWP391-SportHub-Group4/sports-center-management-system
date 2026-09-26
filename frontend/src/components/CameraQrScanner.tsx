"use client";

import { useEffect, useRef, useState, useCallback, type ChangeEvent } from "react";
import jsQR from "jsqr";
import {
  IconCamera,
  IconCameraOff,
  IconSwitchCamera,
  IconUpload,
  IconQrCode,
  IconCheck,
} from "@/components/icons/SportIcons";
import { useLanguage } from "@/lib/language";
import styles from "./CameraQrScanner.module.css";

export interface CameraQrScannerProps {
  /** Callback fired when a QR code is detected and successfully decoded */
  onScan: (decodedText: string) => void;
  /** Initial camera active state (default: true) */
  defaultActive?: boolean;
  /** Optional title override */
  title?: string;
  /** Cooldown in milliseconds between recognizing the same code twice (default: 2500ms) */
  cooldownMs?: number;
  /** Play synthesized high POS beep chime on successful scan (default: true) */
  enableBeep?: boolean;
  /** Optional simulated test payload generator for demo / testing environments */
  samplePayload?: string;
}

/**
 * Play a synthesized 880Hz POS scanner chime tone via Web Audio API.
 * Zero external audio assets, instant hardware-like feedback.
 */
function playScannerBeep() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // 880 Hz crisp high beep
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // AudioContext blocked or not allowed by browser policy; silently ignore
  }
}

export function CameraQrScanner({
  onScan,
  defaultActive = true,
  title,
  cooldownMs = 2500,
  enableBeep = true,
  samplePayload,
}: CameraQrScannerProps) {
  const { language } = useLanguage();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [active, setActive] = useState(defaultActive);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [cameraStatus, setCameraStatus] = useState<
    "idle" | "starting" | "running" | "denied" | "error" | "unsupported"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedValueRef = useRef<string | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Stop active camera stream tracks
  const stopStream = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Handle successful scan event with cooldown check and feedback
  const handleDecodedCode = useCallback(
    (codeText: string) => {
      const now = Date.now();
      if (
        codeText === lastScannedValueRef.current &&
        now - lastScannedTimeRef.current < cooldownMs
      ) {
        return; // Ignore duplicate scan within cooldown window
      }

      lastScannedTimeRef.current = now;
      lastScannedValueRef.current = codeText;
      setLastScannedCode(codeText);

      // Trigger optical green flash
      setFlash(true);
      setTimeout(() => setFlash(false), 500);

      // Play chime
      if (enableBeep) {
        playScannerBeep();
      }

      // Propagate scan to parent
      onScan(codeText);
    },
    [cooldownMs, enableBeep, onScan]
  );

  // Main video scanning loop using jsQR
  const startScanLoop = useCallback(() => {
    const scanFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;

        if (width > 0 && height > 0) {
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const code = jsQR(imageData.data, width, height, {
              inversionAttempts: "dontInvert",
            });

            if (code && code.data) {
              handleDecodedCode(code.data);
            }
          }
        }
      }

      if (activeStreamRef.current) {
        animFrameIdRef.current = requestAnimationFrame(scanFrame);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(scanFrame);
  }, [handleDecodedCode]);

  // Request camera and initialize video stream
  const startCamera = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unsupported");
      return;
    }

    stopStream();
    setCameraStatus("starting");
    setErrorMessage(null);

    try {
      // Query available devices
      try {
        const devList = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devList.filter((d) => d.kind === "videoinput");
        setDevices(videoInputs);
      } catch {
        // Enumerate not critical
      }

      // Build video constraints
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // If ideal constraints failed (e.g. overconstrained on desktop webcams), retry generic
        if (selectedDeviceId || facingMode) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw err;
        }
      }

      activeStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }

      setCameraStatus("running");
      startScanLoop();
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (errorObj.name === "NotAllowedError" || errorObj.name === "PermissionDeniedError") {
        setCameraStatus("denied");
        setErrorMessage(
          language === "en"
            ? "Camera access denied. Please grant permission in browser settings."
            : "Quyền truy cập Camera bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt."
        );
      } else {
        setCameraStatus("error");
        setErrorMessage(
          errorObj.message ||
            (language === "en"
              ? "Unable to initialize camera hardware."
              : "Không thể khởi động thiết bị camera.")
        );
      }
    }
  }, [facingMode, language, selectedDeviceId, startScanLoop, stopStream]);

  // Manage camera lifecycle based on active flag
  useEffect(() => {
    let isCancelled = false;

    if (active) {
      const timer = setTimeout(() => {
        if (!isCancelled) {
          void startCamera();
        }
      }, 0);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
        stopStream();
      };
    }

    stopStream();
    const timer = setTimeout(() => {
      if (!isCancelled) {
        setCameraStatus("idle");
      }
    }, 0);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      stopStream();
    };
  }, [active, startCamera, stopStream]);

  // Flip front/rear facing lens
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    setSelectedDeviceId(undefined);
  };

  // Decode QR code from an uploaded or dropped image file
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imgData.data, img.width, img.height);
          if (code && code.data) {
            handleDecodedCode(code.data);
          } else {
            alert(
              language === "en"
                ? "No valid QR code found in the selected image."
                : "Không tìm thấy mã QR hợp lệ trong ảnh vừa chọn."
            );
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = "";
  };

  // Trigger simulated test scan for automated test runs & QA
  const handleTriggerTestScan = (testValue?: string) => {
    const payload =
      testValue ||
      samplePayload ||
      JSON.stringify({
        kind: "SPORTHUB_GATE_ACCESS",
        memberId: "member@sporthub.com",
        name: "Nguyễn Văn Hội Viên",
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 8),
      });

    handleDecodedCode(payload);
  };

  return (
    <div
      className={styles.scannerContainer}
      role="region"
      aria-label={language === "en" ? "Optical QR Camera Scanner" : "Máy quét Camera mã QR"}
    >
      {/* Header bar */}
      <div className={styles.scannerHeader}>
        <div className={styles.scannerTitleGroup}>
          <span
            className={`${styles.scannerLiveDot} ${
              cameraStatus === "running" ? "" : styles.scannerLiveDotPaused
            }`}
            aria-hidden="true"
          />
          <h4 className={styles.scannerTitleText}>
            <IconCamera size={16} />
            {title ||
              (language === "en"
                ? "Live Camera QR Scanner"
                : "Camera Quét Mã QR Trực Tiếp")}
          </h4>
        </div>

        <div className={styles.scannerControls}>
          {devices.length > 1 && (
            <button
              type="button"
              className={styles.controlBtn}
              onClick={toggleFacingMode}
              title={language === "en" ? "Switch camera lens" : "Đổi camera"}
            >
              <IconSwitchCamera size={14} />
              <span>{facingMode === "environment" ? "Rear" : "Front"}</span>
            </button>
          )}

          <button
            type="button"
            className={`${styles.controlBtn} ${active ? styles.controlBtnActive : ""}`}
            onClick={() => setActive(!active)}
            title={
              active
                ? language === "en"
                  ? "Pause camera feed"
                  : "Tạm dừng camera"
                : language === "en"
                  ? "Resume camera feed"
                  : "Mở lại camera"
            }
          >
            {active ? <IconCameraOff size={14} /> : <IconCamera size={14} />}
            <span>
              {active
                ? language === "en"
                  ? "Pause"
                  : "Tạm dừng"
                : language === "en"
                  ? "Start Camera"
                  : "Bật Camera"}
            </span>
          </button>
        </div>
      </div>

      {/* Viewport Viewfinder */}
      <div className={styles.viewportWrapper}>
        <video
          ref={videoRef}
          className={styles.videoElement}
          muted
          playsInline
          style={{ display: cameraStatus === "running" ? "block" : "none" }}
        />

        {/* Offscreen Canvas for jsQR image frame capture */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Optical Green Flash on Decode */}
        {flash && <div className={styles.flashOverlay} aria-hidden="true" />}

        {/* HUD Targeting Reticle & Laser Scanline */}
        {cameraStatus === "running" && (
          <div className={styles.reticleFrame} aria-hidden="true">
            <span className={`${styles.reticleCorner} ${styles.topLeft}`} />
            <span className={`${styles.reticleCorner} ${styles.topRight}`} />
            <span className={`${styles.reticleCorner} ${styles.bottomLeft}`} />
            <span className={`${styles.reticleCorner} ${styles.bottomRight}`} />
            <span className={styles.laserBeam} />
          </div>
        )}

        {/* Standby / Error / Permission Views */}
        {cameraStatus === "starting" && (
          <div className={styles.standbyCard}>
            <div className={styles.standbyIcon}>
              <IconCamera size={26} />
            </div>
            <p className={styles.standbyTitle}>
              {language === "en"
                ? "Connecting camera hardware..."
                : "Đang kết nối camera..."}
            </p>
          </div>
        )}

        {cameraStatus === "idle" && (
          <div className={styles.standbyCard}>
            <div className={styles.standbyIcon}>
              <IconCameraOff size={26} />
            </div>
            <p className={styles.standbyTitle}>
              {language === "en"
                ? "Camera Scanner on Standby"
                : "Camera đang ở chế độ chờ"}
            </p>
            <p className={styles.standbyHint}>
              {language === "en"
                ? "Click 'Start Camera' above to activate live QR detection."
                : "Bấm 'Bật Camera' phía trên để bắt đầu quét mã QR."}
            </p>
            <button
              type="button"
              className="btn btn--sm"
              style={{
                background: "var(--brand-500, #1a76b8)",
                color: "#ffffff",
                borderRadius: 6,
                fontWeight: 600,
              }}
              onClick={() => setActive(true)}
            >
              {language === "en" ? "Turn Camera On" : "Bật Camera Ngay"}
            </button>
          </div>
        )}

        {cameraStatus === "denied" && (
          <div className={styles.standbyCard}>
            <div className={styles.standbyIcon} style={{ color: "#ef4444" }}>
              <IconCameraOff size={26} />
            </div>
            <p className={styles.standbyTitle}>
              {language === "en" ? "Camera Access Denied" : "Chưa cấp quyền Camera"}
            </p>
            <p className={styles.standbyHint}>
              {errorMessage ||
                (language === "en"
                  ? "Please grant camera permission in your browser URL bar."
                  : "Vui lòng cho phép quyền Camera trên thanh địa chỉ trình duyệt.")}
            </p>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => void startCamera()}
            >
              {language === "en" ? "Retry Camera" : "Thử lại"}
            </button>
          </div>
        )}

        {cameraStatus === "error" && (
          <div className={styles.standbyCard}>
            <div className={styles.standbyIcon} style={{ color: "#f59e0b" }}>
              <IconCameraOff size={26} />
            </div>
            <p className={styles.standbyTitle}>
              {language === "en" ? "Camera Unavailable" : "Camera không khả dụng"}
            </p>
            <p className={styles.standbyHint}>
              {errorMessage ||
                (language === "en"
                  ? "No video input detected or device in use by another app."
                  : "Không tìm thấy thiết bị video hoặc camera đang được ứng dụng khác dùng.")}
            </p>
          </div>
        )}

        {cameraStatus === "unsupported" && (
          <div className={styles.standbyCard}>
            <div className={styles.standbyIcon} style={{ color: "#f59e0b" }}>
              <IconCameraOff size={26} />
            </div>
            <p className={styles.standbyTitle}>
              {language === "en" ? "Webcam API Unsupported" : "Trình duyệt không hỗ trợ Camera"}
            </p>
            <p className={styles.standbyHint}>
              {language === "en"
                ? "Use the file upload or manual search below to verify members."
                : "Dùng tải ảnh QR hoặc nhập tìm kiếm hội viên bên dưới."}
            </p>
          </div>
        )}
      </div>

      {/* Scanner Footer with Hardware Status and Alternative Scan Triggers */}
      <div className={styles.scannerFooter}>
        <div className={styles.footerStatus}>
          <span style={{ fontWeight: 600, color: "#ffffff" }}>
            {cameraStatus === "running"
              ? language === "en"
                ? "Align QR within targeting brackets"
                : "Hướng mã QR vào khung ngắm"
              : language === "en"
                ? "Standby"
                : "Tạm dừng"}
          </span>
          {lastScannedCode && (
            <span
              style={{
                color: "var(--ok-400, #4ade80)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <IconCheck size={12} strokeWidth={2.5} />
              {language === "en" ? "Last scan recognized" : "Đã nhận mã"}
            </span>
          )}
        </div>

        <div className={styles.footerActions}>
          {/* File Upload QR Trigger */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleImageUpload}
          />
          <button
            type="button"
            className={styles.testScanBtn}
            onClick={() => fileInputRef.current?.click()}
            title={language === "en" ? "Upload QR image file" : "Tải ảnh mã QR"}
          >
            <IconUpload size={12} style={{ marginRight: 4 }} />
            {language === "en" ? "Scan File" : "Tải ảnh QR"}
          </button>

          {/* Simulated scan for quick testing or Playwright */}
          <button
            type="button"
            className={styles.testScanBtn}
            onClick={() => handleTriggerTestScan()}
            title={
              language === "en"
                ? "Simulate member QR pass scan"
                : "Mô phỏng quét mã QR hội viên"
            }
          >
            <IconQrCode size={12} style={{ marginRight: 4 }} />
            {language === "en" ? "Test QR Scan" : "Mô phỏng quét"}
          </button>
        </div>
      </div>
    </div>
  );
}
