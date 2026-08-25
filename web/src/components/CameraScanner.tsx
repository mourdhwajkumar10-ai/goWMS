import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import "../styles/receiving-wizard.css";
import { cameraErrorMessage } from "../utils/receivingData";
import type { CameraState } from "../utils/receivingData";

export type ScanOutcome = "success" | "error";

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void | boolean | ScanOutcome | Promise<void | boolean | ScanOutcome>;
  continuous?: boolean;
  embedded?: boolean;
  /** Scanmaster RF layout — video + brackets only, no HUD chrome */
  minimal?: boolean;
  title?: string;
  footer?: ReactNode;
}

function outcomeOk(result: void | boolean | ScanOutcome): boolean {
  return result !== false && result !== "error";
}

function detachVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  try { video.pause(); } catch {}
  video.srcObject = null;
  video.removeAttribute("src");
  try { video.load(); } catch {}
}

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.enabled = false; } catch {}
    try { track.stop(); } catch {}
  }
}

export default function CameraScanner({
  open,
  onClose,
  onScan,
  continuous = true,
  embedded = false,
  minimal = false,
  title = "QR Code Scanner",
  footer,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animRef = useRef<number>(0);
  const sessionRef = useRef(0);
  const cameraOnRef = useRef(true);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const continuousRef = useRef(continuous);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;
  continuousRef.current = continuous;

  const [torchOn, setTorchOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraState, setCameraState] = useState<CameraState>("starting");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const facingRef = useRef<"environment" | "user">("environment");
  const deviceIdRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [screenFlash, setScreenFlash] = useState<"success" | "error" | null>(null);
  const [lastCode, setLastCode] = useState("");
  const [gen, setGen] = useState(0);

  const killCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = 0;
    detectorRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    stopTracks(stream);
    detachVideo(videoRef.current);
  }, []);

  const bumpSession = useCallback(() => {
    sessionRef.current += 1;
    busyRef.current = false;
    killCamera();
  }, [killCamera]);

  const handleClose = useCallback(() => {
    cameraOnRef.current = false;
    bumpSession();
    setTorchOn(false);
    setScanning(false);
    setCameraOn(false);
    setError("");
    setScreenFlash(null);
    setLastCode("");
    onCloseRef.current();
  }, [bumpSession]);

  const handleRestart = useCallback(() => {
    bumpSession();
    cameraOnRef.current = true;
    lastCodeRef.current = null;
    setTorchOn(false);
    setScanning(false);
    setError("");
    setScreenFlash(null);
    setLastCode("");
    setCameraState("starting");
    setCameraOn(true);
    setGen((n) => n + 1);
  }, [bumpSession]);

  const toggleCamera = useCallback(() => {
    if (cameraOnRef.current) {
      cameraOnRef.current = false;
      bumpSession();
      setTorchOn(false);
      setScanning(false);
      setError("");
      setScreenFlash(null);
      setCameraOn(false);
      setCameraState("manual");
      return;
    }
    cameraOnRef.current = true;
    setError("");
    setCameraState("starting");
    setCameraOn(true);
    setGen((n) => n + 1);
  }, [bumpSession]);

  const flipCamera = useCallback(async () => {
    const nextFacing: "environment" | "user" = facingRef.current === "environment" ? "user" : "environment";
    facingRef.current = nextFacing;
    setFacing(nextFacing);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length > 1) {
        const current = streamRef.current?.getVideoTracks()[0]?.getSettings()?.deviceId || deviceIdRef.current;
        const idx = Math.max(0, cams.findIndex((c) => c.deviceId === current));
        deviceIdRef.current = cams[(idx + 1) % cams.length].deviceId;
      } else {
        deviceIdRef.current = undefined;
      }
    } catch {
      deviceIdRef.current = undefined;
    }
    setTorchOn(false);
    if (cameraOnRef.current) {
      bumpSession();
      cameraOnRef.current = true;
      setGen((n) => n + 1);
    }
  }, [bumpSession]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities() as any;
    if (!caps.torch) return;
    const next = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: next } as any] });
    setTorchOn(next);
  }, [torchOn]);

  useEffect(() => {
    if (!open || !cameraOn) {
      killCamera();
      setScanning(false);
      setTorchOn(false);
      if (open && !cameraOn) setCameraState("manual");
      return;
    }

    cameraOnRef.current = true;
    const session = sessionRef.current;
    lastCodeRef.current = null;
    let cancelled = false;

    const stale = () => cancelled || session !== sessionRef.current || !cameraOnRef.current;

    (async () => {
      try {
        setCameraState("starting");
        const host = typeof window !== "undefined" ? window.location.hostname : "";
        const insecure =
          typeof window !== "undefined" &&
          !window.isSecureContext &&
          host !== "localhost" &&
          host !== "127.0.0.1";
        if (insecure) {
          if (!stale()) {
            setCameraState("unsupported");
            setError(cameraErrorMessage("InsecureContext"));
          }
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          if (!stale()) {
            setCameraState("unsupported");
            setError(cameraErrorMessage("NoMediaDevices"));
          }
          return;
        }
        const chosenId = deviceIdRef.current;
        const video: MediaTrackConstraints = chosenId
          ? { deviceId: { exact: chosenId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: facingRef.current }, width: { ideal: 1280 }, height: { ideal: 720 } };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        } catch {
          deviceIdRef.current = undefined;
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingRef.current }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        }
        if (stale()) {
          stopTracks(stream);
          return;
        }
        streamRef.current = stream;
        setCameraState("ready");
        const settings = stream.getVideoTracks()[0]?.getSettings();
        if (settings?.deviceId) deviceIdRef.current = settings.deviceId;
        if (settings?.facingMode === "user" || settings?.facingMode === "environment") {
          facingRef.current = settings.facingMode;
          setFacing(settings.facingMode);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play().catch(() => undefined);
        }
        if (stale()) {
          stopTracks(stream);
          detachVideo(videoRef.current);
          if (streamRef.current === stream) streamRef.current = null;
          return;
        }

        const BD = (window as any).BarcodeDetector;
        if (BD) {
          detectorRef.current = new BD({
            formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "code_39", "itf", "codabar"],
          });
          setScanning(true);

          const detect = async () => {
            if (stale() || !detectorRef.current || !videoRef.current) return;
            if (!busyRef.current) {
              try {
                const results = await detectorRef.current.detect(videoRef.current);
                if (stale()) return;
                if (results.length > 0 && results[0].rawValue) {
                  const value = String(results[0].rawValue);
                  const now = Date.now();
                  const last = lastCodeRef.current;
                  if (!last || last.value !== value || now - last.at >= 1200) {
                    busyRef.current = true;
                    lastCodeRef.current = { value, at: now };
                    navigator.vibrate?.(10);
                    setLastCode(value);
                    void (async () => {
                      try {
                        const result = await onScanRef.current(value);
                        if (stale()) return;
                        const ok = outcomeOk(result);
                        setScreenFlash(ok ? "success" : "error");
                        window.setTimeout(() => setScreenFlash(null), 900);
                      } catch {
                        if (!stale()) {
                          setScreenFlash("error");
                          window.setTimeout(() => setScreenFlash(null), 900);
                        }
                      } finally {
                        busyRef.current = false;
                        if (!continuousRef.current && !stale()) {
                          handleClose();
                        }
                      }
                    })();
                  }
                }
              } catch {}
            }
            if (!stale()) {
              animRef.current = requestAnimationFrame(() => { void detect(); });
            }
          };
          animRef.current = requestAnimationFrame(() => { void detect(); });
        }
      } catch (e: any) {
        if (!stale()) {
          const name = String(e?.name ?? "");
          if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            setCameraState("permission_denied");
          } else if (name === "NotFoundError") {
            setCameraState("no_camera");
          } else if (name === "NotReadableError") {
            setCameraState("busy");
          } else if (name === "SecurityError") {
            setCameraState("unsupported");
          } else {
            setCameraState("unsupported");
          }
          setError(cameraErrorMessage(e?.name));
        }
      }
    })();

    return () => {
      cancelled = true;
      killCamera();
    };
  }, [open, gen, cameraOn, killCamera]);

  useEffect(() => () => {
    cameraOnRef.current = false;
    bumpSession();
  }, [bumpSession]);

  if (!open) return null;

  const status = !cameraOn
    ? "Camera off"
    : error
      ? error
      : screenFlash === "success"
        ? "Scan Completed"
        : screenFlash === "error"
          ? "Scan failed"
          : scanning
            ? "Scanning..."
            : "Starting camera...";
  const statusKind = !cameraOn
    ? "idle"
    : error || screenFlash === "error"
      ? "error"
      : screenFlash === "success"
        ? "success"
        : "idle";

  return (
    <div className={`cam-overlay${embedded ? " cam-embedded" : ""}${minimal ? " cam-minimal" : ""}`}>
      <div className="cam-page">
        {!embedded && (
          <header className="cam-header">
            <h1 className="cam-title">{title}</h1>
          </header>
        )}

        <div className="cam-stage">
          <div className="cam-viewport">
            <video
              ref={videoRef}
              className={`cam-video${facing === "user" ? " cam-video-mirror" : ""}`}
              playsInline
              muted
            />
            {!cameraOn && (
              <div className="cam-off-mask">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                  <path d="M2 2l20 20" />
                </svg>
                <span>Camera off</span>
                <span className="cam-fallback-hint">Type the code in the scan field below</span>
              </div>
            )}
            {cameraOn && error && (
              <div className="cam-off-mask cam-fallback-mask" role="status">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <path d="M7 12h10" />
                </svg>
                <span>{error}</span>
                <span className="cam-fallback-hint">Type the code in the scan field below</span>
              </div>
            )}
            {screenFlash && <div className={`cam-screen-flash ${screenFlash}`} />}
            {!error && cameraOn && (
              <div className="cam-crosshair">
                <div className="cam-crosshair-line cam-crosshair-tl" />
                <div className="cam-crosshair-line cam-crosshair-tr" />
                <div className="cam-crosshair-line cam-crosshair-bl" />
                <div className="cam-crosshair-line cam-crosshair-br" />
              </div>
            )}
            {scanning && cameraOn && !error && <div className="cam-scan-line" />}
            <>
              {!minimal && (
                <div className={`cam-hud-status cam-status-${statusKind}`}>{status}</div>
              )}
              <button
                  type="button"
                  className={`cam-icon-btn cam-icon-power ${cameraOn ? "on" : ""}`}
                  onClick={toggleCamera}
                  aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
                  title={cameraOn ? "Turn camera off" : "Turn camera on"}
                >
                  {cameraOn ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18.6 18.6A9 9 0 0 1 5.4 5.4" />
                      <path d="M9 9v.01M15 15v.01" />
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <path d="M2 2l20 20" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className={`cam-icon-btn cam-icon-torch ${torchOn ? "on" : ""}`}
                  onClick={toggleTorch}
                  disabled={!cameraOn || !!error}
                  aria-label={torchOn ? "Flash on" : "Flash off"}
                  title={torchOn ? "Flash on" : "Flash"}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2v1M15 9.354a4 4 0 1 0-5.646 5.646" /></svg>
                </button>
                {!minimal && (
                  <button
                    type="button"
                    className="cam-icon-btn cam-icon-flip"
                    onClick={() => { void flipCamera(); }}
                    aria-label="Flip camera"
                    title="Flip camera"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 1l4 4-4 4" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <path d="M7 23l-4-4 4-4" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>
                )}
              </>
            </div>
          {!minimal && (
            <div className="cam-quick">
              {footer}
              <button type="button" className="cam-restart-btn" onClick={handleRestart}>Restart scanner</button>
            </div>
          )}
          {!minimal && lastCode && <div className="cam-last-code">{lastCode}</div>}
        </div>

        {!embedded && (
          <footer className="cam-sides">
            <button type="button" className="cam-side-btn" onClick={handleRestart}>Restart</button>
            <button type="button" className="cam-side-btn" onClick={handleClose}>Cancel</button>
          </footer>
        )}
      </div>
    </div>
  );
}
