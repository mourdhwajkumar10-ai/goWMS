import { useState, useRef, useEffect, useCallback } from "react";

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}

export default function CameraScanner({ open, onClose, onScan }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animRef = useRef<number>(0);
  const closedRef = useRef(false);
  const [torchOn, setTorchOn] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  const handleClose = useCallback(() => {
    closedRef.current = true;
    stopStream();
    setTorchOn(false);
    setScanning(false);
    setError("");
    onClose();
  }, [stopStream, onClose]);

  const handleDetected = useCallback(
    (value: string) => {
      if (closedRef.current) return;
      navigator.vibrate?.([100, 50, 100]);
      stopStream();
      onScan(value);
    },
    [stopStream, onScan]
  );

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
    if (!open) return;
    closedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled || closedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const BD = (window as any).BarcodeDetector;
        if (BD) {
          detectorRef.current = new BD({
            formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "code_39", "itf", "codabar"],
          });
          setScanning(true);
          const detect = async () => {
            if (closedRef.current || !detectorRef.current || !videoRef.current) return;
            try {
              const results = await detectorRef.current.detect(videoRef.current);
              if (results.length > 0) { handleDetected(results[0].rawValue); return; }
            } catch {}
            animRef.current = requestAnimationFrame(detect);
          };
          animRef.current = requestAnimationFrame(detect);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.name === "NotAllowedError" ? "Camera permission denied" : e.message || "Camera error");
      }
    })();

    return () => { cancelled = true; stopStream(); };
  }, [open, stopStream, handleDetected]);

  if (!open) return null;

  return (
    <div className="cam-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="cam-modal">
        <div className="cam-header">
          <span className="cam-title">Scan Barcode</span>
          <button className="cam-close" onClick={handleClose}>✕</button>
        </div>
        <div className="cam-viewport">
          <video ref={videoRef} className="cam-video" playsInline muted />
          <div className="cam-crosshair">
            <div className="cam-crosshair-line cam-crosshair-tl" />
            <div className="cam-crosshair-line cam-crosshair-tr" />
            <div className="cam-crosshair-line cam-crosshair-bl" />
            <div className="cam-crosshair-line cam-crosshair-br" />
          </div>
          {scanning && <div className="cam-scan-line" />}
          {error && <div className="cam-error">{error}</div>}
        </div>
        <div className="cam-footer">
          <button className={`cam-torch ${torchOn ? "on" : ""}`} onClick={toggleTorch}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2v1M15 9.354a4 4 0 1 0-5.646 5.646" /></svg>
            {torchOn ? "Torch On" : "Torch Off"}
          </button>
          <div className="cam-hint">{detectorRef.current ? "Point camera at barcode" : "Detecting..."}</div>
        </div>
      </div>
    </div>
  );
}
