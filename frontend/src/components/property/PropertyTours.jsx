import { useState } from "react";
import { ExternalLink, Play, Rotate3d } from "lucide-react";
import { PROVIDER_NAMES, embedUrl, mediaThumbnail, shareUrl } from "../../utils/mediaLinks";
import { cloudImage } from "../../utils/cloudImage";

/**
 * One tour: a still preview with a play button. The provider's player (and its cookies and
 * scripts) only loads after the visitor presses play, so the listing page stays fast.
 */
const Tour = ({ media, kind, title, poster }) => {
  const [playing, setPlaying] = useState(false);
  const src = embedUrl(media);
  if (!src) return null;
  const label = kind === "video" ? "Video tour" : "3D virtual tour";
  const preview = mediaThumbnail(media) || (poster ? cloudImage(poster, 640) : null);
  const Icon = kind === "video" ? Play : Rotate3d;

  return (
    <figure className="min-w-0">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-gray-900">
        {playing ? (
          <iframe
            src={src}
            title={`${label}: ${title}`}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture; xr-spatial-tracking; gyroscope; accelerometer"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 grid place-items-center" aria-label={`Play the ${label.toLowerCase()} of ${title}`}>
            {preview && <img src={preview} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-60" />}
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-white/95 text-brand-700 shadow-lg transition-transform group-hover:scale-105">
              <Icon className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="absolute bottom-3 left-3 rounded-full bg-gray-950/70 px-3 py-1 text-xs font-semibold text-white">{label}</span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>{label} on {PROVIDER_NAMES[media.provider]}</span>
        <a href={shareUrl(media)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-brand-700">
          Open on {PROVIDER_NAMES[media.provider]}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  );
};

// The listing's video and 3D tours side by side (nothing when it has neither)
const PropertyTours = ({ video, virtualTour, title, poster }) => {
  if (!embedUrl(video) && !embedUrl(virtualTour)) return null;
  return (
    <div className={`grid gap-5 ${embedUrl(video) && embedUrl(virtualTour) ? "md:grid-cols-2" : ""}`}>
      {embedUrl(video) && <Tour media={video} kind="video" title={title} poster={poster} />}
      {embedUrl(virtualTour) && <Tour media={virtualTour} kind="tour" title={title} poster={poster} />}
    </div>
  );
};

export default PropertyTours;
