import client from "./client";

/*
 * Listing videos (MP4, MOV or WebM; optional). Too large for the API, so the browser uploads them
 * straight to Cloudinary with a one-time signature from the server, which fixes the folder and the
 * compression (backend utils/listingMedia.js). Then the server checks what was stored.
 */
export const VIDEO_LIMITS = { maxBytes: 50 * 1024 * 1024, maxSeconds: 120 };
export const VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
];
const MB = 1024 * 1024;

// The video's length in seconds, read in the browser before anything is uploaded (null if unreadable)
const durationOf = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });

/** Why this file can't be uploaded, or "" (checked before uploading, again by the server after) */
export const videoProblem = async (file) => {
  if (!file) return "Choose a video.";
  if (
    !VIDEO_TYPES.includes(file.type) &&
    !/\.(mp4|mov|webm|m4v)$/i.test(file.name)
  )
    return "Choose an MP4, MOV or WebM video.";
  if (file.size > VIDEO_LIMITS.maxBytes)
    return `This video is ${Math.ceil(file.size / MB)} MB. Videos can be up to ${VIDEO_LIMITS.maxBytes / MB} MB: trim it or record at a lower quality.`;
  const seconds = await durationOf(file);
  if (seconds && seconds > VIDEO_LIMITS.maxSeconds + 1)
    return `This video is ${Math.ceil(seconds / 60)} minutes long. Videos can be up to ${VIDEO_LIMITS.maxSeconds / 60} minutes.`;
  return "";
};

// Sends the file to Cloudinary, reporting progress (0-1); resolves with Cloudinary's answer
const sendToCloudinary = (uploadUrl, fields, file, { onProgress, signal }) =>
  new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.onprogress = (event) =>
      event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.public_id)
        resolve(body);
      else
        reject(
          new Error(
            body?.error?.message
              ? `The video couldn't be uploaded: ${body.error.message}`
              : "The video couldn't be uploaded. Please try again.",
          ),
        );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "The video upload was interrupted. Check your connection and try again.",
        ),
      );
    xhr.onabort = () =>
      reject(
        Object.assign(new Error("Upload cancelled."), { cancelled: true }),
      );
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });

/**
 * Uploads a listing video. onProgress(0-1) while sending; onProcessing() while Cloudinary compresses it.
 * Resolves with { publicId, url, duration, bytes, width, height } for the listing form.
 */
export const uploadListingVideo = async (
  file,
  { onProgress, onProcessing, signal } = {},
) => {
  const problem = await videoProblem(file);
  if (problem) throw new Error(problem);
  const { data: permit } = await client.post("/uploads/video/signature", {});
  const stored = await sendToCloudinary(permit.uploadUrl, permit.fields, file, {
    signal,
    onProgress: (share) => {
      onProgress?.(share);
      if (share >= 1) onProcessing?.();
    },
  });
  const { data } = await client.post("/uploads/video/verify", {
    publicId: stored.public_id,
  });
  return data;
};

// Playback copy: the best format for the viewer's browser at automatic quality (from the stored video)
export const videoPlaybackUrl = (video) =>
  video?.url?.replace(
    "/video/upload/",
    "/video/upload/f_auto:video,q_auto:eco/",
  ) || "";
// A still frame (one second in) as the poster shown before playing
export const videoPosterUrl = (video) =>
  video?.url
    ? video.url
        .replace(
          "/video/upload/",
          "/video/upload/so_1,w_1280,c_limit,q_auto:eco,f_jpg/",
        )
        .replace(/\.[a-z0-9]+$/i, ".jpg")
    : "";
