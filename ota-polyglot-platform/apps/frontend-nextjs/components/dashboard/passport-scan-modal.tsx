"use client";

import { useEffect, useRef, useState } from "react";
import {
  captureVideoFrame,
  extractPassportFromImage,
  type PassportOcrResult,
} from "@/lib/passport-ocr";
import {
  CameraIcon,
  ChevronLeftIcon,
  CloseIcon,
  FlashlightIcon,
  ImageIcon,
  InfoIcon,
  ShieldIcon,
} from "./icons";

export type PassportScanResult = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  passportNumber: string;
  // Raw ICAO/MRZ alpha-3 code (e.g. "BGD"), not yet converted to the
  // alpha-2 Sabre expects — see alpha3ToAlpha2 in lib/country-codes.ts,
  // applied by the caller (flight-booking-checkout.tsx's applyPassportScan).
  nationality?: string;
  // ISO yyyy-mm-dd from the MRZ, when the scan could read it.
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

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (step !== "camera") return;

    let cancelled = false;

    async function startCamera() {
      setCameraError("");
      setCameraReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera unavailable. Use the gallery button to upload a passport photo.",
        );
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
          stream.getTracks().forEach((track) => track.stop());
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
          setCameraError(
            "Camera unavailable. Use the gallery button to upload a passport photo.",
          );
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
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const capabilities = track.getCapabilities?.() as
      | { torch?: boolean }
      | undefined;
    if (!capabilities?.torch) {
      setTorchOn((value) => !value);
      return;
    }
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchOn(next);
    }
  }

  function toScanResult(result: PassportOcrResult): PassportScanResult {
    return {
      title: result.title,
      firstName: result.firstName,
      lastName: result.lastName,
      gender: result.gender,
      dateOfBirth: result.dateOfBirth,
      passportNumber: result.passportNumber,
      nationality: result.nationality,
      expiryDate: result.expiryDate,
    };
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

      if (
        result.source === "failed" ||
        (!result.firstName && !result.lastName && !result.passportNumber)
      ) {
        setFailMessage(
          "Could not read real passport data from this image. Use a clear photo of the full info page, including the 2 MRZ code lines at the bottom.",
        );
        setStep("failed");
        finishingRef.current = false;
        return;
      }

      const mapped = toScanResult(result);
      setScanned(mapped);
      onCompleteRef.current(mapped);
      setStep("done");
    } catch (error) {
      console.error(error);
      setFailMessage("OCR failed while reading the passport. Please try another image.");
      setStep("failed");
      finishingRef.current = false;
    }
  }

  function handleCapture() {
    const frame = videoRef.current ? captureVideoFrame(videoRef.current) : null;
    if (!frame) {
      setFailMessage("No camera frame available. Upload a passport image from gallery instead.");
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
    if (scanned) onCompleteRef.current(scanned);
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
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
        <div className="flex h-[min(100dvh,820px)] w-full max-w-md flex-col bg-[#121212] text-white sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl">
          <div className="flex items-center px-4 pt-4">
            <button
              type="button"
              aria-label="Go back"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <h2 className="mt-2 text-[28px] leading-tight font-bold tracking-tight">
              Scan passport to auto-fill travel info
            </h2>
            <p className="mt-4 text-[14px] leading-6 text-white/65">
              Upload or photograph the passport info page with the 2 MRZ code lines at
              the bottom. We run real OCR on your image and fill name, gender, date of
              birth, and passport number from that scan only.
            </p>

            <div className="mx-auto mt-10 w-full max-w-[280px]">
              <div className="relative aspect-[3/4] rounded-xl bg-[#1c1c1c] p-4">
                <CornerBrackets />
                <PassportIllustration />
              </div>
              <p className="mt-3 text-center text-[13px] text-white/55">
                Passport Scan Area
              </p>
            </div>
          </div>

          <div className="space-y-3 px-6 pb-8">
            <p className="text-center text-[12px] text-white/55">
              By continuing, you agree to the{" "}
              <button type="button" className="underline underline-offset-2 hover:text-white">
                Privacy Notice
              </button>{" "}
              for passport scan.
            </p>
            <div className="flex items-center justify-center gap-2 rounded-lg bg-[#163a3a] px-4 py-2.5 text-[13px] font-medium text-[#7dd3c7]">
              <ShieldIcon className="h-4 w-4" />
              Your privacy is protected
            </div>
            <button
              type="button"
              onClick={() => setStep("camera")}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#3b82f6] text-[16px] font-semibold text-black hover:bg-[#2563eb]"
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
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-2xl bg-white p-6 text-aerotake-navy sm:rounded-2xl">
          <h2 className="text-[18px] font-bold">Passport details found</h2>
          <p className="mt-1 text-[13px] text-aerotake-muted">
            These values were read from your scanned passport image (OCR), not demo data.
          </p>
          <div className="mt-4 space-y-2 rounded-xl bg-[#f8fafc] p-4 text-[13px]">
            <p>
              <span className="text-aerotake-muted">Name: </span>
              <span className="font-semibold">
                {scanned.firstName} {scanned.lastName}
              </span>
            </p>
            <p>
              <span className="text-aerotake-muted">Gender: </span>
              <span className="font-semibold capitalize">{scanned.gender || "—"}</span>
            </p>
            <p>
              <span className="text-aerotake-muted">Date of birth: </span>
              <span className="font-semibold">{scanned.dateOfBirth || "—"}</span>
            </p>
            <p>
              <span className="text-aerotake-muted">Passport: </span>
              <span className="font-semibold">{scanned.passportNumber || "—"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleApplyAndClose}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-aerotake-coral text-[15px] font-semibold text-white hover:bg-aerotake-coral-dark"
          >
            Use these details
          </button>
        </div>
      </div>
    );
  }

  if (step === "failed") {
    return (
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-2xl bg-white p-6 text-aerotake-navy sm:rounded-2xl">
          <h2 className="text-[18px] font-bold">Could not read passport</h2>
          <p className="mt-2 text-[13px] text-aerotake-muted">{failMessage}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={retryScan}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold"
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black sm:items-center sm:bg-black/80 sm:p-4">
      <div className="relative flex h-[min(100dvh,900px)] w-full max-w-md flex-col bg-black text-white sm:h-auto sm:max-h-[92dvh] sm:overflow-hidden sm:rounded-2xl">
        <div className="relative z-10 flex items-center justify-between px-4 pt-4">
          <button
            type="button"
            aria-label="Close scan"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <h2 className="text-[16px] font-semibold">Passport Scan</h2>
          <button
            type="button"
            aria-label="Scan help"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          >
            <InfoIcon className="h-5 w-5" />
          </button>
        </div>

        {step === "processing" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
            <span className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-[#3b82f6]" />
            <p className="text-[15px] font-medium">{progressLabel}</p>
            <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#3b82f6] transition-all"
                style={{ width: `${Math.max(8, Math.round(progress * 100))}%` }}
              />
            </div>
            <p className="text-center text-[13px] text-white/55">
              Running real OCR on your passport image — no dummy data
            </p>
          </div>
        ) : (
          <>
            <div className="relative z-10 space-y-1 px-6 pt-4 text-center text-[13px] leading-5 text-white/75">
              <p>Centre the information page in the frame, then tap the shutter</p>
              <p>Or upload a clear passport photo from gallery</p>
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
                  <div className="absolute inset-0 flex items-center justify-center text-[13px] text-white/50">
                    Starting camera...
                  </div>
                ) : null}
                {cameraError ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#141414] px-6 text-center text-[13px] text-white/65">
                    {cameraError}
                  </div>
                ) : null}

                <CornerBrackets />
                <div
                  className="pointer-events-none absolute inset-x-6 h-0.5 bg-[#3b82f6] shadow-[0_0_12px_#3b82f6]"
                  style={{ animation: "aerotake-passport-scan 2.2s ease-in-out infinite" }}
                />
                <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-md bg-white/85 px-2 py-2">
                  <p className="truncate font-mono text-[11px] tracking-widest text-[#334155]">
                    P{"<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"}
                  </p>
                  <p className="truncate font-mono text-[11px] tracking-widest text-[#334155]">
                    {"<<<<<<<<<<<<<<<"}
                  </p>
                </div>
              </div>
            </div>

            <style>{`
              @keyframes aerotake-passport-scan {
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
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15"
              >
                <ImageIcon className="h-6 w-6" />
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
                  torchOn ? "bg-[#3b82f6] text-white" : "bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                <FlashlightIcon className="h-6 w-6" />
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
                className="inline-flex items-center gap-2 text-[12px] text-white/55 hover:text-white"
              >
                <CameraIcon className="h-3.5 w-3.5" />
                Upload passport image for OCR
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
      <span className="pointer-events-none absolute top-3 left-3 h-8 w-8 rounded-tl-md border-t-[3px] border-l-[3px] border-[#3b82f6]" />
      <span className="pointer-events-none absolute top-3 right-3 h-8 w-8 rounded-tr-md border-t-[3px] border-r-[3px] border-[#3b82f6]" />
      <span className="pointer-events-none absolute bottom-3 left-3 h-8 w-8 rounded-bl-md border-b-[3px] border-l-[3px] border-[#3b82f6]" />
      <span className="pointer-events-none absolute right-3 bottom-3 h-8 w-8 rounded-br-md border-r-[3px] border-b-[3px] border-[#3b82f6]" />
    </>
  );
}

function PassportIllustration() {
  return (
    <div className="relative z-10 flex h-full flex-col rounded-lg border border-white/10 bg-[#2a2a2a] p-3">
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
        <div className="h-2 w-full rounded bg-[#64748b]/70" />
        <div className="h-2 w-full rounded bg-[#64748b]/70" />
      </div>
    </div>
  );
}
