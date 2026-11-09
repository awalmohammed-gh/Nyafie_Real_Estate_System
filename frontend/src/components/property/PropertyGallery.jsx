import { useEffect, useId, useRef, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";

const PropertyImage = ({ src, alt, className, priority = false, compact = false }) => {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) {
    return (
      <span role="img" aria-label="Property photo unavailable" className={`flex flex-col items-center justify-center gap-3 bg-gray-100 text-gray-400 ${className}`}>
        <Building2 aria-hidden="true" className={compact ? "h-5 w-5" : "h-8 w-8"} />
        {!compact && <span className="text-sm">Photo coming soon</span>}
      </span>
    );
  }
  return <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => setFailed(src)} className={className} />;
};

const PropertyGallery = ({ images, title }) => {
  const photos = images.filter(Boolean);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const headingId = useId();
  const photoIndex = active < photos.length ? active : 0;
  // Up to three stacked thumbnails beside the main photo (photos 2-4); the last one shows how many more
  const tiles = photos.slice(1, 4);
  const tiled = tiles.length > 0;
  const hidden = photos.length - 1 - tiles.length;

  useLockBodyScroll(open);

  // Native modal dialogs provide a focus trap, Escape handling and focus restoration.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const showPhoto = (index) => {
    setActive(index);
    setOpen(true);
  };
  const step = (direction) => setActive((index) => (index + direction + photos.length) % photos.length);

  if (!photos.length) {
    return <PropertyImage alt={title} className="aspect-[3/2] max-h-[26rem] w-full rounded-xl" />;
  }

  return (
    <section aria-label="Property photos">
      <div className={`grid gap-2.5 ${tiled ? "sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]" : ""}`}>
        <div className="group relative min-w-0 overflow-hidden rounded-2xl bg-gray-100">
          <button type="button" onClick={() => showPhoto(photoIndex)} aria-label="Open property photos" className="block aspect-[4/3] max-h-[28rem] w-full sm:aspect-[16/10]">
            <PropertyImage src={photos[photoIndex]} alt={title} priority className="h-full w-full object-cover" />
          </button>
          {photos.length > 1 && (
            <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
              <button type="button" onClick={() => step(-1)} aria-label="Previous property photo" className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/95 text-gray-800 shadow-md transition hover:scale-105 hover:bg-white">
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Next property photo" className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/95 text-gray-800 shadow-md transition hover:scale-105 hover:bg-white">
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          )}
          {photos.length > 1 && <span aria-live="polite" className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-gray-950/70 px-3 py-1 text-xs font-semibold text-white tabular-nums">{photoIndex + 1} / {photos.length}</span>}
          <button type="button" onClick={() => showPhoto(photoIndex)} className="absolute right-3 bottom-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-white/95 px-3.5 text-xs font-semibold text-gray-800 shadow-sm hover:bg-white">
            <Images aria-hidden="true" className="h-4 w-4" />
            {photos.length > 1 ? "View all photos" : "View photo"}
          </button>
        </div>
        {tiled && (
          <div className="hidden min-h-0 gap-2.5 sm:grid" style={{ gridTemplateRows: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
            {tiles.map((src, index) => {
              const last = index === tiles.length - 1 && hidden > 0;
              return (
                <button type="button" key={`${src}:${index}`} onClick={() => showPhoto(index + 1)} aria-label={last ? `Open all ${photos.length} property photos` : `Open property photo ${index + 2}`} className="relative min-h-0 overflow-hidden rounded-2xl bg-gray-100">
                  <PropertyImage src={src} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 hover:scale-105" />
                  {last && (
                    <span className="absolute inset-0 grid place-items-center bg-gray-950/55 text-white">
                      <span className="flex flex-col items-center gap-1 text-sm font-semibold"><Images aria-hidden="true" className="h-5 w-5" />+{hidden} {hidden === 1 ? "Photo" : "Photos"}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {photos.length > 1 && (
        <div className={`mt-3 flex gap-2 overflow-x-auto py-1 no-scrollbar ${tiled ? "sm:hidden" : ""}`} aria-label="Choose a property photo">
          {photos.map((src, index) => (
            <button type="button" key={`${src}:${index}`} onClick={() => setActive(index)} aria-label={`Show property photo ${index + 1}`} aria-pressed={photoIndex === index} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-2 ${photoIndex === index ? "ring-brand-500" : "ring-transparent opacity-70 hover:opacity-100"}`}>
              <PropertyImage src={src} alt="" compact className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            const buttons = event.currentTarget.querySelectorAll('button:not([disabled])');
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
          if (photos.length > 1 && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            step(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-gray-950 text-white backdrop:bg-gray-950/80"
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <h2 id={headingId} className="min-w-0 truncate text-sm font-medium">{title} — photos</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close gallery" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/10">
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-20" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
            <PropertyImage key={photos[photoIndex]} src={photos[photoIndex]} alt={`${title}, photo ${photoIndex + 1}`} priority className="max-h-full max-w-full rounded-lg object-contain" />
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} aria-label="Previous gallery photo" className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-gray-900/80 hover:bg-gray-800 sm:left-5"><ChevronLeft aria-hidden="true" className="h-5 w-5" /></button>
                <button type="button" onClick={() => step(1)} aria-label="Next gallery photo" className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-gray-900/80 hover:bg-gray-800 sm:right-5"><ChevronRight aria-hidden="true" className="h-5 w-5" /></button>
              </>
            )}
          </div>
          <p aria-live="polite" className="shrink-0 py-4 text-center text-xs text-gray-300">{photoIndex + 1} / {photos.length}</p>
          {photos.length > 1 && (
            <div className="flex shrink-0 gap-3 overflow-x-auto px-4 pb-5 sm:justify-center">
              {photos.map((src, index) => (
                <button type="button" key={`${src}:${index}`} onClick={() => setActive(index)} aria-label={`View gallery photo ${index + 1}`} aria-pressed={photoIndex === index} className={`h-12 w-16 shrink-0 overflow-hidden rounded-md ring-2 ring-offset-2 ring-offset-gray-950 ${photoIndex === index ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"}`}>
                  <PropertyImage src={src} alt="" compact className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </section>
  );
};

export default PropertyGallery;
