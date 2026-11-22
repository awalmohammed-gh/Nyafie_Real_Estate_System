import { useEffect, useRef, useState } from "react";
import { Film, Loader2, RefreshCw, Trash2, Upload, X } from "lucide-react";
import {
  VIDEO_LIMITS,
  VIDEO_TYPES,
  uploadListingVideo,
  videoPlaybackUrl,
  videoPosterUrl,
} from "../../frontApi/videoApi";

const MB = 1024 * 1024;
const minutes = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/**
 * The listing's own video (optional): pick an MP4/MOV/WebM, it uploads straight to Cloudinary with a
 * progress bar and is compressed there (frontApi/videoApi.js). value: { publicId, url, duration, bytes }
 * or null. onBusyChange(true) while uploading, so the form can wait before saving.
 */
const VideoUploadField = ({
  value,
  onChange,
  onBusyChange,
  disabled = false,
}) => {
  const input = useRef(null);
  const abort = useRef(null);
  const [state, setState] = useState({ step: "idle", progress: 0, error: "" }); // idle | uploading | processing
  const busy = state.step !== "idle";
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => abort.current?.abort(), []);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const controller = new AbortController();
    abort.current = controller;
    setState({ step: "uploading", progress: 0, error: "" });
    try {
      const video = await uploadListingVideo(file, {
        signal: controller.signal,
        onProgress: (progress) =>
          setState((current) => ({ ...current, progress })),
        onProcessing: () =>
          setState((current) => ({ ...current, step: "processing" })),
      });
      onChange(video);
      setState({ step: "idle", progress: 0, error: "" });
    } catch (error) {
      setState({
        step: "idle",
        progress: 0,
        error: error.cancelled ? "" : error.message,
      });
    }
  };

  return (
    <div className="space-y-3">
      {value && !busy && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-black">
          <video
            src={videoPlaybackUrl(value)}
            poster={videoPosterUrl(value)}
            controls
            preload="none"
            playsInline
            className="aspect-video w-full"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <Film className="h-4 w-4 text-brand-600" aria-hidden="true" />
              {value.duration ? minutes(value.duration) : "Video"}
              {value.bytes
                ? ` · ${(value.bytes / MB).toFixed(1)} MB stored`
                : ""}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => input.current?.click()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 font-semibold text-gray-700 hover:bg-gray-100"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Replace
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(null)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </button>
            </span>
          </div>
        </div>
      )}

      {busy ? (
        <div
          role="status"
          className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-brand-900"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {state.step === "processing"
                ? "Compressing the video…"
                : `Uploading… ${Math.round(state.progress * 100)}%`}
            </span>
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-800 hover:bg-white"
              aria-label="Cancel video upload"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </button>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-white"
            aria-hidden="true"
          >
            <div
              className={`h-full rounded-full bg-brand-600 transition-[width] duration-200 ${state.step === "processing" ? "animate-pulse" : ""}`}
              style={{
                width: `${state.step === "processing" ? 100 : Math.max(4, state.progress * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : (
        !value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 transition hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60"
          >
            <Upload className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <span className="font-semibold text-gray-800">
              Upload a video of the property
            </span>
            <span className="text-xs text-gray-500">
              MP4, MOV or WebM · up to {VIDEO_LIMITS.maxBytes / MB} MB and{" "}
              {VIDEO_LIMITS.maxSeconds / 60} minutes · compressed automatically
            </span>
          </button>
        )
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept={[...VIDEO_TYPES, ".mp4,.mov,.webm,.m4v"].join(",")}
        onChange={pick}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

export default VideoUploadField;
