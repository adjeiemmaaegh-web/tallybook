import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

interface ScanResult { rawValue?: string }
interface ScannerInstance { detect(source: HTMLVideoElement): Promise<ScanResult[]> }
type DetectorConstructor = new (options?: { formats?: string[] }) => ScannerInstance;

/** Optional browser camera integration. No frames or images leave the device. */
export function CameraBarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanCallback = useRef(onScan);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => { scanCallback.current = onScan; }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    let frame = 0;
    let busy = false;
    const stop = () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    };
    async function initialize() {
      const Detector = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!Detector) { setError("Camera barcode recognition is unavailable in this browser. Use the SKU/barcode field instead."); return; }
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { setError("Camera scanning requires browser camera access on HTTPS or localhost. Use manual entry instead."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) { stop(); return; }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setReady(true);
        const detector = new Detector();
        const tick = async () => {
          if (cancelled) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              const results = await detector.detect(video);
              const code = results.find((result) => result.rawValue?.trim())?.rawValue?.trim();
              if (code && !cancelled) { stop(); scanCallback.current(code); return; }
            } catch { if (!cancelled) setError("Could not recognize the barcode. Try manual entry."); stop(); return; }
            finally { busy = false; }
          }
          if (!cancelled) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Camera permission was denied. You can still scan with a USB scanner or type a code." : "Camera could not start. Use manual barcode entry instead.");
        stream?.getTracks().forEach((track) => track.stop());
      }
    }
    void initialize();
    return stop;
  }, []);

  return <div className="rounded-lg border p-3 space-y-3" role="region" aria-label="Camera barcode scanner">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold flex items-center gap-2"><Camera className="h-4 w-4" /> Scan a product barcode</span><button className="secondary-action min-h-11" type="button" onClick={onClose}><CameraOff className="h-4 w-4" /> Close camera</button></div>
    <video ref={videoRef} muted playsInline autoPlay aria-label="Live barcode camera preview" className="w-full max-h-64 rounded-lg bg-black object-contain" />
    <p className="text-sm" role="status">{error || (ready ? "Hold the product barcode in view. Recognition runs on this device." : "Requesting camera access…")}</p>
  </div>;
}
