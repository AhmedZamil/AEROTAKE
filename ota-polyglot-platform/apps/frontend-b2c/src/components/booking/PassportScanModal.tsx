"use client";

import { useEffect, useRef, useState } from "react";
import {
  LuCamera,
  LuChevronLeft,
  LuImage,
  LuInfo,
  LuShield,
  LuX,
  LuZap,
} from "react-icons/lu";
import {
  captureVideoFrame,
  extractPassportFromImage,
  type PassportOcrResult,
} from "@/lib/passport-ocr";

export type PassportScanResult = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  passportNumber: string;
  /** ICAO alpha-3 from MRZ when read (e.g. BGD). */
  nationality?: string;
  expiryDate?: string;
};

type Step = "intro" | "camera" | "processing" | "done" | "failed";

export default function PassportScanModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (result: PassportScanResult) => void;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [progressLabel, setProgressLabel] = useState("Reading passport...");
  const [progress, setProgress] = useState(0);
  const [scanned, setScanned] = useState<PassportScanResult | null>(null);
  const [failMessage, setFailMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const finishingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (step !== "camera") return;
    let cancelled = false;

    async function startCamera() {
      setCameraError("");
      setCameraReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera unavailable. Use the gallery button to upload a passport photo.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        if (!cancelled) setCameraReady(true);
      } catch {
        if (!cancelled) {
          setCameraError("Camera unavailable. Use the gallery button to upload a passport photo.");
        }
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
    if (!capabilities?.torch) {
      setTorchOn((v) => !v);
      return;
    }
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchOn(next);
    }
  }

  function toScanResult(result: PassportOcrResult): PassportScanResult {
    return {
      title: result.title || "mr",
      firstName: (result.firstName || "").trim(),
      lastName: (result.lastName || "").trim(),
      gender: (result.gender || "").trim(),
      dateOfBirth: (result.dateOfBirth || "").trim(),
      passportNumber: (result.passportNumber || "").trim(),
      nationality: result.nationality?.trim() || undefined,
      expiryDate: result.expiryDate?.trim() || undefined,
    };
  }

  function hasUsableScan(result: PassportOcrResult): boolean {
    if (result.source === "failed") return false;
    const first = (result.firstName || "").trim();
    const last = (result.lastName || "").trim();
    const passport = (result.passportNumber || "").trim().toUpperCase();
    // Reject OCR junk like "PERSONAL" (from "Personal Data") — need digit(s) in the number.
    const plausiblePassport = /^[A-Z0-9]{6,12}$/.test(passport) && /\d/.test(passport);
    return Boolean((first || last) && plausiblePassport);
  }

  async function processImage(source: File | Blob | string) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setStep("processing");
    setProgress(0.05);
    setProgressLabel("Preparing image...");
    stopCamera();
    setCameraReady(false);

    try {
      const result = await extractPassportFromImage(source, (status, value) => {
        setProgressLabel(status);
        setProgress(value);
      });

      if (!hasUsableScan(result)) {
        const chars = (result.rawText || "").replace(/\s+/g, "").length;
        setFailMessage(
          chars === 0
            ? "OCR could not read any text from this image. Check lighting, fill the frame with the passport info page, or try uploading a clearer photo."
            : `Could not parse passport fields (read ${chars} characters). Use a clear photo of the full info page, including the two MRZ lines at the bottom.`,
        );
        setStep("failed");
        finishingRef.current = false;
        return;
      }

      const mapped = toScanResult(result);
      setScanned(mapped);
      // Do not call onComplete yet — wait for "Use these details" so the parent
      // applies once when the user confirms (avoids racing the form while the modal is open).
      setStep("done");
    } catch (error) {
      console.error(error);
      const detail =
        error instanceof Error && error.message
          ? ` (${error.message})`
          : "";
      setFailMessage(
        `Could not read the passport${detail}. Please try another image, or check that the device can load OCR assets.`,
      );
      setStep("failed");
      finishingRef.current = false;
    }
  }

  function handleCapture() {
    const frame = videoRef.current ? captureVideoFrame(videoRef.current) : null;
    if (!frame) {
      setFailMessage("No camera frame available. Upload a passport image instead.");
      setStep("failed");
      return;
    }
    void processImage(frame);
  }

  function handleGalleryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void processImage(file);
  }

  function handleApplyAndClose() {
    if (!scanned) return;
    onCompleteRef.current(scanned);
    onClose();
  }

  function retryScan() {
    finishingRef.current = false;
    setFailMessage("");
    setScanned(null);
    setStep("camera");
  }

  if (step === "intro") {
    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/70 sm:items-center sm:p-4">
        <div className="flex h-[min(100dvh,820px)] w-full max-w-md flex-col bg-navy text-white sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl">
          <div className="flex items-center px-4 pt-4">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
            >
              <LuChevronLeft className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight">
              Scan passport to auto-fill traveller details
            </h2>
            <p className="mt-4 text-sm leading-6 text-white/70">
              Photograph or upload the passport information page with the two MRZ code
              lines at the bottom. Reading happens on your device — we do not upload the
              image to our servers.
            </p>
            <div className="mx-auto mt-10 w-full max-w-[280px]">
              <div className="relative aspect-[3/4] rounded-xl bg-white/5 p-4">
                <CornerBrackets />
                <PassportIllustration />
              </div>
              <p className="mt-3 text-center text-xs text-white/55">Passport scan area</p>
            </div>
          </div>
          <div className="space-y-3 px-6 pb-8">
            <div className="flex items-center justify-center gap-2 rounded-lg bg-primary-strong/20 px-4 py-2.5 text-sm font-medium text-primary-tint">
              <LuShield className="h-4 w-4" />
              On-device OCR — image stays on this phone
            </div>
            <button
              type="button"
              onClick={() => setStep("camera")}
              className="btn-primary flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "done" && scanned) {
    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/70 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-2xl bg-card p-6 text-navy sm:rounded-2xl">
          <h2 className="text-lg font-bold">Passport details found</h2>
          <p className="mt-1 text-sm text-slate">
            Check these values, then use them. You can still edit the form afterward.
          </p>
          <div className="mt-4 space-y-2 rounded-xl bg-bg p-4 text-sm">
            <p>
              <span className="text-slate">Name: </span>
              <span className="font-semibold">
                {[scanned.firstName, scanned.lastName].filter(Boolean).join(" ") || "—"}
              </span>
            </p>
            <p>
              <span className="text-slate">Gender: </span>
              <span className="font-semibold capitalize">{scanned.gender || "—"}</span>
            </p>
            <p>
              <span className="text-slate">Date of birth: </span>
              <span className="font-semibold">{scanned.dateOfBirth || "—"}</span>
            </p>
            <p>
              <span className="text-slate">Passport: </span>
              <span className="font-semibold">{scanned.passportNumber || "—"}</span>
            </p>
            {scanned.expiryDate ? (
              <p>
                <span className="text-slate">Expiry: </span>
                <span className="font-semibold">{scanned.expiryDate}</span>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleApplyAndClose}
            className="btn-primary mt-5 flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold"
          >
            Use these details
          </button>
        </div>
      </div>
    );
  }

  if (step === "failed") {
    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/70 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-2xl bg-card p-6 text-navy sm:rounded-2xl">
          <h2 className="text-lg font-bold">Could not read passport</h2>
          <p className="mt-2 text-sm text-slate">{failMessage}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={retryScan}
              className="btn-primary inline-flex h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-navy"
            >
              Upload image
            </button>
          </div>
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleGalleryChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black sm:items-center sm:bg-navy/80 sm:p-4">
      <div className="relative flex h-[min(100dvh,900px)] w-full max-w-md flex-col bg-black text-white sm:h-auto sm:max-h-[92dvh] sm:overflow-hidden sm:rounded-2xl">
        <div className="relative z-10 flex items-center justify-between px-4 pt-4">
          <button
            type="button"
            aria-label="Close scan"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          >
            <LuX className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold">Passport scan</h2>
          <span className="flex h-10 w-10 items-center justify-center text-white/50" aria-hidden>
            <LuInfo className="h-5 w-5" />
          </span>
        </div>

        {step === "processing" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
            <span className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-primary-strong" />
            <p className="text-sm font-medium">{progressLabel}</p>
            <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary-strong transition-all"
                style={{ width: `${Math.max(8, Math.round(progress * 100))}%` }}
              />
            </div>
            <p className="text-center text-xs text-white/55">Reading on your device — please wait</p>
          </div>
        ) : (
          <>
            <div className="relative z-10 space-y-1 px-6 pt-4 text-center text-xs leading-5 text-white/75">
              <p>Centre the information page in the frame, then tap the shutter</p>
              <p>Or upload a clear passport photo from your gallery</p>
            </div>

            <div className="relative mx-auto mt-6 w-[min(88%,340px)] flex-1">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[#1a1a1a]">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {!cameraReady && !cameraError ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50">
                    Starting camera…
                  </div>
                ) : null}
                {cameraError ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#141414] px-6 text-center text-xs text-white/65">
                    {cameraError}
                  </div>
                ) : null}
                <CornerBrackets />
                <div
                  className="pointer-events-none absolute inset-x-6 h-0.5 bg-primary-strong shadow-[0_0_12px_var(--color-primary-strong,#0B3D5C)]"
                  style={{ animation: "b2c-passport-scan 2.2s ease-in-out infinite" }}
                />
                <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-md bg-white/85 px-2 py-2">
                  <p className="truncate font-mono text-[11px] tracking-widest text-slate">
                    P{"<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"}
                  </p>
                  <p className="truncate font-mono text-[11px] tracking-widest text-slate">
                    {"<<<<<<<<<<<<<<<"}
                  </p>
                </div>
              </div>
            </div>

            <style>{`
              @keyframes b2c-passport-scan {
                0% { top: 14%; }
                50% { top: 72%; }
                100% { top: 14%; }
              }
            `}</style>

            <div className="relative z-10 mt-auto flex items-center justify-between px-10 pt-8 pb-10">
              <button
                type="button"
                aria-label="Upload from gallery"
                onClick={() => galleryRef.current?.click()}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
              >
                <LuImage className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Capture passport"
                onClick={handleCapture}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white bg-white/10"
              >
                <span className="h-14 w-14 rounded-full bg-white" />
              </button>
              <button
                type="button"
                aria-label="Toggle flashlight"
                onClick={() => void toggleTorch()}
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  torchOn ? "bg-primary-strong text-white" : "bg-white/10 hover:bg-white/15"
                }`}
              >
                <LuZap className="h-6 w-6" />
              </button>
            </div>

            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleGalleryChange}
            />

            <div className="px-6 pb-6 text-center">
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="inline-flex items-center gap-2 text-xs text-white/55 hover:text-white"
              >
                <LuCamera className="h-3.5 w-3.5" />
                Upload passport image
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CornerBrackets() {
  return (
    <>
      <span className="pointer-events-none absolute top-3 left-3 h-8 w-8 rounded-tl-md border-t-[3px] border-l-[3px] border-primary-strong" />
      <span className="pointer-events-none absolute top-3 right-3 h-8 w-8 rounded-tr-md border-t-[3px] border-r-[3px] border-primary-strong" />
      <span className="pointer-events-none absolute bottom-3 left-3 h-8 w-8 rounded-bl-md border-b-[3px] border-l-[3px] border-primary-strong" />
      <span className="pointer-events-none absolute right-3 bottom-3 h-8 w-8 rounded-br-md border-r-[3px] border-b-[3px] border-primary-strong" />
    </>
  );
}

function PassportIllustration() {
  return (
    <div className="relative z-10 flex h-full flex-col rounded-lg border border-white/10 bg-white/10 p-3">
      <div className="flex gap-3">
        <div className="h-20 w-16 rounded bg-white/15" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-2 w-[80%] rounded bg-white/25" />
          <div className="h-2 w-[60%] rounded bg-white/20" />
          <div className="h-2 w-[66%] rounded bg-white/20" />
          <div className="h-2 w-1/2 rounded bg-white/15" />
        </div>
      </div>
      <div className="mt-auto space-y-1.5 rounded bg-white/90 px-2 py-2">
        <div className="h-2 w-full rounded bg-slate/70" />
        <div className="h-2 w-full rounded bg-slate/70" />
      </div>
    </div>
  );
}
