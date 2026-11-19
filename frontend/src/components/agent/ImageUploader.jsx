import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, ImagePlus, Star, X } from "lucide-react";
import { compressImage } from "../../utils/image";
import { createId } from "../../utils/crypto";
import { cloudImage } from "../../utils/cloudImage";

const MAX_SIZE_MB = 10;

// Image entries: { id, src, name, status: "uploading" | "done" | "error", progress, error }
// Photos are compressed in the browser first (the bar tracks that step); they are uploaded to
// Cloudinary by the backend when the listing is saved, and only the URLs are stored in MongoDB.
// max: photo limit from the agent's plan (via the permission system); limitNote explains it and
// limitAction ({ to, label }) offers the way to raise it. The server enforces the same limit.
const ImageUploader = ({ images, setImages, error, max = 8, limitNote, limitAction }) => {
  const MAX_IMAGES = max;
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const update = (id, patch) => setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)));

  const processFile = (file) => {
    const id = createId("img");
    const entry = { id, name: file.name, src: "", status: "uploading", progress: 0 };

    if (!file.type.startsWith("image/")) {
      setImages((prev) => [...prev, { ...entry, status: "error", error: "Not an image file" }]);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setImages((prev) => [...prev, { ...entry, status: "error", error: `Larger than ${MAX_SIZE_MB}MB` }]);
      return;
    }

    setImages((prev) => [...prev, entry]);

    let progress = 0;
    const timer = setInterval(() => {
      progress = Math.min(progress + 8 + Math.random() * 14, 90);
      update(id, { progress });
    }, 120);

    compressImage(file)
      .then((src) => {
        // Let the bar finish so the "upload" reads naturally
        setTimeout(() => {
          clearInterval(timer);
          update(id, { src, progress: 100, status: "done" });
        }, 500);
      })
      .catch((err) => {
        clearInterval(timer);
        update(id, { status: "error", error: err.message });
      });
  };

  const handleFiles = (fileList) => {
    const room = MAX_IMAGES - images.filter((img) => img.status !== "error").length;
    [...fileList].slice(0, Math.max(room, 0)).forEach(processFile);
  };

  const remove = (id) => setImages((prev) => prev.filter((img) => img.id !== id));
  const makeCover = (id) =>
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      return [target, ...prev.filter((img) => img.id !== id)];
    });

  const count = images.filter((img) => img.status !== "error").length;
  const full = count >= MAX_IMAGES;
  // A plan downgrade never deletes photos: the gallery can be trimmed, but can't take new ones
  const over = count > MAX_IMAGES;

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        disabled={full}
        className={`flex w-full flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging ? "border-brand-500 bg-brand-50" : error ? "border-red-300 bg-red-50/40" : "border-gray-200 hover:border-brand-300 hover:bg-gray-50"
        }`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-brand-50 text-brand-500">
          <ImagePlus className="h-6 w-6" />
        </span>
        <span className="mt-4 text-sm font-semibold text-gray-900">
          {full ? `Photo limit reached (${count} of ${MAX_IMAGES})` : "Click to upload or drag photos here"}
        </span>
        <span className="mt-1 text-xs text-gray-500">JPG, PNG or WebP · up to {MAX_SIZE_MB}MB each · <span className="font-semibold text-gray-700">{count} / {MAX_IMAGES} uploaded</span></span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {full && limitNote && (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p>
            {over && `This property has ${count} photos, more than your current limit. They're all kept; remove some or upgrade to add new ones. `}
            {limitNote}
            {limitAction && <> <Link to={limitAction.to} className="font-semibold text-brand-700 underline-offset-2 hover:underline">{limitAction.label}</Link></>}
          </p>
        </div>
      )}
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence initial={false}>
            {images.map((img, index) => (
              <motion.li
                key={img.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative aspect-4/3 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200"
              >
                {img.src && <img src={cloudImage(img.src, 200)} alt={img.name} className="h-full w-full object-cover" />}

                {img.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col justify-end bg-gray-900/40 p-3">
                    <p className="mb-1.5 truncate text-xs font-medium text-white">Uploading {Math.round(img.progress)}%</p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/30">
                      <div className="h-full rounded-full bg-white transition-[width] duration-150" style={{ width: `${img.progress}%` }} />
                    </div>
                  </div>
                )}

                {img.status === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50 p-3 text-center">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <p className="text-xs font-semibold text-red-700">{img.error}</p>
                    <p className="w-full truncate text-[11px] text-red-500">{img.name}</p>
                  </div>
                )}

                {img.status === "done" && (
                  <>
                    {index === 0 ? (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white">
                        <Star className="h-3 w-3 fill-current" />
                        Cover
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeCover(img.id)}
                        className="absolute top-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-700 opacity-100 shadow-sm transition sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        Set as cover
                      </button>
                    )}
                    <CheckCircle2 className="absolute bottom-2 left-2 h-5 w-5 fill-emerald-500 text-white" />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  aria-label={`Remove ${img.name}`}
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-gray-700 shadow-sm transition hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
};

export default ImageUploader;
