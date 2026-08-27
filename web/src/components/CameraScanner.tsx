import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { Camera, CameraOff, Flashlight, FlashlightOff, RotateCcw, AlertCircle } from "lucide-react";
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

const CAMERA_PREF_KEY = "gowms_camera_on";
function readCameraPref(): boolean {
  try { const v = localStorage.getItem(CAMERA_PREF_KEY); return v === null ? true : v === "1"; } catch { return true; }
}
function writeCameraPref(on: boolean) { try { localStorage.setItem(CAMERA_PREF_KEY, on ? "1" : "0"); } catch {} }

/* ── Floating icon button style ── */
const floatBtn = (bg: string): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: 10, border: 'none',
  background: `${bg}cc`, backdropFilter: 'blur(8px)',
  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', transition: 'transform 120ms ease-out',
});

/* ── Premium scan viewport ── */
function ScanViewport({
  cameraOn, error, scanning, screenFlash, facing, videoRef,
  onToggleCamera, onToggleTorch, torchOn, onFlipCamera, minimal,
}: {
  cameraOn: boolean; error: string; scanning: boolean;
  screenFlash: "success" | "error" | null; facing: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  onToggleCamera: () => void; onToggleTorch: () => void;
  torchOn: boolean; onFlipCamera: () => void; minimal: boolean;
}) {
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '4/3', maxHeight: 240,
      borderRadius: 16, overflow: 'hidden',
      background: cameraOn && !error ? '#000' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e1b4b 100%)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
    }}>
      {/* Video */}
      <video ref={videoRef} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: facing === 'user' ? 'scaleX(-1)' : 'none',
        display: cameraOn && !error ? 'block' : 'none',
      }} playsInline muted />

      {/* Permission denied overlay */}
      {cameraOn && error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98))',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertCircle size={28} style={{ color: '#f87171' }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.4 }}>Camera unavailable</div>
          <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 240, lineHeight: 1.5 }}>
            {error}. You can still type barcodes manually below.
          </div>
        </div>
      )}

      {/* Camera off — scan frame with brackets */}
      {!cameraOn && !error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center',
        }}>
          <div style={{ width: 80, height: 80, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTop: '3px solid #3b82f6', borderLeft: '3px solid #3b82f6', borderTopLeftRadius: 4 }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTop: '3px solid #3b82f6', borderRight: '3px solid #3b82f6', borderTopRightRadius: 4 }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottom: '3px solid #3b82f6', borderLeft: '3px solid #3b82f6', borderBottomLeftRadius: 4 }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottom: '3px solid #3b82f6', borderRight: '3px solid #3b82f6', borderBottomRightRadius: 4 }} />
            <Camera size={28} style={{ color: '#64748b' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>Tap to enable camera</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Or type barcodes manually below</div>
        </div>
      )}

      {/* Scanning — crosshair + scan line */}
      {cameraOn && !error && scanning && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', top: 12, left: 12, width: 28, height: 28, borderTop: '3px solid #3b82f6', borderLeft: '3px solid #3b82f6' }} />
          <div style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderTop: '3px solid #3b82f6', borderRight: '3px solid #3b82f6' }} />
          <div style={{ position: 'absolute', bottom: 12, left: 12, width: 28, height: 28, borderBottom: '3px solid #3b82f6', borderLeft: '3px solid #3b82f6' }} />
          <div style={{ position: 'absolute', bottom: 12, right: 12, width: 28, height: 28, borderBottom: '3px solid #3b82f6', borderRight: '3px solid #3b82f6' }} />
          <div style={{
            position: 'absolute', left: 16, right: 16, height: 2,
            background: 'linear-gradient(90deg, transparent, #7c3aed, transparent)',
            boxShadow: '0 0 12px rgba(124,58,237,0.6)',
            animation: 'cam-scan 2s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* Screen flash */}
      {screenFlash && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: screenFlash === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
          animation: 'cam-flash-fade 400ms ease-out forwards',
        }} />
      )}

      {/* Floating action buttons */}
      {!minimal && (
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', zIndex: 6 }}>
          <button onClick={onToggleCamera} style={floatBtn(cameraOn ? '#ef4444' : '#64748b')} title={cameraOn ? 'Turn camera off' : 'Turn camera on'}>
            {cameraOn ? <CameraOff size={16} /> : <Camera size={16} />}
          </button>
          <button onClick={onToggleTorch} disabled={!cameraOn || !!error} style={{ ...floatBtn(torchOn ? '#f59e0b' : '#64748b'), opacity: (!cameraOn || !!error) ? 0.4 : 1 }} title={torchOn ? 'Flash on' : 'Flash off'}>
            {torchOn ? <Flashlight size={16} /> : <FlashlightOff size={16} />}
          </button>
          <button onClick={onFlipCamera} style={floatBtn('#64748b')} title="Flip camera">
            <RotateCcw size={16} />
          </button>
        </div>
      )}

      {/* Scanning indicator */}
      {cameraOn && !error && !minimal && (
        <div style={{
          position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
          fontSize: 11, fontWeight: 600, color: scanning ? '#4ade80' : '#94a3b8',
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}>
          {scanning ? '● Scanning...' : 'Starting camera...'}
        </div>
      )}

      <style>{`
        @keyframes cam-scan { 0%, 100% { top: 12px; opacity: 1; } 50% { top: calc(100% - 14px); opacity: 0.6; } }
        @keyframes cam-flash-fade { 0% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}

export default function CameraScanner({
  open, onClose, onScan, continuous = true, embedded = false,
  minimal = false, title = "QR Code Scanner", footer,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animRef = useRef<number>(0);
  const sessionRef = useRef(0);
  const cameraOnRef = useRef(readCameraPref());
  const busyRef = useRef(false);
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const continuousRef = useRef(continuous);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;
  continuousRef.current = continuous;

  const [torchOn, setTorchOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(readCameraPref);
  const [_cameraState, setCameraState] = useState<CameraState>("starting");
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
    setTorchOn(false); setScanning(false); setCameraOn(false);
    setError(""); setScreenFlash(null); setLastCode("");
    onCloseRef.current();
  }, [bumpSession]);

  const handleRestart = useCallback(() => {
    bumpSession();
    cameraOnRef.current = true;
    lastCodeRef.current = null;
    setTorchOn(false); setScanning(false); setError("");
    setScreenFlash(null); setLastCode("");
    setCameraState("starting"); setCameraOn(true);
    setGen((n) => n + 1);
  }, [bumpSession]);

  const toggleCamera = useCallback(() => {
    if (cameraOnRef.current) {
      cameraOnRef.current = false; writeCameraPref(false);
      bumpSession(); setTorchOn(false); setScanning(false);
      setError(""); setScreenFlash(null); setCameraOn(false);
      setCameraState("manual"); return;
    }
    cameraOnRef.current = true; writeCameraPref(true);
    setError(""); setCameraState("starting");
    setCameraOn(true); setGen((n) => n + 1);
  }, [bumpSession]);

  const flipCamera = useCallback(async () => {
    const next: "environment" | "user" = facingRef.current === "environment" ? "user" : "environment";
    facingRef.current = next; setFacing(next);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length > 1) {
        const cur = streamRef.current?.getVideoTracks()[0]?.getSettings()?.deviceId || deviceIdRef.current;
        const idx = Math.max(0, cams.findIndex((c) => c.deviceId === cur));
        deviceIdRef.current = cams[(idx + 1) % cams.length].deviceId;
      } else { deviceIdRef.current = undefined; }
    } catch { deviceIdRef.current = undefined; }
    setTorchOn(false);
    if (cameraOnRef.current) { bumpSession(); cameraOnRef.current = true; setGen((n) => n + 1); }
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
      killCamera(); setScanning(false); setTorchOn(false);
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
        const insecure = typeof window !== "undefined" && !window.isSecureContext && host !== "localhost" && host !== "127.0.0.1";
        if (insecure) { if (!stale()) { setCameraState("unsupported"); setError(cameraErrorMessage("InsecureContext")); } return; }
        if (!navigator.mediaDevices?.getUserMedia) { if (!stale()) { setCameraState("unsupported"); setError(cameraErrorMessage("NoMediaDevices")); } return; }
        const chosenId = deviceIdRef.current;
        const video: MediaTrackConstraints = chosenId
          ? { deviceId: { exact: chosenId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: facingRef.current }, width: { ideal: 1280 }, height: { ideal: 720 } };
        let stream: MediaStream;
        try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); } catch {
          deviceIdRef.current = undefined;
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingRef.current }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        }
        if (stale()) { stopTracks(stream); return; }
        streamRef.current = stream; setCameraState("ready");
        const settings = stream.getVideoTracks()[0]?.getSettings();
        if (settings?.deviceId) deviceIdRef.current = settings.deviceId;
        if (settings?.facingMode === "user" || settings?.facingMode === "environment") { facingRef.current = settings.facingMode as any; setFacing(settings.facingMode as any); }
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.setAttribute("playsinline", "true"); await videoRef.current.play().catch(() => undefined); }
        if (stale()) { stopTracks(stream); detachVideo(videoRef.current); if (streamRef.current === stream) streamRef.current = null; return; }
        const BD = (window as any).BarcodeDetector;
        if (BD) {
          detectorRef.current = new BD({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "code_39", "itf", "codabar"] });
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
                    busyRef.current = true; lastCodeRef.current = { value, at: now };
                    navigator.vibrate?.(10); setLastCode(value);
                    void (async () => {
                      try {
                        const result = await onScanRef.current(value);
                        if (stale()) return;
                        const ok = outcomeOk(result);
                        setScreenFlash(ok ? "success" : "error");
                        window.setTimeout(() => setScreenFlash(null), 900);
                      } catch { if (!stale()) { setScreenFlash("error"); window.setTimeout(() => setScreenFlash(null), 900); } }
                      finally { busyRef.current = false; if (!continuousRef.current && !stale()) handleClose(); }
                    })();
                  }
                }
              } catch {}
            }
            if (!stale()) animRef.current = requestAnimationFrame(() => { void detect(); });
          };
          animRef.current = requestAnimationFrame(() => { void detect(); });
        }
      } catch (e: any) {
        if (!stale()) {
          const name = String(e?.name ?? "");
          if (name === "NotAllowedError" || name === "PermissionDeniedError") setCameraState("permission_denied");
          else if (name === "NotFoundError") setCameraState("no_camera");
          else if (name === "NotReadableError") setCameraState("busy");
          else setCameraState("unsupported");
          setError(cameraErrorMessage(e?.name));
        }
      }
    })();
    return () => { cancelled = true; killCamera(); };
  }, [open, gen, cameraOn, killCamera]);

  useEffect(() => () => { cameraOnRef.current = false; bumpSession(); }, [bumpSession]);

  if (!open) return null;

  return (
    <div className={`cam-overlay${embedded ? " cam-embedded" : ""}${minimal ? " cam-minimal" : ""}`}>
      <div className="cam-page">
        {!embedded && (
          <header className="cam-header">
            <h1 className="cam-title">{title}</h1>
          </header>
        )}
        <div className="cam-stage" style={{ gap: 12, padding: '8px 16px' }}>
          <ScanViewport
            cameraOn={cameraOn} error={error} scanning={scanning}
            screenFlash={screenFlash} facing={facing} videoRef={videoRef}
            onToggleCamera={toggleCamera} onToggleTorch={toggleTorch}
            torchOn={torchOn} onFlipCamera={flipCamera} minimal={minimal}
          />
          {!minimal && (
            <button type="button" onClick={handleRestart} style={{
              padding: '8px 16px', borderRadius: 20, border: '1px solid #e2e8f0',
              background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <RotateCcw size={14} /> Restart scanner
            </button>
          )}
          {!minimal && lastCode && (
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', fontFamily: 'ui-monospace, monospace', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Last: {lastCode}
            </div>
          )}
          {footer}
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
