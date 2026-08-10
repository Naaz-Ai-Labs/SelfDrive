"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { compressImageFile } from "@/lib/image-compression";

export type CapturedPhoto = {
  side: "front" | "rear" | "left" | "right" | "odometer" | "fuel" | "damage";
  url: string;
  notes?: string;
  lat?: number;
  lng?: number;
  timestamp?: string;
};

const MANDATORY_SIDES: Array<{ key: CapturedPhoto["side"]; label: string; icon: string; guide: string }> = [
  { key: "front", label: "Front View", icon: "🚘", guide: "Position camera directly facing the FRONT bumper & headlights" },
  { key: "rear", label: "Rear / Back View", icon: "🚙", guide: "Position camera facing the REAR bumper & tail lights" },
  { key: "left", label: "Left Side", icon: "⬅️", guide: "Capture full LEFT side profile from front door to rear panel" },
  { key: "right", label: "Right Side", icon: "➡️", guide: "Capture full RIGHT side profile from front door to rear panel" },
];

const OPTIONAL_SIDES: Array<{ key: CapturedPhoto["side"]; label: string; icon: string; guide: string }> = [
  { key: "odometer", label: "Odometer", icon: "🔢", guide: "Capture clear reading of the dashboard odometer" },
  { key: "fuel", label: "Fuel Gauge", icon: "⛽", guide: "Capture fuel level indicator on instrument cluster" },
  { key: "damage", label: "Pre-existing Damage", icon: "⚠️", guide: "Close-up photo of any existing scratch or dent" },
];

interface VehicleCameraScannerProps {
  onPhotoCaptured: (photo: CapturedPhoto) => void;
  capturedPhotos: Record<string, CapturedPhoto>;
  onRemovePhoto?: (side: string) => void;
}

export function VehicleCameraScanner({
  onPhotoCaptured,
  capturedPhotos,
  onRemovePhoto,
}: VehicleCameraScannerProps) {
  const [activeSide, setActiveSide] = useState<CapturedPhoto["side"]>("front");
  const [isOpen, setIsOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"loading" | "active" | "denied" | "unavailable">("loading");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Request GPS Geolocation
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus("unavailable");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsStatus("active");
      },
      (err) => {
        console.warn("Geolocation warning:", err.message);
        setGpsStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (isOpen) {
      requestGps();
    }
  }, [isOpen, requestGps]);

  // Start Live Camera Stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Check flashlight capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities?.() as Record<string, unknown> | undefined;
        if (capabilities && "torch" in capabilities) {
          setFlashSupported(true);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not access camera";
      console.warn("Camera access warning:", msg);
      setCameraError("Camera access denied or unavailable. You can use file input fallback with geotagging.");
    }
  }, [cameraFacing]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, startCamera]);

  const toggleFlash = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (track && flashSupported) {
      try {
        const newFlash = !flashOn;
        await track.applyConstraints({
          advanced: [{ torch: newFlash } as any],
        });
        setFlashOn(newFlash);
      } catch (e) {
        console.warn("Torch toggle failed:", e);
      }
    }
  };

  /**
   * Watermarks the captured image on canvas with high-visibility Geotag metadata
   */
  const stampGeotag = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    sideLabel: string,
    lat?: number,
    lng?: number
  ): string => {
    const now = new Date();
    const timestampStr = `${now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })} ${now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })}`;

    const bannerHeight = Math.max(70, Math.round(height * 0.12));
    const startY = height - bannerHeight;

    // Dark translucent background banner
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(0, startY, width, bannerHeight);

    // Gold accent top stripe
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(0, startY, width, 4);

    // Font styling
    const fontSize = Math.max(14, Math.round(width * 0.022));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";

    const padding = Math.max(16, Math.round(width * 0.02));

    // Line 1: Side Label & Brand
    const line1Y = startY + bannerHeight * 0.32;
    ctx.fillText(`📍 ${sideLabel.toUpperCase()} VIEW  •  DARSHH HOLIDAYS VERIFIED`, padding, line1Y);

    // Line 2: Geolocation Coordinates & Timestamp
    const line2Y = startY + bannerHeight * 0.72;
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `400 ${Math.round(fontSize * 0.88)}px monospace`;

    const locText = lat && lng ? `GPS: ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E` : `GPS: Location Pending`;
    ctx.fillText(`${locText}  |  🕒 ${timestampStr}`, padding, line2Y);

    const notesStr = `Geotagged: ${lat ? `${lat.toFixed(6)}, ${lng?.toFixed(6)}` : "No GPS"} at ${timestampStr}`;
    return notesStr;
  };

  /**
   * Process a captured frame or File, apply Geotag stamp, and upload
   */
  const processAndUploadCapturedImage = async (
    source: HTMLVideoElement | HTMLImageElement,
    side: CapturedPhoto["side"]
  ) => {
    setCapturing(true);
    try {
      let srcWidth = 0;
      let srcHeight = 0;
      if (source instanceof HTMLVideoElement) {
        srcWidth = source.videoWidth || 1280;
        srcHeight = source.videoHeight || 720;
      } else {
        srcWidth = source.naturalWidth || 1280;
        srcHeight = source.naturalHeight || 720;
      }

      const canvas = document.createElement("canvas");
      canvas.width = srcWidth;
      canvas.height = srcHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Could not create canvas context");

      // Draw source image
      ctx.drawImage(source, 0, 0, srcWidth, srcHeight);

      // Find side label
      const sideItem = [...MANDATORY_SIDES, ...OPTIONAL_SIDES].find((s) => s.key === side);
      const label = sideItem?.label || side;

      // Stamp Geotag watermark
      const notes = stampGeotag(
        ctx,
        srcWidth,
        srcHeight,
        label,
        gpsLocation?.lat,
        gpsLocation?.lng
      );

      // Convert canvas to Blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85)
      );
      if (!blob) throw new Error("Failed to encode canvas image");

      const file = new File([blob], `vehicle_${side}_${Date.now()}.jpg`, { type: "image/jpeg" });
      const compressed = await compressImageFile(file, 1600, 0.85);

      const formData = new FormData();
      formData.append("file", compressed);

      const res = await fetch("/api/upload", { method: "POST", body: formData }).then((r) => r.json());
      if (res?.path) {
        onPhotoCaptured({
          side,
          url: res.path,
          notes,
          lat: gpsLocation?.lat,
          lng: gpsLocation?.lng,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      console.error("Geotag capture error:", err);
      alert("Failed to capture image. Please try again.");
    } finally {
      setCapturing(false);
    }
  };

  const captureFromVideo = () => {
    if (!videoRef.current) return;
    processAndUploadCapturedImage(videoRef.current, activeSide);
  };

  const handleFileUploadFallback = (e: React.ChangeEvent<HTMLInputElement>, side: CapturedPhoto["side"]) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      processAndUploadCapturedImage(img, side);
    };
    img.src = url;
    e.target.value = "";
  };

  const completedMandatoryCount = MANDATORY_SIDES.filter((s) => capturedPhotos[s.key]?.url).length;

  return (
    <div className="space-y-4">
      {/* Required Scans Progress Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 bg-ink-50/70 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📱</span>
          <div>
            <h4 className="text-xs font-semibold text-ink-900">4-Side Live Camera Geotag Inspection</h4>
            <p className="text-[11px] text-ink-500">
              Mandatory live photos with GPS stamp: Front, Rear, Left, Right
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              completedMandatoryCount === 4
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : "bg-amber-100 text-amber-800 border border-amber-300"
            }`}
          >
            {completedMandatoryCount === 4 ? "✓ 4/4 Mandatory Scans Complete" : `${completedMandatoryCount}/4 Mandatory Scans`}
          </span>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shadow-sm"
          >
            <span>📷</span> Open Live Camera Scanner
          </button>
        </div>
      </div>

      {/* Grid Preview of Captured Photos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MANDATORY_SIDES.map((sideItem) => {
          const photo = capturedPhotos[sideItem.key];
          return (
            <div
              key={sideItem.key}
              className={`relative flex flex-col rounded-xl border p-2 text-xs transition ${
                photo
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-dashed border-ink-200 bg-white hover:border-brand-500"
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-semibold text-ink-800 flex items-center gap-1">
                  <span>{sideItem.icon}</span> {sideItem.label}
                </span>
                {photo ? (
                  <span className="text-[10px] font-semibold text-emerald-700">✓ Done</span>
                ) : (
                  <span className="text-[10px] font-medium text-amber-600">Required</span>
                )}
              </div>

              {photo ? (
                <div className="group relative aspect-video w-full overflow-hidden rounded-lg border border-ink-200 bg-black">
                  <img src={photo.url} alt={sideItem.label} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onRemovePhoto?.(sideItem.key)}
                      className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white shadow hover:bg-red-700"
                    >
                      Retake / Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSide(sideItem.key);
                    setIsOpen(true);
                  }}
                  className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-300 bg-ink-50 text-ink-500 hover:bg-brand-50 hover:text-brand-700"
                >
                  <span className="text-lg">📷</span>
                  <span className="text-[11px] font-medium">Scan {sideItem.label}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Optional Extra Scans (Odometer, Fuel, Damage) */}
      <div className="pt-2">
        <p className="mb-2 text-xs font-semibold text-ink-600">Optional Additional Inspection Photos</p>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONAL_SIDES.map((sideItem) => {
            const photo = capturedPhotos[sideItem.key];
            return (
              <div key={sideItem.key} className="flex items-center justify-between rounded-lg border border-ink-200 bg-white p-2 text-xs">
                <span className="flex items-center gap-1 font-medium text-ink-700">
                  <span>{sideItem.icon}</span> {sideItem.label}
                </span>
                {photo ? (
                  <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                    ✓ Saved
                    <button type="button" onClick={() => onRemovePhoto?.(sideItem.key)} className="text-red-500 hover:underline">
                      ✕
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSide(sideItem.key);
                      setIsOpen(true);
                    }}
                    className="text-[11px] text-brand-700 hover:underline"
                  >
                    + Scan
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FULLSCREEN LIVE CAMERA MODAL WITH GEOTAG OVERLAY */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4">
          <div className="relative flex h-full max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-stone-950 text-white shadow-2xl border border-stone-800">
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900/90 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📷</span>
                <div>
                  <h3 className="font-semibold text-sm text-white">Live Geotag Camera Inspection</h3>
                  <p className="text-[11px] text-amber-400 font-mono">
                    Scanning: {MANDATORY_SIDES.find((s) => s.key === activeSide)?.label || activeSide.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* GPS Status Indicator */}
                <div className="flex items-center gap-1.5 rounded-full bg-stone-800 px-2.5 py-1 text-[11px]">
                  {gpsStatus === "active" && (
                    <span className="flex items-center gap-1 text-emerald-400 font-mono">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      GPS: {gpsLocation?.lat.toFixed(4)}°, {gpsLocation?.lng.toFixed(4)}° (±{gpsLocation?.accuracy}m)
                    </span>
                  )}
                  {gpsStatus === "loading" && (
                    <span className="text-amber-400 animate-pulse">📡 Acquiring GPS location…</span>
                  )}
                  {(gpsStatus === "denied" || gpsStatus === "unavailable") && (
                    <button type="button" onClick={requestGps} className="text-red-400 hover:underline">
                      ⚠️ GPS Off (Tap to Retry)
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full bg-stone-800 p-1.5 text-stone-300 hover:bg-stone-700 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Side Switch Tabs */}
            <div className="flex overflow-x-auto border-b border-stone-800 bg-stone-900 px-2 py-1 text-xs gap-1">
              {[...MANDATORY_SIDES, ...OPTIONAL_SIDES].map((item) => {
                const isDone = Boolean(capturedPhotos[item.key]);
                const isActive = activeSide === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveSide(item.key)}
                    className={`flex items-center gap-1 shrink-0 rounded-lg px-3 py-1.5 transition ${
                      isActive
                        ? "bg-brand-500 text-stone-950 font-bold"
                        : isDone
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {isDone && <span className="text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Live Camera Viewfinder */}
            <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
              {cameraError ? (
                <div className="p-6 text-center text-sm text-stone-300 space-y-3">
                  <p className="text-amber-400">{cameraError}</p>
                  <label className="btn-primary inline-flex cursor-pointer items-center gap-2 px-4 py-2 text-xs">
                    📁 Choose Photo from Device with Geotag
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFileUploadFallback(e, activeSide)}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-contain"
                  />

                  {/* Target Bounding Box Overlay for Vehicle Alignment */}
                  <div className="pointer-events-none absolute inset-6 flex items-center justify-center rounded-2xl border-2 border-dashed border-white/40">
                    <div className="rounded-md bg-black/60 px-3 py-1 text-center text-xs font-semibold text-white backdrop-blur">
                      {MANDATORY_SIDES.find((s) => s.key === activeSide)?.guide || "Align vehicle in frame"}
                    </div>
                  </div>

                  {/* Live Watermark Preview Badge */}
                  <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg bg-slate-950/80 p-2.5 backdrop-blur border border-amber-500/30 text-[11px] font-mono">
                    <div className="flex items-center justify-between text-amber-400 font-bold text-xs">
                      <span>📍 VIEW: {activeSide.toUpperCase()}</span>
                      <span>DARSHH HOLIDAYS GEOTAG STAMP</span>
                    </div>
                    <div className="mt-0.5 text-slate-300 flex justify-between">
                      <span>
                        GPS: {gpsLocation ? `${gpsLocation.lat.toFixed(6)}°, ${gpsLocation.lng.toFixed(6)}°` : "Acquiring..."}
                      </span>
                      <span>{new Date().toLocaleDateString("en-IN")} {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Bottom Controls */}
            <div className="flex items-center justify-between border-t border-stone-800 bg-stone-900 px-4 py-3">
              <div className="flex items-center gap-2">
                {/* Flash Toggle */}
                {flashSupported && (
                  <button
                    type="button"
                    onClick={toggleFlash}
                    className={`rounded-xl px-3 py-2 text-xs font-medium ${
                      flashOn ? "bg-amber-400 text-stone-950" : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    ⚡ Flash {flashOn ? "ON" : "OFF"}
                  </button>
                )}

                {/* Flip Camera */}
                <button
                  type="button"
                  onClick={() => setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"))}
                  className="rounded-xl bg-stone-800 px-3 py-2 text-xs font-medium text-stone-300 hover:bg-stone-700"
                >
                  🔄 Flip Camera ({cameraFacing === "environment" ? "Back" : "Front"})
                </button>
              </div>

              {/* CAPTURE SNAPSHOT BUTTON */}
              <button
                type="button"
                onClick={captureFromVideo}
                disabled={capturing || Boolean(cameraError)}
                className="flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-stone-950 shadow-lg hover:bg-brand-400 active:scale-95 disabled:opacity-50"
              >
                <span className="h-4 w-4 rounded-full border-2 border-stone-950 bg-white" />
                {capturing ? "Stamping Geotag..." : `Capture ${activeSide.toUpperCase()}`}
              </button>

              {/* Device File Upload Fallback Button */}
              <label className="cursor-pointer rounded-xl bg-stone-800 px-3 py-2 text-xs font-medium text-stone-300 hover:bg-stone-700">
                📁 Upload File
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFileUploadFallback(e, activeSide)}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
